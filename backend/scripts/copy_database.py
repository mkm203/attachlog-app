"""Copy all the data of one AttachLog database into another (for example local SQLite -> Turso).

The destination is the database the app itself would use: set DATABASE_URL (and TURSO_AUTH_TOKEN for Turso)
in the environment first. The source is given as an argument.

    # PowerShell or bash, from the backend folder
    DATABASE_URL=libsql://<db>.turso.io TURSO_AUTH_TOKEN=<token> python scripts/copy_database.py sqlite:///./attachlog.db

The destination must be empty (no users yet): the script stops instead of mixing data. It creates the tables
first (Alembic), copies every table in dependency order inside one transaction, and prints the row counts.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select  # noqa: E402

from app import migrate, models  # noqa: E402,F401  (models registers the tables)
from app.database import Base, engine, make_engine  # noqa: E402


def main(source_url: str) -> int:
    source = make_engine(source_url)
    if source.url == engine.url:
        print("Source and destination are the same database.")
        return 1

    migrate.upgrade()  # creates the tables on the destination
    users = Base.metadata.tables["users"]
    with engine.connect() as dest:
        if dest.execute(select(func.count()).select_from(users)).scalar():
            print("The destination already has users. Use an empty database.")
            return 1

    copied = {}
    with source.connect() as src, engine.begin() as dest:
        for table in Base.metadata.sorted_tables:  # parents before children
            rows = [dict(r._mapping) for r in src.execute(select(table))]
            if rows:
                dest.execute(table.insert(), rows)
            copied[table.name] = len(rows)
    for name, n in copied.items():
        print(f"{name}: {n}")
    print("Done.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
