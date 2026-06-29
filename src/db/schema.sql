-- Housearch schema v1
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS house (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL DEFAULT '',
  source_url  TEXT,
  source_site TEXT,
  address     TEXT,
  lat         REAL,
  lng         REAL,
  price       INTEGER,
  surface_m2  REAL,
  rooms       INTEGER,
  bedrooms    INTEGER,
  year_built  INTEGER,
  dpe         TEXT,
  lot_m2      REAL,
  raw_json    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  archived    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS house_field (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id INTEGER NOT NULL REFERENCES house(id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  value    TEXT
);

CREATE TABLE IF NOT EXISTS visit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id      INTEGER NOT NULL REFERENCES house(id) ON DELETE CASCADE,
  scheduled_at  TEXT,
  done_at       TEXT,
  location_note TEXT,
  weather       TEXT,
  with_whom     TEXT,
  summary       TEXT,
  template_id   INTEGER REFERENCES checklist_template(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photo (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id INTEGER NOT NULL REFERENCES house(id) ON DELETE CASCADE,
  visit_id INTEGER REFERENCES visit(id) ON DELETE SET NULL,
  path     TEXT NOT NULL,
  taken_at TEXT,
  caption  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS timeline_event (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id    INTEGER NOT NULL REFERENCES house(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  note        TEXT,
  visit_id    INTEGER REFERENCES visit(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS note (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id   INTEGER NOT NULL REFERENCES house(id) ON DELETE CASCADE,
  visit_id   INTEGER REFERENCES visit(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checklist_template (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_item (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES checklist_template(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'question', -- question (yes/no/?) | check (number/text)
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklist_response (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id INTEGER NOT NULL REFERENCES house(id) ON DELETE CASCADE,
  visit_id INTEGER REFERENCES visit(id) ON DELETE CASCADE,
  item_id  INTEGER NOT NULL REFERENCES checklist_item(id) ON DELETE CASCADE,
  value    TEXT,
  note     TEXT
);

CREATE TABLE IF NOT EXISTS score_template_item (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  label  TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  sign   INTEGER NOT NULL DEFAULT 1, -- +1 bonus, -1 malus
  sort   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS score_custom (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id INTEGER NOT NULL REFERENCES house(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  points   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS score_response (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id         INTEGER NOT NULL REFERENCES house(id) ON DELETE CASCADE,
  template_item_id INTEGER NOT NULL REFERENCES score_template_item(id) ON DELETE CASCADE,
  value            INTEGER NOT NULL DEFAULT 0 -- 0 or 1 (criterion met)
);

CREATE TABLE IF NOT EXISTS geocode_cache (
  query TEXT PRIMARY KEY,
  lat   REAL,
  lng   REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_house_archived ON house(archived);
CREATE INDEX IF NOT EXISTS idx_event_house ON timeline_event(house_id);
CREATE INDEX IF NOT EXISTS idx_photo_house ON photo(house_id);
CREATE INDEX IF NOT EXISTS idx_visit_house ON visit(house_id);
CREATE INDEX IF NOT EXISTS idx_note_house ON note(house_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_score_resp ON score_response(house_id, template_item_id);
