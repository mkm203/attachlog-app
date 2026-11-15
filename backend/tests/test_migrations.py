"""The migration must build exactly the tables the models describe, so the two never drift apart."""
from sqlalchemy import create_engine, inspect

import app.database as database
from app.database import Base


def test_the_initial_migration_matches_the_models(tmp_path, monkeypatch):
    from app import migrate

    engine = create_engine(f"sqlite:///{tmp_path / 'm.db'}")
    monkeypatch.setattr(migrate, "engine", engine)
    monkeypatch.setattr(database, "engine", engine)
    migrate.upgrade()

    found = inspect(engine)
    expected = Base.metadata.tables
    assert set(found.get_table_names()) - {"alembic_version"} == set(expected)
    for name, table in expected.items():
        assert {c["name"] for c in found.get_columns(name)} == {c.name for c in table.columns}, name
        assert {i["name"] for i in found.get_indexes(name)} >= {i.name for i in table.indexes}, name
        assert {tuple(fk["constrained_columns"]) for fk in found.get_foreign_keys(name)} == {
            tuple(c.name for c in fk.columns) for fk in table.foreign_key_constraints}, name


def test_a_database_made_before_migrations_is_adopted_not_rebuilt(tmp_path, monkeypatch):
    from app import migrate

    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    Base.metadata.create_all(engine)                  # how the first release created its tables
    monkeypatch.setattr(migrate, "engine", engine)
    monkeypatch.setattr(database, "engine", engine)
    migrate.upgrade()                                 # must not fail with "table already exists"
    assert "alembic_version" in inspect(engine).get_table_names()
