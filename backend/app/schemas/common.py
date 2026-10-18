from datetime import datetime, date
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ChatSource(BaseModel):
    meeting_id: UUID
    meeting_title: str


class ActionItemBase(BaseModel):
    text: str
    owner_name: str
    owner_initials: str
    owner_id: Optional[UUID] = None
    due_date: Optional[date] = None
    completed: bool = False


class ActionItemCreate(ActionItemBase):
    pass


class ActionItem(ActionItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    meeting_id: UUID


class ActionItemUpdate(BaseModel):
    completed: Optional[bool] = None


class KeyDecisionBase(BaseModel):
    text: str


class KeyDecisionCreate(KeyDecisionBase):
    pass


class KeyDecision(KeyDecisionBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    meeting_id: UUID


class MeetingBase(BaseModel):
    title: str
    date: datetime
    duration: int = 0


class MeetingCreate(MeetingBase):
    pass


class Meeting(MeetingBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    status: str
    failure_reason: Optional[str] = None
    summary: Optional[str] = None
    transcript: Optional[str] = None
    media_filename: Optional[str] = None
    created_by: UUID
    action_items: List[ActionItem] = []
    key_decisions: List[KeyDecision] = []


class MeetingListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    date: datetime
    duration: int
    status: str
    failure_reason: Optional[str] = None
    media_filename: Optional[str] = None
    created_by: UUID


class MeetingStatusResponse(BaseModel):
    id: UUID
    status: str
    failure_reason: Optional[str] = None


class PaginatedMeetings(BaseModel):
    items: List[MeetingListItem]
    total: int
    page: int
    per_page: int
    pages: int


class UserBase(BaseModel):
    name: str
    email: str


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class User(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime


class UserStats(BaseModel):
    total_meetings: int
    ready_meetings: int
    failed_meetings: int
    processing_meetings: int
    total_duration_minutes: int
    total_action_items: int
    pending_action_items: int
    completed_action_items: int
    total_key_decisions: int


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


class ChatMessageBase(BaseModel):
    role: str
    text: str
    meeting_id: Optional[UUID] = None


class ChatMessageCreate(ChatMessageBase):
    sources: Optional[List[ChatSource]] = None


class ChatMessage(ChatMessageBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    sources: Optional[List[ChatSource]] = None
    timestamp: datetime


class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str
    sources: List[ChatSource] = []
