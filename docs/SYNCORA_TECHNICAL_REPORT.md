# Syncora — Technical Implementation Report

**Project:** Syncora — AI-Powered Meeting Intelligence Platform
**Document type:** B.Tech Black-Book Technical Implementation Report
**Scope:** Verified from the working source tree (read-only inspection). No files were modified other than adding this report.
**Verification basis:** Static inspection of source files, configuration, and migrations. All claims below carry a confidence tag:
- **[CONFIRMED]** — code exists and is wired into a live code path.
- **[PARTIAL]** — code exists but is incomplete, non-functional, or not surfaced in the UI.
- **[PLANNED]** — described in design docs (`/.trae/documents/prd.md`, `/.trae/documents/arch.md`) or present only as a dependency/placeholder; no functional implementation.

> **Security note:** No secrets are reproduced in this document. Only environment *variable names* are listed; values (API keys, database passwords, JWT secret) are intentionally omitted and live only in local, git-ignored `.env` files.

---

## 1. System Overview

Syncora is a single-user-scope web application that ingests meeting audio/video, transcribes it, uses an LLM to produce a summary plus structured action items and key decisions, stores vector embeddings of the transcript, and answers natural-language questions over the stored content (RAG).

**Runtime topology (three long-lived processes + infrastructure):**

```
┌─────────────────┐        HTTP /api/v1        ┌──────────────────────────┐
│  Frontend        │  ───────────────────────►  │  Backend API (FastAPI)    │
│  React + Vite    │  ◄───────────────────────  │  run.py  :8787            │
│  127.0.0.1:3000  │        JSON / media        │  app/main.py              │
└─────────────────┘                            └───────┬──────────┬────────┘
        │  Vite dev-server proxy                        │          │
        │  /api → 127.0.0.1:8787                        │          │
        │                                     SQLAlchemy│          │Chroma client
        │                                               ▼          ▼
        │                                     ┌──────────────┐  ┌───────────────┐
        │                                     │ PostgreSQL   │  │ ChromaDB      │
        │                                     │ (Docker)     │  │ (embedded,    │
        │                                     │ :5432        │  │  ./chroma_data)│
        │                                     └──────────────┘  └───────────────┘
        │                                               ▲
        │                              enqueue (broker) │
        │                                     ┌─────────┴────────┐
        │                                     │ Redis (Docker)    │
        │                                     │ :6379  broker+    │
        │                                     │        result     │
        │                                     └─────────┬────────┘
        │                                               │ consume
        │                                     ┌─────────▼─────────────────────┐
        │                                     │ Celery Worker                  │
        │                                     │ celery_worker.py (pool=solo)   │
        │                                     │ app/tasks/meeting.py           │
        │                                     └─────────┬──────────┬──────────┘
        │                                               │          │
        │                                      Whisper (local)   Ollama  :11434
        │                                      app/services/      llama3.2:3b +
        │                                      transcription.py   nomic-embed-text
        │                                                          app/services/llm
```

**Design highlights**
- **Asynchronous pipeline:** upload returns `202 Accepted` immediately; heavy work (decode → transcribe → extract → embed → store) runs in a Celery worker; the UI polls status.
- **Local-first AI:** Whisper and Ollama run on the developer's machine (GPU auto-detected), so there are no per-call API costs. An OpenAI provider exists as an optional/paid fallback.
- **Provider-dispatch pattern:** `LLM_PROVIDER` selects `ollama` | `openai` | `mock` behind a single abstract interface.
- **RAG with per-user isolation:** ChromaDB chunks are tagged with `user_id` and `meeting_id`, and every query is filtered by the authenticated user's id.

---

## 2. Repository Structure

```
btechproject/
├── .trae/documents/            # prd.md, arch.md (design specs, partly outdated)
├── .env.example                # frontend env template (VITE_API_URL)
├── .gitignore
├── index.html                  # Vite HTML entry (title: Syncora)
├── package.json                # frontend deps + scripts
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js              # dev server + /api proxy
├── backend/
│   ├── alembic/                # migrations
│   │   ├── env.py
│   │   └── versions/0001_initial.py, 0002_add_media_columns.py
│   ├── alembic.ini
│   ├── celery_worker.py        # Celery entrypoint
│   ├── run.py                  # FastAPI/uvicorn entrypoint (port 8787)
│   ├── pyproject.toml          # backend dependencies
│   ├── .env.example            # backend env template
│   └── app/
│       ├── main.py             # FastAPI app factory, CORS, lifespan, /health
│       ├── api/v1/             # auth.py, meetings.py, chat.py
│       ├── core/               # config.py, security.py, deps.py, celery_app.py
│       ├── db/                 # base.py, session.py
│       ├── models/             # user, meeting, action_item, key_decision, chat_message
│       ├── schemas/common.py   # all Pydantic request/response models
│       ├── services/           # transcription.py, vector_store.py, llm/
│       └── tasks/meeting.py    # Celery processing task (7-step pipeline)
└── src/                        # React frontend
    ├── main.jsx, App.jsx, index.css
    ├── components/             # Layout, Sidebar, TopBar, AnswerText
    ├── context/AuthContext.jsx
    ├── pages/                  # Login, Dashboard, Upload, MeetingDetail, SearchChat, Settings
    └── services/               # api.js (HTTP client), mockData.js (unused)
```

> **Note on `arch.md`:** it lists `hooks/` and `utils/` folders and states "Mock data is used for now." Neither directory exists, and `src/services/mockData.js` is **not imported anywhere [CONFIRMED]**. The architecture document predates the real backend integration.

---

## 3. Technology Stack

### 3.1 Frontend — `package.json` [CONFIRMED]
| Purpose | Dependency | Version |
|---|---|---|
| UI library | `react`, `react-dom` | ^19.2.1 |
| Routing | `react-router-dom` | ^7.4.1 |
| Icons | `lucide-react` | ^0.487.0 |
| Charts | `recharts` | ^3.5.1 — **declared but not imported anywhere [PLANNED]** |
| Build | `vite` | ^7.2.4 |
| Plugin | `@vitejs/plugin-react` | ^5.1.1 |
| Styling | `tailwindcss` ^3.4.17, `postcss`, `autoprefixer` | — |
| Lint | `eslint` ^9.39.1 + react-hooks / react-refresh plugins | — |

Scripts: `dev` (vite), `build` (vite build), `lint` (eslint .), `preview` (vite preview).

### 3.2 Backend — `backend/pyproject.toml` [CONFIRMED]
| Purpose | Dependency |
|---|---|
| Web framework | `fastapi`, `uvicorn[standard]` |
| ORM / DB | `sqlalchemy[asyncio]`, `asyncpg`, `psycopg2-binary` |
| Migrations | `alembic` |
| Validation/settings | `pydantic[email]`, `pydantic-settings` |
| Auth | `python-jose[cryptography]`, `passlib[bcrypt]` |
| Forms/multipart | `python-multipart` |
| Queue | `redis`, `celery[redis]` |
| Speech-to-text | `whisper`, `openai-whisper` |
| LLM/embeddings | `openai`, `chromadb`, `tiktoken` |
| Media | `moviepy==1.0.3`, `aiofiles` |
| HTTP/misc | `httpx`, `tenacity`, `python-dotenv` |

Requires Python ≥ 3.10. **Observed runtime:** the backend is executed with the **global Python 3.10 interpreter**, not a project virtualenv [CONFIRMED — earlier `ModuleNotFoundError: No module named 'uvicorn'` in `.venv`].

### 3.3 Infrastructure [CONFIRMED]
- **PostgreSQL** — Docker container (referred to as `syncora-pg` in prior operational work), port 5432.
- **Redis** — Docker container (`syncora-redis`), port 6379; used as **both Celery broker and result backend**.
- **ChromaDB** — **not** containerized; an **embedded persistent client** writing to `CHROMA_PATH` (`./chroma_data`). A legacy Docker Chroma container is unused.
- **Ollama** — native service on `http://localhost:11434`; models `llama3.2:3b` (chat) and `nomic-embed-text` (embeddings).
- **FFmpeg** — required by Whisper; the code auto-injects the `imageio-ffmpeg` binary and creates an `ffmpeg.exe` shim (see §8.1).

---

## 4. Configuration & Environment Variables

**Backend settings — `backend/app/core/config.py`**
Class `Settings(BaseSettings)` (pydantic-settings), loaded from `backend/.env` with `extra="ignore"`. Singleton `settings = Settings()`.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — (required) | sync (psycopg2) — used by Celery task & Alembic |
| `ASYNC_DATABASE_URL` | — (required) | asyncpg — used by FastAPI |
| `REDIS_URL` | — (required) | broker + result backend |
| `JWT_SECRET_KEY` | — (required) | HS256 signing key |
| `JWT_ALGORITHM` | `HS256` | |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | 7 days |
| `APP_ENV` | — (required) | enables uvicorn reload when `dev` |
| `CORS_ORIGINS` | — (required) | comma-separated; parsed by `CORS_ORIGINS_LIST` |
| `LLM_PROVIDER` | `ollama` | `ollama` / `openai` / `mock` |
| `OPENAI_API_KEY` | `""` | only for `openai` provider |
| `WHISPER_MODEL` | `whisper-1` | OpenAI transcription model |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | |
| `OLLAMA_CHAT_MODEL` | `llama3.2:3b` | |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | |
| `WHISPER_LOCAL_MODEL` | `small` | tiny/base/small/medium/large-v3 |
| `WHISPER_DEVICE` | `""` | empty ⇒ auto-detect CUDA |
| `WHISPER_USE_LOCAL` | `True` | |
| `CHROMA_PATH` | `./chroma_data` | |
| `MAX_UPLOAD_MB` | `500` | |
| `MEDIA_STORAGE_DIR` | `./media_storage` | |

Helper: `Settings.resolve_whisper_device()` returns an explicit `WHISPER_DEVICE`, else `cuda` if `torch.cuda.is_available()`, else `cpu`.

**Frontend env — `.env.example`:** `VITE_API_URL=` (empty ⇒ requests go to same origin and are proxied by Vite).

**Git hygiene [CONFIRMED]:** root and `backend/.gitignore` both ignore `.env`, `.env.*` (with `!.env.example`), `media_storage/`, `chroma_data/`, `__pycache__/`, `*.sqlite3`, `*.db`.

---

## 5. Backend — Application Core

### 5.1 App factory — `backend/app/main.py` [CONFIRMED]
- `lifespan(app)` (asynccontextmanager): warns/generates an ephemeral JWT key if `JWT_SECRET_KEY` is missing or < 16 chars; logs env, upload limit, LLM provider; **eagerly initializes the ChromaDB collection** via `get_meeting_collection()` and logs its count.
- `app = FastAPI(title="Syncora API", version="1.0.0", lifespan=lifespan)`.
- `CORSMiddleware` with `allow_origins=settings.CORS_ORIGINS_LIST`, credentials, all methods/headers.
- `app.include_router(api_router, prefix="/api/v1")`.
- Global `@app.exception_handler(Exception)` → logs and returns `500 {"detail": "Internal server error"}`.
- `GET /health` → `{status, env, upload_mb, llm}`.

**Router aggregation — `backend/app/api/v1/__init__.py`:** composes `auth_router`, `meetings_router`, `chat_router`; re-exported by `backend/app/api/__init__.py`.

### 5.2 Database session — `backend/app/db/session.py` [CONFIRMED]
- `engine = create_async_engine(settings.ASYNC_DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)`.
- `AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)`.
- `async def get_db()` — async generator yielding a session, closing it in `finally`.
- `backend/app/db/base.py` — `Base = declarative_base()`.

### 5.3 Authentication — JWT (`backend/app/core/security.py`, `deps.py`) [CONFIRMED]

**`security.py`**
- `hash_password(password)` — bcrypt, `gensalt(rounds=12)`, returns utf-8 string.
- `verify_password(plain, hashed)` — `bcrypt.checkpw`; returns `False` on `ValueError`/`TypeError` (defensive).
- `create_access_token(subject, expires_delta=None)` — JWT payload `{"exp", "sub"}`, signed HS256 with `JWT_SECRET_KEY`; default expiry from settings.
- `decode_access_token(token)` — returns `sub` or `None` on `JWTError`.

**`deps.py`**
- `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)`.
- `_extract_token(request, header_token)` — accepts the token from the `Authorization: Bearer` header **or** the query params `access_token` / `token` (the latter is required so `<audio>`/`<video>` tags, which cannot set headers, can stream protected media).
- `get_current_user(request, header_token, db)` — extracts token → decodes → validates UUID → loads `User`; raises `401` with `WWW-Authenticate: Bearer` on any failure.
- Type aliases: `CurrentUser = Annotated[User, Depends(get_current_user)]`, `DBSession = Annotated[AsyncSession, Depends(get_db)]`.

**Token model** (`schemas/common.py`): `Token { access_token, token_type="bearer", user }`.

### 5.4 Data Models — `backend/app/models/` [CONFIRMED]

All tables use PostgreSQL `UUID` PKs with `server_default=text("gen_random_uuid()")`.

| Model / file | Table | Key columns |
|---|---|---|
| `User` — `user.py` | `users` | `id`, `name`, `email` (unique), `password_hash`, `created_at` |
| `Meeting` — `meeting.py` | `meetings` | `id`, `title`, `date`, `duration` (int min), `status` (enum), `failure_reason`, `summary` (Text), `transcript` (Text), `media_path`, `media_filename`, `created_by` FK→users; relationships `action_items`, `key_decisions`, `creator` (cascade `all, delete-orphan` on children) |
| `MeetingStatus` — `meeting.py` | PG enum `meeting_status` | `processing` / `ready` / `failed` |
| `ActionItem` — `action_item.py` | `action_items` | `id`, `meeting_id` FK (ON DELETE CASCADE, indexed), `text`, `owner_name`, `owner_initials`, `owner_id` FK→users (nullable), `due_date` (Date, nullable), `completed` (bool) |
| `KeyDecision` — `key_decision.py` | `key_decisions` | `id`, `meeting_id` FK (CASCADE, indexed), `text` |
| `ChatMessage` — `chat_message.py` | `chat_messages` | `id`, `user_id` FK (indexed), `role` (enum), `text`, `meeting_id` FK (ON DELETE SET NULL, nullable), `sources` (JSON), `timestamp` |
| `ChatRole` — `chat_message.py` | PG enum `chat_role` | `user` / `assistant` |

`models/__init__.py` re-exports everything; `models/base.py` re-exports `Base` + models (used by Alembic).

> **Observation:** `ActionItem.owner_id` is defined and nullable but **never populated** — the LLM extraction returns only `owner_name`/`owner_initials`, and `tasks/meeting.py::_set_ready` does not set `owner_id` **[PARTIAL]**.

### 5.5 Schemas — `backend/app/schemas/common.py` [CONFIRMED]
Pydantic v2 models (`ConfigDict(from_attributes=True)` where ORM mapping is needed):
`ChatSource{meeting_id, meeting_title}`, `ActionItemBase/Create/ActionItem/ActionItemUpdate`, `KeyDecision*`, `MeetingBase/Create/Meeting/MeetingListItem/MeetingStatusResponse/PaginatedMeetings`, `UserBase/Create/Login/User/UserStats`, `Token`, `ChatMessageBase/Create/ChatMessage`, `ChatRequest{question}`, `ChatResponse{answer, sources}`.

> The chat request field is strictly named **`question`**; the frontend must not send `query`.

---

## 6. Backend — API Reference

Base prefix: `/api/v1`. All routes except `register`/`login` require a valid JWT and scope every query to `Meeting.created_by == current_user.id`.

### 6.1 Auth — `backend/app/api/v1/auth.py` [CONFIRMED]
| Method & path | Function | Behaviour |
|---|---|---|
| `POST /auth/register` → 201 | `register(payload: UserCreate, db)` | Case-insensitive duplicate-email check (`ilike`); creates user with bcrypt hash; lowercases email; returns `Token`. |
| `POST /auth/login` → 200 | `login(form_data: OAuth2PasswordRequestForm, db)` | Form-encoded `username`(=email)/`password`; verifies bcrypt; returns `Token` or `401`. |
| `GET /auth/me` | `get_me(current_user)` | Returns the current `User` schema. |
| `GET /auth/me/stats` | `get_me_stats(current_user, db)` | Aggregates 9 counts/sums (meetings by status, total duration of ready meetings, action items total/pending/complete, key decisions) using `union_all` of scalar subqueries → `UserStats`. |

### 6.2 Meetings — `backend/app/api/v1/meetings.py` [CONFIRMED]
Module constants: `ALLOWED_EXTENSIONS = {".mp3", ".wav", ".mp4", ".mov"}`, `MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024`, `UPLOAD_DIR = abspath(MEDIA_STORAGE_DIR)` (created on import), `MEDIA_EXT_TO_MIME`.

Helpers: `_guess_mime(path)`, `_iter_file_chunks(path, start, end, chunk_size=1MB)` (generator used for streaming).

| Method & path | Function | Behaviour |
|---|---|---|
| `POST /meetings/upload` → 202 | `upload_meeting(current_user, db, file, title, date=None)` | Validates extension; streams the upload to disk in 1 MB chunks, aborting and deleting the part-file if `MAX_UPLOAD_BYTES` is exceeded; stores file as `{uuid4}{ext}`; creates `Meeting(status=processing)`; enqueues `process_meeting.delay(...)`. Returns `{id, status}`. |
| `GET /meetings` | `list_meetings(current_user, db, page=1, per_page=20)` | Paginated (`PaginatedMeetings`) list ordered by `date DESC`, scoped to user. |
| `GET /meetings/{id}` | `get_meeting(...)` | Eager-loads action items + decisions via `selectinload`; 404 if not owned. |
| `GET /meetings/{id}/status` | `get_meeting_status(...)` | Lightweight `{id, status, failure_reason}` for polling. |
| `GET /meetings/{id}/media` | `get_meeting_media(..., range=None)` | Streams the stored media; **implements HTTP Range** (`206 Partial Content`, `Content-Range`, `Accept-Ranges`, `416` on invalid range) for seeking. |
| `POST /meetings/{id}/retry` → 202 | `retry_meeting(...)` | Requires the original file to exist; resets status/summary/transcript/duration, deletes existing `ActionItem`/`KeyDecision` rows, deletes Chroma chunks via `delete_meeting_chunks`, re-enqueues the task. |
| `PATCH /meetings/{id}/action-items/{item_id}` | `update_action_item(...)` | Toggles `completed` on an owned action item; returns updated `ActionItem`. |
| `DELETE /meetings/{id}` → 204 | `delete_meeting(...)` | Deletes the DB row (children cascade), deletes Chroma chunks, removes the media file from disk. |

### 6.3 Chat / RAG — `backend/app/api/v1/chat.py` [CONFIRMED]
- `NO_INFO_MESSAGE` — canned "couldn't find anything relevant…" string.
- `_get_meeting_titles(db, user_id, meeting_ids)` — maps meeting-id → title, scoped to the owner.
- `_answer_with_rag(question, user_id, meeting_id, db)` — **core RAG routine** (see §9.4).
- `POST /chat/meeting/{meeting_id}` — `chat_meeting(...)`; requires meeting `status == ready`; persists the user message, runs RAG, persists the assistant message **with `sources` JSON**, returns `ChatResponse`.
- `POST /chat/global` — `chat_global(...)`; same but `meeting_id=None` (searches all of the user's meetings).
- `GET /chat/history?meeting_id=&limit=100` — `get_chat_history(...)`; returns stored messages (global when `meeting_id` omitted, else per-meeting).

> **Observation:** the history endpoint is fully implemented but the frontend never calls it on load — chat sessions start empty after refresh **[PARTIAL]**.

---

## 7. Asynchronous Processing (Celery + Redis)

### 7.1 Celery app — `backend/app/core/celery_app.py` [CONFIRMED]
`Celery("syncora", broker=REDIS_URL, backend=REDIS_URL)` with `task_serializer/accept_content/result_serializer=json`, `timezone=UTC`, `task_track_started=True`, `task_time_limit=3600`, `worker_prefetch_multiplier=1`, and `autodiscover_tasks(["app.tasks"])`.

### 7.2 Worker entrypoint — `backend/celery_worker.py` [CONFIRMED]
Re-exports `celery_app`. On Windows the worker must be started with `--pool=solo` (see §13).

### 7.3 Pipeline task — `backend/app/tasks/meeting.py` [CONFIRMED]
The task uses a **synchronous** SQLAlchemy engine (`create_engine(DATABASE_URL)` + `sessionmaker`) because the Celery worker is not async; async service calls are bridged with `asyncio.run(...)`.

- `_set_failure(meeting_id, reason)` — sets `status=failed` + `failure_reason`.
- `_set_ready(meeting_id, transcript, summary, duration, action_items_data, key_decisions_data, user_id)` — writes transcript/summary/duration, inserts `ActionItem` rows (parsing ISO `due_date`, defaulting to `None`) and `KeyDecision` rows, sets `status=ready`, clears `failure_reason`; on exception rolls back and calls `_set_failure`.
- `@celery_app.task(bind=True, name="process_meeting", max_retries=0, time_limit=3600)` `process_meeting(self, meeting_id, file_path, user_id, title)` — the **7-step pipeline**:

| Step | Log label | Operation | Failure handling |
|---|---|---|---|
| 1 | `[1/7]` | `get_media_duration_seconds(file_path)` → minutes | — |
| 2 | `[2/7]` | `extract_audio_if_needed(file_path)` (video → mp3) | on error → `_set_failure("Audio extraction failed: …")`, return |
| 3 | `[3/7]` | `asyncio.run(transcribe_audio(audio_path))`; deletes temp extracted audio in `finally` | on error → `_set_failure("Transcription failed…")`; empty transcript → `"Transcription produced empty text"` |
| 4 | `[4/7]` | `llm.extract_meeting_data(transcript, title)` | on error → `_set_failure("AI extraction failed…")`; empty summary → failure |
| 5 | `[5/7]` | `chunk_transcript(transcript)` (falls back to single chunk) | — |
| 6 | `[6/7]` | `llm.embed_text(chunks)`; asserts `len(embeddings) == len(chunks)` | mismatch → `"Mismatch between chunks and embeddings"` |
| 7 | `[7/7]` | `store_meeting_chunks(meeting_id, user_id, chunks, embeddings)` → `_set_ready(...)` | on error → `_set_failure("Vector storage failed…")` |

A top-level `except` converts any unhandled error into `status=failed` with `"Internal processing error: …"`.

### 7.4 Redis role [CONFIRMED]
Redis is the Celery **broker** (task queue) and **result backend**. The frontend does not talk to Redis; it observes progress through the `GET /meetings/{id}/status` and `GET /meetings` polling endpoints.

---

## 8. AI Services

### 8.1 Speech-to-text — `backend/app/services/transcription.py` [CONFIRMED]
- Constants: `VIDEO_EXTENSIONS = {.mp4,.mov,.m4v,.avi,.mkv}`, `AUDIO_EXTENSIONS = {.mp3,.wav,.m4a,.aac,.flac,.ogg}`; module-level `_local_whisper_model`, `_local_whisper_lock`, `_ffmpeg_path_injected`.
- `_inject_ffmpeg_to_path()` — imports `imageio_ffmpeg`, prepends its directory to `PATH`, and copies the versioned binary to a `ffmpeg.exe` shim so Whisper's shell call to `ffmpeg` resolves on Windows.
- `_get_local_whisper_model()` — lazy, lock-guarded model load (`whisper.load_model(model_name, device=resolve_whisper_device())`), with automatic **CUDA→CPU fallback** if CUDA load fails.
- `_transcribe_local_sync(audio_path)` — `model.transcribe(path, language="en", fp16=(device=="cuda"), verbose=False)`.
- `get_media_duration_seconds(file_path)` — uses `moviepy.editor` (`VideoFileClip`/`AudioFileClip`); returns `0` on failure.
- `extract_audio_if_needed(file_path)` — audio passes through (`(path, False)`); video is transcoded to `.mp3` via `write_audiofile(..., codec="libmp3lame")` returning `(mp3_path, True)`.
- `_transcribe_openai(file_path)` — optional OpenAI Whisper API call with retry/backoff on `429`, raising `RateLimitError` on hard quota (`credit_balance_exhausted`/`insufficient_quota`).
- `transcribe_audio(file_path)` — dispatch: OpenAI when `not WHISPER_USE_LOCAL` and key present, with automatic fallback to local; otherwise runs `_transcribe_local_sync` in a `ThreadPoolExecutor` (keeps the event loop free). `RateLimitError` is defined here.

### 8.2 LLM abstraction — `backend/app/services/llm/base.py` [CONFIRMED]
- Pydantic DTOs: `ExtractedActionItem{text, owner_name, owner_initials, owner_id?, due_date?, completed}`, `ExtractedKeyDecision{text}`, `ExtractedMeetingData{summary, action_items, key_decisions}`.
- `BaseLLMProvider(ABC)` — abstract async methods: `extract_meeting_data(transcript, meeting_title)`, `chat_with_context(question, context_chunks)`, `embed_text(texts)`, `embed_query(text)`.

### 8.3 Providers — `backend/app/services/llm/providers.py` [CONFIRMED]

**Module-level helpers**
- `_parse_retry_after(resp, default)` — honours `Retry-After`.
- `_is_hard_quota(body_text)` — detects non-retryable quota exhaustion.
- `_post_openai_with_retry(url, headers, payload, timeout, label)` — up to `MAX_RETRIES=5` with exponential backoff on `429`; hard-quota raises immediately.
- `_post_ollama(url, payload, timeout, label)` — posts to `OLLAMA_BASE_URL`; friendly errors for connect failure (Ollama not running) and `404` (model not pulled); logs latency.
- `_extract_json(text)` — forgiving JSON parse: direct → fenced block (`_JSON_FENCE_RE`) → first `{…}` span.
- `_build_extraction_system_prompt()` / `_build_extraction_user_prompt(transcript, title)` — instruct the model to return **only** JSON with keys `summary`, `action_items`(`text, owner_name, owner_initials, due_date`), `key_decisions`; derives initials; defaults owner to `Unassigned`/`U`.
- `_normalize_action_item(raw)` — sanitises text/owner, derives initials (max 2 upper), validates `YYYY-MM-DD` due dates.

**`OpenAIProvider`** — `extract_meeting_data` uses a `json_schema` `response_format`; `chat_with_context` uses a grounded system prompt; `embed_text`/`embed_query` call `/embeddings` with `text-embedding-3-small` (`embedding_dim=1536`).

**`OllamaProvider`** — local GPU inference:
- `extract_meeting_data` calls `/api/generate` with `format="json"`; on JSON parse failure retries **without** forced JSON.
- `chat_with_context` calls `/api/generate` (`num_ctx=8192`, `temperature=0.1`) and maps refusal phrases (`__no_info__`, "i couldn't find anything relevant", …) to the sentinel `__NO_INFO__`.
- `embed_text` calls `/api/embed` (batch), falling back per-item if the shape is unexpected; `embed_query` accepts both `embeddings[0]` (list) and a flat `embedding` list.

**`MockProvider`** — deterministic, network-free: returns a canned summary/action item/decision and SHA-256-derived normalised 384-dim vectors. Enables offline dev/testing.

**`get_llm_provider()`** — lazy singleton dispatch on `LLM_PROVIDER` (unknown values fall back to Ollama with a warning).

### 8.4 Action-item & decision extraction [CONFIRMED]
Performed inside `extract_meeting_data`: the transcript + title are sent to the configured provider, which returns structured JSON that is normalised into `ExtractedActionItem` / `ExtractedKeyDecision` objects. These are persisted by `_set_ready` into `action_items` and `key_decisions`. Action items carry an **owner** (name + derived initials), an optional **due date**, and a **completed** flag toggled later via `PATCH .../action-items/{item_id}`.

---

## 9. Vector Search & RAG

### 9.1 ChromaDB — `backend/app/services/vector_store.py` [CONFIRMED]
- `get_client()` — lazy singleton `chromadb.PersistentClient(path=CHROMA_PATH, settings=ChromaSettings(anonymized_telemetry=False))`.
- `get_meeting_collection()` — `get_or_create_collection("meeting_transcripts", metadata={"hnsw:space": "cosine"})`.
- `chunk_transcript(transcript, chunk_size=600, overlap=100)` — sentence-aware packing: splits on `(?<=[.!?])\s+`, fills up to 600 words, then carries the last 100 words into the next chunk (overlap).
- `store_meeting_chunks(meeting_id, user_id, chunks, embeddings)` — deletes any existing chunks (idempotent re-ingest) then `collection.upsert` with ids `"{meeting_id}_{i}"` and metadata `{meeting_id, user_id, chunk_index}`.
- `delete_meeting_chunks(meeting_id)` — `collection.delete(where={"meeting_id": …})`; guarded by try/except with a warning.
- `search_chunks(query_embedding, user_id, meeting_id=None, top_k=6, score_threshold=0.3)` — builds a `where` clause filtered by `user_id` (**and** `meeting_id` when scoped) using `{"$and": [...]}` for multi-key filters; queries `n_results=top_k*2`, computes `similarity = 1.0 - distance`, filters below threshold, sorts descending, returns top_k `{id, text, meeting_id, user_id, similarity}` dicts.

### 9.2 RAG answer flow — `chat.py::_answer_with_rag` [CONFIRMED]
1. `llm.embed_query(question)`.
2. `search_chunks(..., top_k=6, score_threshold=0.3)` scoped to the user (and meeting when per-meeting chat).
3. If no chunks → return `NO_INFO_MESSAGE` with empty sources.
4. Resolve meeting titles (`_get_meeting_titles`).
5. **Number unique sources first** — dedupe by `meeting_id` and assign `source_index` 1..N, so `[n]` markers align 1:1 with the `sources` array returned to the UI.
6. Build `context_chunks` with `{text, meeting_title, meeting_id, source_index}`.
7. `llm.chat_with_context(question, context_chunks)` → if the model returns the `__NO_INFO__` sentinel, return `NO_INFO_MESSAGE` with empty sources; else return the answer + numbered sources.

### 9.3 Citations [CONFIRMED — recently implemented]
- Both provider prompts label each chunk `[<source_index>] Source: <title>` and instruct: *"Cite every source you relied on using its bracketed number, e.g. [1]."*
- Frontend renders the markers as numbered superscripts with a source-title tooltip via `src/components/AnswerText.jsx`; the "Sources" pill list is prefixed with the same numbers, giving a visual link between a claim and its originating meeting.

---

## 10. Frontend

### 10.1 Bootstrap & routing — `src/main.jsx`, `src/App.jsx` [CONFIRMED]
- `main.jsx` mounts `<App/>` into `#root` under `StrictMode`.
- `App.jsx` wraps everything in `AuthProvider`; `AppContent` defines `BrowserRouter` routes:
  - `/login` (redirects to `/dashboard` if authenticated)
  - `/` → redirect to dashboard or login
  - `/dashboard`, `/upload`, `/search`, `/settings`, `/meetings/:id` — each rendered inside a `Layout` with a contextual title and guarded by `ProtectedRoute`.
- `ProtectedRoute` — renders children only when `useAuth().isAuthenticated`, else `<Navigate to="/login">`.
- `LayoutWithDashboardActions` — layout for the Dashboard whose top-bar child is an "Upload Meeting" button.

### 10.2 Auth state — `src/context/AuthContext.jsx` [CONFIRMED]
- `AuthProvider` initialises `isAuthenticated` from `api.isLoggedIn()` and `user` from `getStoredUser()`; syncs across tabs via a `storage` event listener.
- Exposes `login(email, password)`, `register(name, email, password)`, `logout()`; `useAuth()` hook.

### 10.3 API service layer — `src/services/api.js` [CONFIRMED]
- Token/user persistence in `localStorage` (`syncora_token`, `syncora_user`); `BASE_URL` from `VITE_API_URL`.
- `getErrorMessage(err, fallback)` — robust stringification of FastAPI error payloads (arrays, `detail`, etc.) to avoid `[object Object]`.
- `buildHeaders()` — injects `Authorization: Bearer <token>`.
- `handleResponse(res)` — on `401` clears storage and redirects to `/`; **skips body parsing for `204 No Content`** (fixes a prior "Unexpected end of JSON input" crash on delete); parses JSON by content-type; throws `Error` with `status`/`data` on non-OK.
- `HttpClient` class — `_request(method, url, {params, body, headers, isForm})` with `AbortController`; `get/post/patch/delete` wrappers.
- `api` object methods: `register`, `login` (form-encoded), `logout`, `getMe`, `getStats` (maps snake_case→camelCase and computes `hoursSaved = round(minutes * 0.6)`), `getMeetings` (perPage 50), `getMeeting`, `getMeetingStatus`, `getMediaUrl` (appends `access_token` for media tags), `uploadMeeting` (XHR with upload progress), `retryMeeting`, `toggleActionItem`, `deleteMeeting`, `sendChatMessage` (maps `sources` → `{meetingId, meetingTitle}`).
- Normalisers: `mapOwner`, `formatDateValue`, `mapMeetingListItem`, `mapMeetingDetail` (flattens action items/decisions into the UI shape).

### 10.4 Pages — `src/pages/` [CONFIRMED]
| File | Responsibility | Key behaviour |
|---|---|---|
| `Login.jsx` | Auth screen | Toggle sign-in/create-account; client-side validation (password ≥ 6, confirm match); calls `useAuth().login/register`; **`fakeGoogle()` shows a "coming soon" error [PARTIAL]** |
| `Dashboard.jsx` | Meeting grid + stats | `fetchData()` loads meetings + stats in parallel; **auto-polls every 4 s while any meeting is `processing`**; `handleRetry`, `handleDelete` (confirm dialog → `api.deleteMeeting`); status badges (processing/ready/failed); empty-state onboarding; skeleton loader |
| `Upload.jsx` | Drag-drop upload | Validates type (mp3/wav/mp4/mov) and 500 MB limit; auto-fills title from filename; `api.uploadMeeting` with progress bar; then shows a 3-step "Transcribing → Summarizing → Ready" indicator that is **client-side simulated (fixed delays), not backend-driven [PARTIAL]**; on success redirects to the dashboard |
| `MeetingDetail.jsx` | Single meeting | `fetchMeeting()` + polling every 4 s while processing; custom audio/video player (play/pause, seek bar, `formatMMSS`) using the range-capable media endpoint; Summary, Action Items (optimistic toggle via `toggleActionItem`), Key Decisions, collapsible Transcript; per-meeting chat with `AnswerText` citations; processing/failed banners with retry |
| `SearchChat.jsx` | Global chat | `api.sendChatMessage(null, q)` against `/chat/global`; message bubbles with `AnswerText` + numbered Sources; typing indicator; suggestion chips; empty state |
| `Settings.jsx` | Settings tabs | Profile / Notifications / Team / Security tabs. **Profile fields are hardcoded ("John Doe"), toggle switches are static, and Change/Enable buttons are non-functional; Team tab is an explicit "Coming soon!" placeholder [PARTIAL/PLANNED]** |

### 10.5 Components — `src/components/` [CONFIRMED]
- `Layout.jsx` — `Sidebar` + `TopBar` + `<Outlet/>` shell.
- `Sidebar.jsx` — brand, `NavLink`s (Dashboard, Upload, Search & Chat, Settings), user avatar/initials + logout.
- `TopBar.jsx` — page title + right-aligned action slot (children).
- `AnswerText.jsx` — splits an answer on `[n]` and renders each marker as a superscript badge (tooltip = `Source n: <meeting title>`).

### 10.6 Styling [CONFIRMED]
- Tailwind configured in `tailwind.config.js` with a custom `primary` colour `#06b6d4` and the Inter font stack; content globs cover `index.html` and `src/**/*.{js,ts,jsx,tsx}`.
- `src/index.css` sets the dark base (`background-color: #0a0a0b`, light text) — the app is **dark-theme only** by design.

---

## 11. Database Schema & Migrations

### 11.1 Tables (authoritative — from `alembic/versions/0001_initial.py` + `0002_add_media_columns.py`) [CONFIRMED]
`users`, `meetings`, `action_items`, `key_decisions`, `chat_messages`, plus PostgreSQL enums `meeting_status` and `chat_role`. FKs: `meetings.created_by→users.id`; `action_items.meeting_id→meetings.id ON DELETE CASCADE`; `action_items.owner_id→users.id`; `key_decisions.meeting_id→meetings.id ON DELETE CASCADE`; `chat_messages.user_id→users.id`; `chat_messages.meeting_id→meetings.id ON DELETE SET NULL`. Indexes on `meetings.created_by`, `action_items.meeting_id`, `key_decisions.meeting_id`, `chat_messages.user_id`. Migration `0002` adds `meetings.media_path` and `meetings.media_filename`.

### 11.2 Alembic configuration [CONFIRMED]
- `backend/alembic/env.py` injects `backend/` into `sys.path`, imports `settings` and `Base` + all models, sets `sqlalchemy.url` from `settings.DATABASE_URL` (synchronous driver) and `target_metadata = Base.metadata`; supports offline/online modes.
- `backend/alembic.ini` — `script_location = alembic`, `prepend_sys_path = .`.

---

## 12. Testing

**Status: no automated tests exist. [PLANNED]**

- No `tests/` directory, no `test_*.py` / `*.test.jsx` files, and no pytest configuration in `backend/pyproject.toml` or a `pytest.ini`/`conftest.py`.
- The only "test-oriented" asset is `MockProvider` in `providers.py` (a network-free deterministic LLM/embedding provider for offline development and manual testing) plus `src/services/mockData.js`, which is **currently unused**.
- Verification to date has been **manual/operational**: exercising endpoints, inspecting PostgreSQL, and querying ChromaDB directly.

**Recommended additions for the black-book's future-work section:** pytest + `httpx.ASGITransport` for API/auth tests, a Celery `task_always_eager` pipeline test with `MockProvider`, and React Testing Library for the chat/citation components.

---

## 13. Startup & Run Commands

### 13.1 Prerequisites
- PostgreSQL and Redis containers running; Ollama running with models pulled; FFmpeg available (auto-handled by the code).
- Backend dependencies installed into the Python 3.10 interpreter that runs the app.
- `backend/.env` populated (copy from `backend/.env.example`).

### 13.2 Infrastructure (background, not dedicated terminals)
```powershell
# PostgreSQL and Redis (Docker) — container names per the project's setup
docker start syncora-pg
docker start syncora-redis

# Ollama local models (one-time pulls)
ollama pull llama3.2:3b
ollama pull nomic-embed-text
ollama serve
```

### 13.3 Database migrations
```powershell
cd d:\code\btechproject\backend
alembic upgrade head
```

### 13.4 Three development terminals
| Terminal | Command | Purpose |
|---|---|---|
| 1 — Backend API | `cd d:\code\btechproject\backend` then `python run.py` | FastAPI/uvicorn on **:8787** (reload when `APP_ENV=dev`) |
| 2 — Celery Worker | `cd d:\code\btechproject\backend` then `python -m celery -A celery_worker worker --loglevel=info --pool=solo` | Runs the 7-step pipeline (`--pool=solo` required on Windows) |
| 3 — Frontend | `cd d:\code\btechproject` then `npm run dev` | Vite dev server on **127.0.0.1:3000**, proxying `/api` and `/health` to `127.0.0.1:8787` |

**Open the app at** `http://127.0.0.1:3000` (use the IPv4 literal to avoid `localhost`/IPv6 proxy mismatches).

**Productive endpoints:** `GET http://127.0.0.1:8787/health`, interactive docs at `http://127.0.0.1:8787/docs`.

**Operational notes:**
- Restart the **backend** to pick up Python changes; restart the **Celery worker** to pick up task/service module changes (it does not auto-reload).
- `vite.config.js` changes require a full frontend restart.

---

## 14. Confirmed vs. Planned — Consolidated Matrix

| Capability | Status | Evidence |
|---|---|---|
| Email/password auth + JWT | **CONFIRMED** | `auth.py`, `security.py`, `deps.py` |
| bcrypt password hashing (cost 12) | **CONFIRMED** | `security.py::hash_password` |
| File upload with size/type validation | **CONFIRMED** | `meetings.py::upload_meeting` |
| Streaming media playback with HTTP Range | **CONFIRMED** | `meetings.py::get_meeting_media` |
| Celery + Redis async pipeline | **CONFIRMED** | `celery_app.py`, `tasks/meeting.py` |
| Local Whisper transcription (GPU auto-detect) | **CONFIRMED** | `transcription.py` |
| OpenAI Whisper fallback | **CONFIRMED (optional)** | `transcription.py::_transcribe_openai` |
| Ollama local LLM + embeddings | **CONFIRMED** | `providers.py::OllamaProvider` |
| OpenAI provider (paid) | **CONFIRMED (optional)** | `providers.py::OpenAIProvider` |
| Mock provider (offline dev) | **CONFIRMED** | `providers.py::MockProvider` |
| Summary + action items + key decisions extraction | **CONFIRMED** | `providers.py::extract_meeting_data`, `tasks/meeting.py::_set_ready` |
| Action item completion toggle | **CONFIRMED** | `meetings.py::update_action_item`, `MeetingDetail.jsx::toggleActionItem` |
| ChromaDB vector store with per-user filtering | **CONFIRMED** | `vector_store.py` |
| RAG chat (per-meeting and global) | **CONFIRMED** | `chat.py::_answer_with_rag`, `chat_meeting`, `chat_global` |
| Source citations numbered & rendered | **CONFIRMED** | `chat.py`, `providers.py`, `AnswerText.jsx` |
| Meeting delete (DB + vectors + media) | **CONFIRMED** | `meetings.py::delete_meeting` |
| Retry failed processing | **CONFIRMED** | `meetings.py::retry_meeting` |
| Dashboard status polling | **CONFIRMED** | `Dashboard.jsx`, `MeetingDetail.jsx` |
| Chat message persistence (DB) | **CONFIRMED** | `chat.py` writes `ChatMessage` rows |
| Chat history hydration in the UI | **PARTIAL** | `GET /chat/history` exists; frontend never calls it |
| Upload processing-step indicator tied to real status | **PARTIAL** | `Upload.jsx` uses fixed client-side delays |
| Action item `owner_id` linkage to a user | **PARTIAL** | Column exists; never populated |
| Google OAuth sign-in | **PLANNED** | `Login.jsx::fakeGoogle` shows "coming soon"; PRD lists it |
| Settings: profile edit / notifications / 2FA | **PLANNED** | `Settings.jsx` hardcoded values, static toggles |
| Team / organisation management | **PLANNED** | `Settings.jsx` "Coming soon!"; PRD marks non-functional |
| Charts / analytics | **PLANNED** | `recharts` dependency present but unused |
| Automated test suite | **PLANNED** | No tests/config found |
| `hooks/` and `utils/` folders | **PLANNED** | Listed in `arch.md`; do not exist |
| Frontend mock-data layer | **OBSOLETE** | `mockData.js` unused; `api.js` calls the real backend |
| Refresh tokens / token revocation | **PLANNED** | Single 7-day access token; no refresh/denylist |
| Rate limiting / brute-force protection | **PLANNED** | Not implemented on auth endpoints |

---

## 15. Known Limitations & Design Notes

1. **Single-user scope.** Although data is keyed by `user_id`/`created_by` and every query is ownership-scoped, collaboration features (sharing, teams, roles) are not implemented.
2. **Local-first dependence.** Ollama models and local Whisper weights must be installed; the backend degrades gracefully but cannot process/answer without them (unless `LLM_PROVIDER=mock`).
3. **Small-model grounding.** `llama3.2:3b` can omit citation markers or refuse when the question's framing doesn't match the transcript's content, returning the `__NO_INFO__` sentinel (surfaced as the "couldn't find anything relevant" message).
4. **RAG tuning.** `top_k=6` with a **similarity threshold of 0.3** (cosine, `nomic-embed-text`); the threshold is deliberately low because stricter values dropped valid chunks.
5. **ChromaDB filter syntax.** Multi-key filters must use `{"$and": [...]}`; a plain multi-key dict raises a Chroma `ValueError` (handled in `search_chunks`).
6. **Port choice.** The backend uses **8787** (not 8000) to avoid the common Windows/Docker/WSL port-8000 collision.
7. **Celery is not auto-reloading**; module changes need a worker restart.
8. **`hoursSaved` is a heuristic** — 60% of total meeting minutes, computed client-side in `api.getStats`.

---

## 16. Appendix — File & Function Inventory

**Backend**
| File | Key symbols |
|---|---|
| `backend/run.py` | uvicorn launcher (port 8787) |
| `backend/celery_worker.py` | `celery_app` re-export |
| `backend/app/main.py` | `lifespan`, `app`, `global_exception_handler`, `health_check` |
| `backend/app/core/config.py` | `Settings`, `CORS_ORIGINS_LIST`, `resolve_whisper_device`, `settings` |
| `backend/app/core/security.py` | `hash_password`, `verify_password`, `create_access_token`, `decode_access_token` |
| `backend/app/core/deps.py` | `oauth2_scheme`, `_extract_token`, `get_current_user`, `CurrentUser`, `DBSession` |
| `backend/app/core/celery_app.py` | `celery_app` |
| `backend/app/db/session.py` | `engine`, `AsyncSessionLocal`, `get_db` |
| `backend/app/db/base.py` | `Base` |
| `backend/app/models/*` | `User`, `Meeting`, `MeetingStatus`, `ActionItem`, `KeyDecision`, `ChatMessage`, `ChatRole` |
| `backend/app/schemas/common.py` | All Pydantic schemas (see §5.5) |
| `backend/app/api/v1/auth.py` | `register`, `login`, `get_me`, `get_me_stats` |
| `backend/app/api/v1/meetings.py` | `upload_meeting`, `list_meetings`, `get_meeting`, `get_meeting_status`, `get_meeting_media`, `retry_meeting`, `update_action_item`, `delete_meeting`, `_guess_mime`, `_iter_file_chunks` |
| `backend/app/api/v1/chat.py` | `_get_meeting_titles`, `_answer_with_rag`, `chat_meeting`, `chat_global`, `get_chat_history` |
| `backend/app/services/transcription.py` | `_inject_ffmpeg_to_path`, `_get_local_whisper_model`, `_transcribe_local_sync`, `get_media_duration_seconds`, `extract_audio_if_needed`, `_transcribe_openai`, `transcribe_audio`, `RateLimitError` |
| `backend/app/services/vector_store.py` | `get_client`, `get_meeting_collection`, `chunk_transcript`, `store_meeting_chunks`, `delete_meeting_chunks`, `search_chunks` |
| `backend/app/services/llm/base.py` | `ExtractedActionItem`, `ExtractedKeyDecision`, `ExtractedMeetingData`, `BaseLLMProvider` |
| `backend/app/services/llm/providers.py` | `_post_openai_with_retry`, `_post_ollama`, `_extract_json`, `_build_extraction_*_prompt`, `_normalize_action_item`, `OpenAIProvider`, `OllamaProvider`, `MockProvider`, `get_llm_provider` |
| `backend/app/tasks/meeting.py` | `_set_failure`, `_set_ready`, `process_meeting` |

**Frontend**
| File | Key symbols |
|---|---|
| `src/main.jsx` | React root mount |
| `src/App.jsx` | `LayoutWithDashboardActions`, `ProtectedRoute`, `AppContent`, `App` |
| `src/context/AuthContext.jsx` | `AuthProvider`, `useAuth` |
| `src/services/api.js` | `getErrorMessage`, `getStoredUser`, `buildHeaders`, `handleResponse`, `HttpClient`, `api`, `mapOwner`, `mapMeetingListItem`, `mapMeetingDetail` |
| `src/components/` | `Layout`, `Sidebar`, `TopBar`, `AnswerText` |
| `src/pages/` | `Login`, `Dashboard`, `UploadPage`, `MeetingDetail`, `SearchChat`, `Settings` |

---

*End of report.*
