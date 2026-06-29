'use strict';
const { cheerio, baseFrom, int, num } = require('./util');

module.exports = {
  site: 'SeLoger',
  match: (h) => /seloger\./.test(h),
  async parse(url, html) {
    const $ = cheerio.load(html);
    const base = baseFrom($, html);
    // SeLoger often exposes data in __INITIAL_STATE__ / JSON-LD already handled.
    if (!base.price) base.price = int($('[data-testid="cdp-price"], .Summary__PriceText').first().text());
    if (!base.surface_m2) base.surface_m2 = num($('[data-testid*="surface"]').first().text());
    return { ...base, source_site: 'SeLoger', source_url: url };
  },
};
