"""Creating schools and companies, giving roles, invites and codes. Used by the auth, admin and school routes."""
import secrets
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import mailer
from app.errors import ApiError
from app.models import Company, Invite, Membership, Placement, School, User, as_utc, now

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L: easy to read out loud and type
INVITE_DAYS = 14


def new_code(length: int) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def normalize_code(raw: str) -> str:
    return "".join(ch for ch in raw.upper() if ch.isalnum())


def user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.strip().lower()))


def new_school(db: Session, name: str, city: str, term_start, term_end) -> School:
    school = School(name=name, city=city, term_start=term_start, term_end=term_end, join_code=unique_join_code(db))
    db.add(school)
    db.flush()
    return school


def unique_join_code(db: Session) -> str:
    while True:
        code = new_code(8)
        if not db.scalar(select(School.id).where(School.join_code == code)):
            return code


def find_or_create_company(db: Session, name: str, city: str) -> Company:
    company = db.scalar(select(Company).where(func.lower(Company.name) == name.strip().lower(),
                                              func.lower(Company.city) == city.strip().lower()))
    if company is None:
        company = Company(name=name.strip(), city=city.strip())
        db.add(company)
        db.flush()
    return company


def ensure_membership(db: Session, user_id: str, role: str, school_id: str | None, company_id: str | None) -> Membership:
    found = db.scalar(select(Membership).where(
        Membership.user_id == user_id, Membership.role == role,
        Membership.school_id == school_id if school_id else Membership.school_id.is_(None),
        Membership.company_id == company_id if company_id else Membership.company_id.is_(None)))
    if found is None:
        found = Membership(user_id=user_id, role=role, school_id=school_id, company_id=company_id)
        db.add(found)
        db.flush()
    return found


def grant_or_invite(db: Session, email: str, role: str, created_by: str, *, school: School | None = None,
                    company: Company | None = None) -> tuple[str, Invite | None]:
    """Give `email` a role now when they already have a verified account, otherwise create an invite.

    An unverified account is not trusted: anyone can sign up with someone else's address using a school code,
    so a role is only handed over to an address once its owner has redeemed a code sent to it.
    """
    email = email.strip().lower()
    school_id = school.id if school else None
    company_id = company.id if company else None
    user = user_by_email(db, email)
    if user is not None and user.email_verified:
        ensure_membership(db, user.id, role, school_id, company_id)
        attach_pending(db, user)
        return "member", None
    invite = db.scalar(select(Invite).where(
        Invite.email == email, Invite.role == role, Invite.accepted_at.is_(None), Invite.expires_at > now(),
        Invite.school_id == school_id if school_id else Invite.school_id.is_(None),
        Invite.company_id == company_id if company_id else Invite.company_id.is_(None)))
    if invite is None:
        invite = Invite(code=new_code(10), email=email, role=role, school_id=school_id, company_id=company_id,
                        created_by=created_by, expires_at=now() + timedelta(days=INVITE_DAYS))
        db.add(invite)
        db.flush()
    # Send (or send again) every time the invitation is requested: the first attempt may have failed.
    where = school.name if school else company.name if company else "AttachLog"
    invite.email_sent = mailer.send(  # a plain attribute, not a column: it only says what happened just now
        email, f"You are invited to AttachLog ({where})",
        f"You have been invited to {where} on AttachLog as: {role.replace('_', ' ')}.\n\n"
        f"1. Install the AttachLog app.\n2. Choose 'Create account' and enter this code: {invite.code}\n"
        f"3. Use this email address ({email}).\n\nThe code works for {INVITE_DAYS} days.")
    return "invited", invite


def redeem(db: Session, user: User, raw_code: str) -> None:
    """Use an invite code or a school's join code for this user. Raises ApiError(422, invalid_code) otherwise."""
    code = normalize_code(raw_code)
    invite = db.scalar(select(Invite).where(Invite.code == code))
    if invite is not None:
        if invite.accepted_at is not None or as_utc(invite.expires_at) <= now():
            raise ApiError(422, "invalid_code", "This code was already used or has expired. Ask for a new one.")
        if invite.email != user.email:
            raise ApiError(403, "invite_email_mismatch", f"This code was sent to a different email address")
        ensure_membership(db, user.id, invite.role, invite.school_id, invite.company_id)
        invite.accepted_at = now()
        user.email_verified = True
        attach_pending(db, user)
        return
    school = db.scalar(select(School).where(School.join_code == code))
    if school is None:
        raise ApiError(422, "invalid_code", "This code is not valid. Check it and try again.")
    ensure_membership(db, user.id, "student", school.id, None)


def attach_pending(db: Session, user: User) -> None:
    """Placements waiting for this company supervisor (by email) get linked now that the account is verified."""
    if not user.email_verified:
        return
    waiting = db.scalars(select(Placement).where(Placement.company_supervisor_email == user.email,
                                                 Placement.company_supervisor_id.is_(None)))
    for placement in waiting:
        placement.company_supervisor_id = user.id
        placement.company_supervisor_name = user.name
        ensure_membership(db, user.id, "company_supervisor", None, placement.company_id)
