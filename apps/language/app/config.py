"""Application configuration backed by environment variables.

Uses pydantic-settings so values can be overridden via a .env file or
directly in the process environment. Loaded lazily via get_settings() which
is cached with @lru_cache — the AsyncOpenAI client is never constructed at
import time.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openrouter_api_key: str = ""
    llm_model: str = "anthropic/claude-haiku-4.5"
    request_timeout: float = 4.0

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
