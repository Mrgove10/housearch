# Plan — Housearch

## Visual reference
`/mockup/` contains static HTML/CSS mockups (`list`, `map`, `house`, `visit`, `add`, `settings`, `login`) demonstrating the target UX: mobile-first with bottom nav + FAB, desktop ≥900px with 220px side nav, 2-col house list, sticky right-aside on house detail, drag-and-drop photo zone, segmented yes/no/? checklist, descending timeline with visits inline, score pill colors. Real implementation should match this look-and-feel — colors, spacing, radii, components — and port the same EJS-friendly markup. Mockups are reference only, not the production code.

## Stack
- Backend: Node + Express, SQLite (better-sqlite3)
- Frontend: server-rendered EJS/Nunjucks + HTMX + minimal vanilla JS, mobile-first CSS
- Map: MapLibre GL JS + free tiles (MapTiler free key or OSM raster fallback)
- Auth: single-user, bcrypt password, express-session cookie
- Hosting: `npm start` on LAN, listen `0.0.0.0:PORT`

## Repo layout
```
/src
  /routes      (auth, houses, photos, timeline, checklist, score, import)
  /scrapers    (seloger.js, leboncoin.js, bienici.js, logicimmo.js, pap.js, jinka.js, generic.js)
  /db          (schema.sql, migrations, queries)
  /views       (ejs templates, partials)
  /public      (css, htmx, maplibre, icons)
  /lib         (geocode.js, score.js, session.js)
/data
  /photos/<houseId>/...
  housearch.sqlite
/skills
  /housearch-import  (Claude skill: paste URL → JSON → POST /api/import)
server.js
```

## SQLite schema (v1)
- `user(id, password_hash)`
- `settings(key, value)` — incl. `map_center_lat`, `map_center_lng`, `map_zoom` (default location for the map view)
- `house(id, title, source_url, source_site, address, lat, lng, price, surface_m2, rooms, bedrooms, year_built, dpe, raw_json, created_at, archived)`
- `house_field(house_id, key, value)` — flex bag for any scraped extra
- `photo(id, house_id, visit_id NULL, path, taken_at, caption)`
- `timeline_event(id, house_id, type, occurred_at, note, visit_id)` — types: added, contacted, visit_scheduled, visit_done, offer, counter_offer, refused, accepted, archived
- `visit(id, house_id, scheduled_at, done_at, location_note, weather, with_whom, summary)` — first-class visit, linked to timeline + photos + checklist_response + notes
- `note(id, house_id, body, created_at)` — visit notes, freeform
- `checklist_template(id, name)` + `checklist_item(id, template_id, label, kind)` (kind=question/check)
- `checklist_response(id, house_id, item_id, value, note)`
- `score_template_item(id, label, weight, sign)` — fixed criteria
- `score_custom(id, house_id, label, points)` — per-house bonus/malus
- `score_response(id, house_id, template_item_id, value)`

Computed score = Σ(template.value × weight × sign) + Σ(custom.points).

## Features (build order)

1. **Scaffold + auth** — Express, session, login page, password set via CLI on first run.
2. **House CRUD** — list, detail, manual create/edit, archive.
3. **Import flow** — `POST /api/import {url}` → dispatch by hostname to scraper → upsert house. Manual paste fallback fills form pre-filled.
4. **Scrapers** — per site adapter returns normalized object + `raw_json`. Order: SeLoger, LeBonCoin, Bien'ici, Logic-Immo, PAP, Jinka. Use `undici` + `cheerio`; fall back to OG meta if selectors break.
5. **Photos** — two upload paths:
   - Phone: `<input type=file accept="image/*" capture multiple>` (camera + library, multi-select)
   - Desktop: drag-and-drop zone on house / visit page, accepts multiple files at once, paste-from-clipboard also supported
   Server: `POST /api/photos` multipart, multi-file in one request. Files stored as-is under `/data/photos/<houseId>[/<visitId>]/`. Browser handles display sizing via CSS + `loading="lazy"`. Client shows per-file progress + thumbnail preview before upload completes.
6. **Timeline** — add events with type + date + note, render vertical timeline **descending (newest on top)**, including future-scheduled events at the very top.
7. **Visit notes** — append-only notes per house.
8. **Checklists** — manage templates in settings; attach template to a visit; fill answers on phone.
9. **Scoring** — template editor + per-house custom items; live computed score badge.
10. **Map** — MapLibre, markers per house, color by score, click → drawer with summary + link to detail.
11. **Claude skill** (`/skills/housearch-import`) — takes a listing URL or pasted HTML, returns normalized JSON, optionally POSTs to local API with token.

## Mobile UX
- Single-column, bottom nav (Map / List / Add / Settings)
- Big tap targets, sticky CTA
- Add-from-clipboard button on home

## Deliverables for v1
- Login, CRUD, import (≥2 sites working), photos, timeline, notes, map, basic score, checklist runtime.

## Open questions
1. Default port? (suggest 8787)
2. Geocoding for addresses with no lat/lng — OK to use Nominatim (OSM) with rate-limit + cache?
3. Backup: nightly copy of sqlite + photos to a configured folder — want it now or later?
