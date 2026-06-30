'use strict';
const express = require('express');
const { db, getSetting } = require('../db');
const { computeScore } = require('../lib/score');
const { geocode } = require('../lib/geocode');
const { downloadImages } = require('../lib/images');
const router = express.Router();

const EVENT_LABELS = {
  added: 'Added',
  contacted: 'Contacted owner',
  visit_scheduled: 'Visit scheduled',
  visit_done: 'Visit done',
  offer: 'Offer made',
  counter_offer: 'Counter-offer',
  refused: 'Refused',
  accepted: 'Accepted',
  archived: 'Archived',
  note: 'Note',
};

const STATUSES = { idea: 'Idea', contacted: 'Contacted', visited: 'Visited', offered: 'Offered', declined: 'Declined' };
const READONLY_STATUS = 'declined';

function firstPhoto(houseId) {
  const p = db.prepare('SELECT path FROM photo WHERE house_id = ? ORDER BY id LIMIT 1').get(houseId);
  return p ? '/photos/' + p.path : null;
}


// ---- List ----
router.get('/houses', (req, res) => {
  const q = (req.query.q || '').trim();
  const filter = req.query.filter || 'all';
  const archived = filter === 'archived' ? 1 : 0;
  let sql = 'SELECT * FROM house WHERE archived = ?';
  const args = [archived];
  if (q) { sql += ' AND (title LIKE ? OR address LIKE ?)'; args.push('%' + q + '%', '%' + q + '%'); }
  sql += ' ORDER BY created_at DESC';
  let houses = db.prepare(sql).all(...args);

  houses = houses.map((h) => {
    const sc = computeScore(h.id);
    const upcoming = db.prepare(
      "SELECT scheduled_at FROM visit WHERE house_id = ? AND done_at IS NULL AND scheduled_at IS NOT NULL AND scheduled_at >= datetime('now') ORDER BY scheduled_at LIMIT 1"
    ).get(h.id);
    return {
      ...h,
      score: sc.total,
      thumb: firstPhoto(h.id),
      status: STATUSES[h.status] || 'Idea',
      upcoming: upcoming ? upcoming.scheduled_at : null,
    };
  });

  const counts = {
    all: db.prepare('SELECT COUNT(*) c FROM house WHERE archived = 0').get().c,
    visited: houses.filter((h) => db.prepare("SELECT 1 FROM visit WHERE house_id=? AND done_at IS NOT NULL LIMIT 1").get(h.id)).length,
    offered: houses.filter((h) => db.prepare("SELECT 1 FROM timeline_event WHERE house_id=? AND type IN ('offer','counter_offer','accepted') LIMIT 1").get(h.id)).length,
    archived: db.prepare('SELECT COUNT(*) c FROM house WHERE archived = 1').get().c,
  };

  if (filter === 'visited') houses = houses.filter((h) => db.prepare("SELECT 1 FROM visit WHERE house_id=? AND done_at IS NOT NULL LIMIT 1").get(h.id));
  if (filter === 'offered') houses = houses.filter((h) => db.prepare("SELECT 1 FROM timeline_event WHERE house_id=? AND type IN ('offer','counter_offer','accepted') LIMIT 1").get(h.id));

  res.render('list', { title: 'Houses', active: 'list', houses, q, filter, counts });
});

// ---- New / manual add page ----
router.get('/add', (req, res) => {
  res.render('add', { title: 'Add house', active: 'add', prefill: null, error: null });
});

// ---- Create ----
router.post('/houses', async (req, res) => {
  const b = req.body;
  let lat = b.lat ? parseFloat(b.lat) : null;
  let lng = b.lng ? parseFloat(b.lng) : null;
  if ((lat == null || isNaN(lat)) && b.address) {
    const g = await geocode(b.address);
    if (g) { lat = g.lat; lng = g.lng; }
  }
  const info = db.prepare(
    `INSERT INTO house (title, source_url, source_site, address, lat, lng, price, surface_m2, rooms, bedrooms, year_built, dpe, lot_m2, raw_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    b.title || 'Untitled house', b.source_url || null, b.source_site || null, b.address || null,
    lat, lng, b.price || null, b.surface_m2 || null, b.rooms || null, b.bedrooms || null,
    b.year_built || null, b.dpe || null, b.lot_m2 || null, b.raw_json || null
  );
  const id = info.lastInsertRowid;
  db.prepare("INSERT INTO timeline_event (house_id, type, occurred_at, note) VALUES (?,?,datetime('now'),?)")
    .run(id, 'added', b.source_site ? 'Added from ' + b.source_site : 'Added manually');
  // Import listing photos (background — they appear on the detail page as they finish)
  let imgs = [];
  try { imgs = JSON.parse(b.image_urls || '[]'); } catch {}
  if (Array.isArray(imgs) && imgs.length) {
    downloadImages(id, imgs, b.source_url || null).catch(() => {});
  }
  res.redirect('/houses/' + id);
});

// ---- Detail ----
router.get('/houses/:id', (req, res) => {
  const house = db.prepare('SELECT * FROM house WHERE id = ?').get(req.params.id);
  if (!house) return res.status(404).render('error', { title: 'Not found', message: 'House not found', active: 'list' });

  const score = computeScore(house.id);
  const events = db.prepare('SELECT * FROM timeline_event WHERE house_id = ? ORDER BY occurred_at DESC, id DESC').all(house.id);
  // attach photos to visit events
  const eventsRich = events.map((e) => {
    let photos = [];
    if (e.visit_id) photos = db.prepare('SELECT path FROM photo WHERE visit_id = ? ORDER BY id LIMIT 6').all(e.visit_id);
    const counts = e.visit_id
      ? db.prepare('SELECT (SELECT COUNT(*) FROM photo WHERE visit_id=v.id) np, (SELECT COUNT(*) FROM note WHERE visit_id=v.id) nn FROM visit v WHERE v.id=?').get(e.visit_id)
      : null;
    return { ...e, label: EVENT_LABELS[e.type] || e.type, photos, counts };
  });

  const scoreItems = db.prepare('SELECT * FROM score_template_item ORDER BY sort, id').all();
  const scoreResp = new Map(
    db.prepare('SELECT template_item_id, value FROM score_response WHERE house_id = ?').all(house.id)
      .map((r) => [r.template_item_id, r.value])
  );
  const scoreCustom = db.prepare('SELECT * FROM score_custom WHERE house_id = ? ORDER BY id').all(house.id);

  const photos = db.prepare('SELECT * FROM photo WHERE house_id = ? ORDER BY id DESC').all(house.id);
  const notes = db.prepare('SELECT * FROM note WHERE house_id = ? ORDER BY created_at DESC, id DESC').all(house.id);
  const visits = db.prepare('SELECT * FROM visit WHERE house_id = ? ORDER BY COALESCE(done_at, scheduled_at, created_at) DESC').all(house.id);

  res.render('house', {
    title: house.title || 'House', active: 'list', house, score,
    events: eventsRich, scoreItems, scoreResp, scoreCustom, photos, notes, visits,
    eventTypes: EVENT_LABELS, hero: firstPhoto(house.id),
    statuses: STATUSES, readonly: house.status === READONLY_STATUS,
    maptilerKey: getSetting('maptiler_key', '') || process.env.MAPTILER_KEY || '',
  });
});

// ---- Edit page ----
router.get('/houses/:id/edit', (req, res) => {
  const house = db.prepare('SELECT * FROM house WHERE id = ?').get(req.params.id);
  if (!house) return res.status(404).render('error', { title: 'Not found', message: 'House not found', active: 'list' });
  res.render('add', { title: 'Edit house', active: 'list', prefill: house, error: null });
});

// ---- Update ----
router.post('/houses/:id', async (req, res) => {
  const house = db.prepare('SELECT * FROM house WHERE id = ?').get(req.params.id);
  if (!house) return res.status(404).json({ error: 'not found' });
  const b = req.body;
  let lat = b.lat ? parseFloat(b.lat) : house.lat;
  let lng = b.lng ? parseFloat(b.lng) : house.lng;
  if (b.address && b.address !== house.address && !b.lat) {
    const g = await geocode(b.address);
    if (g) { lat = g.lat; lng = g.lng; }
  }
  db.prepare(
    `UPDATE house SET title=?, source_url=?, source_site=?, address=?, lat=?, lng=?, price=?, surface_m2=?, rooms=?, bedrooms=?, year_built=?, dpe=?, lot_m2=? WHERE id=?`
  ).run(
    b.title || house.title, b.source_url || null, b.source_site || house.source_site, b.address || null,
    lat, lng, b.price || null, b.surface_m2 || null, b.rooms || null, b.bedrooms || null,
    b.year_built || null, b.dpe || null, b.lot_m2 || null, house.id
  );
  res.redirect('/houses/' + house.id);
});

// ---- Status ----
router.post('/houses/:id/status', (req, res) => {
  let { status, decline_reason } = req.body;
  if (!STATUSES[status]) status = 'idea';
  const reason = status === 'declined' ? (decline_reason || null) : null;
  db.prepare('UPDATE house SET status=?, decline_reason=? WHERE id=?').run(status, reason, req.params.id);
  res.redirect('/houses/' + req.params.id);
});

// ---- Position (click-to-set on the house mini-map) ----
router.post('/houses/:id/position', (req, res) => {
  const lat = parseFloat(req.body.lat), lng = parseFloat(req.body.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'bad coords' });
  db.prepare('UPDATE house SET lat=?, lng=? WHERE id=?').run(lat, lng, req.params.id);
  res.json({ ok: true, lat, lng });
});

// ---- Archive / unarchive / delete ----
router.post('/houses/:id/archive', (req, res) => {
  db.prepare('UPDATE house SET archived = 1 WHERE id = ?').run(req.params.id);
  db.prepare("INSERT INTO timeline_event (house_id, type, occurred_at) VALUES (?,?,datetime('now'))").run(req.params.id, 'archived');
  res.redirect('/houses');
});
router.post('/houses/:id/unarchive', (req, res) => {
  db.prepare('UPDATE house SET archived = 0 WHERE id = ?').run(req.params.id);
  res.redirect('/houses/' + req.params.id);
});
router.post('/houses/:id/delete', (req, res) => {
  db.prepare('DELETE FROM house WHERE id = ?').run(req.params.id);
  res.redirect('/houses');
});

module.exports = router;
