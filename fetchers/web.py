"""Fetch and extract readable text from a general web page."""
from __future__ import annotations

import logging

import requests
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (compatible; LinkToNotion/1.0; +https://github.com/)"
)
MAX_CHARS = 60_000  # cap the amount we send to the LLM


def fetch_article(url: str) -> str:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # Strip noise
    for tag in soup(["script", "style", "noscript", "iframe", "svg", "nav", "footer", "header", "form"]):
        tag.decompose()

    # Prefer semantic containers; fall back to full body text.
    candidate = soup.find("article") or soup.find("main") or soup.body or soup
    text = candidate.get_text(separator="\n", strip=True)

    # Collapse runs of blank lines
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    cleaned = "\n".join(lines)

    title = soup.title.get_text(strip=True) if soup.title else url

    combined = f"TITLE: {title}\nURL: {url}\n\n{cleaned}"
    if len(combined) > MAX_CHARS:
        log.info("Truncating article from %d to %d chars", len(combined), MAX_CHARS)
        combined = combined[:MAX_CHARS] + "\n\n[...truncated...]"
    return combined
