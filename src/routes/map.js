'use strict';
const express = require('express');
const { db, getSetting } = require('../db');
const { computeScore } = require('../lib/score');
const router = express.Router();

router.get('/map', (req, res) => {
  res.render('map', {
    title: 'Map', active: 'map',
    // Fallback view (only used when there are no houses to fit). The map otherwise
    // auto-fits to all markers.
    center: { lat: 46.6, lng: 2.4, zoom: 5 },
    maptilerKey: getSetting('maptiler_key', '') || process.env.MAPTILER_KEY || '',
  });
});

router.get('/api/houses.geojson', (req, res) => {
  const houses = db.prepare('SELECT * FROM house WHERE lat IS NOT NULL AND lng IS NOT NULL').all();
  const features = houses.map((h) => {
    const muted = h.archived === 1 || h.status === 'declined';
    const sc = muted ? null : computeScore(h.id).total;
    const photo = db.prepare('SELECT path FROM photo WHERE house_id = ? ORDER BY id LIMIT 1').get(h.id);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
      properties: {
        id: h.id, title: h.title, address: h.address, price: h.price,
        surface: h.surface_m2, score: sc, muted, precise: h.geo_precise === 1,
        cat: h.archived ? 'archived' : h.status,
        thumb: photo ? '/photos/' + photo.path : null,
      },
    };
  });
  res.json({ type: 'FeatureCollection', features });
});

module.exports = router;
