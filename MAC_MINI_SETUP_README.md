# LinkToNotion Multi-Machine Setup

This document describes the cleanest way to run LinkToNotion on both your Windows machine and a Mac mini.

## Recommended Model

Do not copy the full runtime environment between machines.

Use this split instead:

- Keep the code in GitHub.
- Keep `.env.local` separate on each machine.
- Recreate `.venv` on each machine from `requirements.txt`.
- Run only one active bot instance at a time for the same Telegram bot token.

This works best because:

- `.venv` is machine-specific and should not be copied from Windows to macOS.
- `.env.local` contains secrets and is already excluded from git.
- Git becomes the source of truth for code, while each machine keeps its own runtime state.

## Repo Strategy

Use GitHub as the package you move between machines.

Windows workflow:

- Edit code locally.
- Test changes locally.
- Commit and push to GitHub.

Mac mini workflow:

- Pull the latest code from GitHub.
- Use a local `.env.local` file on the Mac mini.
- Create a fresh virtual environment on the Mac mini.
- Run the bot there as the always-on instance.

## Important Rule

Do not run the same Telegram bot token on both machines at the same time.

This project uses long polling. If both machines are running the same bot concurrently, polling can conflict and behavior becomes unpredictable.

When moving execution from one machine to the other:

1. Stop the bot on the currently active machine.
2. Pull the latest code on the target machine.
3. Start the bot on the target machine.

## Windows Setup

From the repo root:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

## Mac Mini Setup

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

If the repo is not present yet:

```bash
git clone <your-repo-url>
cd LinkToNotion
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Environment Files

Use `.env.local` on both machines.

Recommended approach:

- Keep the same service credentials on both machines if both are allowed to run the same bot.
- Keep `.env.local` out of Git.
- If a machine needs different behavior, only change that machine's `.env.local`.

## Daily Workflow

Recommended development and hosting pattern:

1. Make code changes on Windows.
2. Push changes to GitHub.
3. Pull changes on the Mac mini.
4. Restart the bot on the Mac mini.

## Best Long-Term Host

If the Mac mini is your always-on machine, use it as the permanent runtime host.

That gives you:

- a stable always-on bot process
- a dedicated host for Gmail, Notion, and Telegram access
- less risk of accidentally running duplicate bot instances

## Optional Next Step

For production-like use on the Mac mini, run the bot with `launchd` so it starts automatically after reboot.

## Launchd Setup

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

Load the agent:

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

## Security Note

Your `.env.local` contains live secrets. Do not email that file or commit it to Git.

If secrets were pasted into chat logs or any place you do not fully control, rotate them.