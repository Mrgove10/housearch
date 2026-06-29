'use strict';
const express = require('express');
const { db } = require('../db');
const router = express.Router();

const VALID = ['added', 'contacted', 'visit_scheduled', 'visit_done', 'offer', 'counter_offer', 'refused', 'accepted', 'archived', 'note'];

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

// Notes (append-only)
router.post('/houses/:id/notes', (req, res) => {
  const house = db.prepare('SELECT id FROM house WHERE id = ?').get(req.params.id);
  if (!house) return res.status(404).json({ error: 'not found' });
  const body = (req.body.body || '').trim();
  if (body) db.prepare('INSERT INTO note (house_id, visit_id, body) VALUES (?,?,?)').run(house.id, req.body.visit_id || null, body);
  res.redirect('/houses/' + house.id + '#notes');
});

module.exports = router;
