"""Database engine, session and the base class of the tables."""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import database_url, turso_auth_token

_url = database_url()


def make_engine(url: str = _url):
    if url.startswith("sqlite+libsql"):
        try:
            import sqlalchemy_libsql  # noqa: F401  (registers the dialect)
        except ImportError as exc:
            raise RuntimeError(
                "DATABASE_URL points to Turso but the libSQL driver is not installed. "
                "Install it with: pip install -r requirements-turso.txt") from exc
        args: dict = {"check_same_thread": False}
        if turso_auth_token():
            args["auth_token"] = turso_auth_token()
        # A fresh connection per use: remote libSQL connections go stale when idle.
        return create_engine(url, connect_args=args, poolclass=NullPool)
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})
    # pool_pre_ping: a cloud Postgres closes idle connections; check before reusing one.
    return create_engine(url, pool_pre_ping=True)


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """One database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
