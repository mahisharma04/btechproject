import logging
import math
import mimetypes
import os
import uuid
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import joinedload, selectinload

from app.core.config import settings
from app.core.deps import CurrentUser, DBSession
from app.models import ActionItem, KeyDecision, Meeting, MeetingStatus
from app.schemas import (
    ActionItem as ActionItemSchema,
    ActionItemUpdate,
    Meeting as MeetingSchema,
    MeetingListItem,
    MeetingStatusResponse,
    PaginatedMeetings,
)

router = APIRouter(prefix="/meetings", tags=["meetings"])
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".mp4", ".mov"}
MAX_UPLOAD_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024

UPLOAD_DIR = os.path.abspath(settings.MEDIA_STORAGE_DIR)
os.makedirs(UPLOAD_DIR, exist_ok=True)

MEDIA_EXT_TO_MIME = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
}


def _guess_mime(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in MEDIA_EXT_TO_MIME:
        return MEDIA_EXT_TO_MIME[ext]
    mime, _ = mimetypes.guess_type(path)
    return mime or "application/octet-stream"


def _iter_file_chunks(path: str, start: int, end: int, chunk_size: int = 1024 * 1024):
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            read_size = min(chunk_size, remaining)
            buf = f.read(read_size)
            if not buf:
                break
            yield buf
            remaining -= len(buf)


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_meeting(
    current_user: CurrentUser,
    db: DBSession,
    file: UploadFile = File(...),
    title: str = Form(...),
    date: Optional[datetime] = Form(None),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format: {ext}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    if date is None:
        date = datetime.utcnow()

    file_id = uuid.uuid4()
    stored_name = f"{file_id}{ext}"
    stored_path = os.path.join(UPLOAD_DIR, stored_name)

    total_bytes = 0
    with open(stored_path, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > MAX_UPLOAD_BYTES:
                f.close()
                os.remove(stored_path)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File too large. Max size: {settings.MAX_UPLOAD_MB}MB",
                )
            f.write(chunk)

    meeting = Meeting(
        title=title,
        date=date,
        duration=0,
        status=MeetingStatus.PROCESSING,
        media_path=stored_path,
        media_filename=file.filename or stored_name,
        created_by=current_user.id,
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)

    from app.tasks.meeting import process_meeting
    try:
        process_meeting.delay(
            meeting_id=str(meeting.id),
            file_path=stored_path,
            user_id=str(current_user.id),
            title=title,
        )
    except Exception as e:
        logger.warning(f"Celery not available, processing will be skipped: {e}")

    return {"id": meeting.id, "status": MeetingStatus.PROCESSING.value}


@router.get("", response_model=PaginatedMeetings)
async def list_meetings(
    current_user: CurrentUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    offset = (page - 1) * per_page

    total_query = select(func.count(Meeting.id)).where(
        Meeting.created_by == current_user.id
    )
    total = (await db.execute(total_query)).scalar_one()

    stmt = (
        select(Meeting)
        .where(Meeting.created_by == current_user.id)
        .order_by(Meeting.date.desc())
        .offset(offset)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    meetings = result.scalars().all()

    pages = math.ceil(total / per_page) if total > 0 else 1

    return PaginatedMeetings(
        items=[MeetingListItem.model_validate(m) for m in meetings],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get("/{meeting_id}", response_model=MeetingSchema)
async def get_meeting(
    meeting_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    stmt = (
        select(Meeting)
        .options(
            selectinload(Meeting.action_items),
            selectinload(Meeting.key_decisions),
        )
        .where(
            Meeting.id == meeting_id,
            Meeting.created_by == current_user.id,
        )
    )
    result = await db.execute(stmt)
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )
    return MeetingSchema.model_validate(meeting)


@router.get("/{meeting_id}/status", response_model=MeetingStatusResponse)
async def get_meeting_status(
    meeting_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    stmt = select(Meeting).where(
        Meeting.id == meeting_id,
        Meeting.created_by == current_user.id,
    )
    result = await db.execute(stmt)
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )
    return MeetingStatusResponse(
        id=meeting.id,
        status=meeting.status.value,
        failure_reason=meeting.failure_reason,
    )


@router.get("/{meeting_id}/media")
async def get_meeting_media(
    meeting_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
    range: Optional[str] = Query(None),
):
    stmt = select(Meeting).where(
        Meeting.id == meeting_id,
        Meeting.created_by == current_user.id,
    )
    result = await db.execute(stmt)
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )

    media_path = meeting.media_path
    if not media_path or not os.path.exists(media_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not available",
        )

    file_size = os.path.getsize(media_path)
    media_type = _guess_mime(media_path)
    filename = meeting.media_filename or os.path.basename(media_path)

    start = 0
    end = file_size - 1
    status_code = status.HTTP_200_OK
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename}"',
    }

    if range and range.startswith("bytes="):
        try:
            range_val = range[len("bytes="):]
            start_str, _, end_str = range_val.partition("-")
            if start_str:
                start = int(start_str)
            if end_str:
                end = int(end_str)
            if start > end or start >= file_size:
                raise HTTPException(
                    status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                    headers={"Content-Range": f"bytes */{file_size}"},
                )
            end = min(end, file_size - 1)
            status_code = status.HTTP_206_PARTIAL_CONTENT
            headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            headers["Content-Length"] = str(end - start + 1)
        except ValueError:
            pass
    else:
        headers["Content-Length"] = str(file_size)

    return StreamingResponse(
        _iter_file_chunks(media_path, start, end),
        status_code=status_code,
        media_type=media_type,
        headers=headers,
    )


@router.post("/{meeting_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_meeting(
    meeting_id: UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    stmt = select(Meeting).where(
        Meeting.id == meeting_id,
        Meeting.created_by == current_user.id,
    )
    result = await db.execute(stmt)
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )

    if not meeting.media_path or not os.path.exists(meeting.media_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Original media file is missing; cannot retry. Please re-upload.",
        )

    meeting.status = MeetingStatus.PROCESSING
    meeting.failure_reason = None
    meeting.summary = None
    meeting.transcript = None
    meeting.duration = 0

    await db.execute(
        delete(ActionItem).where(ActionItem.meeting_id == meeting.id)
    )
    await db.execute(
        delete(KeyDecision).where(KeyDecision.meeting_id == meeting.id)
    )
    await db.commit()

    from app.services import delete_meeting_chunks
    delete_meeting_chunks(meeting.id)

    from app.tasks.meeting import process_meeting
    try:
        process_meeting.delay(
            meeting_id=str(meeting.id),
            file_path=meeting.media_path,
            user_id=str(current_user.id),
            title=meeting.title,
        )
    except Exception as e:
        logger.warning(f"Celery not available, retry processing skipped: {e}")

    return {"id": meeting.id, "status": MeetingStatus.PROCESSING.value}


@router.patch("/{meeting_id}/action-items/{item_id}", response_model=ActionItemSchema)
async def update_action_item(
    meeting_id: UUID,
    item_id: UUID,
    payload: ActionItemUpdate,
    current_user: CurrentUser,
    db: DBSession,
):
    meeting_stmt = select(Meeting).where(
        Meeting.id == meeting_id,
        Meeting.created_by == current_user.id,
    )
    meeting = (await db.execute(meeting_stmt)).scalar_one_or_none()
    if not meeting:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")

    item_stmt = select(ActionItem).where(
        ActionItem.id == item_id,
        ActionItem.meeting_id == meeting_id,
    )
    item = (await db.execute(item_stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action item not found")

    if payload.completed is not None:
        item.completed = payload.completed

    await db.commit()
    await db.refresh(item)
    return ActionItemSchema.model_validate(item)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(
    meeting_id: UUID,
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

    media_path = meeting.media_path

    await db.execute(delete(Meeting).where(Meeting.id == meeting_id))
    await db.commit()

    from app.services import delete_meeting_chunks
    delete_meeting_chunks(meeting_id)

    if media_path and os.path.exists(media_path):
        try:
            os.remove(media_path)
        except Exception as e:
            logger.warning(f"Failed to delete media file {media_path}: {e}")

    return None
