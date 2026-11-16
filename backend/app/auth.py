"""Accounts: sign up with a code, log in, who am I, join another school, passwords."""
import hashlib
import secrets
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import mailer, ratelimit
from app.access import memberships
from app.database import get_db
from app.errors import ApiError
from app.models import Company, PasswordReset, School, User, now
from app.people import redeem, user_by_email
from app.schemas import (ChangePassword, ErrorResponse, ForgotRequest, LoginRequest, MeOut, MembershipOut,
                         ProfileUpdate, RedeemRequest, RegisterRequest, ResetRequest, TokenResponse)
from app.security import current_user, hash_password, make_token, verify_password

router = APIRouter(prefix="/v1", tags=["accounts"])
DB = Annotated[Session, Depends(get_db)]
Me = Annotated[User, Depends(current_user)]
E = {c: {"model": ErrorResponse} for c in (401, 403, 409, 422, 429)}
RESET_MINUTES = 30
MAX_RESET_ATTEMPTS = 5


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def me_out(db: Session, user: User) -> MeOut:
    rows = memberships(db, user.id)
    schools = {s.id: s.name for s in db.scalars(select(School).where(School.id.in_([m.school_id for m in rows if m.school_id])))} if rows else {}
    companies = {c.id: c.name for c in db.scalars(select(Company).where(Company.id.in_([m.company_id for m in rows if m.company_id])))} if rows else {}
    return MeOut(id=user.id, name=user.name, email=user.email, is_admin=user.is_admin, email_verified=user.email_verified,
                 phone=user.phone, field_of_study=user.field_of_study, specialty=user.specialty,
                 teaching_field=user.teaching_field, bio=user.bio, avatar=user.avatar,
                 memberships=[MembershipOut(id=m.id, role=m.role, school_id=m.school_id, school_name=schools.get(m.school_id),
                                            company_id=m.company_id, company_name=companies.get(m.company_id)) for m in rows])


def token_response(db: Session, user: User) -> dict:
    token, expires_in = make_token(user.id)
    return {"access_token": token, "token_type": "bearer", "expires_in": expires_in, "user": me_out(db, user)}


@router.post("/auth/register", response_model=TokenResponse, status_code=201,
             responses={k: E[k] for k in (409, 422)})
def register(data: RegisterRequest, db: DB, request: Request):
    """Create an account with a code: an invite code sent to this email, or your school's join code (students)."""
    ip = client_ip(request)
    ratelimit.code_attempts.guard(ip)
    if user_by_email(db, data.email):
        raise ApiError(409, "email_taken", "This email already has an account. Log in, then use 'Join with a code'.")
    user = User(email=data.email, name=data.name.strip(), password_hash=hash_password(data.password),
                field_of_study=(getattr(data, 'field_of_study', None) or '').strip() or None,
                specialty=(getattr(data, 'specialty', None) or '').strip() or None)
    db.add(user)
    try:
        db.flush()
        redeem(db, user, data.code)      # a bad code rolls the whole sign-up back
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "email_taken", "This email already has an account. Log in, then use 'Join with a code'.")
    except ApiError:
        db.rollback()
        ratelimit.code_attempts.hit(ip)
        raise
    db.commit()
    return token_response(db, user)


@router.post("/auth/login", response_model=TokenResponse, responses={401: E[401], 422: E[422]})
def login(data: LoginRequest, db: DB, request: Request):
    """Email and password for a signed token. Unknown email and wrong password give the same 401.
    Eight wrong passwords for one email (or thirty from one address) in five minutes block further tries (429)."""
    ip = client_ip(request)
    key = f"{ip}|{data.email}"
    ratelimit.login_by_email.guard(key)
    ratelimit.login_by_ip.guard(ip)
    user = user_by_email(db, data.email)
    if not verify_password(data.password, user.password_hash if user else None):
        ratelimit.login_by_email.hit(key)
        ratelimit.login_by_ip.hit(ip)
        raise ApiError(401, "invalid_credentials", "Invalid email or password")
    ratelimit.login_by_email.reset(key)
    return token_response(db, user)


@router.get("/me", response_model=MeOut, responses={401: E[401]})
def me(db: DB, user: Me):
    return me_out(db, user)


@router.post("/me/redeem", response_model=MeOut, responses={k: E[k] for k in (401, 403, 422)})
def redeem_code(data: RedeemRequest, db: DB, user: Me):
    """Add a role or a school to your account with a code (an invite, or a school's join code for students)."""
    ratelimit.code_attempts.guard(user.id)
    try:
        redeem(db, user, data.code)
    except ApiError:
        db.rollback()
        ratelimit.code_attempts.hit(user.id)
        raise
    db.commit()
    return me_out(db, user)


@router.post("/me/password", status_code=204, responses={k: E[k] for k in (401, 403, 422)})
def change_password(data: ChangePassword, db: DB, user: Me):
    if not verify_password(data.current_password, user.password_hash):
        raise ApiError(403, "wrong_password", "The current password is wrong")
    user.password_hash = hash_password(data.new_password)
    db.commit()


@router.put("/me", response_model=MeOut, responses={401: E[401], 422: E[422]})
def update_profile(data: ProfileUpdate, db: DB, user: Me):
    user.name = data.name.strip()
    user.phone = (data.phone or '').strip() or None
    user.field_of_study = (data.field_of_study or '').strip() or None
    user.specialty = (data.specialty or '').strip() or None
    user.teaching_field = (data.teaching_field or '').strip() or None
    user.bio = (data.bio or '').strip() or None
    user.avatar = data.avatar or None
    db.commit()
    return me_out(db, user)


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


@router.post("/auth/forgot", status_code=202, responses={422: E[422]})
def forgot_password(data: ForgotRequest, db: DB, request: Request):
    """Email a 6-digit code (needs the email provider). The answer is the same whether or not the account exists."""
    key = f"{client_ip(request)}|{data.email}"
    ratelimit.reset_requests.guard(key)
    ratelimit.reset_requests.hit(key)
    user = user_by_email(db, data.email)
    if user is not None and mailer.enabled():
        code = f"{secrets.randbelow(10**6):06d}"
        db.add(PasswordReset(user_id=user.id, code_hash=_hash_code(code), expires_at=now() + timedelta(minutes=RESET_MINUTES)))
        db.commit()
        mailer.send(user.email, "Your AttachLog reset code",
                    f"Your code is {code}. It works for {RESET_MINUTES} minutes. Ignore this email if it was not you.")
    return {"status": "If the address has an account, a code was sent."}


@router.post("/auth/reset", status_code=204, responses={k: E[k] for k in (422, 429)})
def reset_password(data: ResetRequest, db: DB, request: Request):
    """Set a new password with the emailed code. Five wrong tries burn the code."""
    ip = client_ip(request)
    ratelimit.code_attempts.guard(ip)
    ratelimit.code_attempts.hit(ip)
    bad = ApiError(422, "invalid_code", "This code is wrong or has expired.")
    user = user_by_email(db, data.email)
    if user is None:
        raise bad
    reset = db.scalar(select(PasswordReset).where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None),
                                                  PasswordReset.expires_at > now()).order_by(PasswordReset.expires_at.desc()))
    if reset is None or reset.attempts >= MAX_RESET_ATTEMPTS:
        raise bad
    if not secrets.compare_digest(reset.code_hash, _hash_code(data.code.strip())):
        reset.attempts += 1
        db.commit()
        raise bad
    reset.used_at = now()
    user.password_hash = hash_password(data.new_password)
    user.email_verified = True      # they read a message sent to this address
    db.commit()
