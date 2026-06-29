'use strict';
const { request } = require('undici');
const fs = require('node:fs');
const path = require('node:path');
const { db, DATA_DIR } = require('../db');
const { log, warn } = require('./log');

const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const EXT = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
  'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif',
};
const MAX = 30;
const MIN_BYTES = 2048;            // skip spacers / icons
const MAX_BYTES = 20 * 1024 * 1024;

// Download remote image URLs into data/photos/<houseId>/ and record photo rows.
async function downloadImages(houseId, urls, referer) {
  if (!Array.isArray(urls) || !urls.length) return [];
  const dir = path.join(PHOTOS_DIR, String(houseId));
  fs.mkdirSync(dir, { recursive: true });
  const ins = db.prepare('INSERT INTO photo (house_id, path, caption) VALUES (?,?,?)');
  const saved = [];
  const list = urls.slice(0, MAX);
  let skipped = 0;
  log('[photos]', `house ${houseId}: downloading ${list.length} image(s)…`);

  for (const url of list) {
    try {
      const res = await request(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
          ...(referer ? { Referer: referer } : {}),
        },
        maxRedirections: 4,
        headersTimeout: 15000,
        bodyTimeout: 20000,
      });
      if (res.statusCode >= 400) { skipped++; warn('[photos]', `  ${res.statusCode} ${url}`); try { await res.body.dump(); } catch {} continue; }
      const ct = (res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!ct.startsWith('image/')) { skipped++; try { await res.body.dump(); } catch {} continue; }
      const buf = Buffer.from(await res.body.arrayBuffer());
      if (buf.length < MIN_BYTES || buf.length > MAX_BYTES) { skipped++; continue; }
      const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + (EXT[ct] || '.jpg');
      fs.writeFileSync(path.join(dir, name), buf);
      const rel = String(houseId) + '/' + name;
      ins.run(houseId, rel, 'Imported');
      saved.push(rel);
    } catch (e) { skipped++; warn('[photos]', `  failed ${url}: ${e.message}`); }
  }
  log('[photos]', `house ${houseId}: saved ${saved.length}, skipped ${skipped}`);
  return saved;
}

module.exports = { downloadImages };
