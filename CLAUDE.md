# CLAUDE.md — Arcanthyr Session File
*Updated: 17 March 2026 (end of session) · Supersedes all prior versions*
*Full architecture reference → CLAUDE_arch.md (in repo — read when needed, do NOT upload every session)*

---

## SESSION RULES

| Rule | Detail |
|---|---|
| Read this file first | Always |
| Diagnose from actual output | Before recommending any fix |
| PowerShell setup | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` at start of every PS session — required before any wrangler command |
| Always specify terminal | Every command must state: which terminal (VS Code, PowerShell, SSH/VPS) AND which directory |
| enrichment_poller | Run inside container only with --loop flag: `docker compose exec -d agent-general python3 /app/src/enrichment_poller.py --loop` · Must cd ~/ai-stack first · Env vars set in docker-compose.yml |
| git commits | `git add -A`, `git commit`, `git push origin master` — separately, no `&&` |
| Pre-deploy check | Verify upload list shows only `public/` files — if `.env` or `.git` appear, stop |
| wrangler d1 | Must run from `Arc v 4/` directory · always add `--remote` for live D1 |
| PowerShell limits | No `&&`, no heredoc `<<'EOF'`, no `grep` (use `Select-String`), no `head` (use `Select-Object -First N`) |
| CC brief pattern | Ask CC to read files and report state BEFORE making changes |
| CC cannot run Python | Windows Store stub blocks it — run Python in PowerShell terminal directly |
| CC vs SSH | CC for local file edits · SSH terminal for VPS runtime commands |
| Long-running scripts | Run directly in PowerShell terminal — CC too slow (confirmed: part2 ingest, embed pass) |
| Context window | Suggest restart proactively when conversation grows long |
| D1 database name | `arcanthyr` (binding: `DB`, ID: `1b8ca95d-b8b3-421d-8c77-20f80432e1a0`) |
| Component quirks | Document in CLAUDE_arch.md Component Notes section |
| Pasting into terminal | Never paste wrangler output back into terminal — type commands fresh |
| Rogue `d` file | Delete with `Remove-Item "c:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\d"` if it reappears — commit deletion |

**Tooling:**
- **Claude.ai** — architecture, planning, debugging, writing CLAUDE.md, code review
- **Claude Code (VS Code)** — file edits, terminal commands, git, wrangler deploys
- **PowerShell / SSH** — VPS runtime commands, long-running Python scripts

---

## SYSTEM STATE — 17 March 2026 (end of session)

| Component | Status |
|---|---|
| Qdrant `general-docs-v2` | 2,410 points — embed pass COMPLETE |
| Embedding model | `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS Docker) |
| Score threshold | 0.45 (validated) |
| D1 `cases` | 11 rows — includes Parsons [2018] TASSC 62 (test case) |
| D1 `secondary_sources` | 1,138 rows · enriched_text backfilled · fully embedded |
| D1 `legislation` | 5 Acts · embedded=1 · 1,272 sections in Qdrant |
| D1 `case_citations` | 5 rows · 1 case processed |
| D1 `case_legislation_refs` | 5 rows · 1 case processed |
| Worker.js | Deployed `391a7c68` → `d0c487c` — procedure pass + fetch-case-url route live |
| `procedure_notes` column | Added to `cases` table · confirmed null on Parsons (correct) |
| `procedurePassPrompt` | Rewritten for judgment content — extracts voir dire, admissibility rulings, hostile witness sequences |
| fetch-case-url route | Built and deployed · times out on large judgments (>~100 paragraphs) — async fix pending |
| summarizeCase() | Two-pass window loop · pass1=2000 tokens · pass2=4000 tokens · single=4000 tokens · procedure pass added |
| Workers AI model | `@cf/qwen/qwen3-30b-a3b-fp8` — CONFIRMED WORKING |
| ingest_corpus.py | Nested bracket citation fix applied |
| generate_manifest.py | In repo · 1,138 chunks ground truth |
| enrichment_poller.py | timeout=30s · heartbeat flush · nohup loop running on VPS |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 + BM25 + concept search LIVE |
| Phase 5 | VALIDATED — citation discipline live |
| Frontend | Dark Gazette theme · Procedure Notes collapsible in case detail · fetch-case-url form on ingest page |

---

## IMMEDIATE NEXT ACTIONS

1. **Implement async job pattern for case upload/fetch** — Worker hands off to VPS server.py, returns job ID immediately, frontend polls `/api/legal/job-status/:id`. Fixes both large PDF upload timeout and fetch-case-url timeout for large judgments. Required before Neil and large HCA judgments can be ingested via console.

2. **Run retrieval baseline** — SSH: `bash ~/retrieval_baseline.sh` — 15 questions, check Q3, Q4, Q7, Q8, Q10, Q12, Q13, Q14.

3. **Open scraper** — only after Procedure Prompt second pass implemented and tested.

4. **Category normalisation** — deferred until post-retrieval testing.

5. **Commit uncommitted files** — ingest_corpus.py, generate_manifest.py, backfill scripts, validate_ingest.ps1, retrieval_baseline.sh.

---

## KNOWN ISSUES / WATCH LIST

- **fetch-case-url timeout** — times out on large judgments (>~100 paragraphs). Root cause: synchronous Worker request can't survive 30s+ AustLII fetch + Qwen3 extraction. Fix: async job pattern (see Immediate Next Actions #1). Small judgments work fine.
- **Scanned PDF upload timeout** — large scanned PDFs (>~100 paragraphs) timeout on console upload. Born-digital PDFs and short scanned judgments work fine. Use scraper or fetch-by-URL for large cases once async pattern is built.
- **Procedure Prompt second pass** — not yet implemented in summarizeCase(). Scraper PAUSED until done. Note: `procedurePassPrompt` in Worker.js is now judgment-tuned (voir dire, admissibility rulings etc) — NOT the RAG workflow Procedure Prompt. Those are different prompts for different content types.
- **Category fragmentation** — non-standard category values in D1 secondary_sources. Deferred until post-retrieval testing.
- **process-document "both" mode** — prompt_mode="both" runs Master Prompt only. Procedure Prompt second pass not yet implemented.
- **python-docx / striprtf** — not installed in agent-general container. DOCX/RTF uploads will error.
- **Worker.js filename case** — wrangler warns about Worker.js vs worker.js. Rename when convenient.
- **Cases with null case_name/facts** — don't render in library UI (hidden). Delete via wrangler d1 directly.

---

## CHANGES THIS SESSION — 17 March 2026

- `procedure_notes TEXT` column added to D1 `cases` table
- `procedurePassPrompt` added to Worker.js at module scope — judgment-tuned (voir dire, admissibility, hostile witness)
- Procedure pass added to `summarizeCase()` — runs after existing two-pass extraction, stores raw Markdown to `procedure_notes`
- Procedure Notes collapsible added to case detail view in frontend — hidden when null, `white-space: pre-wrap` for now
- `handleFetchCaseUrl` route added — `/api/legal/fetch-case-url` POST · accepts `{ url, citation? }` · auto-parses citation from AustLII URL path · falls back to body citation · 400 if neither available
- `handleFetchPage` domain check relaxed — now allows `jade.io` in addition to `austlii.edu.au`
- Fetch from URL form added to ingest.html
- Rogue `d` file deleted from repo
- Parsons [2018] TASSC 62 ingested as test case — procedure_notes confirmed null (correct for pure statutory construction appeal)
- Negative test confirmed: procedure pass returns null on doctrinal appellate judgments
- Deployed `391a7c68`, committed `d0c487c`

---

## FUTURE ROADMAP

- **Async job pattern for case upload/fetch** — Worker receives upload or URL, hands to VPS server.py, returns job ID, frontend polls status. Fixes timeout on large judgments. Build before extending scraper to new courts.
- **Fetch-by-URL case upload** — route built but needs async pattern to handle large judgments reliably. Already works for short cases.
- **Procedure Prompt second pass in summarizeCase()** — GATE before scraper reopens.
- **Procedure Notes Markdown renderer** — replace `white-space: pre-wrap` with proper Markdown rendering in case detail view once real procedure content confirmed landing from scraper.
- **Extend scraper to HCA/FCAFC** — after fetch-by-URL async pattern confirmed working.
- **Console document upload — procedure prompt pass** — process_blocks.py runs Master Prompt only. Add Procedure Prompt second pass.
- **Cloudflare Browser Rendering /crawl endpoint** — available Free plan. For Tasmanian Supreme Court sentencing remarks etc. NOT AustLII.
- **BM25 improvements** — proper scoring + hybrid ranking.
- **Console status indicator** — show enriched/embedded progress per document.
- **Qwen3 UI toggle** — add third button once Qwen validated.
- **Reingest-case route** — delete + reingest pattern to backfill case_name into Qdrant.
- **Nightly cron for xref_agent.py** — after scraper active.
- **Stare decisis layer** — surface treatment history from case_citations.
- **Animated sigil** — swap `sigil.jpg` for `sigil.gif` if rotating GIF produced.
- **Agent work (post-corpus validation)** — contradiction detection, coverage gap analysis, citation network traversal, stale authority detection, query expansion, procedural sequence assembly, bulk enrichment audit.
- **Category normalisation** — `doctrine` vs `legal doctrine` in secondary_sources. Post-retrieval testing.