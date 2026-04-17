"""Create a Notion page for a generated lesson."""
from __future__ import annotations

import logging
import re
from typing import Any

from notion_client import Client

import config

log = logging.getLogger(__name__)

_notion = Client(auth=config.NOTION_API_KEY)

# Notion rich_text content limit per segment.
RT_CHUNK = 1900


def _rich_text(text: str) -> list[dict]:
    """Split a string into rich_text segments respecting Notion's per-segment char limit."""
    if not text:
        return []
    chunks: list[str] = []
    remaining = text
    while len(remaining) > RT_CHUNK:
        chunks.append(remaining[:RT_CHUNK])
        remaining = remaining[RT_CHUNK:]
    chunks.append(remaining)
    return [{"type": "text", "text": {"content": c}} for c in chunks]


def _heading(level: int, text: str) -> dict:
    key = f"heading_{level}"
    return {"object": "block", "type": key, key: {"rich_text": _rich_text(text)}}


def _paragraph(text: str) -> dict:
    return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {"rich_text": _rich_text(text)},
    }


def _bullet(text: str) -> dict:
    return {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {"rich_text": _rich_text(text)},
    }


def _numbered(text: str) -> dict:
    return {
        "object": "block",
        "type": "numbered_list_item",
        "numbered_list_item": {"rich_text": _rich_text(text)},
    }


def _code(text: str, language: str = "plain text") -> dict:
    # Notion's code block requires a specific set of language strings.
    lang = language.strip().lower() or "plain text"
    allowed = {
        "bash", "c", "c#", "c++", "css", "dart", "diff", "docker", "go", "graphql",
        "html", "java", "javascript", "json", "kotlin", "latex", "lua", "makefile",
        "markdown", "objective-c", "php", "plain text", "powershell", "python", "r",
        "ruby", "rust", "sass", "scala", "scss", "shell", "sql", "swift", "typescript",
        "vb.net", "xml", "yaml",
    }
    if lang == "ts":
        lang = "typescript"
    if lang == "js":
        lang = "javascript"
    if lang == "sh":
        lang = "shell"
    if lang == "py":
        lang = "python"
    if lang not in allowed:
        lang = "plain text"
    return {
        "object": "block",
        "type": "code",
        "code": {"rich_text": _rich_text(text), "language": lang},
    }


def _markdown_to_blocks(md: str) -> list[dict]:
    """Convert a small subset of markdown (paragraphs, bullets, numbered lists, fenced code)
    into Notion blocks. Anything we don't recognize becomes a paragraph."""
    blocks: list[dict] = []
    lines = md.splitlines()
    i = 0
    para_buf: list[str] = []

    def flush_para() -> None:
        if para_buf:
            blocks.append(_paragraph("\n".join(para_buf).strip()))
            para_buf.clear()

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Fenced code block
        if stripped.startswith("```"):
            flush_para()
            lang = stripped[3:].strip()
            i += 1
            code_lines: list[str] = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            blocks.append(_code("\n".join(code_lines), lang))
            i += 1  # skip closing ```
            continue

        # Blank line ends the current paragraph
        if not stripped:
            flush_para()
            i += 1
            continue

        # Bulleted list item
        bullet_match = re.match(r"^[-*+]\s+(.*)", stripped)
        if bullet_match:
            flush_para()
            blocks.append(_bullet(bullet_match.group(1)))
            i += 1
            continue

        # Numbered list item
        numbered_match = re.match(r"^\d+\.\s+(.*)", stripped)
        if numbered_match:
            flush_para()
            blocks.append(_numbered(numbered_match.group(1)))
            i += 1
            continue

        para_buf.append(line)
        i += 1

    flush_para()
    return blocks


def _build_blocks(lesson: dict[str, Any], source_url: str) -> list[dict]:
    blocks: list[dict] = []

    # Source + tags as the first paragraph
    source_line = f"Source: {source_url}"
    if lesson.get("tags"):
        source_line += f"\nTags: {', '.join(lesson['tags'])}"
    blocks.append(_paragraph(source_line))

    blocks.append(_heading(2, "Overview"))
    blocks.extend(_markdown_to_blocks(lesson["overview"]))

    blocks.append(_heading(2, "Key Concepts"))
    for concept in lesson.get("key_concepts", []):
        name = concept.get("name", "")
        explanation = concept.get("explanation", "")
        blocks.append(_bullet(f"{name}: {explanation}"))

    blocks.append(_heading(2, "How It Works"))
    blocks.extend(_markdown_to_blocks(lesson["how_it_works"]))

    blocks.append(_heading(2, "Training Exercise"))
    blocks.extend(_markdown_to_blocks(lesson["training_exercise"]))

    blocks.append(_heading(2, "Further Reading"))
    for item in lesson.get("further_reading", []):
        title = item.get("title", "")
        url = item.get("url", "")
        if url:
            # Notion link-bearing rich_text
            blocks.append({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {
                    "rich_text": [
                        {"type": "text", "text": {"content": title or url, "link": {"url": url}}}
                    ]
                },
            })
        elif title:
            blocks.append(_bullet(title))

    # Notion imposes a limit of 100 children per request; keep under that.
    if len(blocks) > 95:
        log.warning("Lesson produced %d blocks; truncating to 95", len(blocks))
        blocks = blocks[:95]
    return blocks


def create_lesson_page(lesson: dict[str, Any], source_url: str) -> str:
    """Create the page and return its URL."""
    blocks = _build_blocks(lesson, source_url)

    page = _notion.pages.create(
        parent={"page_id": config.NOTION_PARENT_PAGE_ID},
        properties={
            "title": {"title": [{"type": "text", "text": {"content": lesson["title"]}}]}
        },
        children=blocks,
    )
    return page["url"]
