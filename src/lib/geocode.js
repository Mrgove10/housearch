'use strict';
const { db } = require('../db');
const { log } = require('./log');

// Geocoder using the French Base Adresse Nationale (BAN):
//   https://api-adresse.data.gouv.fr/search/?q=...
// Free, no API key, street-level precision, France-tuned. Results are cached
// in SQLite so a given address is only looked up once.
let lastCall = 0;
const MIN_INTERVAL = 120; // be polite (~8 req/s); BAN tolerates much more

async function geocode(query) {
  if (!query || !query.trim()) return null;
  const q = query.trim();

  // Already coordinates? "47.2184, -1.5536"
  const m = q.match(/^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  const cached = db.prepare('SELECT lat, lng FROM geocode_cache WHERE query = ?').get(q);
  if (cached) { log('[geo]', `cache ${cached.lat == null ? 'miss(none)' : 'hit'} "${q}"`); return cached.lat == null ? null : { lat: cached.lat, lng: cached.lng }; }

  const wait = MIN_INTERVAL - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  try {
    const url = 'https://api-adresse.data.gouv.fr/search/?limit=1&q=' + encodeURIComponent(q);
    const res = await fetch(url, { headers: { 'User-Agent': 'Housearch/1.0' }, signal: AbortSignal.timeout(10000) });
    if (res.status >= 400) throw new Error('BAN HTTP ' + res.status);
    const data = await res.json();
    const feat = data && Array.isArray(data.features) && data.features[0];
    if (feat && feat.geometry && Array.isArray(feat.geometry.coordinates)) {
      const [lng, lat] = feat.geometry.coordinates; // BAN/GeoJSON order: [lon, lat]
      db.prepare('INSERT OR REPLACE INTO geocode_cache (query, lat, lng) VALUES (?,?,?)').run(q, lat, lng);
      log('[geo]', `BAN "${q}" → ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      return { lat, lng };
    }
    db.prepare('INSERT OR REPLACE INTO geocode_cache (query, lat, lng) VALUES (?,NULL,NULL)').run(q);
    log('[geo]', `BAN "${q}" → no result`);
    return null;
  } catch (e) {
    log('[geo]', `BAN "${q}" → error: ${e.message}`);
    return null;
  }
}

module.exports = { geocode };
