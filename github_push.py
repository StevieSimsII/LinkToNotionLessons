"""Push a generated wiki page to the Second_Brain GitHub repo via the Contents API."""
from __future__ import annotations

import base64
import logging
import re
from datetime import datetime, timezone

import requests

import config

log = logging.getLogger(__name__)

_REPO = "StevieSimsII/Second_Brain"
_PAGES_PATH = "wiki/pages"
_API_BASE = "https://api.github.com"
_SITE_URL = "https://steviesimsii.github.io/Second_Brain/"


def _slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return re.sub(r"-+", "-", text).strip("-")[:80]


def push_wiki_page(lesson: dict, *, source_url: str) -> str:
    """Push a lesson as a wiki page to Second_Brain. Returns the live site URL."""
    from llm.gpt import lesson_to_wiki_markdown

    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    markdown = lesson_to_wiki_markdown(
        lesson, source_url=source_url, personal_notes="", date=date
    )

    slug = f"{date}-{_slugify(lesson.get('title', 'untitled'))}"
    file_path = f"{_PAGES_PATH}/{slug}.md"
    api_url = f"{_API_BASE}/repos/{_REPO}/contents/{file_path}"

    headers = {
        "Authorization": f"Bearer {config.SECOND_BRAIN_GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    # Need existing file's SHA if we're updating rather than creating
    sha = None
    existing = requests.get(api_url, headers=headers, timeout=15)
    if existing.status_code == 200:
        sha = existing.json().get("sha")

    body: dict = {
        "message": f"lesson: {lesson.get('title', slug)}",
        "content": base64.b64encode(markdown.encode("utf-8")).decode("ascii"),
    }
    if sha:
        body["sha"] = sha

    resp = requests.put(api_url, json=body, headers=headers, timeout=15)
    resp.raise_for_status()

    log.info("Pushed wiki page: %s/%s", _REPO, file_path)
    return _SITE_URL
