# LinkToNotion

A personal Telegram bot that turns links (articles or GitHub repos) into structured Notion lessons and emails them to you.

## Flow

1. You send a URL to your Telegram bot.
2. The bot fetches the content — README + repo structure for GitHub, article text for the web.
3. OpenAI turns it into a structured lesson: *Overview · Key Concepts · How It Works · Training Exercise · Further Reading*.
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
- **OpenAI API key** — https://platform.openai.com/api-keys
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

## Multi-Machine Use

The cleanest way to use this project across a Windows machine and a Mac mini is:

- Keep the code in GitHub.
- Keep `.env.local` local to each machine.
- Recreate `.venv` separately on each machine from `requirements.txt`.
- Run only one active bot instance at a time for the same Telegram bot token.

Why this is the right split:

- `.venv` is machine-specific and should not be copied between Windows and macOS.
- `.env.local` contains secrets and is already excluded from git.
- Git stays the source of truth for code, while each machine keeps its own runtime state.

Recommended workflow:

1. Edit and test on Windows.
2. Push changes to GitHub.
3. Pull changes on the Mac mini.
4. Restart the bot on the Mac mini.

Important:

- Do not run the same Telegram bot on both machines at once.
- This bot uses long polling, so concurrent runs with the same token can conflict.

## Mac Mini Setup

If the repo is not already on the Mac mini:

```bash
git clone <your-repo-url>
cd LinkToNotion
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env.local
python main.py
```

If the repo already exists on the Mac mini:

```bash
cd LinkToNotion
git pull
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Mac Launchd

If the Mac mini is your always-on host, use `launchd` so the bot starts automatically after reboot.

Create `~/Library/LaunchAgents/com.stevie.linktonotion.plist` with this content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.stevie.linktonotion</string>

    <key>ProgramArguments</key>
    <array>
      <string>/Users/YOUR_USER/LinkToNotion/.venv/bin/python</string>
      <string>/Users/YOUR_USER/LinkToNotion/main.py</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USER/LinkToNotion</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/YOUR_USER/Library/Logs/LinkToNotion.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USER/Library/Logs/LinkToNotion.err.log</string>
  </dict>
</plist>
```

Replace `YOUR_USER` with your macOS username.

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.stevie.linktonotion.plist
launchctl start com.stevie.linktonotion
```

Check logs:

```bash
tail -f ~/Library/Logs/LinkToNotion.log
tail -f ~/Library/Logs/LinkToNotion.err.log
```

If you update the plist later:

```bash
launchctl unload ~/Library/LaunchAgents/com.stevie.linktonotion.plist
launchctl load ~/Library/LaunchAgents/com.stevie.linktonotion.plist
```

## Security

Do not email or commit `.env.local`.

If secrets were pasted into chat logs or other places you do not fully control, rotate them.

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
│   └── gpt.py              # OpenAI client — structured lesson generation
├── notionapi/
│   └── client.py           # Notion page creation
└── email_notifier/
    └── gmail.py            # Gmail SMTP sender
```
