import logging
import re
from typing import List, Optional
from uuid import UUID

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Optional[chromadb.PersistentClient] = None
_meeting_collection = None


def get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=settings.CHROMA_PATH,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


def get_meeting_collection():
    global _meeting_collection
    if _meeting_collection is None:
        client = get_client()
        _meeting_collection = client.get_or_create_collection(
            name="meeting_transcripts",
            metadata={"hnsw:space": "cosine"},
        )
    return _meeting_collection


def chunk_transcript(
    transcript: str,
    chunk_size: int = 600,
    overlap: int = 100,
) -> List[str]:
    sentences = re.split(r"(?<=[.!?])\s+", transcript.strip())
    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for sentence in sentences:
        sent_len = len(sentence.split())
        if current_len + sent_len > chunk_size and current:
            chunks.append(" ".join(current))
            overlap_size = min(overlap, len(current))
            current = current[-overlap_size:] if overlap_size > 0 else []
            current_len = sum(len(s.split()) for s in current)
        current.append(sentence)
        current_len += sent_len

    if current:
        chunks.append(" ".join(current))

    return [c for c in chunks if c.strip()]


async def store_meeting_chunks(
    meeting_id: UUID,
    user_id: UUID,
    chunks: List[str],
    embeddings: List[List[float]],
) -> None:
    collection = get_meeting_collection()
    delete_meeting_chunks(meeting_id)
    ids = [f"{meeting_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {"meeting_id": str(meeting_id), "user_id": str(user_id), "chunk_index": i}
        for i in range(len(chunks))
    ]

    collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas,
    )
    logger.info(f"Stored {len(chunks)} chunks for meeting {meeting_id}")


def delete_meeting_chunks(meeting_id: UUID) -> None:
    collection = get_meeting_collection()
    try:
        collection.delete(
            where={"meeting_id": str(meeting_id)},
        )
        logger.info(f"Deleted chunks for meeting {meeting_id}")
    except Exception as e:
        logger.warning(f"Failed to delete chunks for meeting {meeting_id}: {e}")


async def search_chunks(
    query_embedding: List[float],
    user_id: UUID,
    meeting_id: Optional[UUID] = None,
    top_k: int = 6,
    score_threshold: float = 0.3,
) -> List[dict]:
    collection = get_meeting_collection()
    clauses = [{"user_id": {"$eq": str(user_id)}}]
    if meeting_id is not None:
        clauses.append({"meeting_id": {"$eq": str(meeting_id)}})
    if len(clauses) == 1:
        where = clauses[0]
    else:
        where = {"$and": clauses}

    try:
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k * 2,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as e:
        logger.error(f"Chroma query failed: {e}")
        return []

    if not results["ids"] or not results["ids"][0]:
        return []

    matches = []
    for i, (doc_id, doc, metadata, distance) in enumerate(zip(
        results["ids"][0],
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    )):
        similarity = 1.0 - distance
        if similarity < score_threshold:
            continue
        matches.append({
            "id": doc_id,
            "text": doc,
            "meeting_id": metadata.get("meeting_id"),
            "user_id": metadata.get("user_id"),
            "similarity": similarity,
        })

    matches.sort(key=lambda x: x["similarity"], reverse=True)
    return matches[:top_k]
