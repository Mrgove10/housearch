'use strict';
const { cheerio, baseFrom, int, num } = require('./util');

module.exports = {
  site: 'PAP',
  match: (h) => /pap\.fr/.test(h),
  async parse(url, html) {
    const $ = cheerio.load(html);
    const base = baseFrom($, html);
    if (!base.price) base.price = int($('.item-price').first().text());
    if (!base.surface_m2) base.surface_m2 = num($('.item-summary li:contains("m²")').first().text());
    return { ...base, source_site: 'PAP', source_url: url };
  },
};
