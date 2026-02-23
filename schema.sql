CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  created_at TEXT,
  text TEXT,
  tag TEXT,
  next TEXT,
  clarify TEXT,
  draft TEXT,
  _v INTEGER,
  deleted INTEGER
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  citation TEXT,
  court TEXT,
  case_date TEXT,
  case_name TEXT,
  url TEXT,
  facts TEXT,
  issues TEXT,
  holding TEXT,
  principles_extracted TEXT,
  processed_date TEXT,
  summary_quality_score REAL
);

CREATE TABLE IF NOT EXISTS legal_principles (
  id TEXT PRIMARY KEY,
  principle_text TEXT,
  keywords TEXT,
  statute_refs TEXT,
  case_citations TEXT,
  most_recent_citation TEXT,
  date_added TEXT
);

CREATE TABLE IF NOT EXISTS email_contacts (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  created_at TEXT
);