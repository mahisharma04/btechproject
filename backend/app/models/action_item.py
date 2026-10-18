import uuid

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    ForeignKey,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base


class ActionItem(Base):
    __tablename__ = "action_items"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    meeting_id = Column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    text = Column(Text, nullable=False)
    owner_name = Column(String, nullable=False)
    owner_initials = Column(String, nullable=False)
    owner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    due_date = Column(Date, nullable=True)
    completed = Column(Boolean, default=False, nullable=False)

    meeting = relationship("Meeting", back_populates="action_items")
