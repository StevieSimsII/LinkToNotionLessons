"""OpenAI GPT client — turns raw fetched content into a structured lesson."""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import OpenAI

import config

log = logging.getLogger(__name__)

_client = OpenAI(api_key=config.OPENAI_API_KEY)

SYSTEM_PROMPT = """You are an expert technical educator. You take raw content from a web \
article or a GitHub repository and transform it into a structured, self-contained \
training lesson aimed at a curious engineer who has not seen this material before.

You MUST return valid JSON matching this exact schema:

{
  "title": "A concise, descriptive lesson title (max 120 chars).",
  "tags": ["3-6 lowercase tag strings capturing the core topics/technologies"],
  "overview": "1-2 paragraphs explaining what this is, why it matters, and who would care.",
  "key_concepts": [
    {"name": "Short concept name", "explanation": "2-4 sentence explanation of the concept."}
  ],
  "how_it_works": "A multi-paragraph walkthrough of the mechanics. If it's a repo, explain the code structure, main modules, and data flow. If it's an article, explain the central ideas and reasoning step by step. Markdown is allowed (bullets, code blocks with triple backticks).",
  "training_exercise": "A concrete hands-on exercise the reader can do to cement the learning. Include step-by-step instructions and, where useful, a small code snippet or command. Markdown allowed.",
  "further_reading": [
    {"title": "Resource title", "url": "https://..."}
  ]
}

Rules:
- Return ONLY the JSON object. No prose, no markdown fences around it.
- 4-8 key_concepts. 2-5 further_reading items (infer likely canonical resources if none are in the source).
- Keep the tone practical and technical; assume the reader is a working engineer.
- If the source is a repository, always describe the actual code/architecture — don't just paraphrase the README.
"""


def _extract_json(text: str) -> dict[str, Any]:
    """Be forgiving if the model wraps the JSON in ```json fences."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```\s*$", "", stripped)
    return json.loads(stripped)


def _clean_markdown(text: str) -> str:
    return (text or "").strip()


def lesson_to_wiki_markdown(
    lesson: dict[str, Any], *, source_url: str, personal_notes: str = "", date: str = ""
) -> str:
    """Render a generated lesson into markdown for the Second Brain repo."""
    title = lesson.get("title") or "Untitled Lesson"
    tags = [str(tag).strip() for tag in lesson.get("tags", []) if str(tag).strip()]

    lines: list[str] = [f"# {title}", ""]

    if date:
        lines.append(f"Date: {date}")
    lines.append(f"Source: {source_url}")
    if tags:
        lines.append(f"Tags: {', '.join(tags)}")
    lines.append("")

    overview = _clean_markdown(lesson.get("overview", ""))
    if overview:
        lines.extend(["## Overview", "", overview, ""])

    concepts = lesson.get("key_concepts", [])
    if concepts:
        lines.extend(["## Key Concepts", ""])
        for concept in concepts:
            name = str(concept.get("name", "")).strip()
            explanation = str(concept.get("explanation", "")).strip()
            if name and explanation:
                lines.append(f"- **{name}**: {explanation}")
            elif name:
                lines.append(f"- **{name}**")
            elif explanation:
                lines.append(f"- {explanation}")
        lines.append("")

    how_it_works = _clean_markdown(lesson.get("how_it_works", ""))
    if how_it_works:
        lines.extend(["## How It Works", "", how_it_works, ""])

    training_exercise = _clean_markdown(lesson.get("training_exercise", ""))
    if training_exercise:
        lines.extend(["## Training Exercise", "", training_exercise, ""])

    further_reading = lesson.get("further_reading", [])
    if further_reading:
        lines.extend(["## Further Reading", ""])
        for item in further_reading:
            item_title = str(item.get("title", "")).strip()
            item_url = str(item.get("url", "")).strip()
            if item_title and item_url:
                lines.append(f"- [{item_title}]({item_url})")
            elif item_url:
                lines.append(f"- {item_url}")
            elif item_title:
                lines.append(f"- {item_title}")
        lines.append("")

    notes = _clean_markdown(personal_notes)
    if notes:
        lines.extend(["## Personal Notes", "", notes, ""])

    return "\n".join(lines).rstrip() + "\n"


def generate_lesson(url: str, source_type: str, content: str) -> dict[str, Any]:
    """Call OpenAI and return the parsed lesson dict."""
    user_message = (
        f"Source URL: {url}\n"
        f"Source type: {source_type}\n\n"
        f"Source content follows between the BEGIN/END markers.\n"
        f"--- BEGIN SOURCE ---\n{content}\n--- END SOURCE ---\n\n"
        "Produce the lesson JSON now."
    )

    response = _client.chat.completions.create(
        model=config.OPENAI_MODEL,
        max_completion_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
    )

    raw = response.choices[0].message.content or ""
    log.debug("OpenAI raw response: %s", raw[:500])

    lesson = _extract_json(raw)
    required = ("title", "overview", "key_concepts", "how_it_works", "training_exercise")
    missing = [k for k in required if not lesson.get(k)]
    if missing:
        raise ValueError(f"Lesson JSON missing required fields: {missing}")

    lesson.setdefault("tags", [])
    lesson.setdefault("further_reading", [])
    return lesson
