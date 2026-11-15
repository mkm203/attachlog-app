"""School administration: the platform admin registers schools and coordinators (/v1/admin),
coordinators run their own school (/v1/schools)."""
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import mailer
from app.access import require_coordinator
from app.database import get_db
from app.errors import ApiError
from app.models import Invite, Membership, Placement, School, User, now
from app.people import grant_or_invite, new_school, unique_join_code, user_by_email
from app.schemas import (AddCoordinator, AdminResetPassword, ErrorResponse, GrantOut, InviteOut, MemberOut, SchoolCreate,
                         SchoolCreated, SchoolDetail, SchoolIn, SchoolOut, SchoolSummary, StaffInvite)
from app.security import current_user, hash_password, require_admin

admin = APIRouter(prefix="/v1/admin", tags=["admin"])
schools = APIRouter(prefix="/v1/schools", tags=["schools"])
DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[User, Depends(require_admin)]
Anyone = Annotated[User, Depends(current_user)]
E = {c: {"model": ErrorResponse} for c in (401, 403, 404, 409, 422)}


def find_school(db: Session, school_id: str) -> School:
    school = db.get(School, school_id)
    if school is None:
        raise ApiError(404, "school_not_found", f"School {school_id} not found")
    return school


def check_term(data: SchoolIn) -> None:
    if data.term_end <= data.term_start:
        raise ApiError(422, "invalid_dates", "term_end must be after term_start")


def grant_out(db: Session, email: str, role: str, created_by: str, school: School) -> GrantOut:
    status, invite = grant_or_invite(db, email, role, created_by, school=school)
    return GrantOut(status=status, email=email, invite=InviteOut.model_validate(invite) if invite else None,
                    email_sent=bool(invite) and mailer.enabled())


def detail(db: Session, school: School) -> SchoolDetail:
    rows = db.execute(select(Membership, User).join(User, User.id == Membership.user_id)
                      .where(Membership.school_id == school.id).order_by(Membership.role, User.name)).all()
    members = [MemberOut(user_id=u.id, name=u.name, email=u.email, role=m.role) for m, u in rows]
    invites = db.scalars(select(Invite).where(Invite.school_id == school.id, Invite.accepted_at.is_(None),
                                              Invite.expires_at > now()).order_by(Invite.created_at.desc())).all()
    return SchoolDetail(school=SchoolOut.model_validate(school), members=members,
                        invites=[InviteOut.model_validate(i) for i in invites])


# ---------------- platform admin ----------------
@admin.get("/schools", response_model=list[SchoolSummary], responses={k: E[k] for k in (401, 403)})
def list_schools(db: DB, user: Admin):
    counts = dict(((sid, role), n) for sid, role, n in db.execute(
        select(Membership.school_id, Membership.role, func.count()).where(Membership.school_id.is_not(None))
        .group_by(Membership.school_id, Membership.role)))
    placed = dict(db.execute(select(Placement.school_id, func.count()).group_by(Placement.school_id)).all())
    out = []
    for s in db.scalars(select(School).order_by(School.name)):
        out.append(SchoolSummary(**SchoolOut.model_validate(s).model_dump(),
                                 coordinators=counts.get((s.id, "coordinator"), 0),
                                 academic_supervisors=counts.get((s.id, "academic_supervisor"), 0),
                                 students=counts.get((s.id, "student"), 0), placements=placed.get(s.id, 0)))
    return out


@admin.post("/schools", response_model=SchoolCreated, status_code=201, responses={k: E[k] for k in (401, 403, 422)})
def create_school(data: SchoolCreate, db: DB, user: Admin):
    """Register a school and invite its first coordinator."""
    check_term(data)
    school = new_school(db, data.name.strip(), data.city.strip(), data.term_start, data.term_end)
    grant = grant_out(db, data.coordinator_email, "coordinator", user.id, school)
    db.commit()
    return SchoolCreated(school=SchoolOut.model_validate(school), coordinator=grant)


@admin.get("/schools/{school_id}", response_model=SchoolDetail, responses={k: E[k] for k in (401, 403, 404)})
def school_detail(school_id: str, db: DB, user: Admin):
    return detail(db, find_school(db, school_id))


@admin.put("/schools/{school_id}", response_model=SchoolOut, responses={k: E[k] for k in (401, 403, 404, 422)})
def update_school(school_id: str, data: SchoolIn, db: DB, user: Admin):
    check_term(data)
    school = find_school(db, school_id)
    school.name, school.city, school.term_start, school.term_end = data.name.strip(), data.city.strip(), data.term_start, data.term_end
    db.commit()
    return school


@admin.post("/schools/{school_id}/coordinators", response_model=GrantOut, status_code=201,
            responses={k: E[k] for k in (401, 403, 404, 422)})
def add_coordinator(school_id: str, data: AddCoordinator, db: DB, user: Admin):
    out = grant_out(db, data.email, "coordinator", user.id, find_school(db, school_id))
    db.commit()
    return out


@admin.post("/schools/{school_id}/join-code", response_model=SchoolOut, responses={k: E[k] for k in (401, 403, 404)})
def new_join_code(school_id: str, db: DB, user: Admin):
    """Replace the school's student join code (the old one stops working)."""
    school = find_school(db, school_id)
    school.join_code = unique_join_code(db)
    db.commit()
    return school


@admin.post("/users/reset-password", responses={k: E[k] for k in (401, 403, 404)})
def reset_user_password(data: AdminResetPassword, db: DB, user: Admin):
    """For when email is not set up: give someone a temporary password to hand over (they should change it)."""
    target = user_by_email(db, data.email)
    if target is None:
        raise ApiError(404, "user_not_found", "No account with this email")
    temp = secrets.token_urlsafe(9)
    target.password_hash = hash_password(temp)
    db.commit()
    return {"email": target.email, "temporary_password": temp}


# ---------------- a coordinator's own school ----------------
@schools.get("/{school_id}", response_model=SchoolDetail, responses={k: E[k] for k in (401, 403, 404)})
def my_school(school_id: str, db: DB, user: Anyone):
    """Join code, members and pending invites of a school you coordinate."""
    require_coordinator(db, user, school_id)
    return detail(db, find_school(db, school_id))


@schools.get("/{school_id}/members", response_model=list[MemberOut], responses={k: E[k] for k in (401, 403, 404)})
def members(school_id: str, db: DB, user: Anyone,
            role: Annotated[str | None, Query(pattern="^(coordinator|academic_supervisor|student)$")] = None):
    """Pick-list for the placement form: students or academic supervisors of your school."""
    require_coordinator(db, user, school_id)
    return [m for m in detail(db, find_school(db, school_id)).members if role is None or m.role == role]


@schools.post("/{school_id}/staff", response_model=GrantOut, status_code=201,
              responses={k: E[k] for k in (401, 403, 404, 422)})
def invite_staff(school_id: str, data: StaffInvite, db: DB, user: Anyone):
    """Invite an academic supervisor by email. If they already have a verified account they are added at once."""
    require_coordinator(db, user, school_id)
    out = grant_out(db, data.email, data.role, user.id, find_school(db, school_id))
    db.commit()
    return out
