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
    """A pre-migrations database (0001-era tables, no alembic_version) is stamped 0001 and upgraded to head."""
    import sqlalchemy as sa
    from app import migrate

    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    TS = sa.DateTime(timezone=True)
    meta = sa.MetaData()
    sa.Table("users", meta,
             sa.Column("id", sa.String(36), primary_key=True),
             sa.Column("email", sa.String(254), nullable=False),
             sa.Column("name", sa.String(120), nullable=False),
             sa.Column("password_hash", sa.String(200), nullable=False),
             sa.Column("is_admin", sa.Boolean, nullable=False),
             sa.Column("email_verified", sa.Boolean, nullable=False),
             sa.Column("created_at", TS, nullable=False))
    sa.Table("schools", meta,
             sa.Column("id", sa.String(36), primary_key=True),
             sa.Column("name", sa.String(160), nullable=False),
             sa.Column("city", sa.String(80), nullable=False),
             sa.Column("join_code", sa.String(12), nullable=False),
             sa.Column("term_start", sa.Date, nullable=False),
             sa.Column("term_end", sa.Date, nullable=False),
             sa.Column("created_at", TS, nullable=False))
    sa.Table("companies", meta,
             sa.Column("id", sa.String(36), primary_key=True),
             sa.Column("name", sa.String(120), nullable=False),
             sa.Column("city", sa.String(80), nullable=False),
             sa.Column("created_at", TS, nullable=False))
    sa.Table("memberships", meta,
             sa.Column("id", sa.String(36), primary_key=True),
             sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
             sa.Column("role", sa.String(20), nullable=False),
             sa.Column("school_id", sa.String(36), sa.ForeignKey("schools.id"), nullable=True),
             sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=True),
             sa.Column("created_at", TS, nullable=False),
             sa.UniqueConstraint("user_id", "role", "school_id", "company_id", name="uq_membership"))
    sa.Table("invites", meta,
             sa.Column("id", sa.String(36), primary_key=True),
             sa.Column("code", sa.String(12), nullable=False),
             sa.Column("email", sa.String(254), nullable=False),
             sa.Column("role", sa.String(20), nullable=False),
             sa.Column("school_id", sa.String(36), sa.ForeignKey("schools.id"), nullable=True),
             sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=True),
             sa.Column("created_by", sa.String(36), nullable=False),
             sa.Column("created_at", TS, nullable=False),
             sa.Column("expires_at", TS, nullable=False),
             sa.Column("accepted_at", TS, nullable=True))
    sa.Table("password_resets", meta,
             sa.Column("id", sa.String(36), primary_key=True),
             sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
             sa.Column("code_hash", sa.String(64), nullable=False),
             sa.Column("expires_at", TS, nullable=False),
             sa.Column("attempts", sa.Integer, nullable=False),
             sa.Column("used_at", TS, nullable=True))
    sa.Table("placements", meta,
             sa.Column("id", sa.String(36), primary_key=True),
             sa.Column("school_id", sa.String(36), sa.ForeignKey("schools.id"), nullable=False),
             sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=False),
             sa.Column("student_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
             sa.Column("student_name", sa.String(120), nullable=False),
             sa.Column("company_name", sa.String(120), nullable=False),
             sa.Column("company_city", sa.String(80), nullable=False),
             sa.Column("company_supervisor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
             sa.Column("company_supervisor_name", sa.String(120), nullable=True),
             sa.Column("company_supervisor_email", sa.String(254), nullable=False),
             sa.Column("academic_supervisor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
             sa.Column("academic_supervisor_name", sa.String(120), nullable=False),
             sa.Column("start_date", sa.Date, nullable=False),
             sa.Column("end_date", sa.Date, nullable=False),
             sa.Column("total_weeks", sa.Integer, nullable=False),
             sa.Column("status", sa.String(10), nullable=False),
             sa.Column("final_score", sa.Integer, nullable=True),
             sa.Column("final_comment", sa.Text, nullable=True))
    sa.Table("entries", meta,
             sa.Column("id", sa.String(36), primary_key=True),
             sa.Column("placement_id", sa.String(36), sa.ForeignKey("placements.id"), nullable=False),
             sa.Column("student_id", sa.String(36), nullable=False),
             sa.Column("week", sa.Integer, nullable=False),
             sa.Column("tasks", sa.Text, nullable=False),
             sa.Column("hours", sa.Integer, nullable=False),
             sa.Column("status", sa.String(10), nullable=False),
             sa.Column("created_at", TS, nullable=False),
             sa.Column("updated_at", TS, nullable=False),
             sa.UniqueConstraint("placement_id", "week", name="uq_entry_placement_week"))
    sa.Table("reviews", meta,
             sa.Column("id", sa.String(36), primary_key=True),
             sa.Column("entry_id", sa.String(36), sa.ForeignKey("entries.id"), nullable=False),
             sa.Column("reviewer_id", sa.String(36), nullable=False),
             sa.Column("decision", sa.String(10), nullable=False),
             sa.Column("comment", sa.Text, nullable=True),
             sa.Column("created_at", TS, nullable=False))
    meta.create_all(engine)

    monkeypatch.setattr(migrate, "engine", engine)
    monkeypatch.setattr(database, "engine", engine)
    migrate.upgrade()                                 # must not fail and must reach head
    found = inspect(engine)
    assert "alembic_version" in found.get_table_names()
    assert "reflection" in {c["name"] for c in found.get_columns("entries")}
    assert "audit_events" in found.get_table_names()
