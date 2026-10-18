import asyncio
import logging
import os
from datetime import date
from typing import Optional
from uuid import UUID

from celery import Task
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.celery_app import celery_app
from app.core.config import settings
from app.models import (
    ActionItem,
    KeyDecision,
    Meeting,
    MeetingStatus,
)
from app.services import (
    chunk_transcript,
    delete_meeting_chunks,
    extract_audio_if_needed,
    get_media_duration_seconds,
    store_meeting_chunks,
    transcribe_audio,
)
from app.services.llm import get_llm_provider

logger = logging.getLogger(__name__)


_sync_engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)
_SyncSessionLocal = sessionmaker(bind=_sync_engine, expire_on_commit=False)


def _set_failure(meeting_id: UUID, reason: str):
    db = _SyncSessionLocal()
    try:
        meeting = db.execute(select(Meeting).where(Meeting.id == meeting_id)).scalar_one_or_none()
        if meeting:
            meeting.status = MeetingStatus.FAILED
            meeting.failure_reason = reason
            db.commit()
    except Exception as e:
        logger.error(f"Failed to set failure status: {e}")
    finally:
        db.close()


def _set_ready(meeting_id: UUID, transcript: str, summary: str, duration: int,
               action_items_data, key_decisions_data, user_id: UUID):
    db = _SyncSessionLocal()
    try:
        meeting = db.execute(select(Meeting).where(Meeting.id == meeting_id)).scalar_one_or_none()
        if not meeting:
            return
        meeting.transcript = transcript
        meeting.summary = summary
        meeting.duration = duration

        for ai in action_items_data:
            due_date = None
            if getattr(ai, "due_date", None):
                try:
                    due_date = date.fromisoformat(str(ai.due_date))
                except (ValueError, TypeError):
                    due_date = None
            db.add(ActionItem(
                meeting_id=meeting_id,
                text=ai.text,
                owner_name=ai.owner_name,
                owner_initials=ai.owner_initials,
                due_date=due_date,
                completed=False,
            ))

        for kd in key_decisions_data:
            db.add(KeyDecision(
                meeting_id=meeting_id,
                text=kd.text,
            ))

        meeting.status = MeetingStatus.READY
        meeting.failure_reason = None
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save meeting data: {e}")
        db.rollback()
        _set_failure(meeting_id, f"Failed to save results: {str(e)}")
    finally:
        db.close()


@celery_app.task(bind=True, name="process_meeting", max_retries=0, time_limit=3600)
def process_meeting(self, meeting_id: str, file_path: str, user_id: str, title: str):
    logger.info(f"[Task] Starting processing for meeting {meeting_id}")
    mid = UUID(meeting_id)
    uid = UUID(user_id)
    extracted_audio_path: Optional[str] = None

    try:
        logger.info(f"[1/7] Reading actual media duration for {file_path}")
        duration_seconds = get_media_duration_seconds(file_path)
        duration_minutes = max(1, round(duration_seconds / 60))

        logger.info(f"[2/7] Extracting audio from {file_path}")
        try:
            audio_path, was_extracted = extract_audio_if_needed(file_path)
            if was_extracted:
                extracted_audio_path = audio_path
        except Exception as e:
            _set_failure(mid, f"Audio extraction failed: {str(e)}")
            return

        logger.info(f"[3/7] Transcribing audio {audio_path}")
        try:
            transcript = asyncio.run(transcribe_audio(audio_path))
        except Exception as e:
            logger.exception(f"Transcription failed: {e}")
            _set_failure(mid, f"Transcription failed: {str(e)}")
            return
        finally:
            if extracted_audio_path and os.path.exists(extracted_audio_path):
                try:
                    os.remove(extracted_audio_path)
                except Exception:
                    pass

        if not transcript or not transcript.strip():
            _set_failure(mid, "Transcription produced empty text")
            return

        logger.info(f"[4/7] Extracting meeting data with LLM (transcript length: {len(transcript)})")
        llm = get_llm_provider()
        try:
            extracted = asyncio.run(llm.extract_meeting_data(transcript, title))
        except Exception as e:
            logger.exception(f"LLM extraction failed: {e}")
            _set_failure(mid, f"AI extraction failed: {str(e)}")
            return

        if not extracted.summary or not extracted.summary.strip():
            _set_failure(mid, "LLM extraction returned empty summary")
            return

        logger.info(f"[5/7] Chunking transcript ({len(transcript)} chars)")
        chunks = chunk_transcript(transcript)
        if not chunks:
            chunks = [transcript]
        logger.info(f"    -> {len(chunks)} chunks")

        logger.info(f"[6/7] Generating embeddings")
        try:
            embeddings = asyncio.run(llm.embed_text(chunks))
        except Exception as e:
            logger.exception(f"Embedding failed: {e}")
            _set_failure(mid, f"Embedding generation failed: {str(e)}")
            return

        if len(embeddings) != len(chunks):
            _set_failure(mid, "Mismatch between chunks and embeddings")
            return

        logger.info(f"[7/7] Storing vectors + finalizing (duration: {duration_minutes} min)")
        try:
            asyncio.run(store_meeting_chunks(mid, uid, chunks, embeddings))
        except Exception as e:
            logger.exception(f"Vector store failed: {e}")
            _set_failure(mid, f"Vector storage failed: {str(e)}")
            return

        _set_ready(
            meeting_id=mid,
            transcript=transcript,
            summary=extracted.summary,
            duration=duration_minutes,
            action_items_data=extracted.action_items,
            key_decisions_data=extracted.key_decisions,
            user_id=uid,
        )

        logger.info(f"[Done] Meeting {meeting_id} processed successfully")

    except Exception as exc:
        logger.exception(f"Unhandled error in processing task: {exc}")
        _set_failure(mid, f"Internal processing error: {str(exc)}")
