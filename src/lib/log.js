'use strict';
// Tiny timestamped console logger. Tags keep lines greppable: [http] [scrape] [import] [photos] [geo]
function ts() { return new Date().toISOString().slice(11, 23); }
function log(tag, ...args) { console.log(ts() + ' ' + tag, ...args); }
function warn(tag, ...args) { console.warn(ts() + ' ' + tag, ...args); }
module.exports = { log, warn };
