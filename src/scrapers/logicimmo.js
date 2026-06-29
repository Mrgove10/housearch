'use strict';
const { cheerio, baseFrom } = require('./util');

module.exports = {
  site: 'Logic-Immo',
  match: (h) => /logic-immo\./.test(h),
  async parse(url, html) {
    const $ = cheerio.load(html);
    const base = baseFrom($, html);
    return { ...base, source_site: 'Logic-Immo', source_url: url };
  },
};
