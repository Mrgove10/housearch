# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Approach
- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.

## Commands
- `npm start` — run server (default `http://localhost:8787`, binds `0.0.0.0` for LAN).
- `npm run dev` — same with `node --watch` (auto-restart on file change).
- No build step, no linter, no test suite. Verify changes by running the server and hitting routes.
- `install.sh` / `update.sh` — install/update helpers (git pull + npm install + restart).

## Runtime facts (verify before assuming otherwise)
- Node built-in `node:sqlite` (`DatabaseSync`). NOT better-sqlite3 — plan.md is stale on this. Requires a Node version with `node:sqlite` (Node 22+).
- No auth. Single-user LAN app; every route is open. plan.md/README mention bcrypt/session login but it is NOT implemented. Do not add auth unless asked.
- Config via env or `.env`: `PORT`, `HOST`, `DB_PATH`, `MAPTILER_KEY` (blank = free OSM raster tiles).
- `data/` (sqlite db + `photos/`) is git-ignored. DB and photo dirs auto-created on boot.

## Architecture
- `server.js` — Express wiring: EJS view engine, request logger (skips `/static`, `/photos`), static mounts, exposes `scoreClass`/`scoreLabel`/`path`/`appOrigin` to all views via `res.locals`, mounts each route module, JSON 404/500 for `/api/*` else EJS `error` view.
- `src/db/index.js` — single shared `db` handle imported by every route (module-level singleton). Runs `schema.sql` (`CREATE TABLE IF NOT EXISTS`), then a manual migration block that `ALTER TABLE`s in new columns (schema.sql alone won't add columns to existing DBs — add BOTH schema.sql and a migration guard when adding a column). Seeds default checklist templates + score criteria on first run. Exports `getSetting`/`setSetting`, `importFromFile` (backup restore via `ATTACH` + per-table copy, keeps the live handle valid so no restart needed).
- `src/routes/*` — one Express router per feature (houses, map, visits, timeline, photos, checklist, score, settings, import). Mounted at `/`. `import.js` and `photos.js` export a factory `function(){...}`; others export the router directly — match the existing export style of the file you edit.
- `src/scrapers/` — `index.js` dispatches by hostname to a per-site adapter (seloger, leboncoin, bienici, logicimmo, pap, jinka), falling back to `generic.js`. Each adapter exports `{ site, match(hostname), parse(url, html) }`. `scrapeUrl` normalizes every result through `normalize()` (fixed field set + `raw_json`), and on adapter throw retries with `generic`. Errors return `{ error, message }` objects, not exceptions.
- `src/lib/` — `score.js` (`computeScore` = Σ(template.value × weight × sign) + Σ(custom.points)), `geocode.js` (French BAN `api-adresse.data.gouv.fr`, free/no-key, cached; accepts raw `lat, lng` too), `images.js` (`downloadImages` fetches scraped image URLs into `data/photos/`), `log.js`.
- `src/views/` — EJS templates + `partials/` (mobile bottom nav, desktop side nav at ≥900px). `src/public/` — `css/styles.css`, `js/app.js`.

## Import flow
- Form `POST /import` (URL or pasted HTML) → scrape → re-render `add` view prefilled for review before save.
- `POST /api/import` — JSON: `{url}` / `{html}` to scrape, or `{house:{...}}` to insert directly. `createHouse()` geocodes address when lat/lng missing (`geo_precise=0`; only a manual edit / map click marks coords exact), inserts house + `added` timeline event, downloads images.
- `POST /api/scrape` — preview scrape, no save.
- `skills/housearch-import/` — Claude skill: listing URL/HTML → normalized JSON → POST `/api/import`.

## Data model notes
- `house` carries scraped fields + `status`, `decline_reason`, contact fields, `description` (added via migration block).
- `timeline_event.type`: added, contacted, visit_scheduled, visit_done, offer, counter_offer, refused, accepted, archived. Timeline renders descending (newest/future first).
- `visit` is first-class, linked to timeline, photos, checklist responses, notes. Photos stored at `data/photos/<houseId>[/<visitId>]/`.
