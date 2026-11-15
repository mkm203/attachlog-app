"""Bring the database to the latest schema (Alembic), at every start-up."""
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.database import engine

ROOT = Path(__file__).resolve().parent.parent


def config() -> Config:
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    return cfg


def upgrade() -> None:
    """Apply pending migrations. A database that was created before migrations existed (tables, but no
    alembic_version) is marked as already at the first version instead of being created twice."""
    tables = set(inspect(engine).get_table_names())
    if "users" in tables and "alembic_version" not in tables:
        command.stamp(config(), "0001")
    command.upgrade(config(), "head")
