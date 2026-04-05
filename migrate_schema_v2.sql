-- =============================================================
-- Arcanthyr D1 Schema Migration — Pipeline v2
-- Run via: npx wrangler d1 execute arcanthyr --file=migrate_schema_v2.sql
-- Safe to re-run: all statements use ADD COLUMN IF NOT EXISTS equivalent
-- D1 does not support IF NOT EXISTS on ALTER — run once on clean schema
-- =============================================================

-- -------------------------------------------------------------
-- secondary_sources
-- -------------------------------------------------------------
-- raw_text     : original uploaded text before enrichment
-- enriched_text: Claude API output (formatted chunks markdown)
-- enriched     : 0 = not yet enriched, 1 = enrichment complete
-- embedded     : 0 = not yet embedded in Qdrant, 1 = embedded
-- enrichment_error : last error message if enrichment failed, NULL if clean

ALTER TABLE secondary_sources ADD COLUMN raw_text TEXT;
ALTER TABLE secondary_sources ADD COLUMN enriched_text TEXT;
ALTER TABLE secondary_sources ADD COLUMN enriched INTEGER DEFAULT 0;
ALTER TABLE secondary_sources ADD COLUMN embedded INTEGER DEFAULT 0;
ALTER TABLE secondary_sources ADD COLUMN enrichment_error TEXT;

-- -------------------------------------------------------------
-- cases
-- -------------------------------------------------------------
-- Cases store full text at scrape time — no raw_text needed.
-- enriched     : reserved for future enrichment pass if needed
-- embedded     : 0 = not yet embedded, 1 = embedded in Qdrant

ALTER TABLE cases ADD COLUMN enriched INTEGER DEFAULT 0;
ALTER TABLE cases ADD COLUMN embedded INTEGER DEFAULT 0;
ALTER TABLE cases ADD COLUMN enrichment_error TEXT;

-- -------------------------------------------------------------
-- legislation
-- -------------------------------------------------------------
-- Legislation is well-structured at ingest — no enrichment step.
-- embedded only.

ALTER TABLE legislation ADD COLUMN embedded INTEGER DEFAULT 0;

-- -------------------------------------------------------------
-- Backfill existing rows
-- -------------------------------------------------------------
-- secondary_sources: 657 rows already in D1 with text in existing
-- columns. Mark enriched=1 (manually processed), embedded=1 (already
-- in Qdrant via dual-call run). Adjust if Qdrant verification shows
-- incomplete embedding.

UPDATE secondary_sources SET enriched = 1, embedded = 1 WHERE enriched IS NULL OR enriched = 0;

-- cases: clean slate, no rows. No backfill needed.
-- legislation: 5 acts re-ingested and embedded. Mark embedded=1.
UPDATE legislation SET embedded = 1 WHERE embedded IS NULL OR embedded = 0;

-- =============================================================
-- Verification queries — run these after migration to confirm
-- =============================================================
-- SELECT COUNT(*), enriched, embedded FROM secondary_sources GROUP BY enriched, embedded;
-- SELECT COUNT(*), embedded FROM legislation GROUP BY embedded;
-- SELECT COUNT(*), enriched, embedded FROM cases GROUP BY enriched, embedded;
