import uuid
from datetime import datetime
from enum import Enum as PythonEnum

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.types import Enum as SQLEnum

from app.db.base import Base


class MeetingStatus(str, PythonEnum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    title = Column(String, nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    duration = Column(Integer, default=0, nullable=False)
    status = Column(
        SQLEnum(MeetingStatus, name="meeting_status", create_type=False),
        default=MeetingStatus.PROCESSING,
        nullable=False,
    )
    failure_reason = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    transcript = Column(Text, nullable=True)
    media_path = Column(String, nullable=True)
    media_filename = Column(String, nullable=True)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    action_items = relationship(
        "ActionItem",
        back_populates="meeting",
        cascade="all, delete-orphan",
    )
    key_decisions = relationship(
        "KeyDecision",
        back_populates="meeting",
        cascade="all, delete-orphan",
    )
    creator = relationship("User")
