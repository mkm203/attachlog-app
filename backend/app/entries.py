"""The logbook endpoints, all under /v1."""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import audit
from app.database import get_db
from app.errors import ApiError
from app.access import require_view, visible_placements
from app.models import Entry, Membership, Placement, Review
from app.notifications import notify_users, send_push_notifications
from app.placements import find as find_placement
from app.schemas import (AuditOut, EntryCreate, EntryOut, EntryPage, EntryUpdate, ErrorResponse, Progress, ReviewCreate,
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
    entry = Entry(placement_id=placement_id, student_id=user.id, week=data.week, tasks=data.tasks, hours=data.hours,
                  reflection=(data.reflection or '').strip() or None, skills=(data.skills or '').strip() or None)
    db.add(entry)
    db.flush()
    audit.record(db, actor_id=user.id, action="entry_submitted", placement_id=placement_id, school_id=placement.school_id,
                 detail=f"Week {data.week}")
    recipients = set(db.scalars(select(Membership.user_id).where(
        Membership.school_id == placement.school_id, Membership.role == "coordinator"
    )).all())
    if placement.company_supervisor_id:
        recipients.add(placement.company_supervisor_id)
    notifications = notify_users(db, recipients, "entry_submitted", placement_id=placement.id, entry_id=entry.id)
    try:
        db.commit()
    except IntegrityError:  # two requests at the same moment: the database constraint decides
        db.rollback()
        raise ApiError(409, "entry_exists", f"An entry already exists for week {data.week}")
    send_push_notifications(db, notifications)
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
    entry.reflection = (data.reflection or '').strip() or None
    entry.skills = (data.skills or '').strip() or None
    entry.status = "pending"
    entry.updated_at = datetime.now(timezone.utc)
    placement = find_placement(db, entry.placement_id)
    audit.record(db, actor_id=user.id, action="entry_revised", placement_id=entry.placement_id, school_id=placement.school_id,
                 detail=f"Week {entry.week}")
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
    audit.record(db, actor_id=user.id, action=f"entry_{data.decision}", placement_id=placement.id, school_id=placement.school_id,
                 detail=f"Week {entry.week}")
    notifications = notify_users(db, [entry.student_id], "entry_reviewed",
                                  placement_id=placement.id, entry_id=entry.id)
    if data.decision == "approved":
        notifications.extend(notify_users(db, [placement.academic_supervisor_id], "academic_review_ready",
                                          placement_id=placement.id, entry_id=entry.id))
    db.commit()
    send_push_notifications(db, notifications)
    return review


@router.post("/entries/{entry_id}/feedback", response_model=ReviewOut, status_code=201,
             responses={k: E[k] for k in (401, 403, 404, 409, 422)})
def academic_feedback(entry_id: str, data: ReviewCreate, db: DB, user: Anyone):
    """Academic supervisor adds feedback on an entry approved by the company supervisor (status stays approved)."""
    entry = find_entry(db, entry_id)
    placement = find_placement(db, entry.placement_id)
    if placement.academic_supervisor_id != user.id:
        raise ApiError(403, "forbidden", "Only the academic supervisor assigned to this placement can leave academic feedback")
    if entry.status != "approved":
        raise ApiError(409, "entry_not_approved", "Academic feedback can be added once the company supervisor has approved the entry")
    if not (data.comment and data.comment.strip()):
        raise ApiError(422, "comment_required", "Feedback needs a comment")
    existing = db.scalar(select(Review.id).where(Review.entry_id == entry.id, Review.reviewer_id == user.id))
    if existing is not None:
        raise ApiError(409, "academic_feedback_exists", "You have already left feedback on this entry")
    review = Review(entry_id=entry.id, reviewer_id=user.id, decision="approved", comment=data.comment.strip())
    db.add(review)
    audit.record(db, actor_id=user.id, action="entry_academic_feedback", placement_id=placement.id, school_id=placement.school_id,
                 detail=f"Week {entry.week}")
    notifications = notify_users(db, [entry.student_id], "academic_feedback",
                                  placement_id=placement.id, entry_id=entry.id)
    db.commit()
    send_push_notifications(db, notifications)
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
    tags: list[str] = []
    for e in entries:
        if e.skills:
            for t in e.skills.split(','):
                t = t.strip().lower()
                if t and t not in tags:
                    tags.append(t)
    total = placement.total_weeks
    return {"placement_id": placement_id, "total_weeks": total, "submitted": len(entries),
            "approved": count("approved"), "pending": count("pending"), "rejected": count("rejected"),
            "total_hours": sum(e.hours for e in entries),
            "completion_percent": round(count("approved") / total * 100, 1) if total else 0.0,
            "skills": tags[:12], "comments": comments}


@router.get("/placements/{placement_id}/activity", response_model=list[AuditOut],
            responses={k: E[k] for k in (401, 403, 404)})
def get_activity(placement_id: str, db: DB, user: Anyone):
    """Recent activity on a placement (visible to anyone who can view it)."""
    from app.models import AuditEvent
    placement = find_placement(db, placement_id)
    require_view(db, user, placement)
    return db.scalars(select(AuditEvent).where(AuditEvent.placement_id == placement_id)
                      .order_by(AuditEvent.created_at.desc()).limit(30)).all()