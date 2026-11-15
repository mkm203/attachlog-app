"""The logbook endpoints, all under /v1."""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import ApiError
from app.access import require_view, visible_placements
from app.models import Entry, Placement, Review
from app.placements import find as find_placement
from app.schemas import (EntryCreate, EntryOut, EntryPage, EntryUpdate, ErrorResponse, Progress, ReviewCreate,
                         ReviewOut)
from app.models import User
from app.security import current_user

router = APIRouter(prefix="/v1", tags=["logbook"])
DB = Annotated[Session, Depends(get_db)]
Anyone = Annotated[User, Depends(current_user)]
E = {c: {"model": ErrorResponse} for c in (401, 403, 404, 409, 422)}


def find_entry(db: Session, entry_id: str) -> Entry:
    entry = db.get(Entry, entry_id)
    if entry is None:
        raise ApiError(404, "entry_not_found", f"Entry {entry_id} not found")
    return entry


@router.post("/placements/{placement_id}/entries", response_model=EntryOut, status_code=201,
             responses={k: E[k] for k in (401, 403, 404, 409, 422)})
def create_entry(placement_id: str, data: EntryCreate, db: DB, user: Anyone):
    """The placement's student submits the log of one week. 409 if that week already has an entry."""
    placement = find_placement(db, placement_id)
    if placement.student_id != user.id:
        raise ApiError(403, "not_your_placement", "You can only write in your own logbook")
    if placement.status == "closed":
        raise ApiError(409, "placement_closed", "The placement is closed")
    if data.week > placement.total_weeks:
        raise ApiError(422, "week_out_of_range", f"This placement has only {placement.total_weeks} weeks")
    taken = db.scalar(select(Entry.id).where(Entry.placement_id == placement_id, Entry.week == data.week))
    if taken:
        raise ApiError(409, "entry_exists", f"An entry already exists for week {data.week}")
    entry = Entry(placement_id=placement_id, student_id=user.id, week=data.week, tasks=data.tasks, hours=data.hours)
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:  # two requests at the same moment: the database constraint decides
        db.rollback()
        raise ApiError(409, "entry_exists", f"An entry already exists for week {data.week}")
    return entry


@router.get("/entries", response_model=EntryPage, responses={401: E[401], 422: E[422]})
def list_entries(
    db: DB, user: Anyone,
    placement_id: Annotated[str | None, Query(alias="placementId")] = None,
    status: Annotated[str | None, Query(pattern="^(pending|approved|rejected)$")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
):
    """List the entries of placements you take part in (or coordinate), filtered, one page at a time."""
    query = select(Entry).join(Placement, Placement.id == Entry.placement_id).where(visible_placements(db, user))
    if placement_id:
        query = query.where(Entry.placement_id == placement_id)
    if status:
        query = query.where(Entry.status == status)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(Entry.placement_id, Entry.week).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": rows, "page": page, "page_size": page_size, "total": total}


@router.get("/entries/{entry_id}", response_model=EntryOut, responses={k: E[k] for k in (401, 403, 404)})
def get_entry(entry_id: str, db: DB, user: Anyone):
    entry = find_entry(db, entry_id)
    require_view(db, user, find_placement(db, entry.placement_id))
    return entry


@router.put("/entries/{entry_id}", response_model=EntryOut, responses={k: E[k] for k in (401, 403, 404, 409, 422)})
def update_entry(entry_id: str, data: EntryUpdate, db: DB, user: Anyone):
    """Revise an entry. An approved entry is locked (409). A revised rejected entry goes back to pending."""
    entry = find_entry(db, entry_id)
    if entry.student_id != user.id:
        raise ApiError(403, "forbidden", "This is not your entry")
    if entry.status == "approved":
        raise ApiError(409, "entry_locked", "An approved entry cannot be edited")
    entry.tasks, entry.hours = data.tasks, data.hours
    entry.status = "pending"
    entry.updated_at = datetime.now(timezone.utc)
    db.commit()
    return entry


@router.post("/entries/{entry_id}/reviews", response_model=ReviewOut, status_code=201,
             responses={k: E[k] for k in (401, 403, 404, 409, 422)})
def review_entry(entry_id: str, data: ReviewCreate, db: DB, user: Anyone):
    """Approve or reject. Only the company supervisor assigned to this placement may do it."""
    entry = find_entry(db, entry_id)
    placement = find_placement(db, entry.placement_id)
    if placement.company_supervisor_id != user.id:
        raise ApiError(403, "not_assigned_supervisor", "You are not the supervisor assigned to this placement")
    if entry.status != "pending":
        raise ApiError(409, "entry_not_pending", f"Only a pending entry can be reviewed (this one is {entry.status})")
    if data.decision == "rejected" and not (data.comment and data.comment.strip()):
        raise ApiError(422, "comment_required", "A rejection needs a comment")
    review = Review(entry_id=entry.id, reviewer_id=user.id, decision=data.decision, comment=data.comment)
    entry.status = data.decision
    entry.updated_at = datetime.now(timezone.utc)
    db.add(review)
    db.commit()
    return review


@router.get("/entries/{entry_id}/reviews", response_model=list[ReviewOut], responses={k: E[k] for k in (401, 403, 404)})
def list_reviews(entry_id: str, db: DB, user: Anyone):
    entry = find_entry(db, entry_id)
    require_view(db, user, find_placement(db, entry.placement_id))
    return db.scalars(select(Review).where(Review.entry_id == entry_id).order_by(Review.created_at)).all()


@router.get("/placements/{placement_id}/progress", response_model=Progress,
            responses={k: E[k] for k in (401, 403, 404)})
def get_progress(placement_id: str, db: DB, user: Anyone):
    """Completion percentage and reviewer comments of a placement (for the academic supervisor)."""
    placement = find_placement(db, placement_id)
    require_view(db, user, placement)
    entries = db.scalars(select(Entry).where(Entry.placement_id == placement_id)).all()
    count = lambda s: sum(1 for e in entries if e.status == s)  # noqa: E731
    by_id = {e.id: e for e in entries}
    reviews = db.scalars(select(Review).where(Review.entry_id.in_(by_id)).order_by(Review.created_at)).all() if by_id else []
    comments = [{"week": by_id[r.entry_id].week, "decision": r.decision, "comment": r.comment, "reviewer_id": r.reviewer_id}
                for r in reviews if r.comment]
    total = placement.total_weeks
    return {"placement_id": placement_id, "total_weeks": total, "submitted": len(entries),
            "approved": count("approved"), "pending": count("pending"), "rejected": count("rejected"),
            "completion_percent": round(count("approved") / total * 100, 1) if total else 0.0,
            "comments": comments}