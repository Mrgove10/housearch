'use strict';
const express = require('express');
const { db } = require('../db');
const router = express.Router();

function upsertResponse(visitId, itemId, value, note) {
  const item = db.prepare('SELECT * FROM checklist_item WHERE id = ?').get(itemId);
  const visit = db.prepare('SELECT house_id FROM visit WHERE id = ?').get(visitId);
  if (!item || !visit) return false;
  const existing = db.prepare('SELECT id FROM checklist_response WHERE visit_id = ? AND item_id = ?').get(visitId, itemId);
  if (existing) {
    db.prepare('UPDATE checklist_response SET value = ?, note = COALESCE(?, note) WHERE id = ?').run(value, note ?? null, existing.id);
  } else {
    db.prepare('INSERT INTO checklist_response (house_id, visit_id, item_id, value, note) VALUES (?,?,?,?,?)')
      .run(visit.house_id, visitId, itemId, value, note ?? null);
  }
  return true;
}

// segmented (yes/no/?) or check value
router.post('/api/visits/:visitId/responses/:itemId', (req, res) => {
  const ok = upsertResponse(req.params.visitId, req.params.itemId, String(req.body.value ?? ''), req.body.note);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- Template management (settings) ----
router.post('/checklist/templates', (req, res) => {
  const name = (req.body.name || '').trim() || 'New template';
  db.prepare('INSERT INTO checklist_template (name) VALUES (?)').run(name);
  res.redirect('/settings#checklist');
});
router.post('/checklist/templates/:id/delete', (req, res) => {
  db.prepare('DELETE FROM checklist_template WHERE id = ?').run(req.params.id);
  res.redirect('/settings#checklist');
});
router.post('/checklist/templates/:id/items', (req, res) => {
  const tpl = db.prepare('SELECT id FROM checklist_template WHERE id = ?').get(req.params.id);
  if (!tpl) return res.redirect('/settings#checklist');
  const sort = db.prepare('SELECT COALESCE(MAX(sort),0)+1 s FROM checklist_item WHERE template_id = ?').get(tpl.id).s;
  db.prepare('INSERT INTO checklist_item (template_id, label, kind, sort) VALUES (?,?,?,?)')
    .run(tpl.id, (req.body.label || '').trim() || 'Item', req.body.kind === 'check' ? 'check' : 'question', sort);
  res.redirect('/settings/checklist/' + tpl.id);
});
router.post('/checklist/items/:id/delete', (req, res) => {
  const it = db.prepare('SELECT template_id FROM checklist_item WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM checklist_item WHERE id = ?').run(req.params.id);
  res.redirect('/settings/checklist/' + (it ? it.template_id : ''));
});

// Template editor page
router.get('/settings/checklist/:id', (req, res) => {
  const tpl = db.prepare('SELECT * FROM checklist_template WHERE id = ?').get(req.params.id);
  if (!tpl) return res.redirect('/settings');
  const items = db.prepare('SELECT * FROM checklist_item WHERE template_id = ? ORDER BY sort, id').all(tpl.id);
  res.render('checklist-edit', { title: 'Edit template', active: 'settings', tpl, items });
});

module.exports = router;
