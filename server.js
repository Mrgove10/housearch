'use strict';
const path = require('node:path');
const express = require('express');

const { DATA_DIR } = require('./src/db');
const { log } = require('./src/lib/log');

const app = express();
const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || '0.0.0.0';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.set('trust proxy', 1);

// Request logger: METHOD /path -> status (ms). Skips static asset noise.
app.use((req, res, next) => {
  if (req.path.startsWith('/static/') || req.path.startsWith('/photos/')) return next();
  const t = Date.now();
  res.on('finish', () => {
    log('[http]', `${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - t}ms)`);
  });
  next();
});

app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.json({ limit: '15mb' }));

// Static
app.use('/static', express.static(path.join(__dirname, 'src', 'public')));
app.use('/photos', express.static(path.join(DATA_DIR, 'photos')));

// expose helpers to all views
const { scoreClass, scoreLabel } = require('./src/lib/score');
app.use((req, res, next) => {
  res.locals.scoreClass = scoreClass;
  res.locals.scoreLabel = scoreLabel;
  res.locals.path = req.path;
  res.locals.appOrigin = req.protocol + '://' + req.get('host');
  next();
});

// Routes (no auth — single-user local app)
app.use('/', require('./src/routes/import')());
app.use('/', require('./src/routes/houses'));
app.use('/', require('./src/routes/map'));
app.use('/', require('./src/routes/visits'));
app.use('/', require('./src/routes/timeline'));
app.use('/', require('./src/routes/photos'));
app.use('/', require('./src/routes/checklist'));
app.use('/', require('./src/routes/score'));
app.use('/', require('./src/routes/messages'));
app.use('/', require('./src/routes/settings'));

// Root -> list
app.get('/', (req, res) => res.redirect('/houses'));

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
  res.status(404).render('error', { title: 'Not found', message: 'Page not found', active: '' });
});

// error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: err.message });
  res.status(500).render('error', { title: 'Error', message: err.message, active: '' });
});

app.listen(PORT, HOST, () => {
  console.log(`\n  Housearch running → http://localhost:${PORT}  (LAN: http://<your-ip>:${PORT})\n`);
});
