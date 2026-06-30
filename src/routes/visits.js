'use strict';
const express = require('express');
const { db } = require('../db');
const router = express.Router();

// Calendar of visits, grouped by month (newest month first).
router.get('/calendar', (req, res) => {
  const rows = db.prepare(`
    SELECT v.id, v.scheduled_at, v.done_at, v.with_whom, h.id AS house_id, h.title AS house_title
    FROM visit v JOIN house h ON h.id = v.house_id
    WHERE v.scheduled_at IS NOT NULL AND v.scheduled_at <> ''
    ORDER BY v.scheduled_at ASC
  `).all();
  const months = new Map();
  for (const v of rows) {
    const key = v.scheduled_at.slice(0, 7); // YYYY-MM
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(v);
  }
  const groups = [...months.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, visits]) => ({ key, visits }));
  res.render('calendar', { title: 'Calendar', active: 'calendar', groups });
});

// Create / plan a visit
router.post('/houses/:id/visits', (req, res) => {
  const house = db.prepare('SELECT id FROM house WHERE id = ?').get(req.params.id);
  if (!house) return res.status(404).render('error', { title: 'Not found', message: 'House not found', active: 'list' });
  const scheduled = (req.body.scheduled_at || '').trim() || null;
  const tpl = req.body.template_id || db.prepare('SELECT id FROM checklist_template ORDER BY id LIMIT 1').get()?.id || null;
  const info = db.prepare(
    'INSERT INTO visit (house_id, scheduled_at, template_id, with_whom, location_note) VALUES (?,?,?,?,?)'
  ).run(house.id, scheduled, tpl, req.body.with_whom || null, req.body.location_note || null);
  if (scheduled) {
    db.prepare('INSERT INTO timeline_event (house_id, type, occurred_at, note, visit_id) VALUES (?,?,?,?,?)')
      .run(house.id, 'visit_scheduled', scheduled, req.body.note || null, info.lastInsertRowid);
  }
  res.redirect('/visits/' + info.lastInsertRowid);
});

// Visit runtime page
router.get('/visits/:id', (req, res) => {
  const visit = db.prepare('SELECT * FROM visit WHERE id = ?').get(req.params.id);
  if (!visit) return res.status(404).render('error', { title: 'Not found', message: 'Visit not found', active: 'list' });
  const house = db.prepare('SELECT * FROM house WHERE id = ?').get(visit.house_id);
  const templates = db.prepare('SELECT * FROM checklist_template ORDER BY name').all();
  const items = visit.template_id
    ? db.prepare('SELECT * FROM checklist_item WHERE template_id = ? ORDER BY sort, id').all(visit.template_id)
    : [];
  const respRows = db.prepare('SELECT item_id, value FROM checklist_response WHERE visit_id = ?').all(visit.id);
  const resp = new Map(respRows.map((r) => [r.item_id, r.value]));
  const photos = db.prepare('SELECT * FROM photo WHERE visit_id = ? ORDER BY id DESC').all(visit.id);
  const notes = db.prepare('SELECT * FROM note WHERE visit_id = ? ORDER BY created_at DESC, id DESC').all(visit.id);
  res.render('visit', { title: 'Visit', active: 'list', visit, house, templates, items, resp, photos, notes });
});

// Switch template
router.post('/visits/:id/template', (req, res) => {
  db.prepare('UPDATE visit SET template_id = ? WHERE id = ?').run(req.body.template_id || null, req.params.id);
  res.redirect('/visits/' + req.params.id);
});

// Save summary / draft
router.post('/visits/:id/save', (req, res) => {
  db.prepare('UPDATE visit SET summary = ?, location_note = ?, weather = ?, with_whom = ? WHERE id = ?')
    .run(req.body.summary || null, req.body.location_note || null, req.body.weather || null, req.body.with_whom || null, req.params.id);
  res.redirect('/visits/' + req.params.id);
});

// Finish visit -> mark done + timeline event
router.post('/visits/:id/finish', (req, res) => {
  const visit = db.prepare('SELECT * FROM visit WHERE id = ?').get(req.params.id);
  if (!visit) return res.status(404).json({ error: 'not found' });
  if (req.body.summary != null) db.prepare('UPDATE visit SET summary = ? WHERE id = ?').run(req.body.summary, visit.id);
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  db.prepare('UPDATE visit SET done_at = ? WHERE id = ?').run(now, visit.id);
  // close the scheduled event or create a done event
  const sched = db.prepare("SELECT id FROM timeline_event WHERE visit_id = ? AND type = 'visit_scheduled'").get(visit.id);
  if (sched) {
    db.prepare("UPDATE timeline_event SET type='visit_done', occurred_at=?, note=COALESCE(?,note) WHERE id=?")
      .run(now, req.body.summary || null, sched.id);
  } else {
    db.prepare('INSERT INTO timeline_event (house_id, type, occurred_at, note, visit_id) VALUES (?,?,?,?,?)')
      .run(visit.house_id, 'visit_done', now, req.body.summary || null, visit.id);
  }
  res.redirect('/houses/' + visit.house_id + '#timeline');
});

router.post('/visits/:id/delete', (req, res) => {
  const v = db.prepare('SELECT house_id FROM visit WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM visit WHERE id = ?').run(req.params.id);
  res.redirect('/houses/' + (v ? v.house_id : ''));
});

module.exports = router;
