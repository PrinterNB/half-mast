# half-mast

A simple static web UI for half-mast notices.

## What it shows

- Nationwide half-mast notice at the top of the main page
- Clean state notice cards with state badges and links to a shared state detail page
- Reason and duration for each notice
- Clean dark mode styling
- Nationwide notice is fetched automatically from the White House proclamations pages when deployed on Wrangler/Workers
- State notices are loaded from `notices.json`
- State routes work for any U.S. state through the shared state page

## Update future notices

Edit `notices.json` for state entries:

- `states` controls the homepage state cards and the shared state detail page
- Add or remove state entries in that file only; the UI resolves the matching state automatically

The nationwide banner updates itself from the live White House proclamation pages. If the live fetch is unavailable, the app falls back to the `nationwide` value in `notices.json`.

## Open locally

Because the UI loads JSON with `fetch`, run a local static server:

```bash
cd .
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.