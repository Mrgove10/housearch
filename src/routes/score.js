'use strict';
const express = require('express');
const { db } = require('../db');
const { computeScore } = require('../lib/score');
const router = express.Router();

// Toggle a template criterion for a house (live)
router.post('/api/houses/:id/score/:itemId', (req, res) => {
  const house = db.prepare('SELECT id FROM house WHERE id = ?').get(req.params.id);
  const item = db.prepare('SELECT id FROM score_template_item WHERE id = ?').get(req.params.itemId);
  if (!house || !item) return res.status(404).json({ error: 'not found' });
  const value = req.body.value ? 1 : 0;
  db.prepare(
    `INSERT INTO score_response (house_id, template_item_id, value) VALUES (?,?,?)
     ON CONFLICT(house_id, template_item_id) DO UPDATE SET value = excluded.value`
  ).run(house.id, item.id, value);
  res.json(computeScore(house.id));
});

// Custom per-house bonus/malus
router.post('/houses/:id/score/custom', (req, res) => {
  const house = db.prepare('SELECT id FROM house WHERE id = ?').get(req.params.id);
  if (!house) return res.status(404).json({ error: 'not found' });
  const label = (req.body.label || '').trim();
  const points = parseInt(req.body.points, 10) || 0;
  if (label) db.prepare('INSERT INTO score_custom (house_id, label, points) VALUES (?,?,?)').run(house.id, label, points);
  res.redirect('/houses/' + house.id + '#score');
});
router.post('/score/custom/:id/delete', (req, res) => {
  const c = db.prepare('SELECT house_id FROM score_custom WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM score_custom WHERE id = ?').run(req.params.id);
  res.redirect('/houses/' + (c ? c.house_id : '') + '#score');
});

// ---- Score template criteria management (settings) ----
router.post('/score/template', (req, res) => {
  const label = (req.body.label || '').trim();
  const weight = Math.abs(parseInt(req.body.weight, 10) || 1);
  const sign = req.body.sign === '-1' ? -1 : 1;
  if (label) {
    const sort = db.prepare('SELECT COALESCE(MAX(sort),0)+1 s FROM score_template_item').get().s;
    db.prepare('INSERT INTO score_template_item (label, weight, sign, sort) VALUES (?,?,?,?)').run(label, weight, sign, sort);
  }
  res.redirect('/settings#score');
});
router.post('/score/template/:id/delete', (req, res) => {
  db.prepare('DELETE FROM score_template_item WHERE id = ?').run(req.params.id);
  res.redirect('/settings#score');
});

module.exports = router;
