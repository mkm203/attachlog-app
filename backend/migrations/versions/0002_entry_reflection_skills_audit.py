"""add entry reflection/skills and audit events

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    with op.batch_alter_table("entries") as batch:
        batch.add_column(sa.Column("reflection", sa.Text(), nullable=True))
        batch.add_column(sa.Column("skills", sa.String(400), nullable=True))

    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("school_id", sa.String(36), sa.ForeignKey("schools.id"), nullable=True),
        sa.Column("placement_id", sa.String(36), sa.ForeignKey("placements.id"), nullable=True),
        sa.Column("actor_id", sa.String(36), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", TS, nullable=False),
    )
    op.create_index("ix_audit_events_school_id", "audit_events", ["school_id"])
    op.create_index("ix_audit_events_placement_id", "audit_events", ["placement_id"])
    op.create_index("ix_audit_events_actor_id", "audit_events", ["actor_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_actor_id", table_name="audit_events")
    op.drop_index("ix_audit_events_placement_id", table_name="audit_events")
    op.drop_index("ix_audit_events_school_id", table_name="audit_events")
    op.drop_table("audit_events")
    with op.batch_alter_table("entries") as batch:
        batch.drop_column("skills")
        batch.drop_column("reflection")
