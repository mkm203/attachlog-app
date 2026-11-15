"""initial schema: users, schools, companies, memberships, invites, password resets, placements, entries, reviews

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(200), nullable=False),
        sa.Column("is_admin", sa.Boolean, nullable=False),
        sa.Column("email_verified", sa.Boolean, nullable=False),
        sa.Column("created_at", TS, nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "schools",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("city", sa.String(80), nullable=False),
        sa.Column("join_code", sa.String(12), nullable=False),
        sa.Column("term_start", sa.Date, nullable=False),
        sa.Column("term_end", sa.Date, nullable=False),
        sa.Column("created_at", TS, nullable=False),
    )
    op.create_index("ix_schools_join_code", "schools", ["join_code"], unique=True)

    op.create_table(
        "companies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("city", sa.String(80), nullable=False),
        sa.Column("created_at", TS, nullable=False),
    )

    op.create_table(
        "memberships",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("school_id", sa.String(36), sa.ForeignKey("schools.id"), nullable=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=True),
        sa.Column("created_at", TS, nullable=False),
        sa.UniqueConstraint("user_id", "role", "school_id", "company_id", name="uq_membership"),
    )
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])
    op.create_index("ix_memberships_school_id", "memberships", ["school_id"])
    op.create_index("ix_memberships_company_id", "memberships", ["company_id"])

    op.create_table(
        "invites",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(12), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("school_id", sa.String(36), sa.ForeignKey("schools.id"), nullable=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("expires_at", TS, nullable=False),
        sa.Column("accepted_at", TS, nullable=True),
    )
    op.create_index("ix_invites_code", "invites", ["code"], unique=True)
    op.create_index("ix_invites_email", "invites", ["email"])

    op.create_table(
        "password_resets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", TS, nullable=False),
        sa.Column("attempts", sa.Integer, nullable=False),
        sa.Column("used_at", TS, nullable=True),
    )
    op.create_index("ix_password_resets_user_id", "password_resets", ["user_id"])

    op.create_table(
        "placements",
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
        sa.Column("final_comment", sa.Text, nullable=True),
    )
    for col in ("school_id", "company_id", "student_id", "company_supervisor_id", "company_supervisor_email",
                "academic_supervisor_id"):
        op.create_index(f"ix_placements_{col}", "placements", [col])

    op.create_table(
        "entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("placement_id", sa.String(36), sa.ForeignKey("placements.id"), nullable=False),
        sa.Column("student_id", sa.String(36), nullable=False),
        sa.Column("week", sa.Integer, nullable=False),
        sa.Column("tasks", sa.Text, nullable=False),
        sa.Column("hours", sa.Integer, nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("updated_at", TS, nullable=False),
        sa.UniqueConstraint("placement_id", "week", name="uq_entry_placement_week"),
    )
    op.create_index("ix_entries_placement_id", "entries", ["placement_id"])
    op.create_index("ix_entries_student_id", "entries", ["student_id"])

    op.create_table(
        "reviews",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("entry_id", sa.String(36), sa.ForeignKey("entries.id"), nullable=False),
        sa.Column("reviewer_id", sa.String(36), nullable=False),
        sa.Column("decision", sa.String(10), nullable=False),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column("created_at", TS, nullable=False),
    )
    op.create_index("ix_reviews_entry_id", "reviews", ["entry_id"])


def downgrade() -> None:
    for table in ("reviews", "entries", "placements", "password_resets", "invites", "memberships",
                  "companies", "schools", "users"):
        op.drop_table(table)
