import asyncio
import json
import logging
import os
import re
import time
from typing import List, Optional

import httpx

from app.core.config import settings
from app.services.llm.base import (
    BaseLLMProvider,
    ExtractedActionItem,
    ExtractedKeyDecision,
    ExtractedMeetingData,
)

logger = logging.getLogger(__name__)

MAX_RETRIES = 5


def _parse_retry_after(resp: httpx.Response, default: int) -> int:
    header = resp.headers.get("Retry-After")
    if header is None:
        return default
    try:
        val = int(float(header))
        return max(val, 1)
    except (ValueError, TypeError):
        return default


def _is_hard_quota(body_text: str) -> bool:
    if not body_text:
        return False
    return (
        "credit_balance_exhausted" in body_text
        or "insufficient_quota" in body_text
        or "no credits remaining" in body_text.lower()
    )


async def _post_openai_with_retry(url: str, headers: dict, payload: dict, timeout: float, label: str) -> dict:
    for attempt in range(1, MAX_RETRIES + 1):
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, headers=headers, json=payload)

        body_text = ""
        try:
            body_text = resp.text or ""
        except Exception:
            pass

        if resp.status_code == 429:
            if _is_hard_quota(body_text):
                raise RuntimeError(
                    f"OpenAI call '{label}' failed: account has no credits. "
                    f"Set LLM_PROVIDER=ollama (already default) to run the LLM locally instead. "
                    f"Detail: {body_text[:200]}"
                )
            if attempt == MAX_RETRIES:
                logger.error(f"[LLM/{label}] 429 after {MAX_RETRIES} attempts")
                raise RuntimeError(
                    f"OpenAI rate limit reached for {label} after {MAX_RETRIES} retries. {body_text[:200]}"
                )
            wait_s = _parse_retry_after(resp, default=2 ** attempt + 5)
            logger.warning(f"[LLM/{label}] 429 attempt {attempt}/{MAX_RETRIES}, waiting {wait_s}s")
            await asyncio.sleep(wait_s)
            continue

        resp.raise_for_status()
        return resp.json()

    raise RuntimeError(f"Retries exhausted for {label}")


async def _post_ollama(url: str, payload: dict, timeout: float, label: str):
    full_url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}{url}"
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(full_url, json=payload)
    except httpx.ConnectError as e:
        raise RuntimeError(
            f"Ollama not reachable at {settings.OLLAMA_BASE_URL}. "
            f"Install Ollama (https://ollama.com/) and run 'ollama serve', then pull the required models. Detail: {e}"
        )
    if resp.status_code == 404:
        txt = ""
        try:
            txt = resp.text or ""
        except Exception:
            pass
        raise RuntimeError(
            f"Ollama model missing or endpoint not found ({label}). Run: "
            f"ollama pull {settings.OLLAMA_CHAT_MODEL} ; ollama pull {settings.OLLAMA_EMBED_MODEL}. "
            f"Detail: {txt[:200]}"
        )
    resp.raise_for_status()
    logger.info(f"[Ollama/{label}] completed in {time.time() - t0:.1f}s")
    return resp.json()


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*\})\s*```", re.DOTALL | re.IGNORECASE)


def _extract_json(text: str) -> dict:
    """Very forgiving JSON extraction: try direct parse, then fenced code, then first {...} block."""
    text = (text or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except Exception:
        pass
    m = _JSON_FENCE_RE.search(text)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last != -1 and last > first:
        try:
            return json.loads(text[first : last + 1])
        except Exception:
            pass
    raise ValueError(f"Could not extract JSON from response: {text[:400]}")


def _build_extraction_system_prompt() -> str:
    return (
        "You are Syncora, a meeting intelligence assistant. Given a meeting transcript, "
        "extract structured meeting data and return ONLY a JSON object. "
        "Do NOT wrap the JSON in markdown fences, commentary, or explanations. "
        "The JSON must have exactly these keys: summary (string, 2-4 concise paragraphs), "
        "action_items (array of objects with keys text:string, owner_name:string, "
        "owner_initials:string, due_date:string|null in YYYY-MM-DD or null), "
        "key_decisions (array of strings). "
        "Derive owner_initials from owner_name (e.g. 'John Smith' -> 'JS', 'Alice' -> 'A'). "
        "If no owner is mentioned for an action item, set owner_name='Unassigned' and owner_initials='U'. "
        "If no due date is known, set due_date=null. Language: English."
    )


def _build_extraction_user_prompt(transcript: str, meeting_title: str) -> str:
    return (
        f"Meeting title: {meeting_title}\n\n"
        f"Transcript:\n{transcript}\n\n"
        "Return ONLY valid JSON with keys: summary, action_items, key_decisions. No markdown."
    )


def _normalize_action_item(raw: dict) -> dict:
    text = str(raw.get("text") or "").strip()
    owner_name = str(raw.get("owner_name") or "Unassigned").strip() or "Unassigned"
    owner_initials = str(raw.get("owner_initials") or "").strip()
    if not owner_initials:
        parts = [p for p in owner_name.replace("-", " ").split() if p]
        if parts:
            owner_initials = "".join(p[0] for p in parts[:2]).upper()
        else:
            owner_initials = "U"
    due_date_raw = raw.get("due_date")
    due_date = None
    if isinstance(due_date_raw, str) and due_date_raw.strip():
        s = due_date_raw.strip()
        if len(s) >= 10 and re.match(r"^\d{4}-\d{2}-\d{2}", s):
            due_date = s[:10]
    return {
        "text": text,
        "owner_name": owner_name,
        "owner_initials": owner_initials[:2].upper(),
        "due_date": due_date,
    }


class OpenAIProvider(BaseLLMProvider):
    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY or ""
        self.base_url = "https://api.openai.com/v1"
        self.chat_model = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini")
        self.embedding_model = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        self.embedding_dim = 1536

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def extract_meeting_data(
        self,
        transcript: str,
        meeting_title: str,
    ) -> ExtractedMeetingData:
        system_prompt = (
            "You are a meeting intelligence assistant. Given a meeting transcript, "
            "extract structured data. Always return valid JSON matching the provided schema. "
            "For owner_initials, derive from owner_name (e.g. 'John Smith' -> 'JS', 'Alice' -> 'A'). "
            "If no owner is mentioned, use 'Unassigned' as owner_name and 'U' as owner_initials. "
            "For due dates, use ISO format (YYYY-MM-DD). If no due date, use null."
        )
        schema = {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "A concise 2-4 paragraph summary of the meeting."},
                "action_items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "text": {"type": "string"},
                            "owner_name": {"type": "string"},
                            "owner_initials": {"type": "string"},
                            "due_date": {"type": ["string", "null"], "format": "date"},
                        },
                        "required": ["text", "owner_name", "owner_initials"],
                    },
                },
                "key_decisions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Key decisions made in the meeting.",
                },
            },
            "required": ["summary", "action_items", "key_decisions"],
        }
        user_prompt = (
            f"Meeting title: {meeting_title}\n\n"
            f"Transcript:\n{transcript}\n\n"
            f"Extract summary, action items (with owner_name, owner_initials, optional due_date), "
            f"and key decisions. Return valid JSON only, no markdown."
        )
        payload = {
            "model": self.chat_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "meeting_extraction", "schema": schema},
            },
            "temperature": 0.2,
        }
        data = await _post_openai_with_retry(
            url=f"{self.base_url}/chat/completions",
            headers=self._headers(),
            payload=payload,
            timeout=120.0,
            label="extract",
        )
        raw = data["choices"][0]["message"]["content"]
        parsed = json.loads(raw)
        action_items = [
            ExtractedActionItem(
                text=ai["text"],
                owner_name=ai.get("owner_name", "Unassigned"),
                owner_initials=ai.get("owner_initials", "U"),
                due_date=ai.get("due_date"),
                completed=False,
            )
            for ai in parsed.get("action_items", [])
        ]
        key_decisions = [
            ExtractedKeyDecision(text=kd) for kd in parsed.get("key_decisions", [])
        ]
        return ExtractedMeetingData(
            summary=parsed.get("summary", ""),
            action_items=action_items,
            key_decisions=key_decisions,
        )

    async def chat_with_context(
        self,
        question: str,
        context_chunks: List[dict],
    ) -> str:
        context_parts = []
        for i, chunk in enumerate(context_chunks, 1):
            meeting_title = chunk.get("meeting_title", "Unknown meeting")
            text = chunk.get("text", "")
            context_parts.append(f"[{i}] Source: {meeting_title}\n{text}")
        context_block = "\n\n".join(context_parts)
        system_prompt = (
            "You are Syncora, a meeting intelligence assistant. "
            "Answer the user's question ONLY based on the provided context chunks below. "
            "If the context does not contain enough information to answer the question, "
            "respond exactly with: '__NO_INFO__' and nothing else. "
            "Do NOT use any external knowledge or general knowledge. "
            "Always cite which source numbers you used. Be concise."
        )
        user_prompt = (
            f"Context chunks:\n{context_block}\n\n"
            f"Question: {question}\n\n"
            f"Answer based only on the context chunks above. If no info, say __NO_INFO__."
        )
        payload = {
            "model": self.chat_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.1,
        }
        data = await _post_openai_with_retry(
            url=f"{self.base_url}/chat/completions",
            headers=self._headers(),
            payload=payload,
            timeout=120.0,
            label="chat",
        )
        return data["choices"][0]["message"]["content"].strip()

    async def embed_text(self, texts: List[str]) -> List[List[float]]:
        payload = {"model": self.embedding_model, "input": texts}
        data = await _post_openai_with_retry(
            url=f"{self.base_url}/embeddings",
            headers=self._headers(),
            payload=payload,
            timeout=60.0,
            label="embed_text",
        )
        return [item["embedding"] for item in data["data"]]

    async def embed_query(self, text: str) -> List[float]:
        payload = {"model": self.embedding_model, "input": [text]}
        data = await _post_openai_with_retry(
            url=f"{self.base_url}/embeddings",
            headers=self._headers(),
            payload=payload,
            timeout=60.0,
            label="embed_query",
        )
        return data["data"][0]["embedding"]


class OllamaProvider(BaseLLMProvider):
    """Runs the LLM + embeddings locally via Ollama (http://localhost:11434)."""

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.chat_model = settings.OLLAMA_CHAT_MODEL
        self.embed_model = settings.OLLAMA_EMBED_MODEL
        self._chat_options = {
            "temperature": 0.2,
            "num_ctx": 8192,
        }
        self._embedding_dim: Optional[int] = None

    async def extract_meeting_data(
        self,
        transcript: str,
        meeting_title: str,
    ) -> ExtractedMeetingData:
        system_prompt = _build_extraction_system_prompt()
        user_prompt = _build_extraction_user_prompt(transcript, meeting_title)

        payload = {
            "model": self.chat_model,
            "system": system_prompt,
            "prompt": user_prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.1, "num_ctx": 8192},
        }
        data = await _post_ollama("/api/generate", payload, timeout=600.0, label="extract")
        raw_text = (data.get("response") or "").strip()
        try:
            parsed = _extract_json(raw_text)
        except ValueError as e:
            logger.warning(f"[Ollama/extract] JSON parse failed (first pass), retrying without force-json. {e}")
            payload2 = {k: v for k, v in payload.items() if k != "format"}
            data2 = await _post_ollama("/api/generate", payload2, timeout=600.0, label="extract-retry")
            raw_text2 = (data2.get("response") or "").strip()
            parsed = _extract_json(raw_text2)

        summary = str(parsed.get("summary") or "").strip()
        if not summary:
            raise RuntimeError("Ollama extraction returned empty summary")

        raw_ais = parsed.get("action_items") or []
        if not isinstance(raw_ais, list):
            raw_ais = []
        action_items: List[ExtractedActionItem] = []
        for ai in raw_ais:
            if not isinstance(ai, dict):
                continue
            norm = _normalize_action_item(ai)
            if not norm["text"]:
                continue
            action_items.append(
                ExtractedActionItem(
                    text=norm["text"],
                    owner_name=norm["owner_name"],
                    owner_initials=norm["owner_initials"],
                    due_date=norm["due_date"],
                    completed=False,
                )
            )

        raw_kds = parsed.get("key_decisions") or []
        if not isinstance(raw_kds, list):
            raw_kds = []
        key_decisions: List[ExtractedKeyDecision] = []
        for kd in raw_kds:
            t = str(kd).strip() if not isinstance(kd, dict) else str(kd.get("text") or "").strip()
            if t:
                key_decisions.append(ExtractedKeyDecision(text=t))

        logger.info(
            f"[Ollama/extract] done: summary={len(summary)} chars, "
            f"action_items={len(action_items)}, key_decisions={len(key_decisions)}"
        )
        return ExtractedMeetingData(
            summary=summary,
            action_items=action_items,
            key_decisions=key_decisions,
        )

    async def chat_with_context(
        self,
        question: str,
        context_chunks: List[dict],
    ) -> str:
        context_parts = []
        for i, chunk in enumerate(context_chunks, 1):
            meeting_title = chunk.get("meeting_title", "Unknown meeting")
            text = chunk.get("text", "")
            context_parts.append(f"[{i}] Source: {meeting_title}\n{text}")
        context_block = "\n\n".join(context_parts)

        system_prompt = (
            "You are Syncora, a helpful meeting intelligence assistant. "
            "Answer the user's question ONLY using information from the provided context chunks. "
            "If the answer is not present in the context, respond with exactly the text '__NO_INFO__' "
            "and nothing else. Do NOT use outside knowledge. When you answer, briefly cite which "
            "source numbers you used (e.g. '[1][3]'). Keep answers concise."
        )
        user_prompt = (
            f"Context chunks:\n{context_block}\n\n"
            f"User question: {question}\n\n"
            "Answer based ONLY on the context chunks above. If no answer exists, say exactly __NO_INFO__."
        )
        payload = {
            "model": self.chat_model,
            "system": system_prompt,
            "prompt": user_prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_ctx": 8192},
        }
        data = await _post_ollama("/api/generate", payload, timeout=300.0, label="chat")
        answer = (data.get("response") or "").strip()
        if not answer:
            return "__NO_INFO__"
        lowered = answer.lower()
        no_info_markers = [
            "__no_info__",
            "i couldn't find anything relevant",
            "i do not have enough information",
            "the provided context does not contain",
            "cannot be answered from the provided context",
            "no relevant information",
        ]
        if any(m in lowered for m in no_info_markers):
            return "__NO_INFO__"
        return answer

    async def embed_text(self, texts: List[str]) -> List[List[float]]:
        payload = {"model": self.embed_model, "input": texts}
        data = await _post_ollama("/api/embed", payload, timeout=300.0, label="embed_text")
        embeddings = data.get("embeddings") or []
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            logger.warning("[Ollama/embed_text] batch embed shape unexpected; falling back per-item")
            return [await self.embed_query(t) for t in texts]
        if self._embedding_dim is None and embeddings:
            self._embedding_dim = len(embeddings[0])
        return [list(e) for e in embeddings]

    async def embed_query(self, text: str) -> List[float]:
        payload = {"model": self.embed_model, "input": text}
        data = await _post_ollama("/api/embed", payload, timeout=120.0, label="embed_query")
        embeddings = data.get("embeddings") or []
        if embeddings and isinstance(embeddings, list):
            first = embeddings[0]
            if isinstance(first, list):
                if self._embedding_dim is None:
                    self._embedding_dim = len(first)
                return list(first)
            if isinstance(first, (int, float)):
                return list(embeddings)
        if isinstance(data.get("embedding"), list):
            return list(data["embedding"])
        raise RuntimeError(f"Unexpected Ollama embedding response shape: {str(data)[:200]}")


class MockProvider(BaseLLMProvider):
    """Deterministic no-network fallback for testing. Never calls external services."""

    async def extract_meeting_data(self, transcript: str, meeting_title: str) -> ExtractedMeetingData:
        snippet = (transcript[:200] or "").strip()
        summary = (
            f"Mock summary of '{meeting_title}'. "
            f"Transcript begins: {snippet}... The meeting covered topics outlined in the recording."
        )
        action_items = [
            ExtractedActionItem(
                text="Review meeting notes and follow up with attendees",
                owner_name="Unassigned",
                owner_initials="U",
                due_date=None,
                completed=False,
            )
        ]
        key_decisions = [ExtractedKeyDecision(text="Meeting was recorded for future reference.")]
        return ExtractedMeetingData(
            summary=summary,
            action_items=action_items,
            key_decisions=key_decisions,
        )

    async def chat_with_context(self, question: str, context_chunks: List[dict]) -> str:
        if context_chunks:
            src_nums = list(range(1, len(context_chunks) + 1))
            return (
                f"(Mock answer) Based on the provided context chunks [{','.join(map(str, src_nums))}], "
                f"relevant details appear in the meeting content for question: {question}"
            )
        return "__NO_INFO__"

    async def embed_text(self, texts: List[str]) -> List[List[float]]:
        import hashlib
        dim = 384
        out: List[List[float]] = []
        for t in texts:
            h = hashlib.sha256(t.encode("utf-8")).digest()
            vec = [0.0] * dim
            for i, b in enumerate(h):
                vec[i % dim] += (b - 128) / 128.0
            norm = sum(v * v for v in vec) ** 0.5 or 1.0
            out.append([v / norm for v in vec])
        return out

    async def embed_query(self, text: str) -> List[float]:
        return (await self.embed_text([text]))[0]


_llm_provider: Optional[BaseLLMProvider] = None


def get_llm_provider() -> BaseLLMProvider:
    global _llm_provider
    if _llm_provider is None:
        provider_name = (settings.LLM_PROVIDER or "ollama").lower()
        if provider_name == "openai":
            _llm_provider = OpenAIProvider()
        elif provider_name == "ollama":
            _llm_provider = OllamaProvider()
        elif provider_name == "mock":
            _llm_provider = MockProvider()
        else:
            logger.warning(f"Unknown LLM_PROVIDER='{provider_name}', defaulting to ollama")
            _llm_provider = OllamaProvider()
    return _llm_provider
