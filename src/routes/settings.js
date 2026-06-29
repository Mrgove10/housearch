'use strict';
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { db, getSetting, setSetting, DATA_DIR } = require('../db');
const router = express.Router();

router.get('/settings', (req, res) => {
  const templates = db.prepare('SELECT t.*, (SELECT COUNT(*) FROM checklist_item WHERE template_id=t.id) n FROM checklist_template t ORDER BY t.name').all();
  const scoreItems = db.prepare('SELECT * FROM score_template_item ORDER BY sort, id').all();
  const stats = {
    houses: db.prepare('SELECT COUNT(*) c FROM house WHERE archived=0').get().c,
    archived: db.prepare('SELECT COUNT(*) c FROM house WHERE archived=1').get().c,
    photos: db.prepare('SELECT COUNT(*) c FROM photo').get().c,
  };
  res.render('settings', {
    title: 'Settings', active: 'settings', templates, scoreItems, stats,
    maptilerKey: getSetting('maptiler_key', ''),
    flash: req.query.ok ? 'Saved.' : null,
  });
});

router.post('/settings/map', (req, res) => {
  if (req.body.maptiler_key != null) setSetting('maptiler_key', req.body.maptiler_key.trim());
  res.redirect('/settings?ok=1#map');
});

// Export: download the sqlite db file
router.get('/settings/export', (req, res) => {
  const dbPath = process.env.DB_PATH || path.join(DATA_DIR, 'housearch.sqlite');
  res.download(dbPath, 'housearch-' + new Date().toISOString().slice(0, 10) + '.sqlite');
});

module.exports = router;
