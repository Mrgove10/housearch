'use strict';
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const AdmZip = require('adm-zip');
const multer = require('multer');
const { db, getSetting, setSetting, DATA_DIR, importFromFile } = require('../db');
const router = express.Router();

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 1024 * 1024 * 1024 } });
const dbFile = () => process.env.DB_PATH || path.join(DATA_DIR, 'housearch.sqlite');

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
    flash: req.query.ok === 'imported' ? 'Backup imported.' : req.query.ok ? 'Saved.' : null,
    error: req.query.err === 'nofile' ? 'No file selected.'
      : req.query.err === 'badzip' ? 'Zip has no .sqlite file.'
      : req.query.err ? 'Import failed: ' + req.query.err : null,
  });
});

router.post('/settings/map', (req, res) => {
  if (req.body.maptiler_key != null) setSetting('maptiler_key', req.body.maptiler_key.trim());
  res.redirect('/settings?ok=1#map');
});

// Export: sqlite db + all photos bundled in one zip.
router.get('/settings/export', (req, res) => {
  // Flush the WAL into the main file so the copied .sqlite is complete.
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const zip = new AdmZip();
  zip.addLocalFile(dbFile(), '', 'housearch.sqlite');
  const photosDir = path.join(DATA_DIR, 'photos');
  if (fs.existsSync(photosDir)) zip.addLocalFolder(photosDir, 'photos');
  const buf = zip.toBuffer();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="housearch-${new Date().toISOString().slice(0, 10)}.zip"`
  );
  res.send(buf);
});

// Import: accept the export zip, split it back into the sqlite db + photos.
router.post('/settings/import', upload.single('backup'), (req, res) => {
  if (!req.file) return res.redirect('/settings?err=nofile#data');
  let tmpDb;
  try {
    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries();
    const dbEntry = entries.find((e) => !e.isDirectory && e.entryName.endsWith('.sqlite'));
    if (!dbEntry) return res.redirect('/settings?err=badzip#data');

    // Restore data: write the embedded sqlite to a temp file, copy it into the
    // live db, then clear and re-extract the photos tree.
    tmpDb = path.join(os.tmpdir(), 'housearch-import-' + Date.now() + '.sqlite');
    fs.writeFileSync(tmpDb, dbEntry.getData());
    importFromFile(tmpDb);

    const photosDir = path.join(DATA_DIR, 'photos');
    fs.rmSync(photosDir, { recursive: true, force: true });
    fs.mkdirSync(photosDir, { recursive: true });
    for (const e of entries) {
      if (e.isDirectory) continue;
      const name = e.entryName.replace(/^\/+/, '');
      if (!name.startsWith('photos/')) continue;
      const dest = path.join(DATA_DIR, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, e.getData());
    }
    res.redirect('/settings?ok=imported#data');
  } catch (e) {
    res.redirect('/settings?err=' + encodeURIComponent(e.message) + '#data');
  } finally {
    if (tmpDb) fs.rmSync(tmpDb, { force: true });
    fs.rmSync(req.file.path, { force: true });
  }
});

module.exports = router;
