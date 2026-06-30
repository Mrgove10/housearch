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

// Migrate existing DBs (CREATE TABLE IF NOT EXISTS won't add new columns).
{
  const cols = db.prepare('PRAGMA table_info(house)').all().map((c) => c.name);
  if (!cols.includes('status')) db.exec("ALTER TABLE house ADD COLUMN status TEXT NOT NULL DEFAULT 'idea'");
  if (!cols.includes('decline_reason')) db.exec('ALTER TABLE house ADD COLUMN decline_reason TEXT');
}

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// Create a checklist template with items if no template of that name exists yet.
function ensureTemplate(name, items) {
  const existing = db.prepare('SELECT id FROM checklist_template WHERE name = ?').get(name);
  if (existing) return;
  const tid = db.prepare('INSERT INTO checklist_template (name) VALUES (?)').run(name).lastInsertRowid;
  const ins = db.prepare('INSERT INTO checklist_item (template_id, label, kind, sort) VALUES (?,?,?,?)');
  items.forEach(([l, k], i) => ins.run(tid, l, k, i));
}

// Defaults
function seedDefaults() {
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
  // Ensure the French house-inspection template exists (added by name, so it
  // appears on existing installs too without duplicating).
  ensureTemplate('Inspection maison', [
    ['Le bruit', 'question'],
    ["L'orientation", 'check'],
    ['Les fissures', 'question'],
    ['La toiture', 'question'],
    ["L'humidité", 'question'],
    ['Électricité', 'question'],
    ['DPE', 'check'],
    ['Ventilation', 'question'],
    ['Charpente', 'question'],
    ["L'isolation", 'question'],
  ]);

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
