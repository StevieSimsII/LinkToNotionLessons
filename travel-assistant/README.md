# Wayfinder Travel Assistant

A local-first prototype for a single-user travel assistant.

## What is included

- Multi-trip dashboard stored in browser local storage
- Trip brief with dates, travelers, home base, budget, and travel-time limit
- Destination explorer with ranked ideas
- Assistant task queue for research and booking work
- Booking and confirmation tracker
- Day-by-day itinerary builder
- Calendar export as `.ics`
- Trip photo upload and timeline

## Run

Open `index.html` in a browser.

No install step is required. The first version is intentionally static so the workflow can be shaped before adding accounts, APIs, or booking automation.

## Next integration targets

- Import confirmations from Expedia, email, or pasted text
- Add Google Calendar sync and notifications
- Add browser/computer-use booking prep with explicit human approval before purchase
- Move persistence from local storage to SQLite/Prisma when the app graduates to a server-backed build
