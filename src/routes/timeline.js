'use strict';
const express = require('express');
const { db } = require('../db');
const router = express.Router();

const VALID = ['added', 'contacted', 'visit_scheduled', 'visit_done', 'offer', 'counter_offer', 'refused', 'accepted', 'archived', 'note'];

const EVENT_LABELS = {
  added: 'Added', contacted: 'Contacted owner', visit_scheduled: 'Visit scheduled',
  visit_done: 'Visit done', offer: 'Offer made', counter_offer: 'Counter-offer',
  refused: 'Refused', accepted: 'Accepted', archived: 'Archived', note: 'Note', status: 'Status',
};

// Global timeline: every event across all houses, newest first. Visit notes
// (note table rows tied to a visit) are folded in and labelled distinctly.
router.get('/timeline', (req, res) => {
  const events = db.prepare(`
    SELECT e.id, e.type, e.occurred_at, e.note, e.visit_id, e.house_id, h.title AS house_title
    FROM timeline_event e JOIN house h ON h.id = e.house_id
  `).all().map((e) => ({ ...e, label: EVENT_LABELS[e.type] || e.type }));

  const visitNotes = db.prepare(`
    SELECT n.id, n.body AS note, n.created_at AS occurred_at, n.visit_id, n.house_id, h.title AS house_title
    FROM note n JOIN house h ON h.id = n.house_id
    WHERE n.visit_id IS NOT NULL
  `).all().map((n) => ({ ...n, type: 'note', label: 'Note (during visit)' }));

  const all = [...events, ...visitNotes]
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)) || (b.id - a.id));
  res.render('timeline', { title: 'Timeline', active: 'timeline', events: all });
});

// Add timeline event
router.post('/houses/:id/events', (req, res) => {
  const house = db.prepare('SELECT id FROM house WHERE id = ?').get(req.params.id);
  if (!house) return res.status(404).render('error', { title: 'Not found', message: 'House not found', active: 'list' });
  const type = VALID.includes(req.body.type) ? req.body.type : 'note';
  const occurred = (req.body.occurred_at || '').trim() || new Date().toISOString().slice(0, 16).replace('T', ' ');
  db.prepare('INSERT INTO timeline_event (house_id, type, occurred_at, note) VALUES (?,?,?,?)')
    .run(house.id, type, occurred, req.body.note || null);
  res.redirect('/houses/' + house.id + '#timeline');
});

router.post('/events/:id/delete', (req, res) => {
  const ev = db.prepare('SELECT house_id FROM timeline_event WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM timeline_event WHERE id = ?').run(req.params.id);
  res.redirect('/houses/' + (ev ? ev.house_id : ''));
});

// Notes (append-only). Visit notes stay in the note table (shown on the visit page);
// house-level notes become timeline events so they live in the timeline only.
router.post('/houses/:id/notes', (req, res) => {
  const house = db.prepare('SELECT id FROM house WHERE id = ?').get(req.params.id);
  if (!house) return res.status(404).json({ error: 'not found' });
  const body = (req.body.body || '').trim();
  if (body) {
    if (req.body.visit_id) {
      db.prepare('INSERT INTO note (house_id, visit_id, body) VALUES (?,?,?)').run(house.id, req.body.visit_id, body);
      return res.redirect('/visits/' + req.body.visit_id + '#notes');
    }
    db.prepare("INSERT INTO timeline_event (house_id, type, occurred_at, note) VALUES (?,?,datetime('now'),?)").run(house.id, 'note', body);
  }
  res.redirect('/houses/' + house.id + '#timeline');
});

module.exports = router;
