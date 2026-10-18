import asyncio
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Tuple

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi", ".mkv"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}


class RateLimitError(Exception):
    pass


_local_whisper_lock = threading.Lock()
_local_whisper_model = None
_ffmpeg_path_injected = False


def _inject_ffmpeg_to_path() -> None:
    """Whisper shell-calls `ffmpeg` for audio decoding; add bundled imageio-ffmpeg to PATH."""
    global _ffmpeg_path_injected
    if _ffmpeg_path_injected:
        return
    try:
        import imageio_ffmpeg  # type: ignore
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        ffmpeg_dir = os.path.dirname(os.path.abspath(ffmpeg_exe))
        if os.path.isdir(ffmpeg_dir):
            shim_path = os.path.join(ffmpeg_dir, "ffmpeg.exe")
            real_name = os.path.basename(ffmpeg_exe)
            if real_name.lower() != "ffmpeg.exe" and not os.path.exists(shim_path):
                try:
                    import shutil
                    shutil.copy2(ffmpeg_exe, shim_path)
                    logger.info(f"[Whisper-Local] Created ffmpeg.exe shim from {real_name}")
                except Exception as copy_err:
                    logger.warning(f"[Whisper-Local] Could not create ffmpeg.exe shim: {copy_err}")
            current = os.environ.get("PATH", "")
            if ffmpeg_dir not in current.split(os.pathsep):
                os.environ["PATH"] = ffmpeg_dir + os.pathsep + current
                logger.info(f"[Whisper-Local] Added ffmpeg to PATH: {ffmpeg_dir}")
    except Exception as e:
        logger.warning(f"[Whisper-Local] Could not auto-inject ffmpeg to PATH: {e}")
    _ffmpeg_path_injected = True


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


def _get_local_whisper_model():
    global _local_whisper_model
    if _local_whisper_model is not None:
        return _local_whisper_model
    with _local_whisper_lock:
        if _local_whisper_model is not None:
            return _local_whisper_model
        _inject_ffmpeg_to_path()
        try:
            import whisper  # type: ignore
        except Exception as e:
            raise RuntimeError(
                f"Python 'whisper' package not available. Install with: pip install openai-whisper. Original: {e}"
            )
        device = settings.resolve_whisper_device()
        model_name = settings.WHISPER_LOCAL_MODEL
        logger.info(
            f"[Whisper-Local] Loading model '{model_name}' on '{device}' "
            f"(first run downloads weights automatically; ~460MB for small, ~145MB for base)."
        )
        try:
            _local_whisper_model = whisper.load_model(model_name, device=device)
        except Exception as e:
            if device == "cuda":
                logger.warning(f"[Whisper-Local] CUDA load failed ({e}); falling back to CPU.")
                _local_whisper_model = whisper.load_model(model_name, device="cpu")
            else:
                raise
        logger.info("[Whisper-Local] Model ready.")
        return _local_whisper_model


def _transcribe_local_sync(audio_path: str) -> str:
    model = _get_local_whisper_model()
    fp16 = settings.resolve_whisper_device() == "cuda"
    result = model.transcribe(
        audio_path,
        language="en",
        fp16=fp16,
        verbose=False,
    )
    text = (result.get("text") or "").strip()
    return text


def get_media_duration_seconds(file_path: str) -> int:
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in VIDEO_EXTENSIONS and ext not in AUDIO_EXTENSIONS:
        return 0
    try:
        from moviepy.editor import VideoFileClip, AudioFileClip

        if ext in VIDEO_EXTENSIONS:
            clip = VideoFileClip(file_path)
        else:
            clip = AudioFileClip(file_path)
        duration = int(clip.duration)
        clip.close()
        return duration
    except Exception as e:
        logger.warning(f"Could not read media duration: {e}")
        return 0


def extract_audio_if_needed(file_path: str) -> Tuple[str, bool]:
    ext = os.path.splitext(file_path)[1].lower()
    if ext in AUDIO_EXTENSIONS:
        return file_path, False
    if ext in VIDEO_EXTENSIONS:
        audio_path = os.path.splitext(file_path)[0] + ".mp3"
        try:
            from moviepy.editor import VideoFileClip

            clip = VideoFileClip(file_path)
            clip.audio.write_audiofile(audio_path, codec="libmp3lame", verbose=False, logger=None)
            clip.close()
            return audio_path, True
        except Exception as e:
            logger.error(f"Failed to extract audio: {e}")
            raise RuntimeError(f"Audio extraction failed: {e}")
    raise ValueError(f"Unsupported file type: {ext}")


async def _transcribe_openai(file_path: str) -> str:
    api_key = settings.OPENAI_API_KEY or ""
    model = settings.WHISPER_MODEL
    max_retries = 6

    for attempt in range(1, max_retries + 1):
        async with httpx.AsyncClient(timeout=600.0) as client:
            with open(file_path, "rb") as f:
                files = {"file": (os.path.basename(file_path), f)}
                data = {
                    "model": model,
                    "language": "en",
                    "response_format": "text",
                }
                headers = {"Authorization": f"Bearer {api_key}"}
                resp = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers=headers,
                    data=data,
                    files=files,
                )

        body_text = ""
        try:
            body_text = resp.text or ""
        except Exception:
            pass

        if resp.status_code == 429:
            if _is_hard_quota(body_text):
                raise RateLimitError(
                    "Transcription failed: OpenAI account has no credits. "
                    "Set WHISPER_USE_LOCAL=true (already default) to use local GPU Whisper instead."
                )
            if attempt == max_retries:
                raise RateLimitError(
                    f"Transcription failed: OpenAI rate limit reached after {max_retries} retries. "
                    f"Last: {body_text[:200]}"
                )
            wait_s = _parse_retry_after(resp, default=2 ** attempt + 15)
            logger.warning(f"[Whisper-API] 429 attempt {attempt}/{max_retries}, waiting {wait_s}s")
            await asyncio.sleep(wait_s)
            continue

        resp.raise_for_status()
        return resp.text.strip()

    raise RateLimitError(f"Transcription failed after {max_retries} attempts due to rate limiting")


async def transcribe_audio(file_path: str) -> str:
    use_local = bool(settings.WHISPER_USE_LOCAL)

    if not use_local and settings.OPENAI_API_KEY:
        try:
            return await _transcribe_openai(file_path)
        except RateLimitError:
            logger.warning("[Whisper] OpenAI unusable; auto-falling back to local Whisper.")

    device = settings.resolve_whisper_device()
    logger.info(f"[Whisper] LOCAL transcription: model={settings.WHISPER_LOCAL_MODEL} device={device}")
    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=1) as ex:
        return await loop.run_in_executor(ex, _transcribe_local_sync, file_path)
