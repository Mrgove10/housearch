#!/usr/bin/env node
'use strict';
// Tiny Housearch import client.
// Usage:
//   node helper.js scrape <url>          # preview normalized JSON (no save)
//   node helper.js import <url>          # server scrapes + saves
//   node helper.js import-json '<json>'  # POST a normalized house object
// Env: HOUSEARCH_URL (default http://localhost:8787)

const BASE = process.env.HOUSEARCH_URL || 'http://localhost:8787';

async function post(pathname, body) {
  const res = await fetch(BASE + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  let out;
  if (cmd === 'scrape') out = await post('/api/scrape', { url: arg });
  else if (cmd === 'import') out = await post('/api/import', { url: arg });
  else if (cmd === 'import-json') out = await post('/api/import', { house: JSON.parse(arg) });
  else { console.error('cmd: scrape|import|import-json'); process.exit(1); }
  console.log(JSON.stringify(out.json, null, 2));
  process.exit(out.status < 300 ? 0 : 1);
})();
