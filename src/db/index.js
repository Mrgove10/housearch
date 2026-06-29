'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'housearch.sqlite');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'photos'), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// Defaults
function seedDefaults() {
  if (getSetting('map_center_lat') == null) setSetting('map_center_lat', '47.2184');
  if (getSetting('map_center_lng') == null) setSetting('map_center_lng', '-1.5536');
  if (getSetting('map_zoom') == null) setSetting('map_zoom', '12');

  // Seed a starter checklist template + score criteria once
  const haveTpl = db.prepare('SELECT COUNT(*) c FROM checklist_template').get().c;
  if (!haveTpl) {
    const r = db.prepare('INSERT INTO checklist_template (name) VALUES (?)').run('Default visit');
    const tid = r.lastInsertRowid;
    const items = [
      ['Cellar humidity OK?', 'question'],
      ['Roof < 20 yrs?', 'question'],
      ['Boiler age', 'check'],
      ['Neighbors quiet?', 'question'],
      ['Schools nearby?', 'question'],
    ];
    const ins = db.prepare('INSERT INTO checklist_item (template_id, label, kind, sort) VALUES (?,?,?,?)');
    items.forEach(([l, k], i) => ins.run(tid, l, k, i));
  }
  const haveScore = db.prepare('SELECT COUNT(*) c FROM score_template_item').get().c;
  if (!haveScore) {
    const ins = db.prepare('INSERT INTO score_template_item (label, weight, sign, sort) VALUES (?,?,?,?)');
    [
      ['Quiet street', 3, 1],
      ['Close to school', 4, 1],
      ['South-facing garden', 2, 1],
      ['Old electrical wiring', 2, -1],
    ].forEach(([l, w, s], i) => ins.run(l, w, s, i));
  }
}
seedDefaults();

module.exports = { db, getSetting, setSetting, DATA_DIR };
