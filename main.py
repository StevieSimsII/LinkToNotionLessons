"""LinkToNotion — entry point. Starts the Telegram bot in long-polling mode."""
from __future__ import annotations

import logging

from telegram.ext import Application, CommandHandler, MessageHandler, filters

import config
from bot.handlers import handle_start, handle_url

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
# Quiet down noisy libraries
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("telegram").setLevel(logging.INFO)

log = logging.getLogger(__name__)


def main() -> None:
    log.info("Starting LinkToNotion bot...")
    app = Application.builder().token(config.TELEGRAM_BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", handle_start))
    app.add_handler(CommandHandler("help", handle_start))
    # Any message containing a URL entity (or a plain text message — the handler parses it).
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_url))

    log.info("Bot ready. Press Ctrl+C to stop.")
    app.run_polling(allowed_updates=["message"])


if __name__ == "__main__":
    main()
