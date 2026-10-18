from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    ASYNC_DATABASE_URL: str
    REDIS_URL: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080
    APP_ENV: str
    CORS_ORIGINS: str

    # "openai" | "ollama" | "mock"
    LLM_PROVIDER: str = "ollama"

    # OpenAI
    OPENAI_API_KEY: str = ""
    WHISPER_MODEL: str = "whisper-1"

    # Ollama (local LLM + embeddings)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_CHAT_MODEL: str = "llama3.2:3b"
    OLLAMA_EMBED_MODEL: str = "nomic-embed-text"

    # Local Whisper (Python package; GPU auto-detect)
    # "tiny" | "base" | "small" | "medium" | "large-v3"
    WHISPER_LOCAL_MODEL: str = "small"
    WHISPER_DEVICE: str = ""
    WHISPER_USE_LOCAL: bool = True

    CHROMA_PATH: str = "./chroma_data"
    MAX_UPLOAD_MB: int = 500
    MEDIA_STORAGE_DIR: str = "./media_storage"

    @property
    def CORS_ORIGINS_LIST(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    def resolve_whisper_device(self) -> str:
        if self.WHISPER_DEVICE:
            return self.WHISPER_DEVICE.lower()
        try:
            import torch  # type: ignore
            if torch.cuda.is_available():
                return "cuda"
        except Exception:
            pass
        return "cpu"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
