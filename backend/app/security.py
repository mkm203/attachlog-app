"""Passwords, tokens and the logged-in user. A token carries only the user id (`sub`);
what the person may do comes from their memberships, looked up on every request."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app import config
from app.database import get_db
from app.errors import ApiError
from app.models import User

bearer = HTTPBearer(auto_error=False)
ITERATIONS = 310_000
_DUMMY = "pbkdf2_sha256$%d$%s$%s" % (ITERATIONS, "00" * 16, "00" * 32)


def _pbkdf2(password: str, salt: bytes, iterations: int) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${_pbkdf2(password, salt, ITERATIONS).hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    """Always spends the same time, so a missing account is not revealed by a faster answer."""
    try:
        _, iterations, salt, expected = (stored or _DUMMY).split("$")
        ok = hmac.compare_digest(_pbkdf2(password, bytes.fromhex(salt), int(iterations)), bytes.fromhex(expected))
    except ValueError:
        return False
    return ok and stored is not None


def make_token(user_id: str) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    expires_in = config.jwt_ttl_minutes() * 60
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(seconds=expires_in)}
    return jwt.encode(payload, config.jwt_secret(), algorithm="HS256"), expires_in


def current_user(creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
                 db: Annotated[Session, Depends(get_db)]) -> User:
    """401 when there is no valid token or the account no longer exists."""
    if creds is None:
        raise ApiError(401, "not_authenticated", "Missing bearer token")
    try:
        claims = jwt.decode(creds.credentials, config.jwt_secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ApiError(401, "invalid_token", "Invalid or expired token")
    user = db.get(User, claims["sub"]) if claims.get("sub") else None
    if user is None:
        raise ApiError(401, "invalid_token", "Token has no valid subject")
    return user


def require_admin(user: Annotated[User, Depends(current_user)]) -> User:
    """403 unless the caller is the platform administrator."""
    if not user.is_admin:
        raise ApiError(403, "forbidden", "This action is for the platform administrator")
    return user
