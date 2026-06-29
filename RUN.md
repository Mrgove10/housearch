# Running Housearch

Self-hosted house-hunting tracker. Node + Express + `node:sqlite` (no native build needed) + EJS + MapLibre. No login — single-user local app.

## Quick start

```bash
npm install
npm start                     # http://localhost:8787  (LAN: http://<your-ip>:8787)
```

First launch creates `data/housearch.sqlite` and seeds a default checklist template and score
criteria. Open the URL and you're in — no password.

### Config (optional, via env or `.env`)
| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | 8787 | listen port |
| `HOST` | 0.0.0.0 | bind address (LAN access) |
| `MAPTILER_KEY` | _none_ | nicer vector map tiles; blank = free OSM raster |
| `DB_PATH` | `data/housearch.sqlite` | database location |

## What's where
- `server.js` — app wiring, static serving (`/static`, `/photos`)
- `src/db/` — `schema.sql`, init + seed (`index.js`)
- `src/lib/` — `score.js` (computed score), `geocode.js` (BAN + cache)
- `src/routes/` — houses, map, visits, timeline, photos, checklist, score, settings, import
- `src/scrapers/` — `index.js` dispatcher + per-site adapters (SeLoger, LeBonCoin, Bien'ici,
  Logic-Immo, PAP, Jinka) + `generic.js`. All fall back to JSON-LD / OpenGraph / text heuristics.
- `src/views/` — EJS templates + partials (mobile bottom nav, desktop side nav at ≥900px)
- `src/public/` — `css/styles.css` (ported from `/mockup`), `js/app.js`
- `skills/housearch-import/` — Claude skill: paste a URL → normalized JSON → POST `/api/import`
- `data/` — sqlite db + `photos/<houseId>[/<visitId>]/` (git-ignored)

## Import API
```bash
# server scrapes the URL itself
curl -X POST http://localhost:8787/api/import \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.seloger.com/annonces/..."}'

# or send a normalized object (for JS-walled sites)
curl -X POST http://localhost:8787/api/import \
  -H "Content-Type: application/json" \
  -d '{"house":{"title":"Maison 5P","address":"Nantes","price":389000}}'

# preview without saving
curl -X POST http://localhost:8787/api/scrape \
  -H "Content-Type: application/json" -d '{"url":"..."}'
```
In the UI, **Add** → paste a URL → the form is pre-filled for review before you save.

## Backup
Settings → **Export backup** downloads the live `.sqlite`. Photos live under `data/photos/`
— copy that folder too for a full backup.

## Notes
- No auth. Keep it on a trusted LAN; don't expose the port to the internet.
- Scrapers are best-effort: French portals are JS-heavy / bot-walled. When direct scraping
  fails, use the manual form or the Claude skill (method B) which extracts fields for you.
- Geocoding uses the French Base Adresse Nationale (BAN, `api-adresse.data.gouv.fr` — free, no
  key, street-level, cached). Addresses without coordinates are geocoded on save; you can also
  type `lat, lng` directly in any address field, or paste `lat`/`lng` in the Add form.
