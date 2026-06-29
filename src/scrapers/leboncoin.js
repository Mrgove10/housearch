'use strict';
const { cheerio, baseFrom, int, num } = require('./util');

module.exports = {
  site: 'LeBonCoin',
  match: (h) => /leboncoin\./.test(h),
  async parse(url, html) {
    const $ = cheerio.load(html);
    const base = baseFrom($, html);
    // LeBonCoin embeds listing in __NEXT_DATA__
    const next = $('#__NEXT_DATA__').contents().text();
    if (next) {
      try {
        const data = JSON.parse(next);
        const ad = findAd(data);
        if (ad) {
          base.title = ad.subject || base.title;
          base.price = int(ad.price?.[0]) || base.price;
          base.description = ad.body || base.description;
          if (ad.location) {
            base.address = [ad.location.city, ad.location.zipcode].filter(Boolean).join(' ') || base.address;
            base.lat = ad.location.lat ?? base.lat;
            base.lng = ad.location.lng ?? base.lng;
          }
          for (const a of ad.attributes || []) {
            if (a.key === 'square') base.surface_m2 = num(a.value);
            if (a.key === 'rooms') base.rooms = int(a.value);
            if (a.key === 'energy_rate') base.dpe = (a.value || '').toUpperCase();
          }
          // Main carousel only — ad.images.urls (full-size listing photos)
          const imgs = ad.images?.urls || ad.images?.urls_large;
          if (Array.isArray(imgs) && imgs.length) base.images = imgs;
        }
      } catch {}
    }
    return { ...base, source_site: 'LeBonCoin', source_url: url };
  },
};

function findAd(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) return null;
  if (obj.subject && obj.price) return obj;
  for (const k of Object.keys(obj)) {
    const r = findAd(obj[k], depth + 1);
    if (r) return r;
  }
  return null;
}
