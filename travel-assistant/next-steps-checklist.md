# Wayfinder Next Steps Checklist

## 1. Open The Prototype

- Open `http://127.0.0.1:4173/`.
- If it is not running, start it:

```bash
cd /Users/steviecopilot/Stevie_Code/LinkToNotionLessons/travel-assistant
python3 -m http.server 4173
```

## 2. Walk The Core Flow

- Create a new trip.
- Enter dates, adults, budget, home base, and max travel time.
- Review destination ideas.
- Add one idea to the plan.
- Generate an itinerary.
- Add a booking.
- Export the calendar.
- Upload a test photo.

## 3. Decide What Feels Right Or Wrong

- Is the UI clean enough?
- Does the trip brief capture the right constraints?
- Are bookings and itinerary separate in the right way?
- Should the assistant queue feel more like tasks, chat, or an inbox?

## 4. Pick The Next Real Feature

- Confirmation import from pasted Expedia/email text.
- AI-generated destination ideas.
- Real itinerary assistant.
- Calendar sync and reminders.
- Booking browser assistant with human approval.
- Persistent database instead of browser local storage.

## 5. Avoid For Now

- Real payment automation.
- Multi-user auth.
- Full flight/hotel inventory search.
- Complex scaling or backend work before the workflow feels right.

## Useful Files

- `index.html` - app structure
- `styles.css` - visual design
- `app.js` - app behavior and browser storage
- `README.md` - current prototype notes
