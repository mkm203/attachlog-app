"""add user profile fields

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("phone", sa.String(40), nullable=True))
        batch.add_column(sa.Column("field_of_study", sa.String(120), nullable=True))
        batch.add_column(sa.Column("specialty", sa.String(120), nullable=True))
        batch.add_column(sa.Column("teaching_field", sa.String(120), nullable=True))
        batch.add_column(sa.Column("bio", sa.Text(), nullable=True))
        batch.add_column(sa.Column("avatar", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("avatar")
        batch.drop_column("bio")
        batch.drop_column("teaching_field")
        batch.drop_column("specialty")
        batch.drop_column("field_of_study")
        batch.drop_column("phone")
