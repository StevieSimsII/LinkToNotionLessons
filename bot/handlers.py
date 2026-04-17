"""Telegram message handlers."""
from __future__ import annotations

import asyncio
import logging
import re

from telegram import Update
from telegram.ext import ContextTypes

import config
from bot.pipeline import process_link

log = logging.getLogger(__name__)

URL_RE = re.compile(r"https?://[^\s]+", re.IGNORECASE)


def _authorized(update: Update) -> bool:
    user = update.effective_user
    return user is not None and user.id == config.ALLOWED_TELEGRAM_USER_ID


async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _authorized(update):
        await update.message.reply_text("Not authorized.")
        return
    await update.message.reply_text(
        "Send me a link (article or GitHub repo) and I'll create a Notion lesson "
        "and email you the details."
    )


async def handle_url(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _authorized(update):
        log.warning("Unauthorized user %s tried to use the bot", update.effective_user)
        await update.message.reply_text("Not authorized.")
        return

    text = update.message.text or ""
    match = URL_RE.search(text)
    if not match:
        await update.message.reply_text("I didn't see a URL in that message. Send me a link.")
        return

    url = match.group(0).rstrip(").,;!?")
    await update.message.reply_text(f"Processing: {url}\nThis can take a minute...")

    try:
        # The pipeline is sync (uses requests, SMTP, etc.). Run it off the event loop
        # so the bot stays responsive.
        result = await asyncio.to_thread(process_link, url)
    except Exception as e:  # noqa: BLE001 — we want to surface any failure to the user
        log.exception("Pipeline failed for %s", url)
        await update.message.reply_text(f"Something went wrong: {e}")
        return

    await update.message.reply_text(
        f"Done.\n\n*{result['title']}*\nNotion: {result['notion_url']}\n"
        f"Email sent to {result['emailed_to']}",
        parse_mode="Markdown",
        disable_web_page_preview=False,
    )
