"""Runtime settings (environment variables or a .env file; prefix CARDIOLENS_)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CARDIOLENS_", env_file=".env", extra="ignore")

    ARTIFACTS_DIR: Path = ROOT / "artifacts"
    FRONTEND_DIST: Path = ROOT / "app" / "frontend" / "dist"
    # dev: the Vite dev server only. In production the SPA is served from the same origin -> no CORS.
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    ENV: str = "dev"                     # dev | prod
    LOG_LEVEL: str = "INFO"
    VERSION: str = "1.0.0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
