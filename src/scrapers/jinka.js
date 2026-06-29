'use strict';
const { cheerio, baseFrom } = require('./util');

module.exports = {
  site: 'Jinka',
  match: (h) => /jinka\./.test(h),
  async parse(url, html) {
    const $ = cheerio.load(html);
    const base = baseFrom($, html);
    return { ...base, source_site: 'Jinka', source_url: url };
  },
};
