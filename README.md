# half-mast

A simple static web UI for half-mast notices.

## What it shows

- Nationwide half-mast notice at the top of the main page
- Clean state notice cards with state-shape icons and links to separate state pages
- Reason and duration for each notice
- Clean dark mode styling
- Notices loaded from `notices.json` so updates flow to all pages automatically

## Update future notices

Edit `/home/runner/work/half-mast/half-mast/notices.json`:

- `nationwide` controls the top notice on the homepage
- `states` controls the homepage state cards and each state detail page

## Open locally

Because the UI loads JSON with `fetch`, run a local static server:

```bash
cd /home/runner/work/half-mast/half-mast
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.