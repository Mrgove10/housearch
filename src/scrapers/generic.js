'use strict';
const { cheerio, baseFrom } = require('./util');

// Generic scraper: relies on JSON-LD + OpenGraph + text heuristics.
module.exports = {
  site: 'Web',
  async parse(url, html) {
    const $ = cheerio.load(html);
    const base = baseFrom($, html);
    return { ...base, source_url: url };
  },
};
