"""add media columns to meetings

Revision ID: 0002_add_media_columns
Revises: 0001_initial
Create Date: 2026-09-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_add_media_columns"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("meetings", sa.Column("media_path", sa.String(), nullable=True))
    op.add_column("meetings", sa.Column("media_filename", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("meetings", "media_filename")
    op.drop_column("meetings", "media_path")
