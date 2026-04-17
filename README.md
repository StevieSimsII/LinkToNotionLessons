# LinkToNotion

A personal Telegram bot that turns links (articles or GitHub repos) into structured Notion lessons and emails them to you.

## Flow

1. You send a URL to your Telegram bot.
2. The bot fetches the content — README + repo structure for GitHub, article text for the web.
3. Claude turns it into a structured lesson: *Overview · Key Concepts · How It Works · Training Exercise · Further Reading*.
4. A new Notion page is created under your configured parent page.
5. The bot replies on Telegram with the Notion URL.
6. You receive an email with the full lesson body.

## Setup

### 1. Install

```bash
cd LinkToNotion
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Get credentials

- **Telegram bot token** — message [@BotFather](https://t.me/BotFather), run `/newbot`, copy the token.
- **Your Telegram user ID** — message [@userinfobot](https://t.me/userinfobot). This is used to lock the bot to only you.
- **Anthropic API key** — https://console.anthropic.com/
- **Notion integration** —
  1. Create an internal integration at https://www.notion.so/my-integrations
  2. Copy the Internal Integration Secret.
  3. Open the Notion page you want to use as the parent for new lessons, click `···` → *Connect to integration* → select your integration.
  4. Copy the page ID from the URL (the last 32 hex characters).
- **Gmail app password** — enable 2FA on your Google account, then create an app password at https://myaccount.google.com/apppasswords.
- **GitHub token** (optional) — https://github.com/settings/tokens. A classic token with `public_repo` scope is enough for public repos.

### 3. Configure

```bash
cp .env.example .env
# Fill in the values
```

### 4. Run

```bash
python main.py
```

Then in Telegram, send the bot a URL. That's it.

## Structure

```
LinkToNotion/
├── main.py                 # Entry point — starts long polling
├── config.py               # Env var loading
├── bot/
│   ├── handlers.py         # Telegram message handlers
│   └── pipeline.py         # Orchestration: fetch → LLM → Notion → email
├── fetchers/
│   ├── web.py              # Generic article fetcher
│   └── github.py           # GitHub repo fetcher
├── llm/
│   └── claude.py           # Anthropic client — structured lesson generation
├── notionapi/
│   └── client.py           # Notion page creation
└── email_notifier/
    └── gmail.py            # Gmail SMTP sender
```
