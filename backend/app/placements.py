"""The placement endpoints, all under /v1."""
import math
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.access import require_coordinator, require_view, visible_placements
from app.database import get_db
from app.errors import ApiError
from app.models import AuditEvent, Company, Entry, Membership, Placement, Review, School, User
from app.notifications import notify_users, send_push_notifications
from app.people import find_or_create_company, grant_or_invite, user_by_email
from app.schemas import (ErrorResponse, FinalEvaluation, PlacementCreate, PlacementOut, PlacementPage,
                         EntryOut, PlacementReportEntry, PlacementReportOut, PlacementReportReview,
                         PlacementUpdate)
from app.security import current_user

router = APIRouter(prefix="/v1/placements", tags=["placements"])
DB = Annotated[Session, Depends(get_db)]
Anyone = Annotated[User, Depends(current_user)]
ERR = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse},
       404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}


def find(db: Session, placement_id: str) -> Placement:
    placement = db.get(Placement, placement_id)
    if placement is None:
        raise ApiError(404, "placement_not_found", f"Placement {placement_id} not found")
    return placement


def placement_outputs(db: Session, placements: list[Placement]) -> list[PlacementOut]:
    user_ids = {p.student_id for p in placements} | {p.academic_supervisor_id for p in placements}
    user_ids.update(p.company_supervisor_id for p in placements if p.company_supervisor_id)
    people = {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids))).all()} if user_ids else {}
    return [
        PlacementOut.model_validate(p).model_copy(update={
            "student_name": people[p.student_id].name if p.student_id in people else p.student_name,
            "student_avatar": people[p.student_id].avatar if p.student_id in people else None,
            "academic_supervisor_name": people[p.academic_supervisor_id].name
            if p.academic_supervisor_id in people else p.academic_supervisor_name,
            "academic_supervisor_avatar": people[p.academic_supervisor_id].avatar if p.academic_supervisor_id in people else None,
            "company_supervisor_name": people[p.company_supervisor_id].name
            if p.company_supervisor_id in people else p.company_supervisor_name,
            "company_supervisor_avatar": people[p.company_supervisor_id].avatar
            if p.company_supervisor_id in people else None,
        })
        for p in placements
    ]


def placement_output(db: Session, placement: Placement) -> PlacementOut:
    return placement_outputs(db, [placement])[0]


def member_of_school(db: Session, user_id: str, school_id: str, role: str, code: str, label: str) -> User:
    user = db.get(User, user_id)
    member = db.scalar(select(Membership.id).where(
        Membership.user_id == user_id, Membership.role == role, Membership.school_id == school_id))
    if user is None or member is None:
        raise ApiError(422, code, f"This {label} is not a member of the school")
    return user


def set_company_supervisor(db: Session, placement: Placement, email: str, invited_by: str) -> None:
    """Link the supervisor now if they have a verified account, otherwise leave it pending until they redeem an invite."""
    company = db.get(Company, placement.company_id)
    placement.company_supervisor_email = email
    status, _ = grant_or_invite(db, email, "company_supervisor", invited_by, company=company)
    user = user_by_email(db, email)
    if status == "member" and user is not None:
        placement.company_supervisor_id, placement.company_supervisor_name = user.id, user.name
    else:
        placement.company_supervisor_id, placement.company_supervisor_name = None, None


@router.post("", response_model=PlacementOut, status_code=201,
             responses={k: ERR[k] for k in (401, 403, 422)})
def create_placement(data: PlacementCreate, db: DB, user: Anyone):
    """Create a placement (coordinator of the school). The dates must lie inside the school's term."""
    school_id = require_coordinator(db, user, data.school_id)
    school = db.get(School, school_id)
    if data.end_date <= data.start_date:
        raise ApiError(422, "invalid_dates", "end_date must be after start_date")
    if data.start_date < school.term_start or data.end_date > school.term_end:
        raise ApiError(422, "outside_term", f"Dates must be inside the term {school.term_start} to {school.term_end}")
    student = member_of_school(db, data.student_id, school_id, "student", "student_not_in_school", "student")
    academic = member_of_school(db, data.academic_supervisor_id, school_id, "academic_supervisor",
                                "supervisor_not_in_school", "academic supervisor")
    company = find_or_create_company(db, data.company_name, data.company_city)
    weeks = math.ceil(((data.end_date - data.start_date).days + 1) / 7)
    placement = Placement(school_id=school_id, company_id=company.id, student_id=student.id, student_name=student.name,
                          company_name=company.name, company_city=company.city,
                          company_supervisor_email=data.company_supervisor_email,
                          academic_supervisor_id=academic.id, academic_supervisor_name=academic.name,
                          start_date=data.start_date, end_date=data.end_date, total_weeks=weeks, status="open")
    db.add(placement)
    db.flush()
    set_company_supervisor(db, placement, data.company_supervisor_email, user.id)
    recipients = {student.id, academic.id}
    if placement.company_supervisor_id:
        recipients.add(placement.company_supervisor_id)
    notifications = notify_users(db, recipients, "placement_assigned", placement_id=placement.id)
    db.commit()
    send_push_notifications(db, notifications)
    return placement_output(db, placement)


@router.get("", response_model=PlacementPage, responses={401: ERR[401], 422: ERR[422]})
def list_placements(
    db: DB, user: Anyone,
    status: Annotated[str | None, Query(pattern="^(open|closed)$")] = None,
    student_id: str | None = None,
    school_id: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
):
    """The placements you take part in, or that belong to a school you coordinate, one page at a time."""
    query = select(Placement).where(visible_placements(db, user))
    if status:
        query = query.where(Placement.status == status)
    if student_id:
        query = query.where(Placement.student_id == student_id)
    if school_id:
        query = query.where(Placement.school_id == school_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(Placement.start_date, Placement.id).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": placement_outputs(db, rows), "page": page, "page_size": page_size, "total": total}


@router.get("/{placement_id}", response_model=PlacementOut, responses={k: ERR[k] for k in (401, 403, 404)})
def get_placement(placement_id: str, db: DB, user: Anyone):
    placement = find(db, placement_id)
    require_view(db, user, placement)
    return placement_output(db, placement)


@router.get("/{placement_id}/report", response_model=PlacementReportOut,
            responses={k: ERR[k] for k in (401, 403, 404, 409)})
def placement_report(placement_id: str, db: DB, user: Anyone):
    """Return a closed placement's complete report data to a coordinator of its school."""
    placement = find(db, placement_id)
    require_coordinator(db, user, placement.school_id)
    if placement.status != "closed":
        raise ApiError(409, "placement_not_closed", "Only a closed placement can be exported")

    entries = db.scalars(
        select(Entry).where(Entry.placement_id == placement_id).order_by(Entry.week, Entry.created_at)
    ).all()
    entry_ids = [entry.id for entry in entries]
    reviews = db.scalars(
        select(Review).where(Review.entry_id.in_(entry_ids)).order_by(Review.created_at)
    ).all() if entry_ids else []
    reviewer_ids = {review.reviewer_id for review in reviews}
    reviewers = {
        person.id: person.name
        for person in db.scalars(select(User).where(User.id.in_(reviewer_ids))).all()
    } if reviewer_ids else {}
    reviews_by_entry: dict[str, list[PlacementReportReview]] = {}
    for review in reviews:
        report_review = PlacementReportReview.model_validate(review).model_copy(update={
            "reviewer_name": reviewers.get(review.reviewer_id),
        })
        reviews_by_entry.setdefault(review.entry_id, []).append(report_review)

    report_entries = []
    for entry in entries:
        entry_data = EntryOut.model_validate(entry).model_dump()
        report_entries.append(PlacementReportEntry.model_validate({
            **entry_data,
            "reviews": reviews_by_entry.get(entry.id, []),
        }))
    closed_event = db.scalar(
        select(AuditEvent).where(
            AuditEvent.placement_id == placement_id,
            AuditEvent.action == "placement_closed",
        ).order_by(AuditEvent.created_at.desc()).limit(1)
    )
    school = db.get(School, placement.school_id)
    return PlacementReportOut(
        placement=placement_output(db, placement),
        school_name=school.name,
        closed_at=closed_event.created_at if closed_event else None,
        entries=report_entries,
    )


@router.put("/{placement_id}", response_model=PlacementOut,
            responses={k: ERR[k] for k in (401, 403, 404, 409, 422)})
def update_placement(placement_id: str, data: PlacementUpdate, db: DB, user: Anyone):
    """Change the supervisors of an open placement (coordinator of its school)."""
    placement = find(db, placement_id)
    require_coordinator(db, user, placement.school_id)
    if placement.status == "closed":
        raise ApiError(409, "placement_closed", "A closed placement cannot be changed")
    academic = member_of_school(db, data.academic_supervisor_id, placement.school_id, "academic_supervisor",
                                "supervisor_not_in_school", "academic supervisor")
    placement.academic_supervisor_id, placement.academic_supervisor_name = academic.id, academic.name
    set_company_supervisor(db, placement, data.company_supervisor_email, user.id)
    audit.record(db, actor_id=user.id, action="supervisors_changed", placement_id=placement.id, school_id=placement.school_id)
    db.commit()
    return placement_output(db, placement)


@router.post("/{placement_id}/close", response_model=PlacementOut,
             responses={k: ERR[k] for k in (401, 403, 404, 409, 422)})
def close_placement(placement_id: str, data: FinalEvaluation, db: DB, user: Anyone):
    """Close the placement and record the final evaluation (coordinator of its school)."""
    placement = find(db, placement_id)
    require_coordinator(db, user, placement.school_id)
    if placement.status == "closed":
        raise ApiError(409, "placement_closed", "The placement is already closed")
    placement.status = "closed"
    placement.final_score = data.score
    placement.final_comment = data.comment
    audit.record(db, actor_id=user.id, action="placement_closed", placement_id=placement.id, school_id=placement.school_id,
                 detail=f"score={data.score}")
    recipients = {placement.student_id, placement.academic_supervisor_id}
    if placement.company_supervisor_id:
        recipients.add(placement.company_supervisor_id)
    notifications = notify_users(db, recipients, "placement_closed", placement_id=placement.id)
    db.commit()
    send_push_notifications(db, notifications)
    return placement_output(db, placement)
