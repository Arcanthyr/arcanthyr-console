# ARCANTHYR — SESSION CONTEXT BLOCK
*Compressed reference for future session continuity. Load and read before responding.*

---

## CURRENT STATE (as of March 2026)

- D1 ingesting TASSC + TASCCA 2025 cases via AustLII scraper (master_corpus processing in progress)
- Scraper intentionally paused after corpus run — no auto-restart
- Qdrant empty — vector ingest deliberately deferred pending keyword search validation
- Phase 5 (conversational AI interface) design locked but not yet built
- Known fragile point: case name/metadata extraction uses regex — replacement via Llama deferred
- pplx-embed-context-v1 embedding migration identified but not yet done
- Context prefix for Qdrant chunks currently manual

---

## PIPELINE: CURRENT vs RECOMMENDED

**Current:**
```
AustLII → scraper → parse → regex extracts metadata → D1 write → (Qdrant pending)
```

**Recommended:**
```
AustLII → scraper → parse → Llama extraction → enriched D1 write → auto context prefix → Qdrant ingest
```

Llama extraction (Workers AI Llama 3.1 8B) replaces regex server-side in arcanthyr-api Worker.
Extracts: case_name, citation, judge(s), parties, charges, outcome, statutory_provisions → JSON.
Auto-generates Qdrant context prefix from extracted metadata (removes manual step).
Add D1 review queue for low-confidence extractions — spot-check periodically, don't block pipeline.
This is the single highest-leverage change available. Unblocks Qdrant ingest and improves all downstream quality.

---

## PHASE 5 DESIGN (locked)

- Qdrant: top 6 chunks, min score 0.72, max 8
- Re-rank by court hierarchy (CCA/FullCourt > Supreme > Magistrates) within 0.05 score band
- Full metadata per chunk
- Claude API primary → Qwen3 fallback
- API key via: `npx wrangler secret put ANTHROPIC_API_KEY`

**Recommended addition — pre-retrieval agentic BM25 step:**
Before hitting Qdrant, route user query through Llama 3.1 8B agentic loop:
1. Agent receives query + D1 keyword search tool spec
2. Agent iterates: searches, reads results, reformulates, retries (hard limit 3 rounds)
3. Best result set passed to Qdrant semantic layer
4. Court hierarchy re-ranking applied as planned
Evidence base: agentic BM25 delivers 15-30% relevance lift over naive keyword baseline (WANDS/ESCI datasets). Useful now while Qdrant is sparse. Free — uses existing Workers AI.

---

## BACKGROUND AGENT LAYER (recommended roadmap)

All agents run free on existing infrastructure (Workers AI Llama 3.1 8B + D1 + Cloudflare cron triggers) unless noted.

### Agent 1 — Metadata Enrichment (PRIORITY: HIGH, build first)
- Trigger: post-ingest (every new case arriving in D1)
- Task: replace regex — Llama extracts structured metadata + generates Qdrant context prefix
- Output: enriched D1 record + prefixed chunks queued for Qdrant
- Add: D1 review queue for flagged low-confidence extractions
- Directly unblocks Qdrant ingest at scale

### Agent 2 — Cross-Reference Builder (PRIORITY: MEDIUM, build after ingest resumes)
- Trigger: nightly cron
- Task: reads new D1 cases, identifies statutory citations, case citations, judge names, outcomes
- Output: structured cross-reference records written back to D1
- Builds citation graph over time: which cases cite which, statutory provision frequency, judge patterns
- Pure D1/SQLite — no Qdrant dependency
- Based on Google ADK "always-on memory" consolidation pattern — stolen selectively, not wholesale

### Agent 3 — Agentic BM25 Search (PRIORITY: HIGH, integrate into Phase 5)
- Trigger: user query
- Task: drives D1 keyword search iteratively before Qdrant semantic layer
- Output: best candidate set passed downstream
- Lives in arcanthyr-api Worker, fires pre-retrieval

### Agent 4 — Qdrant Validation / Embedding Quality (PRIORITY: MEDIUM, before scaling ingest)
- Trigger: scheduled, post-ingest batch
- Task: issues test queries against freshly ingested chunks, checks retrieved chunks match expected cases
- Output: flags outliers for review — automates current manual keyword validation
- Unblocks confident scaling of ingest

### Agent 5 — Extended Scraper / Ingestion (PRIORITY: LOW, medium term)
- Trigger: scheduled, rate-limited
- Task: extends AustLII scraper to additional sources (Tasmanian legislation, second reading speeches, magistrates decisions if accessible)
- Feeds into Agent 1 (metadata enrichment) on ingest
- Inherits existing scraper architecture: Cloudflare edge proxy, random delays, session limits

### Agent 6 — Online Research Agent (PRIORITY: LOW, future/experimental)
- Trigger: user query returning low-confidence Qdrant results
- Task: searches for recent decisions not yet in corpus
- HIGH RISK in legal context — hallucinated case law is worse than no result
- Needs strict guardrails and human review loop before production use
- Do not build until corpus coverage is well established

---

## FREE vs PAID MODEL ALLOCATION

| Task | Model | Cost |
|---|---|---|
| Metadata extraction | Llama 3.1 8B (Workers AI) | Included |
| Agentic BM25 reformulation | Llama 3.1 8B (Workers AI) | Included |
| Cross-reference building | Llama 3.1 8B (Workers AI) | Included |
| Qdrant context prefix generation | Llama 3.1 8B (Workers AI) | Included |
| Embeddings | nomic-embed-text (Ollama/VPS) → migrate to pplx-embed-context-v1 | Included |
| Conversational interface (Phase 5) | Claude API → Qwen3 fallback | Pay per use |
| Optional: metadata validation spot-check | Claude API on flagged records only | Minimal |

Rule: Llama for all background/pipeline work. Claude API only for user-facing conversational interface where legal accuracy directly affects platform credibility.

---

## KNOWN DEFERRED ITEMS (do not lose track)

1. pplx-embed-context-v1 embedding migration — do before corpus grows further
2. Case name regex replacement — Agent 1 above
3. Qdrant ingest — blocked on metadata quality, unblocked by Agent 1
4. AustLII whitelisting request — submit via http://www.austlii.edu.au/austlii/feedback.html

---

## KEY ARCHITECTURAL WARNINGS

- Llama 3.1 8B will make extraction errors on legal text — always validate before trusting at scale
- Benchmark agent output before trusting in production (ref: LLM plausible-not-correct failure pattern)
- SQLite/D1-native LLM memory (Google ADK pattern) attractive for small corpus but breaks at scale — use selectively for cross-reference building only, do not replace Qdrant
- Removing vector DB doesn't remove retrieval complexity — it moves it. Qdrant stays.
- Background consolidation agents making judgment calls on legal data = compliance/accuracy risk — keep humans in the review loop until confidence is established

---

## INFRASTRUCTURE REMINDER

- Worker: arcanthyr-api (only active Worker)
- Live site: arcanthyr.com
- GitHub: https://github.com/Arcanthyr/arcanthyr-console
- VPS: 31.220.86.192 (AustLII-blocked — irrelevant for scraping via edge proxy)
- D1: primary case law DB
- Qdrant: qdrant-general port 6334, collection general-docs (empty)
- Cloudflare Tunnel: nexus.arcanthyr.com/ingest → agent-general port 18789
- Deployment: always git add -A → git commit → git push origin master AFTER every npx wrangler deploy
- PowerShell: run commands separately, never chain with &&
