---
name: housearch-import
description: Import a French real-estate listing into Housearch. Use when the user pastes a listing URL (SeLoger, LeBonCoin, Bien'ici, Logic-Immo, PAP, Jinka, or any property page) or saved listing HTML and wants it added to their Housearch app. Normalizes the listing to JSON and POSTs it to the local Housearch API.
---

# Housearch import

Turn a property listing (URL or pasted HTML) into a normalized house record and add it to the running Housearch instance.

## Config

Read from the environment (ask the user once if unknown):
- `HOUSEARCH_URL` — base URL of the app, e.g. `http://localhost:8787`

No auth — the local app is open on the LAN.

## Normalized house schema

```json
{
  "title": "string",
  "address": "street, postcode, city",
  "lat": 47.21, "lng": -1.55,
  "price": 389000,
  "surface_m2": 120,
  "rooms": 5, "bedrooms": 3,
  "year_built": 1923,
  "dpe": "D",
  "lot_m2": 340,
  "source_url": "https://...",
  "source_site": "SeLoger"
}
```
All fields optional except a usable `title`. Leave `lat`/`lng` out if unknown — the server geocodes the address via Nominatim.

## Two ways to import

### A. Let the server scrape (preferred when the site isn't JS-walled)
```bash
curl -s -X POST "$HOUSEARCH_URL/api/import" \
  -H "Content-Type: application/json" \
  -d '{"url":"<LISTING_URL>"}'
```

### B. You normalize, then POST the object (best for JS-heavy sites)
When the page is rendered client-side or blocked, fetch/read the listing yourself, extract the fields into the schema above, then:
```bash
curl -s -X POST "$HOUSEARCH_URL/api/import" \
  -H "Content-Type: application/json" \
  -d '{"house": { ...normalized object... }}'
```

You can also send `{"html":"<full page source>"}` to have the server run its own scrapers on HTML you paste.

## Steps
1. Determine `HOUSEARCH_URL`.
2. Try method A with the URL.
3. If the response has `"error"`, extract the listing yourself and use method B with `{"house": ...}`.
4. Report the returned `url` (e.g. `/houses/12`) so the user can open it.

## Preview without saving
`POST /api/scrape {"url":...}` returns the normalized object without inserting — useful to show the user before committing.

See `helper.js` for a tiny Node client used by the examples.
