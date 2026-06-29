'use strict';
const { cheerio, baseFrom } = require('./util');

module.exports = {
  site: "Bien'ici",
  match: (h) => /bienici\./.test(h),
  async parse(url, html) {
    const $ = cheerio.load(html);
    const base = baseFrom($, html);
    return { ...base, source_site: "Bien'ici", source_url: url };
  },
};
