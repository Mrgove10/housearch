'use strict';
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const STATUS_HINT = {
  401: 'authentication required',
  403: 'forbidden — anti-bot block',
  404: 'page not found',
  429: 'rate-limited / blocked',
  503: 'service unavailable — anti-bot challenge',
};

async function fetchHtml(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    // network-level failure (DNS, TLS, timeout, connection refused…)
    const cause = e.cause && e.cause.code ? ' (' + e.cause.code + ')' : (e.name === 'TimeoutError' ? ' (timeout)' : '');
    throw new Error('network error' + cause + ': ' + e.message);
  }
  if (res.status >= 400) {
    const hint = STATUS_HINT[res.status] ? ' — ' + STATUS_HINT[res.status] : '';
    throw new Error('HTTP ' + res.status + hint);
  }
  return await res.text();
}

function num(v) {
  if (v == null) return null;
  const m = String(v).replace(/ /g, ' ').match(/-?\d[\d\s.,]*/);
  if (!m) return null;
  let s = m[0].replace(/\s/g, '');
  // french: "389 000" or "389.000" or "120,5"
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function int(v) { const n = num(v); return n == null ? null : Math.round(n); }

// Collect candidate listing-photo URLs (absolute), best sources first.
function collectImages($, baseUrl) {
  const urls = new Set();
  const add = (u) => {
    if (!u) return;
    u = String(u).trim();
    if (!u || /^data:/i.test(u)) return;
    try { u = new URL(u, baseUrl || undefined).href; } catch { return; }
    if (/\.svg(\?|$)/i.test(u)) return;
    if (/sprite|logo|icon|favicon|placeholder|pixel|blank|avatar|loader|spinner/i.test(u)) return;
    urls.add(u);
  };
  // 1) OpenGraph / Twitter
  $('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"]')
    .each((_, e) => add($(e).attr('content')));
  // 2) JSON-LD image fields
  $('script[type="application/ld+json"]').each((_, el) => {
    let data; try { data = JSON.parse($(el).contents().text()); } catch { return; }
    const arr = Array.isArray(data) ? data : (data['@graph'] || [data]);
    for (const node of arr) {
      if (!node || typeof node !== 'object') continue;
      const img = node.image;
      if (!img) continue;
      if (typeof img === 'string') add(img);
      else if (Array.isArray(img)) img.forEach((x) => add(typeof x === 'string' ? x : x && x.url));
      else if (img.url) add(img.url);
    }
  });
  // 3) <img> gallery (src, lazy attrs, srcset largest)
  $('img').each((_, e) => {
    const $e = $(e);
    add($e.attr('src')); add($e.attr('data-src')); add($e.attr('data-lazy-src')); add($e.attr('data-original'));
    const ss = $e.attr('srcset') || $e.attr('data-srcset');
    if (ss) ss.split(',').forEach((s) => add(s.trim().split(/\s+/)[0]));
  });
  return [...urls].slice(0, 40);
}

// Extract from JSON-LD + OpenGraph as a baseline
function baseFrom($, html) {
  const out = {};
  // OG
  out.title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || null;
  const ogImg = $('meta[property="og:image"]').attr('content');
  if (ogImg) out.image = ogImg;
  const ogDesc = $('meta[property="og:description"]').attr('content');
  if (ogDesc) out.description = ogDesc;

  // JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try { data = JSON.parse($(el).contents().text()); } catch { return; }
    const arr = Array.isArray(data) ? data : (data['@graph'] || [data]);
    for (const node of arr) {
      if (!node || typeof node !== 'object') continue;
      const t = node['@type'];
      if (node.name && !out.title) out.title = node.name;
      if (node.offers && (node.offers.price || node.offers.priceSpecification)) {
        out.price = int(node.offers.price || node.offers.priceSpecification?.price);
      }
      if (node.price && !out.price) out.price = int(node.price);
      const addr = node.address;
      if (addr && typeof addr === 'object') {
        out.address = [addr.streetAddress, addr.postalCode, addr.addressLocality].filter(Boolean).join(', ') || out.address;
      } else if (typeof addr === 'string' && !out.address) out.address = addr;
      const geo = node.geo;
      if (geo && geo.latitude) { out.lat = num(geo.latitude); out.lng = num(geo.longitude); }
      if (node.floorSize) out.surface_m2 = num(node.floorSize.value || node.floorSize);
      if (node.numberOfRooms) out.rooms = int(node.numberOfRooms.value || node.numberOfRooms);
      if (node.numberOfBedrooms) out.bedrooms = int(node.numberOfBedrooms);
      if (node.yearBuilt) out.year_built = int(node.yearBuilt);
    }
  });

  // Heuristics from body text if still missing
  const text = $('body').text().replace(/ /g, ' ');
  if (!out.price) { const m = text.match(/(\d[\d\s.]{4,})\s*€/); if (m) out.price = int(m[1]); }
  if (!out.surface_m2) { const m = text.match(/(\d[\d\s.,]*)\s*m²/); if (m) out.surface_m2 = num(m[1]); }
  if (!out.rooms) { const m = text.match(/(\d+)\s*pi[èe]ces?/i); if (m) out.rooms = int(m[1]); }
  if (!out.bedrooms) { const m = text.match(/(\d+)\s*chambres?/i); if (m) out.bedrooms = int(m[1]); }
  if (!out.dpe) { const m = text.match(/DPE\s*[:\-]?\s*([A-G])(?![A-Za-z])/i); if (m) out.dpe = m[1].toUpperCase(); }

  return out;
}

module.exports = { fetchHtml, cheerio, num, int, baseFrom, collectImages };
