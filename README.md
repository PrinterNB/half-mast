# half-mast

A simple static web UI for half-mast notices.

Live version: https://half-mast.parkerbrown.photos

## What it shows

- Nationwide half-mast notice at the top of the main page
- Clean state notice cards with state badges and links to a shared state detail page
- Reason and duration for each notice
- Clean dark mode styling
- Nationwide notice is fetched automatically from the White House proclamations pages when deployed on Wrangler/Workers
- State notices are discovered automatically from official state governor sites
- State routes work for any U.S. state through the shared state page
- Legacy URLs like `states/washington.html` are routed to the shared state page automatically

## Update future notices

The live worker bundle is now the source of truth for both nationwide and state notices.
For states, it discovers the governor's official site from the National Governors Association and scans the official site for current half-staff notices.
If the live fetch is unavailable, the app falls back to `notices.json`.

That file is now only a fallback data source, so you should not need to edit it for normal updates.

## Open locally

Because the UI loads JSON with `fetch`, run a local static server:

```bash
cd .
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.
