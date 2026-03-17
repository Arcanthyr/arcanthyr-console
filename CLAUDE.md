# CLAUDE.md — Arcanthyr Session File
*Updated: 17 March 2026 (late evening) · Supersedes all prior versions*
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

**Tooling:**
- **Claude.ai** — architecture, planning, debugging, writing CLAUDE.md, code review
- **Claude Code (VS Code)** — file edits, terminal commands, git, wrangler deploys
- **PowerShell / SSH** — VPS runtime commands, long-running Python scripts

---

## SYSTEM STATE — 17 March 2026 (late evening)

| Component | Status |
|---|---|
| Qdrant `general-docs-v2` | ~1,871 points — embed pass running via nohup loop (target ~2,410) |
| Embedding model | `argus-ai/pplx-embed-context-v1-0.6b:fp32` (Ollama, VPS Docker) |
| Score threshold | 0.45 (validated) |
| D1 `cases` | 9 rows — 2026 scrape batch + TASMC test case |
| D1 `secondary_sources` | 1,138 rows · enriched_text backfilled · embed pass ~540 remaining |
| D1 `legislation` | 5 Acts · embedded=1 · 1,272 sections in Qdrant |
| D1 `case_citations` | 5 rows · 1 case processed |
| D1 `case_legislation_refs` | 5 rows · 1 case processed |
| Worker.js | Qwen3-30b deployed · choices[0].message.content fix confirmed working · budget_tokens removed · debug log removed |
| summarizeCase() | Two-pass window loop · pass1=2000 tokens · pass2=4000 tokens · single=4000 tokens |
| Workers AI model | `@cf/qwen/qwen3-30b-a3b-fp8` — CONFIRMED WORKING · Sears v Copper Mines extracted 12 principles |
| ingest_corpus.py | Nested bracket citation fix applied |
| generate_manifest.py | In repo · 1,138 chunks ground truth |
| backfill_enriched_text.py | Reads corpus_manifest.json · matches by (source_file, chunk_index) |
| backfill_enriched_text.sql | Generated · executed · 1,138 rows updated |
| execute_backfill.py | Written · use --file approach via wrangler not batch subprocess |
| validate_ingest.ps1 | In arcanthyr-console\ · run from Arc v 4\ |
| retrieval_baseline.sh | On VPS at ~/retrieval_baseline.sh |
| enrichment_poller.py | timeout=30s · heartbeat flush · nohup loop running on VPS |
| server.py | pplx-embed + general-docs-v2 + threshold 0.45 + BM25 + concept search LIVE |
| Phase 5 | VALIDATED — citation discipline live |
| Frontend | Dark Gazette theme · delete button fix confirmed |
| VPS env vars | OPENAI_API_KEY + WORKER_URL confirmed live in agent-general container |

---

## IMMEDIATE NEXT ACTIONS

1. **Implement Procedure Prompt second pass in `summarizeCase()`** — GATE before scraper reopens. Need `_buildSummary` function from Worker.js to design. Start next session with this.

2. **Confirm embed pass complete** — SSH: `tail -20 ~/embed_progress.log` then `curl -s http://localhost:6334/collections/general-docs-v2 | python3 -m json.tool | grep points_count` — target ~2,410.

3. **Run retrieval baseline** — SSH: `bash ~/retrieval_baseline.sh` — 15 questions, check Q3, Q4, Q7, Q8, Q10, Q12, Q13, Q14.

4. **Open scraper** — only after Procedure Prompt second pass implemented and tested on Sears v Copper Mines.

5. **Category normalisation** — deferred until post-retrieval testing.

6. **Commit uncommitted files** — ingest_corpus.py, generate_manifest.py, backfill scripts, validate_ingest.ps1, retrieval_baseline.sh.

---

## KNOWN ISSUES / WATCH LIST

- **Procedure Prompt second pass** — not yet implemented in summarizeCase(). Scraper PAUSED until done.
- **Category fragmentation** — non-standard category values in D1 secondary_sources. Deferred until post-retrieval testing.
- **Char-based windowing** — Worker.js case extraction window loop now implemented. raw_text cap raised to 500,000 chars.
- **process-document "both" mode** — prompt_mode="both" runs Master Prompt only. Procedure Prompt second pass not yet implemented.
- **python-docx / striprtf** — not installed in agent-general container. DOCX/RTF uploads will error.
- **Worker.js filename case** — wrangler warns about Worker.js vs worker.js. Rename when convenient.
- **Library delete button** — decodeURIComponent fix deployed. Test confirmed working.
- **Cases with null case_name/facts** — don't render in library UI (hidden). Delete via wrangler d1 directly.

---

## CHANGES THIS SESSION — 17 March 2026

- Corpus re-ingest complete: 1,138 chunks (317 part1 + 821 part2) → D1 · 0 FAILs · 0 duplicates
- validate_ingest.ps1: created in arcanthyr-console\ · all checks passed
- backfill_enriched_text.sql: generated and executed via wrangler --file · 1,138 rows updated
- execute_backfill.py: written · --file approach confirmed working
- Worker.js: Qwen3-30b model · window loop pass2 · raw_text cap 500k · budget_tokens=0 · regex JSON extraction · decodeURIComponent delete fix · token limits raised (pass1=2000, pass2/single=4000)
- summarizeCase() token limits: all raised from 600/800 to 2000/4000
- Library delete button: decodeURIComponent fix deployed and confirmed working
- Qwen3 callWorkersAI fix: choices[0].message.content · removed budget_tokens · confirmed working on Sears v Copper Mines (12 principles extracted)
- enrichment_poller.py: timeout 180s → 30s · heartbeat `print([embed] OK: chunk_id, flush=True)` · committed c081bab
- Embed pass: nohup loop running on VPS · 1,871/~2,410 points complete
- Scraper gate revised: Procedure Prompt second pass must be implemented BEFORE scraper reopens
- CLAUDE_arch.md: Qwen3 fix documented under Component Notes

---

## FUTURE ROADMAP

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
