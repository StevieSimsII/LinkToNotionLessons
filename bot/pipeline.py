"""End-to-end orchestration: URL -> fetched content -> Claude lesson -> Notion page -> email."""
from __future__ import annotations

import logging
from urllib.parse import urlparse

import config
from email_notifier.gmail import send_lesson_email
from fetchers.github import fetch_github_repo, is_github_url
from fetchers.web import fetch_article
from llm.claude import generate_lesson
from notionapi.client import create_lesson_page

log = logging.getLogger(__name__)


def _fetch(url: str) -> tuple[str, str]:
    """Return (source_type, text_content) for the URL."""
    if is_github_url(url):
        log.info("Fetching GitHub repo: %s", url)
        return "github", fetch_github_repo(url)

    host = urlparse(url).netloc
    log.info("Fetching article from %s", host)
    return "web", fetch_article(url)


def process_link(url: str) -> dict:
    """Full pipeline. Returns {title, notion_url, emailed_to}."""
    source_type, content = _fetch(url)

    log.info("Generating lesson with Claude (source=%s, chars=%d)", source_type, len(content))
    lesson = generate_lesson(url=url, source_type=source_type, content=content)

    log.info("Creating Notion page: %s", lesson["title"])
    notion_url = create_lesson_page(lesson=lesson, source_url=url)

    log.info("Sending email to %s", config.EMAIL_TO)
    send_lesson_email(lesson=lesson, source_url=url, notion_url=notion_url)

    return {
        "title": lesson["title"],
        "notion_url": notion_url,
        "emailed_to": config.EMAIL_TO,
    }
