'use strict';
const { db } = require('../db');

// Computed score = Σ(template.value × weight × sign) + Σ(custom.points)
function computeScore(houseId) {
  const items = db.prepare('SELECT * FROM score_template_item ORDER BY sort, id').all();
  const respRows = db.prepare('SELECT template_item_id, value FROM score_response WHERE house_id = ?').all(houseId);
  const resp = new Map(respRows.map((r) => [r.template_item_id, r.value]));
  const custom = db.prepare('SELECT * FROM score_custom WHERE house_id = ? ORDER BY id').all(houseId);

  const breakdown = [];
  let total = 0;
  for (const it of items) {
    const v = resp.get(it.id) ? 1 : 0;
    const pts = v * it.weight * it.sign;
    if (v) { total += pts; breakdown.push({ label: it.label, points: pts }); }
  }
  for (const c of custom) {
    total += c.points;
    breakdown.push({ label: c.label, points: c.points, custom: true, id: c.id });
  }
  return { total, breakdown };
}

function scoreClass(n) {
  if (n > 0) return 'good';
  if (n < 0) return 'bad';
  return '';
}
function scoreLabel(n) {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
}

module.exports = { computeScore, scoreClass, scoreLabel };
