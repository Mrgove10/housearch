'use strict';
const { fetchHtml, cheerio, collectImages } = require('./util');
const generic = require('./generic');
const { log, warn } = require('../lib/log');

const adapters = [
  require('./seloger'),
  require('./leboncoin'),
  require('./bienici'),
  require('./logicimmo'),
  require('./pap'),
  require('./jinka'),
];

function pick(hostname) {
  return adapters.find((a) => a.match && a.match(hostname)) || generic;
}

// Scrape a listing URL into a normalized house object.
// If `html` is provided (manual paste / saved file), skip the network fetch.
async function scrapeUrl(url, html) {
  let host = '';
  try { host = new URL(url).hostname; } catch {}
  const adapter = pick(host);
  log('[scrape]', `${adapter.site} ← ${html ? 'pasted HTML' : url}${html ? '' : ' (host ' + host + ')'}`);
  let body = html;
  if (!body) {
    const t = Date.now();
    try {
      body = await fetchHtml(url);
      log('[scrape]', `fetched ${(body.length / 1024).toFixed(0)}KB in ${Date.now() - t}ms`);
    } catch (e) {
      warn('[scrape]', `fetch_failed: ${e.message}`);
      return { error: 'fetch_failed', message: e.message, source_site: adapter.site, source_url: url };
    }
  } else {
    log('[scrape]', `using provided HTML (${(body.length / 1024).toFixed(0)}KB)`);
  }
  let images = [];
  try { images = collectImages(cheerio.load(body), url); } catch {}
  try {
    const data = await adapter.parse(url, body);
    if (!data.source_site) data.source_site = adapter.site;
    if (!data.images || !data.images.length) data.images = images;
    const r = normalize(data);
    const got = ['title', 'price', 'surface_m2', 'rooms', 'bedrooms', 'address', 'dpe'].filter((k) => r[k] != null);
    log('[scrape]', `parsed → fields: ${got.join(', ') || 'none'} · ${r.images.length} images`);
    return r;
  } catch (e) {
    warn('[scrape]', `adapter ${adapter.site} threw (${e.message}); falling back to generic`);
    try {
      const g = await generic.parse(url, body); g.images = images;
      const r = normalize(g);
      log('[scrape]', `generic parsed → ${r.images.length} images`);
      return r;
    } catch (e2) {
      warn('[scrape]', `parse_failed: ${e2.message}`);
      return { error: 'parse_failed', message: e2.message, source_url: url };
    }
  }
}

function normalize(d) {
  return {
    title: d.title ? String(d.title).trim().slice(0, 300) : null,
    address: d.address || null,
    lat: d.lat ?? null,
    lng: d.lng ?? null,
    price: d.price ?? null,
    surface_m2: d.surface_m2 ?? null,
    rooms: d.rooms ?? null,
    bedrooms: d.bedrooms ?? null,
    year_built: d.year_built ?? null,
    dpe: d.dpe || null,
    lot_m2: d.lot_m2 ?? null,
    source_url: d.source_url || null,
    source_site: d.source_site || null,
    image: d.image || null,
    images: Array.isArray(d.images) ? d.images : [],
    description: d.description || null,
    raw_json: JSON.stringify(d),
  };
}

module.exports = { scrapeUrl, adapters };
