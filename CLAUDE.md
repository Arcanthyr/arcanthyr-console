# CLAUDE.md — Arcanthyr Session File
*Updated: 16 March 2026 · Supersedes all prior versions*
*Full architecture reference → CLAUDE_arch.md (in repo — read when needed, do NOT upload every session)*

---

## SESSION RULES

| Rule | Detail |
|---|---|
| Read this file first | Always |
| Diagnose from actual output | Before recommending any fix |
| PowerShell setup | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` at start of every PS session — required before any wrangler command |
| enrichment_poller | Run inside container only with --loop flag: `docker compose exec -d agent-general python3 /app/src/enrichment_poller.py --loop` · Env vars set in docker-compose.yml — no overrides needed after agent-general restart · `docker exec` won't have env vars set |
| git commits | `git add -A`, `git commit`, `git push origin master` — separately, no `&&` |
| Pre-deploy check | Verify upload list shows only `public/` files — if `.env` or `.git` appear, stop |
| wrangler d1 | Must run from `Arc v 4/` directory · always add `--remote` for live D1 |
| PowerShell limits | No `&&`, no heredoc `<<'EOF'`, no `grep` (use `Select-String`) |
| CC brief pattern | Ask CC to read files and report state BEFORE making changes |
| CC cannot run Python | Windows Store stub blocks it — run Python in PowerShell terminal directly |
| CC vs SSH | CC for local file edits · SSH terminal for VPS runtime commands |
| Context window | Suggest restart proactively when conversation grows long |
| D1 database name | `arcanthyr` (binding: `DB`, ID: `1b8ca95d-b8b3-421d-8c77-20f80432e1a0`) |
| Component quirks | Any known operational limitation, gotcha, or non-standard invocation for any component must be documented in CLAUDE_arch.md under a "Component Notes" section — not just user-facing bugs |

**Tooling:**
- **Claude.ai** — architecture, planning, debugging, writing CLAUDE.md, code review
- **Claude Code (VS Code)** — file edits, terminal commands, git, wrangler deploys
- **PowerShell** — SSH to VPS, scp transfers

---

## SYSTEM STATE — 16 March 2026 (end of session)

| Component | Status |
|---|---|
| Qdrant `general-docs-v2` | 2,645 points (legislation + secondary_source complete) · embed pass complete 17 Mar 2026 |
| Embedding model | `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS Docker) |
| Score threshold | 0.45 (validated) |
| D1 `cases` | 8 rows — 2026 scrape batch (TASSC 1–6, TASFC 1–2) · metadata backfilled |
| D1 `secondary_sources` | 1,137 rows · enriched=1 (enriched_text backfilled from master_corpus parts) · embedded=0 (embed pass running) |
| D1 `legislation` | 5 Acts · embedded=1 · 1,272 sections in Qdrant |
| D1 `case_citations` | 5 rows · 1 case processed |
| D1 `case_legislation_refs` | 5 rows · 1 case processed |
| Worker.js | Deployed (ddfc6d22) |
| enrichment_poller.py | In repo + VPS · category in Qdrant payload |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 + BM25 + /process-document + /ingest-status LIVE |
| xref_agent.py | Built + validated · INSERT OR IGNORE idempotency confirmed |
| Phase 5 | VALIDATED — citation discipline live, hallucination reduced |
| Frontend | Dark Gazette theme · UI overhaul briefs 1–6 ALL DEPLOYED · process-document UI live |
| Console document upload | BUILT — /process-document + /ingest-status in server.py · Worker proxy routes live · ingest.html UI live |
| VPS env vars | OPENAI_API_KEY + WORKER_URL confirmed live in agent-general container |

---

## IMMEDIATE NEXT ACTIONS

1. **Retrieval tuning — tendency evidence and doctrine chunks** — concept search implemented but tendency evidence chunks not surfacing in Phase 5 responses despite being in Qdrant at score 0.66. Raw search returns correct chunks but Claude dismisses them as insufficient. Investigate Phase 5 prompt vs raw chunk content mismatch. Priority watch: Q7 (tendency), Q8 (propensity), Q10 (corroboration), Q12 (hostile witness), Q13 (tendency objection).

2. **Corpus gap — procedural/scripted content** — Q12 (hostile witness steps), Q14 (leading questions) confirmed missing. Blocks 027, 020, 008 stripped during ChatGPT enrichment. Needs separate re-ingest via Procedure Prompt. See CLAUDE_arch.md RAG Workflow.

3. **Retrieval baseline script** — build curl loop script on VPS to run all 15 questions automatically rather than manual console runs. Saves significant time across tuning iterations.

4. **Pre-scraper gate — char-based windowing fix** — replace Worker.js `fullText[8000:28000]` with scored overlapping window pipeline. Model upgrade: `summarizeCase()` to `@cf/qwen/qwen3-30b-a3b-fp8`. See CLAUDE_arch.md Workers AI inventory. Test against 3 flagged cases before opening scraper.

5. **Commit uncommitted files** — server.py changes (filter, concept search, type field), docker-compose.yml env vars, CLAUDE_arch.md updates.

---

## KNOWN ISSUES / WATCH LIST

- **Category fragmentation** — several non-standard category values remain in D1 secondary_sources. Full normalisation pass deferred until post-retrieval testing. See CLAUDE_arch.md.
- **Char-based windowing** — Worker.js case extraction uses fixed char slices. Will miss reasoning in long judgments. Scraper PAUSED until fixed.
- **process-document "both" mode** — prompt_mode="both" currently runs Master Prompt only. Procedure Prompt second pass not yet implemented.
- **python-docx / striprtf** — not yet installed in agent-general container. DOCX and RTF uploads will return a clear error until installed: `docker exec agent-general pip install python-docx striprtf --break-system-packages`

---

## RECENT CHANGES — 16 Mar 2026 (morning)

- Full Hogan on Crime corpus re-ingest: 1,138 chunks → D1 → Qdrant (embed pass complete, 2,404 pts)
- Category normalised: `legal doctrine` → `doctrine` (99 rows updated)
- app.js: null guard added to `performLegalSearch` — safe on all pages
- UI overhaul briefs 1–6 all deployed (Dark Gazette theme, Ingest page, Axiom Relay, legislation search, View fix)
- server.py: `/process-document` and `/ingest-status` routes built and deployed
- Worker.js: `/api/ingest/upload-document` and `/api/ingest/status/:jobId` proxy routes added
- ingest.html + app.js: drag-and-drop document upload UI with progress polling
- CF WAF fixes: base64 encoding for corpus uploads, User-Agent header added to post_chunk_to_worker()
- Citation sanitisation fix in split_chunks_from_markdown()
- VPS: OPENAI_API_KEY + WORKER_URL added to docker-compose.yml and .env
- RAG Workflow document updated to v2 (GPT mini quirks, 3k blocks, automated pipeline, console upload architecture, legislation enrichment removed)

## RECENT CHANGES — 16 Mar 2026 (evening)

- Retrieval validation: 15 questions scored against old and new corpus — hallucination eliminated, corpus gaps identified (Q7, Q9, Q10, Q12, Q13, Q14)
- Discovered enriched_text was NULL across all 1,137 secondary_source rows — vectors were built from empty text
- Wrote and ran backfill_enriched_text.py — parsed master_corpus_part1+2, wrote 1,137 UPDATEs via SQL file, 1,131 rows populated
- Reset embedded=0 across all secondary_sources, deleted stale Qdrant secondary_source vectors (940 points removed)
- Embed pass restarted on VPS via nohup — running overnight

## RECENT CHANGES — 17 Mar 2026

- Embed pass complete: 2,645 points in Qdrant (all secondary_source chunks embedded)
- enrichment_poller: fixed OLLAMA_URL/QDRANT_URL localhost issue — must run inside container
- docker-compose.yml: added OLLAMA_URL and QDRANT_URL to agent-general environment block
- enrichment_poller: confirmed --loop flag exists — correct invocation documented in SESSION RULES
- tmux: used to background embed loop — session name 'embed' (now killed, pass complete)
- server.py: added legislation schedule noise filter (type=legislation AND text<200 chars)
- server.py: added concept-based second-pass search (extract_legal_concepts + second Qdrant query)
- server.py: added type field to chunk payload
- server.py: concept search uses limit=top_k*2, results capped at top_k after re-ranking
- CLAUDE_arch.md: added Component Notes section (enrichment_poller, Workers AI inventory)
- Retrieval testing: 15 baseline questions run — 3 pass, 4 partial, 7 fail (see next actions)
- Workers AI model upgrade planned: summarizeCase() → @cf/qwen/qwen3-30b-a3b-fp8 (deferred)

---

## FUTURE ROADMAP

- **Console document upload — procedure prompt pass** — process_blocks.py currently runs Master Prompt only. Add Procedure Prompt second pass for mixed blocks.
- **Cloudflare Browser Rendering /crawl endpoint** — available on Free plan (Account ID: def9cef091857f82b7e096def3faaa25). Potential use: Tasmanian Supreme Court sentencing remarks, Law Reform Commission reports, Bar Association publications. NOT suitable for AustLII. Implementation: Worker cron → POST to /crawl → poll job ID → fetch Markdown → split → process_blocks.py → upload → embed. Build only after primary corpus validated and scraper running at volume.
- **BM25 improvements** — proper scoring + hybrid ranking with semantic scores.
- **Console status indicator** — show enriched/embedded progress per document after upload.
- **Qwen3 UI toggle** — add third button to model toggle once Qwen validated.
- **Reingest-case route** — delete + reingest pattern to backfill case_name into Qdrant.
- **Nightly cron for xref_agent.py** — after scraper is actively running.
- **Stare decisis layer** — surface treatment history from case_citations.
- **Animated sigil** — swap `sigil.jpg` for `sigil.gif` if rotating GIF produced.
- **Agent work (post-corpus validation)** — contradiction detection, coverage gap analysis, citation network traversal, stale authority detection, query expansion, procedural sequence assembly, bulk enrichment audit.