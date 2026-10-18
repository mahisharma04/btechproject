from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select

from app.core.config import settings
from app.core.deps import CurrentUser, DBSession
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.models import ActionItem, KeyDecision, Meeting, MeetingStatus, User
from app.schemas import Token, UserCreate, User as UserSchema, UserStats

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: DBSession):
    existing = await db.execute(
        select(User).where(User.email.ilike(payload.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered",
        )

    user = User(
        name=payload.name,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserSchema.model_validate(user),
    )


@router.post("/login", response_model=Token)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DBSession,
):
    result = await db.execute(
        select(User).where(User.email.ilike(form_data.username))
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserSchema.model_validate(user),
    )


@router.get("/me", response_model=UserSchema)
async def get_me(current_user: CurrentUser):
    return UserSchema.model_validate(current_user)


@router.get("/me/stats", response_model=UserStats)
async def get_me_stats(current_user: CurrentUser, db: DBSession):
    meeting_ids_subq = (
        select(Meeting.id)
        .where(Meeting.created_by == current_user.id)
        .scalar_subquery()
    )

    total_meetings_q = select(func.count(Meeting.id)).where(
        Meeting.created_by == current_user.id
    )
    ready_meetings_q = select(func.count(Meeting.id)).where(
        Meeting.created_by == current_user.id,
        Meeting.status == MeetingStatus.READY,
    )
    failed_meetings_q = select(func.count(Meeting.id)).where(
        Meeting.created_by == current_user.id,
        Meeting.status == MeetingStatus.FAILED,
    )
    processing_meetings_q = select(func.count(Meeting.id)).where(
        Meeting.created_by == current_user.id,
        Meeting.status == MeetingStatus.PROCESSING,
    )
    total_duration_q = select(func.coalesce(func.sum(Meeting.duration), 0)).where(
        Meeting.created_by == current_user.id,
        Meeting.status == MeetingStatus.READY,
    )
    total_action_items_q = select(func.count(ActionItem.id)).where(
        ActionItem.meeting_id.in_(meeting_ids_subq)
    )
    pending_action_items_q = select(func.count(ActionItem.id)).where(
        ActionItem.meeting_id.in_(meeting_ids_subq),
        ActionItem.completed == False,
    )
    completed_action_items_q = select(func.count(ActionItem.id)).where(
        ActionItem.meeting_id.in_(meeting_ids_subq),
        ActionItem.completed == True,
    )
    total_key_decisions_q = select(func.count(KeyDecision.id)).where(
        KeyDecision.meeting_id.in_(meeting_ids_subq)
    )

    from sqlalchemy import union_all

    combined = union_all(
        total_meetings_q,
        ready_meetings_q,
        failed_meetings_q,
        processing_meetings_q,
        total_duration_q,
        total_action_items_q,
        pending_action_items_q,
        completed_action_items_q,
        total_key_decisions_q,
    )
    results = await db.execute(combined)
    rows = [r[0] for r in results.all()]

    return UserStats(
        total_meetings=int(rows[0]),
        ready_meetings=int(rows[1]),
        failed_meetings=int(rows[2]),
        processing_meetings=int(rows[3]),
        total_duration_minutes=int(rows[4]),
        total_action_items=int(rows[5]),
        pending_action_items=int(rows[6]),
        completed_action_items=int(rows[7]),
        total_key_decisions=int(rows[8]),
    )
