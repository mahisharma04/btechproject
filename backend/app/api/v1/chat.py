import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DBSession
from app.models import ChatMessage, ChatRole, Meeting, MeetingStatus
from app.schemas import (
    ChatMessage as ChatMessageSchema,
    ChatRequest,
    ChatResponse,
    ChatSource,
)

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

NO_INFO_MESSAGE = (
    "I couldn't find anything relevant to your question in the meeting transcripts. "
    "Please try rephrasing or asking about a specific topic that was discussed."
)


async def _get_meeting_titles(db: DBSession, user_id: UUID, meeting_ids: List[str]) -> dict:
    if not meeting_ids:
        return {}
    uuids = [UUID(mid) for mid in meeting_ids if mid]
    if not uuids:
        return {}
    stmt = select(Meeting.id, Meeting.title).where(
        Meeting.id.in_(uuids),
        Meeting.created_by == user_id,
    )
    result = await db.execute(stmt)
    return {str(row.id): row.title for row in result.all()}


async def _answer_with_rag(
    question: str,
    user_id: UUID,
    meeting_id: Optional[UUID],
    db,
) -> ChatResponse:
    from app.services.llm import get_llm_provider
    from app.services import search_chunks

    llm = get_llm_provider()

    query_embedding = await llm.embed_query(question)

    chunks = await search_chunks(
        query_embedding=query_embedding,
        user_id=user_id,
        meeting_id=meeting_id,
        top_k=6,
        score_threshold=0.3,
    )

    if not chunks:
        return ChatResponse(answer=NO_INFO_MESSAGE, sources=[])

    meeting_ids_set = list({c["meeting_id"] for c in chunks if c.get("meeting_id")})
    title_map = await _get_meeting_titles(db, user_id, meeting_ids_set)

    context_chunks = []
    for c in chunks:
        mid = c.get("meeting_id", "")
        context_chunks.append({
            "text": c["text"],
            "meeting_title": title_map.get(str(mid), "Unknown meeting"),
            "meeting_id": mid,
        })

    answer = await llm.chat_with_context(question, context_chunks)

    if answer.strip() == "__NO_INFO__":
        return ChatResponse(answer=NO_INFO_MESSAGE, sources=[])

    sources: List[ChatSource] = []
    seen = set()
    for c in chunks:
        mid = c.get("meeting_id")
        if mid and mid not in seen:
            seen.add(mid)
            sources.append(ChatSource(
                meeting_id=UUID(mid),
                meeting_title=title_map.get(str(mid), "Unknown meeting"),
            ))

    return ChatResponse(answer=answer, sources=sources)


@router.post("/meeting/{meeting_id}", response_model=ChatResponse)
async def chat_meeting(
    meeting_id: UUID,
    payload: ChatRequest,
    current_user: CurrentUser,
    db: DBSession,
):
    stmt = select(Meeting).where(
        Meeting.id == meeting_id,
        Meeting.created_by == current_user.id,
    )
    meeting = (await db.execute(stmt)).scalar_one_or_none()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )
    if meeting.status != MeetingStatus.READY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Meeting is not ready. Current status: {meeting.status.value}",
        )

    user_msg = ChatMessage(
        user_id=current_user.id,
        role=ChatRole.USER,
        text=payload.question,
        meeting_id=meeting_id,
    )
    db.add(user_msg)
    await db.flush()

    response = await _answer_with_rag(
        question=payload.question,
        user_id=current_user.id,
        meeting_id=meeting_id,
        db=db,
    )

    sources_json = [s.model_dump(mode="json") for s in response.sources]

    assistant_msg = ChatMessage(
        user_id=current_user.id,
        role=ChatRole.ASSISTANT,
        text=response.answer,
        meeting_id=meeting_id,
        sources=sources_json if sources_json else None,
    )
    db.add(assistant_msg)
    await db.commit()

    return response


@router.post("/global", response_model=ChatResponse)
async def chat_global(
    payload: ChatRequest,
    current_user: CurrentUser,
    db: DBSession,
):
    user_msg = ChatMessage(
        user_id=current_user.id,
        role=ChatRole.USER,
        text=payload.question,
        meeting_id=None,
    )
    db.add(user_msg)
    await db.flush()

    response = await _answer_with_rag(
        question=payload.question,
        user_id=current_user.id,
        meeting_id=None,
        db=db,
    )

    sources_json = [s.model_dump(mode="json") for s in response.sources]

    assistant_msg = ChatMessage(
        user_id=current_user.id,
        role=ChatRole.ASSISTANT,
        text=response.answer,
        meeting_id=None,
        sources=sources_json if sources_json else None,
    )
    db.add(assistant_msg)
    await db.commit()

    return response


@router.get("/history", response_model=List[ChatMessageSchema])
async def get_chat_history(
    current_user: CurrentUser,
    db: DBSession,
    meeting_id: Optional[UUID] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.timestamp.asc())
        .limit(limit)
    )
    if meeting_id is not None:
        stmt = stmt.where(ChatMessage.meeting_id == meeting_id)
    else:
        stmt = stmt.where(ChatMessage.meeting_id.is_(None))

    result = await db.execute(stmt)
    messages = result.scalars().all()

    out = []
    for m in messages:
        sources = None
        if m.sources:
            sources = [ChatSource(**s) for s in m.sources]
        data = ChatMessageSchema(
            id=m.id,
            role=m.role.value,
            text=m.text,
            meeting_id=m.meeting_id,
            sources=sources,
            timestamp=m.timestamp,
        )
        out.append(data)
    return out
