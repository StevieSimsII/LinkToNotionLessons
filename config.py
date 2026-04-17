"""Load configuration from .env.local / .env and expose as module-level constants."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_BASE = Path(__file__).resolve().parent
# .env.local takes precedence; .env is the fallback. Neither overrides real env vars.
load_dotenv(_BASE / ".env.local")
load_dotenv(_BASE / ".env")


def _required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


# Telegram
TELEGRAM_BOT_TOKEN = _required("TELEGRAM_BOT_TOKEN")
ALLOWED_TELEGRAM_USER_ID = int(_required("ALLOWED_TELEGRAM_USER_ID"))

# OpenAI
OPENAI_API_KEY = _required("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

# Notion
NOTION_API_KEY = _required("NOTION_API_KEY")
NOTION_PARENT_PAGE_ID = _required("NOTION_PARENT_PAGE_ID")

# Gmail
GMAIL_USER = _required("GMAIL_USER")
GMAIL_APP_PASSWORD = _required("GMAIL_APP_PASSWORD")
EMAIL_TO = _required("EMAIL_TO")

# GitHub (optional)
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN") or None
