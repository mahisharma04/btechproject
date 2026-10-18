import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api import router as api_router

logging.basicConfig(
    level=logging.INFO if settings.APP_ENV != "dev" else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("syncora")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.JWT_SECRET_KEY or len(settings.JWT_SECRET_KEY) < 16:
        logger.warning(
            "JWT_SECRET_KEY is short or missing. Generating ephemeral key for dev use. "
            "Tokens will NOT survive restarts!"
        )
        settings.JWT_SECRET_KEY = settings.JWT_SECRET_KEY or secrets.token_urlsafe(32)

    logger.info(f"Syncora starting in [{settings.APP_ENV}] mode")
    logger.info(f"Max upload size: {settings.MAX_UPLOAD_MB}MB")
    logger.info(f"LLM provider: {settings.LLM_PROVIDER}")

    from app.services.vector_store import get_meeting_collection
    try:
        col = get_meeting_collection()
        logger.info(f"ChromaDB collection ready (count: {col.count()})")
    except Exception as e:
        logger.warning(f"ChromaDB not yet available: {e}")

    yield


app = FastAPI(title="Syncora API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS_LIST,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception on {request.method} {request.url}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "env": settings.APP_ENV,
        "upload_mb": settings.MAX_UPLOAD_MB,
        "llm": settings.LLM_PROVIDER,
    }
