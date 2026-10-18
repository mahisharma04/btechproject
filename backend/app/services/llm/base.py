from abc import ABC, abstractmethod
from typing import List, Optional

from pydantic import BaseModel


class ExtractedActionItem(BaseModel):
    text: str
    owner_name: str
    owner_initials: str
    owner_id: Optional[str] = None
    due_date: Optional[str] = None
    completed: bool = False


class ExtractedKeyDecision(BaseModel):
    text: str


class ExtractedMeetingData(BaseModel):
    summary: str
    action_items: List[ExtractedActionItem]
    key_decisions: List[ExtractedKeyDecision]


class BaseLLMProvider(ABC):
    @abstractmethod
    async def extract_meeting_data(
        self,
        transcript: str,
        meeting_title: str,
    ) -> ExtractedMeetingData:
        pass

    @abstractmethod
    async def chat_with_context(
        self,
        question: str,
        context_chunks: List[dict],
    ) -> str:
        pass

    @abstractmethod
    async def embed_text(self, texts: List[str]) -> List[List[float]]:
        pass

    @abstractmethod
    async def embed_query(self, text: str) -> List[float]:
        pass
