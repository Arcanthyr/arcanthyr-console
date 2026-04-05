# validate_ingest.ps1 — run after ingest, before backfill
# Must be run from Arc v 4\ directory with ExecutionPolicy bypassed

$ErrorActionPreference = "Stop"

Write-Host "=== POST-INGEST VALIDATION ===" -ForegroundColor Cyan

Write-Host "`n1. Row count (expect 1138):"
npx wrangler d1 execute arcanthyr --remote --command "SELECT COUNT(*) FROM secondary_sources"

Write-Host "`n2. Duplicate IDs (expect 0 rows):"
npx wrangler d1 execute arcanthyr --remote --command "SELECT id, COUNT(*) as cnt FROM secondary_sources GROUP BY id HAVING cnt > 1"

Write-Host "`n3. Null or empty raw_text (expect 0):"
npx wrangler d1 execute arcanthyr --remote --command "SELECT COUNT(*) FROM secondary_sources WHERE raw_text IS NULL OR raw_text = ''"

Write-Host "`n4. Null enriched_text (expect 1138 - run before backfill):"
npx wrangler d1 execute arcanthyr --remote --command "SELECT COUNT(*) FROM secondary_sources WHERE enriched_text IS NULL"

Write-Host "`n5. Category distribution:"
npx wrangler d1 execute arcanthyr --remote --command "SELECT category, COUNT(*) as cnt FROM secondary_sources GROUP BY category ORDER BY cnt DESC"

Write-Host "`n6. Short raw_text chunks (under 100 chars - expect ~4):"
npx wrangler d1 execute arcanthyr --remote --command "SELECT id, LENGTH(raw_text) as len FROM secondary_sources WHERE LENGTH(raw_text) < 100 ORDER BY len"

Write-Host "`n=== DONE ===" -ForegroundColor Cyan
