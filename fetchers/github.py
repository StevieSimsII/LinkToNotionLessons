"""Fetch a GitHub repo's README, metadata, and top-level structure via the REST API."""
from __future__ import annotations

import base64
import logging
import re
from urllib.parse import urlparse

import requests

import config

log = logging.getLogger(__name__)

API = "https://api.github.com"
MAX_CHARS = 80_000
# Files that often contain the most useful repo signal beyond the README.
KEY_FILES = (
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "requirements.txt",
    "package.json",
    "Cargo.toml",
    "go.mod",
    "Dockerfile",
)
GITHUB_URL_RE = re.compile(r"^https?://(www\.)?github\.com/[^/]+/[^/]+", re.IGNORECASE)


def is_github_url(url: str) -> bool:
    return bool(GITHUB_URL_RE.match(url.strip()))


def _auth_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if config.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {config.GITHUB_TOKEN}"
    return headers


def _parse_owner_repo(url: str) -> tuple[str, str]:
    parts = urlparse(url).path.strip("/").split("/")
    if len(parts) < 2:
        raise ValueError(f"Not a GitHub repo URL: {url}")
    owner, repo = parts[0], parts[1]
    repo = repo.removesuffix(".git")
    return owner, repo


def _get(url: str) -> requests.Response:
    resp = requests.get(url, headers=_auth_headers(), timeout=30)
    resp.raise_for_status()
    return resp


def _fetch_readme(owner: str, repo: str) -> str:
    try:
        data = _get(f"{API}/repos/{owner}/{repo}/readme").json()
        content = base64.b64decode(data.get("content", "")).decode("utf-8", errors="replace")
        return content
    except requests.HTTPError as e:
        log.warning("No README for %s/%s: %s", owner, repo, e)
        return ""


def _fetch_tree(owner: str, repo: str, default_branch: str) -> list[str]:
    try:
        data = _get(
            f"{API}/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1"
        ).json()
    except requests.HTTPError as e:
        log.warning("Could not fetch tree for %s/%s: %s", owner, repo, e)
        return []
    entries = data.get("tree", [])
    # Keep a manageable, representative slice: top-level + src-like directories.
    paths = [e["path"] for e in entries if e.get("type") == "blob"]
    # Prioritize shallow paths and cap to 200 entries.
    paths.sort(key=lambda p: (p.count("/"), p.lower()))
    return paths[:200]


def _fetch_file(owner: str, repo: str, path: str) -> str:
    try:
        data = _get(f"{API}/repos/{owner}/{repo}/contents/{path}").json()
    except requests.HTTPError:
        return ""
    if isinstance(data, list) or data.get("encoding") != "base64":
        return ""
    try:
        return base64.b64decode(data.get("content", "")).decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return ""


def fetch_github_repo(url: str) -> str:
    owner, repo = _parse_owner_repo(url)

    meta = _get(f"{API}/repos/{owner}/{repo}").json()
    default_branch = meta.get("default_branch", "main")
    description = meta.get("description") or ""
    language = meta.get("language") or ""
    stars = meta.get("stargazers_count", 0)
    topics = ", ".join(meta.get("topics") or [])
    homepage = meta.get("homepage") or ""

    readme = _fetch_readme(owner, repo)
    tree_paths = _fetch_tree(owner, repo, default_branch)

    key_snippets: list[str] = []
    for fname in KEY_FILES:
        # Match exact top-level file by name
        match = next((p for p in tree_paths if p == fname), None)
        if not match:
            continue
        content = _fetch_file(owner, repo, match)
        if content:
            # Cap each key file to 4k chars
            snippet = content[:4000]
            key_snippets.append(f"--- {match} ---\n{snippet}")

    parts: list[str] = []
    parts.append(f"REPO: {owner}/{repo}")
    parts.append(f"URL: {url}")
    if description:
        parts.append(f"DESCRIPTION: {description}")
    if language:
        parts.append(f"PRIMARY LANGUAGE: {language}")
    if topics:
        parts.append(f"TOPICS: {topics}")
    if homepage:
        parts.append(f"HOMEPAGE: {homepage}")
    parts.append(f"STARS: {stars}")
    parts.append(f"DEFAULT BRANCH: {default_branch}")

    if readme:
        parts.append("\n===== README =====\n")
        parts.append(readme)

    if tree_paths:
        parts.append("\n===== FILE TREE (partial) =====\n")
        parts.append("\n".join(tree_paths))

    if key_snippets:
        parts.append("\n===== KEY FILES =====\n")
        parts.append("\n\n".join(key_snippets))

    combined = "\n".join(parts)
    if len(combined) > MAX_CHARS:
        log.info("Truncating repo payload from %d to %d chars", len(combined), MAX_CHARS)
        combined = combined[:MAX_CHARS] + "\n\n[...truncated...]"
    return combined
