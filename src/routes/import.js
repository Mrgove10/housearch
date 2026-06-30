'use strict';
const express = require('express');
const { db } = require('../db');
const { scrapeUrl } = require('../scrapers');
const { geocode } = require('../lib/geocode');
const { downloadImages } = require('../lib/images');
const { log } = require('../lib/log');

// Insert a normalized house object + 'added' event. Returns new id.
async function createHouse(d) {
  let lat = d.lat, lng = d.lng;
  // Scraped/geocoded coords are approximate (geo_precise defaults to 0); only a
  // manual edit on the house page or a map click marks a location exact.
  if ((lat == null || lng == null) && d.address) {
    const g = await geocode(d.address);
    if (g) { lat = g.lat; lng = g.lng; }
  }
  const info = db.prepare(
    `INSERT INTO house (title, source_url, source_site, address, lat, lng, price, surface_m2, rooms, bedrooms, year_built, dpe, lot_m2, description, raw_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    d.title || 'Imported house', d.source_url || null, d.source_site || null, d.address || null,
    lat ?? null, lng ?? null, d.price ?? null, d.surface_m2 ?? null, d.rooms ?? null, d.bedrooms ?? null,
    d.year_built ?? null, d.dpe || null, d.lot_m2 ?? null, d.description || null, d.raw_json || JSON.stringify(d)
  );
  const id = info.lastInsertRowid;
  log('[import]', `created house ${id}: "${d.title || 'Imported house'}"`);
  db.prepare("INSERT INTO timeline_event (house_id, type, occurred_at, note) VALUES (?,?,datetime('now'),?)")
    .run(id, 'added', d.source_site ? 'Added from ' + d.source_site : 'Imported');
  if (Array.isArray(d.images) && d.images.length) {
    try { await downloadImages(id, d.images, d.source_url); } catch {}
  }
  return id;
}

module.exports = function () {
  const router = express.Router();

  // Form: scrape and prefill the Add form for review
  router.post('/import', async (req, res) => {
    const url = (req.body.url || '').trim();
    const html = req.body.html || null;
    if (!url && !html) return res.redirect('/add');
    const data = await scrapeUrl(url, html);
    if (data.error) {
      const detail = data.message ? ': ' + data.message : '';
      const hint = data.error === 'fetch_failed'
        ? ' The site likely blocks automated requests (anti-bot) or the URL is unreachable. Open the listing in your browser, copy the page source, and paste it in “Or paste saved HTML” above — or fill the form manually.'
        : ' Enter details manually below.';
      return res.render('add', {
        title: 'Add house', active: 'add', prefill: { source_url: url },
        error: 'Could not scrape this listing (' + data.error + detail + ').' + hint,
      });
    }
    res.render('add', { title: 'Add house', active: 'add', prefill: data, error: null, imported: true });
  });

  // JSON API for Claude skill / programmatic import
  router.post('/api/import', async (req, res) => {
    try {
      // Accept either {url[, html]} to scrape, or a full house object under {house}
      let data;
      if (req.body.house) {
        data = req.body.house;
        data.raw_json = data.raw_json || JSON.stringify(req.body.house);
      } else if (req.body.url || req.body.html) {
        data = await scrapeUrl((req.body.url || '').trim(), req.body.html || null);
        if (data.error) return res.status(422).json({ error: data.error, message: data.message });
      } else {
        return res.status(400).json({ error: 'provide url, html, or house' });
      }
      const id = await createHouse(data);
      res.json({ ok: true, id, url: '/houses/' + id, data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Preview scrape without saving (JSON)
  router.post('/api/scrape', async (req, res) => {
    const data = await scrapeUrl((req.body.url || '').trim(), req.body.html || null);
    res.json(data);
  });

  return router;
};
