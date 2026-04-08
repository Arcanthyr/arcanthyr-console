# CLAUDE.md — Arcanthyr Session File
*Updated: 16 March 2026 · Supersedes all prior versions*
*Full architecture reference → CLAUDE_arch.md (in repo — read when needed, do NOT upload every session)*

---

## SESSION RULES

| Rule | Detail |
|---|---|
| Read this file first | Always |
| Diagnose from actual output | Before recommending any fix |
| PowerShell setup | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` at start of every PS session |
| git commits | `git add -A`, `git commit`, `git push origin master` — separately, no `&&` |
| Pre-deploy check | Verify upload list shows only `public/` files — if `.env` or `.git` appear, stop |
| wrangler d1 | Must run from `Arc v 4/` directory · always add `--remote` for live D1 |
| PowerShell limits | No `&&`, no heredoc `<<'EOF'`, no `grep` (use `Select-String`) |
| CC brief pattern | Ask CC to read files and report state BEFORE making changes |
| CC cannot run Python | Windows Store stub blocks it — run Python in PowerShell terminal directly |
| CC vs SSH | CC for local file edits · SSH terminal for VPS runtime commands |
| Context window | Suggest restart proactively when conversation grows long |

**Tooling:**
- **Claude.ai** — architecture, planning, debugging, writing CLAUDE.md, code review
- **Claude Code (VS Code)** — file edits, terminal commands, git, wrangler deploys
- **PowerShell** — SSH to VPS, scp transfers

---

## SYSTEM STATE — 16 March 2026 (morning)

| Component | Status |
|---|---|
| Qdrant `general-docs-v2` | Embed pass IN PROGRESS · 1,273 pts pre-pass (legislation + cases only) |
| Embedding model | `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS Docker) |
| Score threshold | 0.45 (validated) |
| D1 `cases` | 8 rows — 2026 scrape batch (TASSC 1–6, TASFC 1–2) · metadata backfilled |
| D1 `secondary_sources` | 1,138 rows · enriched=1, embedded=0 · embed pass running |
| D1 `legislation` | 5 Acts · embedded=1 · 1,272 sections in Qdrant |
| D1 `case_citations` | 5 rows · 1 case processed |
| D1 `case_legislation_refs` | 5 rows · 1 case processed |
| Worker.js | Deployed (402aa0e9) |
| enrichment_poller.py | In repo + VPS · category in Qdrant payload |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 + BM25 LIVE |
| xref_agent.py | Built + validated · INSERT OR IGNORE idempotency confirmed |
| Phase 5 | VALIDATED — citation discipline live, hallucination reduced |
| Frontend | Dark Gazette theme deployed · UI overhaul IN PROGRESS (CC briefs written, not deployed) |
| Hogan on Crime re-processing | COMPLETE — 56 blocks, 1,138 chunks in D1, embed pass running |

---

## IMMEDIATE NEXT ACTIONS

1. **Confirm embed pass complete** — check Qdrant point count (expect ~2,374):
   ```bash
   curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count
   ```

2. **Retrieval testing** — run all 15 baseline questions via Arc Console. Priority watch: Q7 (tendency), Q10 (corroboration), Q12 (hostile witness), Q13 (tendency objection). Full question list in CLAUDE_arch.md.

3. **Category normalisation** — after retrieval testing:
   ```sql
   UPDATE secondary_sources SET category = 'doctrine' WHERE category = 'legal doctrine';
   ```

4. **UI overhaul** — paste CC briefs 1–6 in order (all written, in CLAUDE_arch.md). Frontend only, safe anytime.

5. **Commit uncommitted files:**
   - `ingest_corpus.py` — chunking rewrite, dedup pass
   - `reingest_duplicates.py` — new script
   - `Arc v 4/arcanthyr-nexus/server.py` — `/delete-by-type` route
   - `Arc v 4/blocks_3k/` — 56 resplit blocks
   - `Arc v 4/master_corpus_part1.md` / `master_corpus_part2.md`
   - `Arc v 4/process_log.txt`

   Message: `"Complete corpus re-ingest: Hogan on Crime 1138 chunks, delete-by-type route, update ingest_corpus.py, add reingest_duplicates.py"`

6. **Delete `Arc v 4/master_corpus.md`** — only after retrieval testing confirms new corpus working.

---

## RECENT CHANGES THIS SESSION (16 Mar 2026)

- Full Hogan on Crime reprocessing: 56 blocks → 1,138 chunks → D1 ingested (enriched=1)
- `reingest_duplicates.py` written + run — 37 silently-skipped chunks recovered with `[2]`/`[3]`/`[4]` suffixes
- D1 wiped + Qdrant secondary_source vectors wiped via `/delete-by-type` before re-ingest
- `ingest_corpus.py` rewritten: deduplication pass, bracket regex fix, `--dry-run` flag
- `server.py` `/delete-by-type` route added
- Embed pass running on VPS (not yet complete)
- Workers AI citation discipline tightened — approved gap phrase enforced
- CC briefs 1–6 written for UI overhaul (not yet deployed)
