'use strict';
const express = require('express');
const { db, getSetting } = require('../db');
const { computeScore } = require('../lib/score');
const router = express.Router();

router.get('/map', (req, res) => {
  res.render('map', {
    title: 'Map', active: 'map',
    center: {
      lat: parseFloat(getSetting('map_center_lat', '47.2184')),
      lng: parseFloat(getSetting('map_center_lng', '-1.5536')),
      zoom: parseFloat(getSetting('map_zoom', '12')),
    },
    maptilerKey: getSetting('maptiler_key', '') || process.env.MAPTILER_KEY || '',
  });
});

router.get('/api/houses.geojson', (req, res) => {
  const houses = db.prepare('SELECT * FROM house WHERE archived = 0 AND lat IS NOT NULL AND lng IS NOT NULL').all();
  const features = houses.map((h) => {
    const sc = computeScore(h.id).total;
    const photo = db.prepare('SELECT path FROM photo WHERE house_id = ? ORDER BY id LIMIT 1').get(h.id);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
      properties: {
        id: h.id, title: h.title, address: h.address, price: h.price,
        surface: h.surface_m2, score: sc,
        thumb: photo ? '/photos/' + photo.path : null,
      },
    };
  });
  res.json({ type: 'FeatureCollection', features });
});

module.exports = router;
