"""Alembic environment: uses the same engine as the app, so DATABASE_URL and the Turso token apply."""
from alembic import context

from app import models  # noqa: F401  (registers the tables on Base.metadata)
from app import database
from app.database import Base

target_metadata = Base.metadata


def run_migrations_online() -> None:
    with database.engine.connect() as connection:   # looked up at run time, so tests can point it elsewhere
        context.configure(connection=connection, target_metadata=target_metadata,
                          render_as_batch=connection.dialect.name == "sqlite",   # SQLite/Turso cannot ALTER freely
                          compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
