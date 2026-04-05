-- migrate_schema_v2_safe.sql
-- Skips raw_text (already exists). Adds remaining columns only.

ALTER TABLE secondary_sources ADD COLUMN enriched_text TEXT;
ALTER TABLE secondary_sources ADD COLUMN enriched INTEGER DEFAULT 0;
ALTER TABLE secondary_sources ADD COLUMN embedded INTEGER DEFAULT 0;
ALTER TABLE secondary_sources ADD COLUMN enrichment_error TEXT;

ALTER TABLE cases ADD COLUMN enriched INTEGER DEFAULT 0;
ALTER TABLE cases ADD COLUMN embedded INTEGER DEFAULT 0;
ALTER TABLE cases ADD COLUMN enrichment_error TEXT;

ALTER TABLE legislation ADD COLUMN embedded INTEGER DEFAULT 0;

UPDATE secondary_sources SET enriched = 1, embedded = 1 WHERE enriched = 0 OR enriched IS NULL;
UPDATE legislation SET embedded = 1 WHERE embedded = 0 OR embedded IS NULL;
