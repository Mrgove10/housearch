'use strict';
const express = require('express');
const { db } = require('../db');
const router = express.Router();

// Ready-to-copy message templates (e.g. to paste when contacting a seller on LBC).
router.get('/messages', (req, res) => {
  const messages = db.prepare('SELECT * FROM message_template ORDER BY sort, id').all();
  res.render('messages', { title: 'Messages', active: 'messages', messages });
});

router.post('/messages', (req, res) => {
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  if (body) {
    const max = db.prepare('SELECT COALESCE(MAX(sort), -1) m FROM message_template').get().m;
    db.prepare('INSERT INTO message_template (title, body, sort) VALUES (?,?,?)').run(title, body, max + 1);
  }
  res.redirect('/messages');
});

router.post('/messages/:id', (req, res) => {
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  if (body) db.prepare('UPDATE message_template SET title = ?, body = ? WHERE id = ?').run(title, body, req.params.id);
  res.redirect('/messages');
});

router.post('/messages/:id/delete', (req, res) => {
  db.prepare('DELETE FROM message_template WHERE id = ?').run(req.params.id);
  res.redirect('/messages');
});

module.exports = router;
