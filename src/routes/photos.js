'use strict';
const express = require('express');
const multer = require('multer');
const fs = require('node:fs');
const path = require('node:path');
const { db, DATA_DIR } = require('../db');
const router = express.Router();

const PHOTOS_DIR = path.join(DATA_DIR, 'photos');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const houseId = req.params.houseId || req.body.house_id;
    const visitId = req.params.visitId || req.body.visit_id;
    let dir = path.join(PHOTOS_DIR, String(houseId));
    if (visitId) dir = path.join(dir, String(visitId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safe = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 50 },
  fileFilter(req, file, cb) { cb(null, /^image\//.test(file.mimetype)); },
});

function saveRecords(req, houseId, visitId, files) {
  const ins = db.prepare('INSERT INTO photo (house_id, visit_id, path) VALUES (?,?,?)');
  const saved = [];
  for (const f of files) {
    const rel = path.relative(PHOTOS_DIR, f.path).split(path.sep).join('/');
    const info = ins.run(houseId, visitId || null, rel);
    saved.push({ id: info.lastInsertRowid, path: '/photos/' + rel });
  }
  return saved;
}

// House-level upload
router.post('/api/houses/:houseId/photos', upload.array('photos', 50), (req, res) => {
  const house = db.prepare('SELECT id FROM house WHERE id = ?').get(req.params.houseId);
  if (!house) return res.status(404).json({ error: 'house not found' });
  const saved = saveRecords(req, req.params.houseId, null, req.files || []);
  res.json({ ok: true, photos: saved });
});

// Visit-level upload
router.post('/api/visits/:visitId/photos', upload.array('photos', 50), (req, res) => {
  const visit = db.prepare('SELECT id, house_id FROM visit WHERE id = ?').get(req.params.visitId);
  if (!visit) return res.status(404).json({ error: 'visit not found' });
  const saved = saveRecords(req, visit.house_id, visit.id, req.files || []);
  res.json({ ok: true, photos: saved });
});

// Delete a photo
router.post('/api/photos/:id/delete', (req, res) => {
  const p = db.prepare('SELECT * FROM photo WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  try { fs.unlinkSync(path.join(PHOTOS_DIR, p.path)); } catch {}
  db.prepare('DELETE FROM photo WHERE id = ?').run(p.id);
  if (req.get('accept')?.includes('application/json')) return res.json({ ok: true });
  res.redirect('back');
});

module.exports = router;
