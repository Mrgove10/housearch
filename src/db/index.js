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
  if (!cols.includes('geo_precise')) db.exec('ALTER TABLE house ADD COLUMN geo_precise INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('contact_name')) db.exec('ALTER TABLE house ADD COLUMN contact_name TEXT');
  if (!cols.includes('contact_phone')) db.exec('ALTER TABLE house ADD COLUMN contact_phone TEXT');
  if (!cols.includes('contact_email')) db.exec('ALTER TABLE house ADD COLUMN contact_email TEXT');
  if (!cols.includes('description')) db.exec('ALTER TABLE house ADD COLUMN description TEXT');
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

// Replace all data in the live db with the contents of another sqlite file.
// Done via ATTACH + per-table copy so the open `db` handle (captured by every
// route module) stays valid -- no process restart needed. Only columns common
// to both schemas are copied, so older/newer backups still import.
function importFromFile(srcPath) {
  const esc = srcPath.replace(/'/g, "''");
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec(`ATTACH DATABASE '${esc}' AS imp`);
  try {
    const tables = db
      .prepare("SELECT name FROM imp.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name);
    db.exec('BEGIN');
    try {
      for (const t of tables) {
        const inMain = db.prepare("SELECT 1 FROM main.sqlite_master WHERE type='table' AND name=?").get(t);
        if (!inMain) continue;
        const mainCols = db.prepare(`PRAGMA main.table_info("${t}")`).all().map((c) => c.name);
        const impCols = db.prepare(`PRAGMA imp.table_info("${t}")`).all().map((c) => c.name);
        const cols = mainCols.filter((c) => impCols.includes(c)).map((c) => `"${c}"`).join(',');
        if (!cols) continue;
        db.exec(`DELETE FROM main."${t}"`);
        db.exec(`INSERT INTO main."${t}" (${cols}) SELECT ${cols} FROM imp."${t}"`);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    db.exec('DETACH DATABASE imp');
    db.exec('PRAGMA foreign_keys=ON');
  }
}

module.exports = { db, getSetting, setSetting, DATA_DIR, importFromFile };
