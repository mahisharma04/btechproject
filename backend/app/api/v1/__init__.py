from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.meetings import router as meetings_router
from app.api.v1.chat import router as chat_router

router = APIRouter()

router.include_router(auth_router)
router.include_router(meetings_router)
router.include_router(chat_router)

__all__ = ["router"]
