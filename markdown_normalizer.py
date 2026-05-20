"""Normalize generated markdown pages into canonical frontmatter form."""
from __future__ import annotations

import re


_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.DOTALL)


def _extract_frontmatter_value(markdown: str, key: str) -> str:
    match = re.search(rf'^{key}:\s*"?([^"\n]+)"?\s*$', markdown, re.MULTILINE)
    return match.group(1).strip() if match else ""


def _extract_tags(markdown: str) -> list[str]:
    match = re.search(r'^tags:\s*\[([^\]]*)\]', markdown, re.MULTILINE)
    if not match:
        return []
    return [tag.strip().strip('"').strip("'") for tag in match.group(1).split(",") if tag.strip()]


def _quote_yaml(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _compose_page_markdown(*, title: str, source: str, date: str, tags: list[str], body: str) -> str:
    clean_tags = [tag.strip().strip('"').strip("'") for tag in tags if tag and tag.strip()]
    tag_list = "[" + ", ".join(clean_tags) + "]" if clean_tags else "[]"
    parts = [
        "---",
        f'title: "{_quote_yaml(title)}"',
        f'source: "{_quote_yaml(source)}"',
        f'date: "{_quote_yaml(date)}"',
        f"tags: {tag_list}",
        "---",
    ]
    body = body.strip()
    if body:
        parts.extend(["", body])
    return "\n".join(parts)


def normalize_page_markdown(
    markdown: str,
    *,
    fallback_title: str = "",
    fallback_source: str = "",
    fallback_date: str = "",
    fallback_tags: list[str] | None = None,
) -> str:
    """Return markdown with canonical YAML frontmatter, inferring it when possible."""
    text = markdown.strip()
    fallback_tags = fallback_tags or []

    frontmatter = _FRONTMATTER_RE.match(text)
    if frontmatter:
        body = frontmatter.group(2).strip()
        return _compose_page_markdown(
            title=_extract_frontmatter_value(text, "title") or fallback_title or "Untitled",
            source=_extract_frontmatter_value(text, "source") or fallback_source,
            date=_extract_frontmatter_value(text, "date") or fallback_date,
            tags=_extract_tags(text) or fallback_tags,
            body=body,
        )

    title = fallback_title
    source = fallback_source
    date = fallback_date
    tags = list(fallback_tags)

    lines = text.splitlines()
    cursor = 0

    if lines and lines[0].startswith("# "):
        title = lines[0][2:].strip() or title
        cursor = 1
        while cursor < len(lines) and not lines[cursor].strip():
            cursor += 1

    metadata_found = False
    while cursor < len(lines):
        line = lines[cursor].strip()
        if not line:
            cursor += 1
            if metadata_found:
                break
            continue
        if line.startswith("Date:"):
            date = line.partition(":")[2].strip() or date
            metadata_found = True
        elif line.startswith("Source:"):
            source = line.partition(":")[2].strip() or source
            metadata_found = True
        elif line.startswith("Tags:"):
            tags = [tag.strip() for tag in line.partition(":")[2].split(",") if tag.strip()] or tags
            metadata_found = True
        else:
            break
        cursor += 1

    body = "\n".join(lines[cursor:]).strip() if metadata_found or cursor else text
    return _compose_page_markdown(
        title=title or "Untitled",
        source=source,
        date=date,
        tags=tags,
        body=body,
    )