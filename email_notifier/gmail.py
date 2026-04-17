"""Send the lesson as a plain-text + HTML email via Gmail SMTP."""
from __future__ import annotations

import html
import logging
import smtplib
from email.message import EmailMessage
from typing import Any

import config

log = logging.getLogger(__name__)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465  # SSL


def _render_plain(lesson: dict[str, Any], source_url: str, notion_url: str) -> str:
    lines: list[str] = []
    lines.append(lesson["title"])
    lines.append("=" * len(lesson["title"]))
    lines.append("")
    lines.append(f"Source: {source_url}")
    lines.append(f"Notion page: {notion_url}")
    if lesson.get("tags"):
        lines.append(f"Tags: {', '.join(lesson['tags'])}")
    lines.append("")

    lines.append("OVERVIEW")
    lines.append("--------")
    lines.append(lesson["overview"])
    lines.append("")

    lines.append("KEY CONCEPTS")
    lines.append("------------")
    for c in lesson.get("key_concepts", []):
        lines.append(f"- {c.get('name', '')}: {c.get('explanation', '')}")
    lines.append("")

    lines.append("HOW IT WORKS")
    lines.append("------------")
    lines.append(lesson["how_it_works"])
    lines.append("")

    lines.append("TRAINING EXERCISE")
    lines.append("-----------------")
    lines.append(lesson["training_exercise"])
    lines.append("")

    further = lesson.get("further_reading") or []
    if further:
        lines.append("FURTHER READING")
        lines.append("---------------")
        for item in further:
            title = item.get("title", "")
            url = item.get("url", "")
            lines.append(f"- {title} ({url})" if url else f"- {title}")

    return "\n".join(lines)


def _render_html(lesson: dict[str, Any], source_url: str, notion_url: str) -> str:
    def esc(s: str) -> str:
        return html.escape(s or "")

    def paragraphs(text: str) -> str:
        return "".join(f"<p>{esc(p)}</p>" for p in (text or "").split("\n\n") if p.strip())

    concepts_html = "".join(
        f"<li><strong>{esc(c.get('name', ''))}:</strong> {esc(c.get('explanation', ''))}</li>"
        for c in lesson.get("key_concepts", [])
    )
    further_html = "".join(
        f'<li><a href="{esc(i.get("url", ""))}">{esc(i.get("title") or i.get("url", ""))}</a></li>'
        for i in (lesson.get("further_reading") or [])
        if i.get("url") or i.get("title")
    )
    tags_html = (
        f"<p><em>Tags: {esc(', '.join(lesson.get('tags', [])))}</em></p>"
        if lesson.get("tags") else ""
    )

    return f"""\
<html>
  <body style="font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 20px; color: #222;">
    <h1>{esc(lesson['title'])}</h1>
    <p>
      <strong>Source:</strong> <a href="{esc(source_url)}">{esc(source_url)}</a><br>
      <strong>Notion page:</strong> <a href="{esc(notion_url)}">{esc(notion_url)}</a>
    </p>
    {tags_html}
    <h2>Overview</h2>
    {paragraphs(lesson['overview'])}
    <h2>Key Concepts</h2>
    <ul>{concepts_html}</ul>
    <h2>How It Works</h2>
    {paragraphs(lesson['how_it_works'])}
    <h2>Training Exercise</h2>
    {paragraphs(lesson['training_exercise'])}
    {('<h2>Further Reading</h2><ul>' + further_html + '</ul>') if further_html else ''}
  </body>
</html>"""


def send_lesson_email(lesson: dict[str, Any], source_url: str, notion_url: str) -> None:
    msg = EmailMessage()
    msg["From"] = config.GMAIL_USER
    msg["To"] = config.EMAIL_TO
    msg["Subject"] = f"[Lesson] {lesson['title']}"

    msg.set_content(_render_plain(lesson, source_url, notion_url))
    msg.add_alternative(_render_html(lesson, source_url, notion_url), subtype="html")

    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=30) as smtp:
        smtp.login(config.GMAIL_USER, config.GMAIL_APP_PASSWORD)
        smtp.send_message(msg)

    log.info("Email sent to %s", config.EMAIL_TO)
