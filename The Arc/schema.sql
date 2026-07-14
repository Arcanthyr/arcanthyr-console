-- ARCANTHYR — D1 Schema
-- Last updated: 5 March 2026
--
-- IMPORTANT: This file reflects the FULL intended schema.
-- For an existing database, use the ALTER TABLE migration scripts
-- at the bottom of this file rather than running CREATE TABLE statements
-- (which will no-op on existing tables due to IF NOT EXISTS).
-- ============================================================

-- ── Misc entries (original table) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entries (
  id         TEXT PRIMARY KEY,
  created_at TEXT,
  text       TEXT,
  tag        TEXT,
  next       TEXT,
  clarify    TEXT,
  draft      TEXT,
  _v         INTEGER,
  deleted    INTEGER
);

-- ── Cases ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
  id                     TEXT PRIMARY KEY,
  citation               TEXT,
  court                  TEXT,
  case_date              TEXT,
  case_name              TEXT,
  url                    TEXT,
  raw_text               TEXT,
  facts                  TEXT,
  issues                 TEXT,
  holding                TEXT,           -- legacy single string
  holdings_extracted     TEXT DEFAULT '[]',  -- JSON array of per-issue holdings
  principles_extracted   TEXT,           -- JSON array of principle objects
  legislation_extracted  TEXT DEFAULT '[]',  -- JSON array of Act/section strings
  authorities_extracted  TEXT DEFAULT '[]',  -- JSON array of authority objects
  processed_date         TEXT,
  summary_quality_score  REAL
);

-- ── Legal principles (cross-case index) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_principles (
  id                   TEXT PRIMARY KEY,
  principle_text       TEXT,
  keywords             TEXT,             -- JSON array
  statute_refs         TEXT,             -- JSON array
  case_citations       TEXT,             -- JSON array
  most_recent_citation TEXT,
  date_added           TEXT
);

-- ── Legislation ───────────────────────────────────────────────────────────────
-- One row per Act. Sections stored separately in legislation_sections.
CREATE TABLE IF NOT EXISTS legislation (
  id               TEXT PRIMARY KEY,    -- e.g. "criminal-code-act-1924-tas"
  title            TEXT,                -- "Criminal Code Act 1924"
  jurisdiction     TEXT,                -- "Tas", "Cth" etc
  year             INTEGER,
  current_as_at    TEXT,                -- date of version uploaded
  summary          TEXT,                -- brief plain-English overview (Llama)
  defined_terms    TEXT,                -- JSON array of {term, definition, section}
  offence_elements TEXT,                -- JSON array of {offence, section, elements, penalty}
  source_url       TEXT,
  raw_text         TEXT,
  processed_date   TEXT
);

-- ── Legislation sections ──────────────────────────────────────────────────────
-- One row per section. Enables direct section lookup from case citations.
CREATE TABLE IF NOT EXISTS legislation_sections (
  id              TEXT PRIMARY KEY,     -- e.g. "criminal-code-act-1924-tas-s389"
  legislation_id  TEXT,                 -- FK → legislation.id
  section_number  TEXT,                 -- "389", "389A", "389(1)(a)" etc
  heading         TEXT,
  text            TEXT,                 -- full section text
  part            TEXT,                 -- Part/Division the section sits in
  FOREIGN KEY (legislation_id) REFERENCES legislation(id)
);

-- ── Secondary sources ─────────────────────────────────────────────────────────
-- Notes, journal articles, commentary, textbooks — anything that isn't a
-- case or legislation. Stored as reference/context material for AI queries.
-- No structured AI extraction on upload — just store, tag, chunk into Qdrant.
CREATE TABLE IF NOT EXISTS secondary_sources (
  id             TEXT PRIMARY KEY,
  title          TEXT,
  source_type    TEXT,                  -- "note", "article", "commentary", "textbook", "other"
  author         TEXT,
  date_published TEXT,
  tags           TEXT,                  -- JSON array of topic tags
  related_cases  TEXT,                  -- JSON array of case citations mentioned
  related_acts   TEXT,                  -- JSON array of Act references mentioned
  raw_text       TEXT,
  chunk_count    INTEGER DEFAULT 0,     -- number of Qdrant chunks stored
  date_added     TEXT
);

-- ── Email contacts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_contacts (
  id         TEXT PRIMARY KEY,
  name       TEXT,
  email      TEXT,
  created_at TEXT
);


-- ============================================================
-- MIGRATION SCRIPTS
-- Run these in D1 Console on an existing database.
-- Safe to run — ALTER TABLE ADD COLUMN is non-destructive.
-- Already applied as of 5 March 2026:
-- ============================================================

-- Session 5 March 2026 — already applied to live DB:
-- ALTER TABLE cases ADD COLUMN holdings_extracted TEXT DEFAULT '[]';
-- ALTER TABLE cases ADD COLUMN legislation_extracted TEXT DEFAULT '[]';
-- ALTER TABLE cases ADD COLUMN authorities_extracted TEXT DEFAULT '[]';

-- Session 5 March 2026 — NEW, run these now if not already done:
-- ALTER TABLE cases ADD COLUMN raw_text TEXT;

-- New tables — run in D1 Console:
-- (paste each CREATE TABLE block above individually)
