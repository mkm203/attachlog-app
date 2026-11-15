"""Who may see or change what. Every rule starts from memberships and from the placement."""
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import Membership, Placement, User


def memberships(db: Session, user_id: str) -> list[Membership]:
    return list(db.scalars(select(Membership).where(Membership.user_id == user_id)))


def school_ids(db: Session, user_id: str, role: str) -> list[str]:
    return [m.school_id for m in memberships(db, user_id) if m.role == role and m.school_id]


def require_coordinator(db: Session, user: User, school_id: str | None = None) -> str:
    """Return the school the coordinator acts on. A coordinator of one school need not name it."""
    mine = school_ids(db, user.id, "coordinator")
    if school_id is not None:
        if school_id not in mine:
            raise ApiError(403, "forbidden", "You are not a coordinator of this school")
        return school_id
    if not mine:
        raise ApiError(403, "forbidden", "This action needs the coordinator role")
    if len(mine) > 1:
        raise ApiError(422, "school_required", "You coordinate several schools: say which one (school_id)")
    return mine[0]


def can_view_placement(db: Session, user: User, p: Placement) -> bool:
    return (user.id in (p.student_id, p.company_supervisor_id, p.academic_supervisor_id)
            or p.school_id in school_ids(db, user.id, "coordinator"))


def require_view(db: Session, user: User, p: Placement) -> None:
    if not can_view_placement(db, user, p):
        raise ApiError(403, "forbidden", "This placement is not yours to see")


def visible_placements(db: Session, user: User):
    """SQL condition: the placements this person is part of, or that belong to a school they coordinate."""
    return or_(Placement.student_id == user.id, Placement.company_supervisor_id == user.id,
               Placement.academic_supervisor_id == user.id,
               Placement.school_id.in_(school_ids(db, user.id, "coordinator")))
