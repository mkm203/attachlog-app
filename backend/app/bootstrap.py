"""Start-up work: make sure the platform administrator account exists and matches ADMIN_EMAIL / ADMIN_PASSWORD."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import User
from app.security import hash_password, verify_password


def ensure_admin(db: Session) -> bool:
    """The environment is the source of truth for the admin: change ADMIN_PASSWORD and restart to reset it."""
    email, password = config.admin_email(), config.admin_password()
    if not email or not password:
        return False
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, name="Administrator", password_hash=hash_password(password),
                    is_admin=True, email_verified=True)
        db.add(user)
    else:
        user.is_admin, user.email_verified = True, True
        if not verify_password(password, user.password_hash):
            user.password_hash = hash_password(password)
    db.commit()
    return True
