"""End-to-end orchestration: URL -> fetched content -> LLM lesson -> Notion + Second Brain."""
from __future__ import annotations

import logging
from urllib.parse import urlparse

from fetchers.github import fetch_github_repo, is_github_url
from fetchers.web import fetch_article
from github_push import push_wiki_page
from llm.gpt import generate_lesson
from notionapi.client import create_lesson_page

log = logging.getLogger(__name__)


def _fetch(url: str) -> tuple[str, str]:
    if is_github_url(url):
        log.info("Fetching GitHub repo: %s", url)
        return "github", fetch_github_repo(url)
    log.info("Fetching article from %s", urlparse(url).netloc)
    return "web", fetch_article(url)


def process_link(url: str) -> dict:
    """Full pipeline. Returns {title, notion_url, site_url}."""
    source_type, content = _fetch(url)

    log.info("Generating lesson (source=%s, chars=%d)", source_type, len(content))
    lesson = generate_lesson(url=url, source_type=source_type, content=content)

    log.info("Creating Notion page: %s", lesson["title"])
    notion_url = create_lesson_page(lesson=lesson, source_url=url)

    log.info("Pushing to Second Brain: %s", lesson["title"])
    site_url = push_wiki_page(lesson, source_url=url)

    return {
        "title": lesson["title"],
        "notion_url": notion_url,
        "site_url": site_url,
    }
