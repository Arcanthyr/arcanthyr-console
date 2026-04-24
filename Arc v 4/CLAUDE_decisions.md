# CLAUDE_decisions.md



Architectural decisions, rationale, dead ends, and lessons learned

extracted from Claude.ai conversation export (Feb–Mar 2026).

Supplement to CLAUDE.md and CLAUDE_arch.md — focuses on *why*, not *what*.



---



## Entry format for retrieval / pipeline changes (added 24 April 2026)

Every decisions-log entry recording a retrieval or pipeline change must state:

**Hypothesis** — what change is expected.
**Expected effect size** — how large, in the metric's units.
**Measurement** — what reading will tell.
**Empirical vs prior-plausibility** — if the expected effect size is below the measurement's resolution, the change is being made on prior-plausibility grounds, not empirical ones. This is permitted but must be named. "Made because it seemed right" and "made because the evidence said so" are different entries.

This format exists because retrieval work on the 31-query binary-graded eval between sessions 80–95 produced a feedback loop running below the instrument's resolution floor. Tagging prior-plausibility changes as such prevents the loop re-forming.

---



## Enrichment Pipeline (Poller / Chunking / LLM Models)



**[2026-03-18]** *What to do next* — score 10, assistant



> The problem is clear. Qwen3-30b returns a reasoning preamble before the actual response — this is documented in CLAUDE_arch.md under "Workers AI — Qwen3 extraction issue (17 Mar 2026)". The fix was applied to `callWorkersAI` (regex extraction `raw.match(/\\{[\\s\\S]*\\}/)`), but `handleLegalQueryWorkersAI` reads `response?.response` directly without that fix — so it's getting the raw Qwen3 output which doesn't match that field path, returning null → "No response from model."



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 10, assistant



> **This is a known gap, never fixed.** The session 7 fix stripped AustLII *navigation* boilerplate (nav bars, footer, breadcrumbs). The structured judgment header (`COURT :`, `CITATION :`, `PARTIES :`, `JUDGE :`, `HEARD :`, `DELIVERED :`) is part of the judgment itself and was intentionally kept because Pass 1 uses it for metadata extraction. The problem is it then becomes chunk 0 and gets fed to the CHUNK prompt which hallucinates a principle from it.



**[2026-03-10]** *Claude.md context and suggestions* — score 6, assistant



> Honest assessment — the patch script approach won't work safely without seeing the actual chunk content around those line numbers. Blindly deleting based on line numbers risks removing the wrong content.



**[2026-03-10]** *Claude.md context and suggestions* — score 6, human



> Structure is now unambiguous. Report back to Claude.ai: Within a chunk — between metadata markers: exactly 1 blank line (single `\\n\\n`) Between metadata block and prose: exactly 3 blank lines (lines 18–20, `\\n\\n\\n\\n`) Between prose paragraphs: exactly 3 blank lines (lines 22–24, 26–28, etc.) Between chunks (heading to heading): exactly 3 blank lines (lines 54–56 between end of chunk 1 prose and line 57 heading of chunk 2) Conclusion: Triple blank lines are used everywhere — between prose paragraphs, between metadata-to-prose, and between chunks. There is no reliable blank-line count distinction between inter-chunk and intra-chunk boundaries. The only reliable chunk boundary is: a line that h…



**[2026-03-10]** *Claude.md context and suggestions* — score 6, human



> ines 56–115 verbatim. Key observations for Claude.ai: Chunk boundary confirmed — always the same pattern: * Line 57: heading (plain text, no `\\[`) * Lines 58–60: 3 blank lines * Line 61: `\\[DOMAIN:` — first marker of the new block Chunk 2 (lines 57–97) has `\\[DOMAIN:` at line 61 — so the lookahead `paragraphs[i+1].startswith('\\\\[DOMAIN:')` should catch heading at line 57. The 725 figure likely comes from short prose sentences like line 85 (`The primary statute establishes...`) or line 93 (`If a conflict arises...`) — these are single-line, under 200 chars, no `\\[`, and happen to be followed by another short sentence. They pass `is_heading` even though they're not headings. Root cause: `is_he…



**[2026-03-10]** *Claude.md context and suggestions* — score 6, assistant



> The key insight from the workflow doc: **every chunk heading is at Level 2 (`##`) or Level 3 (`###`)** per the formatting rules. But they got stripped during assembly.



**[2026-03-11]** *11 MAR 26* — score 6, assistant



> That would make sense — Workers AI runs on Cloudflare's infrastructure so it's fast and free within limits, and Claude API gives the best quality responses. Qwen3 on CPU was probably abandoned as a practical option once you had those two.



**[2026-03-16]** *Performance review* — score 6, human



> i want you to check converation history. there must be a reason why we decided not to go with qwen. i think we did a perfmance test



**[2026-03-17]** *Building case summary with multi-pass extraction* — score 6, assistant



> This means **Option B (pre-merge before `_buildSummary`) won't work as designed** — the Procedure Prompt result isn't a JSON object with `principles`/`legislation` keys. It's raw corpus chunk text.



**[2026-03-17]** *Building case summary with multi-pass extraction* — score 6, assistant



> - **fetch-case-url timeout** — times out on large judgments (>\~100 paragraphs). Root cause: synchronous Worker request can't survive 30s+ AustLII fetch + Qwen3 extraction. Fix: async job pattern (see Immediate Next Actions #1). Small judgments work fine. - **Scanned PDF upload timeout** — large scanned PDFs (>\~100 paragraphs) timeout on console upload. Born-digital PDFs and short scanned judgments work fine. Use scraper or fetch-by-URL for large cases once async pattern is built. - **Procedure Prompt second pass** — not yet implemented in summarizeCase(). Scraper PAUSED until done. Note: `procedurePassPrompt` in Worker.js is now judgment-tuned (voir dire, admissibility rulings etc) — NOT the…



**[2026-03-17]** *Section 95 tendency and coincidence evidence test* — score 6, assistant



> **KNOWN ISSUES update:** - Citation truncation bug: root cause was nested bracket regex in ingest_corpus.py — fixed - \~85 chunks were missing from corpus due to this bug — will be resolved after re-ingest



**[2026-03-18]** *Sync issue troubleshooting* — score 6, assistant



> The root cause: this is a 458k char judgment running 6+ sequential Workers AI calls. The consumer is taking \~3 minutes and CF is canceling it. Queue consumers on free tier have a 15 minute wall-clock limit but there may be a per-invocation CPU limit kicking in.



**[2026-03-19]** *Project state and priorities review* — score 6, assistant



> There's the root cause. Chunk 0 is pure AustLII navigation boilerplate — search interface HTML, jurisdiction dropdowns, database selectors — not judgment text at all. It got scraped and stored as the first chunk of the case.



**[2026-03-19]** *Project state and priorities review* — score 6, assistant



> The key finding: chunk 45 (the DNA secondary transfer chunk) is not appearing in the top results at all. It's scoring below 0.15 for this query, so the second-pass isn't catching it either.



**[2026-03-20]** *Fix pilot issues first* — score 6, assistant



> **Immediate impact:** - Scraper cases won't get enriched today (Queue METADATA/CHUNK calls all use Workers AI) - UI queries via Workers AI (Qwen3 fallback) won't work today - Claude API primary path in UI still works fine — that doesn't use neurons



**[2026-03-20]** *Side projects while waiting for scraper* — score 6, assistant



> Correct philosophy. Both consultants endorse it. The key insight from Consultant 2 is that "raw prose" doesn't mean "entire 3,000-word block" — it means verbatim/near-verbatim prose bounded at 500-800 words with natural chunk boundaries. This is not the same as Option C.



**[2026-03-22]** *Legal RAG system prompt redesign for case law enrichmen* — score 6, assistant



> **Problem 3 (invented principles from headers):** Same root cause — the prompt treats every chunk as containing extractable doctrine. A chunk that's just `COURT: Supreme Court of Tasmania / CITATION: [2024] TASSC 47 / PARTIES: ...` gets the same extraction demand.



**[2026-03-02]** *Case name extraction and console processing* — score 5, assistant



> The issue is Llama on Cloudflare Workers AI is slow and the scraper's 60 second upload timeout isn't long enough for complex cases.



**[2026-03-10]** *Claude.md context and suggestions* — score 5, human



> ok this is from cc: "Total chunks detected: 725 — still too many. The `\\[DOMAIN:` lookahead is working (citation correct, SyntaxWarning is cosmetic — docstring only, no functional impact), but some chunks are still splitting mid-block. The issue is likely that not every block starts with `\\[DOMAIN:` — some blocks open with a different first marker (e.g. `\\[TYPE:`, `\\[ACT:`). Pass back to Claude.ai: the lookahead `paragraphs[i + 1].startswith('\\\\[DOMAIN:')` is too strict — blocks without `\\[DOMAIN:` as the first marker after the heading will not be caught, causing mid-block splits. Need to broaden to any `\\[` marker, or specifically check for any `\\[UPPERCASE:` pattern." Would you like to see…



**[2026-03-11]** *Project state review and pipeline fixes* — score 5, assistant



> The issue is the batch size — we're trying to send 662 chunk IDs in a single POST body, which is likely hitting a D1 or Worker size limit on the `IN (?, ?, ...)` query with that many placeholders.



**[2026-03-11]** *11 MAR 26* — score 5, assistant



> If `raw_text` has content, the fix is to re-run enrichment on these rows (reset `enriched=0`, let the poller enrich them via Claude API, then re-embed). If `raw_text` is also null, the content was never ingested and needs to be re-uploaded from the source file.



**[2026-03-11]** *11 MAR 26* — score 5, assistant



> The corpus chunk issue is the more important one. The fix is to also search `secondary_sources` by ID when a section reference appears in the query. Add to `handleFetchSectionsByReference` in Worker.js — after fetching from `legislation_sections`, also query:



**[2026-03-11]** *11 MAR 26* — score 5, assistant



> The Worker is returning all the right chunks including the corpus s 38 procedure chunk. The problem is in server.py's deduplication — the `existing_ids` check is filtering it out.



**[2026-03-11]** *Claude.md context and suggestions* — score 5, assistant



> The problem is clear: the Worker is calling `nexus.arcanthyr.com/ingest` for each chunk but the Cloudflare Tunnel is dropping or timing out those calls at volume. The 657 D1 writes succeeded because they're direct D1 API calls, but the nexus tunnel calls failed silently.



**[2026-03-15]** *15/3/26* — score 5, assistant



> The fix is to expand Llama's instruction block to match Claude's discipline, but kept concise enough that it doesn't hit Workers AI prompt length sensitivity (which you've had CPU timeout issues with before).



**[2026-03-15]** *Automating Hogan crime block reformatting workflow* — score 5, assistant



> **Minor issues to be aware of across the full run:** - The first master chunk flags `[REVIEW]` because the source block apparently starts with unspecified Act references — that's correct behaviour, not a problem - Chunk 3 ("Definitions — inclusive") is very thin, just a heading note — that's a source content issue not a formatting issue - Chunk 4 has some raw markdown artefacts (`{.mark}`, `***bold***`) carried through from the source — again correct behaviour for the procedure prompt preserving source formatting verbatim



**[2026-03-15]** *Automating Hogan crime block reformatting workflow* — score 5, assistant



> The issue is the chunk splitting logic. It splits on `\\n{3,}` (3 or more blank lines) but the new corpus uses `\\n\\n` (2 blank lines) between chunks, with HTML comments (`<!-- block_001 master -->`) as separators rather than triple blank lines.



**[2026-03-16]** *Validation retrieval tests* — score 5, assistant



> **On the enrichment work:** Not wasted, but not where you think it is. The enrichment that produced `master_corpus.md` is still intact — that file has all 1,138 chunks with their enriched content already written into it. The problem is the pipeline never wrote that enriched content back into the `enriched_text` column in D1 after re-ingest. The re-ingest loaded `raw_text` only, and the embed pass ran before the poller could populate `enriched_text`.



**[2026-03-16]** *Validation retrieval tests* — score 5, assistant



> The issue is matching chunks from the markdown to D1 rows. The D1 `id` field doesn't use `block_001` — it uses the title-derived slugs we saw. So the script needs to match on **title**.



**[2026-03-16]** *UI changes and ingest page updates* — score 5, assistant



> The issue is volume. Each legislation section is a separate D1 row and would need a separate GPT mini call. The Criminal Code alone has hundreds of sections. At 400+ sections across 5 Acts, you're looking at 400+ API calls just for the initial enrichment pass — and then every time you add a new Act, another batch. It adds up, and unlike Hogan on Crime where you do it once and it's done, legislation gets amended, new Acts get added, and you'd be re-enriching periodically.



**[2026-03-16]** *UI changes and ingest page updates* — score 5, assistant



> The important thing is the direct curl works perfectly. The issue is in `post_chunk_to_worker()` in server.py — it's sending the `X-Nexus-Key` header which Cloudflare may be treating as suspicious, or the citation format from the test chunk triggered something.



**[2026-03-16]** *UI changes and ingest page updates* — score 5, assistant



> Found it — this is a known Cloudflare WAF issue. From the March search history, the fix was to base64 encode the payload so CF doesn't scan the content. It was already applied to `handleUploadCase` — same fix needed for `post_chunk_to_worker()` in server.py and the Worker's `handleUploadCorpus`.



**[2026-03-16]** *UI changes and ingest page updates* — score 5, assistant



> First, Cloudflare's WAF was scanning the chunk text content and blocking requests that contained legal language (words like "offence", "assault" etc. trigger security rules). The fix was to base64 encode the text before sending it so CF can't read the content, and decode it on the Worker side before writing to D1. This was already a known issue — the same fix was applied to case uploads months ago.



**[2026-03-16]** *UI changes and ingest page updates* — score 5, assistant



> Second, when GPT mini processes a tiny two-line test block it can't generate a proper citation field, so the code fell back to deriving one from the chunk heading. The heading text "Not Applicable" contained a space which was surviving the sanitisation and producing a malformed D1 row ID. The fix was tightening the fallback so any non-alphanumeric character gets replaced with an underscore and the result is always clean regardless of what GPT returns.



**[2026-03-16]** *Performance review* — score 5, assistant



> On 11 March the poller was run directly on the VPS host — `python3 \~/ai-stack/agent-general/src/enrichment_poller.py` — so `localhost` was right. Last night you ran it with `nohup` the same way, and it completed 50 chunks fine for the same reason. Tonight we switched to `docker compose exec` to get the env vars (specifically `NEXUS_SECRET_KEY`) — but that puts us inside the container where `localhost` breaks.



**[2026-03-16]** *Performance review* — score 5, assistant



> Now — do you want to get the poller running first, or do the docker-compose.yml fix now while we're thinking about it? The fix is a 2-minute CC edit and means you won't need the env var overrides for the rest of the embed run.



**[2026-03-17]** *Section 95 tendency and coincidence evidence test* — score 5, assistant



> The content is definitely in master_corpus — rich tendency material across both parts. So the pipeline dropped it. The issue is the backfill_enriched_text.py misaligned those chunks — the D1 rows exist but their enriched_text got wrong content or the chunk IDs didn't match.



**[2026-03-17]** *Section 95 tendency and coincidence evidence test* — score 5, assistant



> The fix is straightforward — replace `\&` with `and` in CITATION fields only across both master_corpus files, then re-ingest just those 85 chunks.



**[2026-03-17]** *Section 95 tendency and coincidence evidence test* — score 5, assistant



> **2. Fix the backfill alignment** — the backfill_enriched_text.py must use the exact same ID-generation logic as ingest_corpus.py. The dedup suffix `[2]`, `[3]` assignment is order-dependent. If backfill re-parses the file and hits chunks in a different order, it writes enriched_text to wrong rows. The fix is: ingest writes a manifest JSON file mapping `{computed_id: raw_text_hash}`, backfill reads the manifest instead of re-deriving IDs.



**[2026-03-17]** *Performance review* — score 5, assistant



> Perfect. I can see exactly where to add the filter — right after the `chunks.append()` block in the for loop, before the re-ranking. The fix is simple: filter out legislation chunks with very short text.



**[2026-03-17]** *Successful data chunk processing* — score 5, assistant



> If all cases are capped at 50,000 and this one's principles only cover standing (early in the judgment), it suggests the window loop is working but Qwen is extracting consistently across windows. That's actually fine — the fix is proven, the real benefit kicks in when the scraper resumes and ingests full-length judgments up to 500,000 chars.



**[2026-03-18]** *Reviewing Claude documentation files* — score 5, assistant



> The root issue: chunk__0 is AustLII boilerplate HTML, and the DNA content is buried in later chunks. The query "DNA secondary transfer Neill-Fraser" is a specific factual query against dense transcript text — pplx-embed isn't finding semantic similarity between the query and raw judgment text at any meaningful score.



**[2026-03-18]** *Project state and priorities review* — score 5, assistant



> That'll tell us whether it has populated holdings/principles or if they're null. If they're null or thin, the fix is to delete and re-upload the case now that Queues is live — it'll go through the full METADATA + CHUNK fan-out and produce a proper deep enrichment.



**[2026-03-18]** *Sync issue troubleshooting* — score 5, human



> Recommendation: Option 2 — Chunked case pipeline with queue fan-out It's the only option that satisfies all constraints simultaneously. Here's the architecture: Core insight The current problem is N sequential Workers AI calls inside one queue consumer execution. The fix is to make each Workers AI call its own queue consumer execution. Cloudflare Queues already supports this — one message per chunk. Proposed architecture Stage 1 — Upload handler (existing, minimal change) * Store `raw_text` in D1 `cases` as now * Drop one `{ type: "METADATA", citation }` message on the queue * Return immediately Stage 2 — Queue consumer: METADATA message * Read `raw_text` from D1 * Run Pass 1 only (first 8k…



**[2026-03-18]** *Sync issue troubleshooting* — score 5, human



> suggestion 3" Recommendation: Option 2 — Chunked case pipeline with queue fan-out It's the only option that satisfies all constraints simultaneously. Here's the architecture: Core insight The current problem is N sequential Workers AI calls inside one queue consumer execution. The fix is to make each Workers AI call its own queue consumer execution. Cloudflare Queues already supports this — one message per chunk. Proposed architecture Stage 1 — Upload handler (existing, minimal change) * Store `raw_text` in D1 `cases` as now * Drop one `{ type: "METADATA", citation }` message on the queue * Return immediately Stage 2 — Queue consumer: METADATA message * Read `raw_text` from D1 * Run Pass 1 o…



**[2026-03-18]** *Sync issue troubleshooting* — score 5, assistant



> The only thing to watch is the **Workers AI neuron budget** — 118 chunks × \~400 neurons per call = \~47,000 neurons for the Neil case alone. That's well over the 10,000/day free tier. Check the CF dashboard after this run to see actual usage. If you're hitting limits the fix is to spread scraper uploads over multiple days — but for manual console uploads of individual cases it should be fine.



**[2026-03-18]** *Sync issue troubleshooting* — score 5, assistant



> > Read `Arc v 4/Worker.js`. Find the METADATA queue handler branch. Make two changes: > > **Change 1 — Increase Pass 1 max tokens from 800 to 1500** in the `callWorkersAI` call for Pass 1. > > **Change 2 — After the `callWorkersAI` call for Pass 1, add a fallback to extract from `reasoning_content` if `content` is null.** Find where `pass1Raw` is set and add handling for the raw Workers AI response. The issue is that `callWorkersAI` returns the content string directly — check how `callWorkersAI` extracts the response. If it reads `choices[0].message.content`, add a fallback: if content is null, try `choices[0].message.reasoning_content`. > > Show me the current `callWorkersAI` function first…



**[2026-03-18]** *What to do next* — score 5, assistant



> So the short answer: it's a documentation and checklist gap, not a system failure. The fix is a single SQL update. Nothing is broken — the chunks are in D1 intact, they just need the flag flipped.



**[2026-03-18]** *What to do next* — score 5, human



> Three differences worth noting: 1. Same model — both paths use `@cf/qwen/qwen3-30b-a3b-fp8`. The CLAUDE.md roadmap item "Qwen3 UI toggle" suggests this was intentionally switched to Qwen3 from Llama at some point. 2. `max_tokens` differs — RAG query gets 800 (answer synthesis, short output fine). Extraction calls get 2,000–4,000 (structured JSON output needs room). 3. Response shape differs — `handleLegalQueryWorkersAI` reads `response?.response` (line 1681). `callWorkersAI` tries three fallback paths: `choices[0].message.content`, `choices[0].text`, then `response?.response`. The two callers handle model output shape slightly differently, which could be fragile if the model's response forma…



**[2026-03-18]** *What to do next* — score 5, assistant



> **CC's critical correction stands alone and is the most important:** - `env.AI.run` is a Worker binding — VPS can't call it directly - The fix is Cloudflare REST API: `POST api.cloudflare.com/.../ai/run/@cf/qwen/qwen3-30b-a3b-fp8` - Same model, no Worker timeout, no VPS GPU cost - This was the fundamental gap in the original spec



**[2026-03-19]** *Project state and priorities review* — score 5, assistant



> **The problem is exactly what session history identified:** the case chunk second-pass is gated on citation/party name detection. A general query like "Neill-Fraser DNA secondary transfer" doesn't trigger it even though "Neill-Fraser" is a party name.



**[2026-03-19]** *Project state and priorities review* — score 5, assistant



> **Bottom line:** Workers AI is the better path for chunk enrichment on quality and reliability grounds — the neuron cap is the only real problem. The fix is either the retry delay (band-aid) or shifting the scraper to run at noon after the 11am neuron reset (simple, no code change).



**[2026-03-19]** *Project state and priorities review* — score 5, assistant



> The problem is the model itself. Qwen3-30b is receiving 10 chunks including a Neill-Fraser case chunk, but still outputting the refusal. The prompt fix we deployed isn't strong enough to override Qwen3's tendency to refuse when the majority of chunks are unrelated secondary sources.



**[2026-03-19]** *Project state and priorities review* — score 5, assistant



> 1. **Yes it's a real problem** — chunk 0 containing AustLII navigation HTML is a known data quality issue 2. **Yes it's been discussed** — the boilerplate stripper was built specifically to address this in early March, but it operates on the plain text *after* BeautifulSoup extraction. The issue is that the AustLII search interface HTML is being included in the `body` tag before the judgment content, so BeautifulSoup's `get_text()` picks it up 3. **The existing stripper has a pattern for AustLII lines** — but it's line-by-line and the navigation block spans many lines with HTML entities (`\&#9660;`, `\&hellip;` etc) that survive as decoded text



**[2026-03-19]** *Project state and priorities review* — score 5, assistant



> The problem is it's being returned by server.py but then getting lost somewhere between server.py and the model. Check how many total chunks server.py is returning for this query — the Worker caps at a certain number and this chunk might be getting cut off:



**[2026-03-19]** *Side projects while waiting for scraper* — score 5, assistant



> No, but your original goal and RAG are genuinely in tension. What you want — an AI that reasons over your entire research database — is closer to what's called a **long context** approach, where you stuff everything into one giant prompt. The problem is your corpus is \~2,032 chunks × \~500 words = roughly 1 million words. That's too large for any context window today.



**[2026-03-19]** *Side projects while waiting for scraper* — score 5, assistant



> OK — history is clear. The `Returning 0 chunks` problem was fully investigated and fixed in the 17 Mar performance review session. The fix was exactly what's already in the current server.py — changing the filter from `citation == "unknown"` to `type == "legislation"`. That fix is already deployed.



**[2026-03-20]** *Token limit exceeded in API request* — score 5, assistant



> Good. Now the issue is clear. Block 001 failed because `process_blocks.py` had `MAX_TOKENS=32000` but the model (`gpt-4o-mini-2024-07-18`) only supports 16,384 completion tokens. The CLAUDE.md note confirms this was a known stale error from a prior failed run — but looking at the output, block_001 failed in *this* run too.



**[2026-03-20]** *Token limit exceeded in API request* — score 5, assistant



> Server.py is working fine — returning good chunks. The problem is in the baseline script. Check what auth header and field name it's using:



**[2026-03-20]** *Token limit exceeded in API request* — score 5, assistant



> **Q2 (BRD standard)** — yes, likely fixed by ingestion. The new corpus has 490 chunks vs the old 1,579 thin ones. If a BRD doctrine chunk exists in the reprocessed material it'll land with substantive prose this time and retrieve correctly.



**[2026-03-20]** *Fix pilot issues first* — score 5, assistant



> The fix is a worker.js change to the CHUNK queue consumer — preserve `chunk_text` prose alongside the extracted JSON rather than discarding it. It's on the roadmap but deferred.



**[2026-03-20]** *Fix pilot issues first* — score 5, assistant



> **The fix is simple** — one prompt change in worker.js CHUNK handler: instruct the model to return both the extracted JSON fields AND preserve the key reasoning passages verbatim.



**[2026-03-20]** *Fix pilot issues first* — score 5, assistant



> Not dealt with before — it's been on the roadmap since session 2 but never fixed. The history confirms the issue was identified when the CHUNK pipeline was first built and deferred each session.



**[2026-03-20]** *Fix pilot issues first* — score 5, assistant



> So this is genuinely new work. The fix is straightforward though — want CC to do it now while process_blocks.py runs? It's a worker.js prompt change only, no schema changes needed. The `chunk_text` is already stored in D1 — we just need the CHUNK prompt to also preserve key reasoning passages in the JSON output so `principles_json` has prose, not just thin bullet points.



**[2026-03-20]** *Fix pilot issues first* — score 5, assistant



> If there's no DLQ (we never built one — it's on the roadmap), those 70 chunks are just lost. The fix is to reset them to `done=0` so the Queue re-enqueues them on next scrape, or manually re-trigger them.



**[2026-03-20]** *Fix pilot issues first* — score 5, assistant



> The chunk text is fine — no HTML entities, normal prose. The issue is likely the new `reasoning` field in the CHUNK prompt is pushing the response over the 1,500 token `max_tokens` limit, causing truncated JSON that fails to parse.



**[2026-03-20]** *Fix pilot issues first* — score 5, assistant



> The fix is simple: **accept empty extractions as valid** and mark the chunk done. The guard check should only retry on actual errors (null response, parse failure), not on legitimately empty content.



**[2026-03-20]** *Fix pilot issues first* — score 5, assistant



> - **process_blocks.py fixes** — MAX_TOKENS 32000→16000, REPAIR_PROMPT double-brace placeholders fixed, BLOCK_NUMBER injection into system prompt via .replace() - **Corpus pilot run** — block 1 passed CQT: prose preserved, metadata correct, repair pass triggered and accepted, procedure chunks verbatim - **Corpus files deleted** — master_corpus_part1.md + master_corpus_part2.md cleared for clean overnight run - **process_blocks.py launched** — full 56-block overnight run started \~4:30pm AEST · expected completion \~10pm AEST - **Cloudflare Workers Paid** — upgraded to $5/month plan · neuron cap removed - **CHUNK enrichment switched to GPT-4o-mini** — Workers AI Qwen3 blocked graphic family viol…



**[2026-03-20]** *Reviewing recent conversation highlights* — score 5, assistant



> If that returns 200, the issue is the chunk body text content (encoding artifacts). If it returns 500, it's something structural in the route. Paste the result.



**[2026-03-20]** *Side projects while waiting for scraper* — score 5, assistant



> The fix is straightforward — replace the CHUNK message prompt in worker.js with Consultant 1's version that preserves judicial reasoning alongside extracted principles. Then deploy. Then the scraper runs clean from this point forward.



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 5, assistant



> **This is worth checking before you invest time rewriting Pass 1.** If Pass 1 is hitting content moderation blocks, the prompt fix is irrelevant — the fix is moving Pass 1 to GPT-4o-mini as well.



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 5, assistant



> **Reason 2 — The problem was known but mis-prioritised.** It's been in the roadmap as "CHUNK message prompt fix" since session 9. Session 9 correctly diagnosed it — "extracts principles/holdings JSON but discards judicial reasoning prose." It was explicitly deferred because "the scraper hadn't added significant volume yet." At 29 cases it seemed low-stakes. At 309 cases it's overdue.



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 5, assistant



> **The fix is simple:** the CHUNK prompt (or the Worker before calling GPT) should detect chunk 0 containing only header metadata and skip it, or the split logic should skip the first N characters of structured header before chunking. This is a one-line gate, not a scraper change.



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 5, assistant



> ### CHUNK message handler — v3 prompt (session 14) CHUNK queue consumer calls GPT-4o-mini-2024-07-18 with v3 enrichment prompt. Switched from Workers AI (Qwen3) in session 10 due to content moderation blocks on graphic legal content.



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 5, human



> # Change Lines (original) 1 Header date session 13 → 14 Line 2 2 CHUNK message description — v3 fields added Line 158 3 case_chunks column list — enriched_text added + descriptor Lines 401–404 → 401–406 4 cases column list — subject_matter added + descriptor Lines 396–397 → 396–399 5 KNOWN ISSUES — replaced 2 bullets with 2 new bullets Lines 266–267 6 CHUNK handler section — 2 lines expanded to 25 lines Lines 270–271 7a FUTURE ROADMAP — 1 item → 2 items Line 454 7b FUTURE ROADMAP — Re-embed pass updated Line 468 No commands run. Ready for git commit.



**[2026-03-05]** *5 Mar 26* — score 4, assistant



> The constraint is Llama's context window via Workers AI. Llama 3.1 8B has a 128k token context window, and Workers AI supports up to around 6000 tokens input. At roughly 4 characters per token, 8000 characters is about 2000 tokens — so actually the current limit is being conservative even within the Workers AI constraint. You could safely push to **20,000–24,000 characters** (\~5000–6000 tokens) without hitting the ceiling.



**[2026-03-06]** *5 Mar 26* — score 4, assistant



> Option A — show the summary field instead of chunk text in the sources panel. The summary is a complete case synopsis extracted by Llama. That's actually already what's displaying — the truncated text you're seeing is the `summary` field cut to 200 characters. Easy fix: just increase the character limit in `search.html`.



**[2026-03-07]** *7 MAR 26* — score 4, assistant



> *The 30 second CPU timeout on Cloudflare Workers.* Your Worker already has this constraint. Workers AI calls count against it. For a query with 6 chunks of context the inference should complete well within 30 seconds on GPU, but if Cloudflare's infrastructure is under load it could occasionally time out. Claude has the same constraint — this isn't new, just worth keeping in mind.



**[2026-03-09]** *Secondary sources prompt development* — score 4, assistant



> If a section exceeds 450 words, split into logically distinct sub-topics with new unique headings. Do not use continuation headings such as "(cont.)". Each split chunk must have its own semantic label.



**[2026-03-09]** *Secondary sources prompt development* — score 4, assistant



> Omit `[SECTION:]` if the chunk covers a concept rather than a specific section. Omit `[ACT:]` if the chunk is not Act-specific.



**[2026-03-10]** *Claude.md context and suggestions* — score 4, human



> followed by a blank line and `[DOMAIN: ...]` markers. The splitter regex will never match — the entire corpus ingests as one massive chunk. The corpus needs either: 1. `##` headings added to `master_corpus.md` before each block, or 2. The splitter regex changed to split on the actual block boundary pattern (e.g. double blank line + `[DOMAIN:` or `[TYPE:` marker, or the pattern of a plain heading line followed by `\\n\\n\\[`) Claude.ai needs to decide the fix — do not run the script yet.



**[2026-03-11]** *RAG workflow plan issues* — score 4, assistant



> The manual process had *you* reviewing each block's FINAL STATUS before appending. The automated pipeline needs that quality check built in — if Claude returns a chunk marked `NEEDS REVISION` or missing required metadata fields, the pipeline should flag it rather than silently ingest it.



**[2026-03-11]** *Project state review and pipeline fixes* — score 4, assistant



> The one thing to note: the poller calls the Worker routes rather than D1 directly, which keeps all DB access in one place. The Worker routes are all `X-Nexus-Key` protected.



**[2026-03-11]** *11 MAR 26* — score 4, assistant



> My recommendation: do it, but after the cross-reference agent design is clearer — so the enrichment prompt can be written to specifically support that use case rather than generic summarisation.



**[2026-03-14]** *12/3/26* — score 4, assistant



> **Secondary sources corpus — IMPORTANT:** - 711 rows, all `enriched=1` (set manually — raw_text is the content, no Claude API enrichment needed) - `enriched_text` is NULL across all rows — this is correct, poller falls back to `raw_text` - Do NOT run `--mode enrich` on these rows



**[2026-03-14]** *14/3/26* — score 4, assistant



> **The only genuine risks worth noting:** - Llama 3.1 8B extraction quality is imperfect — principles especially will be lightweight. Acceptable for now, improvable later from `raw_text` - Workers AI has CPU time limits per invocation — if a case is very long the Llama call could time out. Mitigated by truncating input to a sensible limit (e.g. 6,000 chars) which is already in the Worker - Local terminal dependency for scraping — means you need your Windows machine running during scrape sessions. Accepted tradeoff given VPS IP is blocked



**[2026-03-15]** *15/3/26* — score 4, assistant



> **Secondary sources corpus — IMPORTANT:** - 711 rows, all enriched=1 (set manually — raw_text is the content, no Claude API enrichment needed) - enriched_text is NULL across all rows — this is correct, poller falls back to raw_text - Do NOT run `--mode enrich` on these rows



**[2026-03-16]** *Debugging script without interrupting execution* — score 4, human



> Answer: same code path. Both paths build the full `chunks` list and the full `payloads` list. The dry-run just exits after printing samples instead of POSTing. The chunk count printed on line 38 is always accurate for both modes — there's no separate counting logic.



**[2026-03-16]** *UI changes and ingest page updates* — score 4, assistant



> The realistic constraint is the Worker's 30-second CPU limit — a 400-page document split + enrichment cannot happen synchronously in a Worker. The right architecture is:



**[2026-03-16]** *Performance review* — score 4, assistant



> Confirmed — it's **Workers AI (Llama 3.1 8B)**, not Claude API, doing the case extraction. The architecture is:



**[2026-03-16]** *Performance review* — score 4, assistant



> The architecture decision is solid and consistent across multiple sessions — Workers AI via Worker route for scraper enrichment. That hasn't changed. What has changed is the model options available.



**[2026-03-17]** *Building case summary with multi-pass extraction* — score 4, human



> Here's the full picture before any changes: Current structure `processCaseUpload(env, caseText, citation, caseName, court)` — Worker.js:185 1. Checks D1 for duplicate citation 2. Builds `caseData` object (`url: ""` hardcoded) 3. Calls `summarizeCase(env, caseData)` — two-pass Qwen3 extraction 4. Calls `saveCaseToDb(env, finalCaseData, summary)` 5. Runs procedure pass: `callWorkersAI(env, procedurePassPrompt, caseText.slice(0, 80000))`, writes `procedure_notes` 6. Fire-and-forgets a Nexus ingest POST 7. Returns `{ id, citation, case_name, summary }` `handleUploadCase(body, env)` — Worker.js:856 Thin wrapper. Parses `{ case_text, citation, case_name, court, court_hint, encoding }` from body, m…



**[2026-03-17]** *Embed pass completion and Parsons ingestion tracking* — score 4, assistant



> **On the Procedure Prompt pass** — you're completely right and I should have caught this earlier. The whole `process_blocks.py` architecture was built specifically to run GPT-4o-mini over the 56 blocks with both Master and Procedure prompts, producing two independent corpus streams that then get ingested separately. That pipeline exists, was designed, was built, and has not been run for the Procedure Prompt stream. It's sitting there waiting.



**[2026-03-17]** *Successful data chunk processing* — score 4, assistant



> > Open `C:\\Users\\Hogan\\OneDrive\\Arcanthyr\\arcanthyr-console\\Arc v 4\\CLAUDE_arch.md` and add the following to the Component Notes section. Do not change anything else. Show me the addition before saving. > > ```markdown > ### Workers AI — Qwen3 extraction issue (17 Mar 2026) > > `@cf/qwen/qwen3-30b-a3b-fp8` was deployed as replacement for `@cf/meta/llama-3.1-8b-instruct` in `callWorkersAI()`. Model confirmed working in CF playground but returns reasoning preamble before JSON output. Fix deployed: regex extraction `raw.match(/\\{[\\s\\S]*\\}/)` in `callWorkersAI` return value strips preamble and returns JSON only. If extraction still fails after this fix, revert model to `@cf/meta/llama-3.1-8b-in…



**[2026-03-17]** *Successful data chunk processing* — score 4, assistant



> 1. **Fix Qwen3 extraction — Pass 1 response: 0 chars** — regex fix deployed but unconfirmed. Fresh session: restart wrangler tail, delete TASMC case, re-upload, check tail for actual error. If still failing revert to `@cf/meta/llama-3.1-8b-instruct` — windowing architecture is model-agnostic.



**[2026-03-18]** *Reviewing Claude documentation files* — score 4, human



> tom@vmi3098054:\~$ sed -n '759,800p' \~/ai-stack/agent-general/src/enrichment_poller.py ok_ids = [] errors = 0 for i, chunk in enumerate(chunks, 1): chunk_id = chunk['id'] embed_text = chunk.get('chunk_text', '') metadata = { 'chunk_id': chunk_id, 'citation': chunk.get('citation', ''), 'chunk_index': chunk.get('chunk_index', 0), 'case_name': chunk.get('case_name') or '', 'text': embed_text[:1000], 'type': 'case_chunk', 'source': 'AustLII', } log.info(f'[CASE-EMBED] {i}/{len(chunks)} chunk_id={chunk_id}') try:…



**[2026-03-18]** *Project state and priorities review* — score 4, human



> PS C:\\Users\\Hogan\\OneDrive\\Arcanthyr\\arcanthyr-console\\Arc v 4> Select-String -Path "worker.js" -Pattern "max_tokens" -Context 5,0 worker.js:55: worker.js:56:Output only the Markdown chunks or NO PROCEDURE CONTENT. No preamble, no commentary.`; worker.js:57: worker.js:58:async function callWorkersAI(env, systemPrompt, userContent, maxTokens = 4000) { worker.js:59: const result = await env.AI.run(WORKERS_AI_MODEL, { > worker.js:60: max_tokens: maxTokens, worker.js:1528: "x-api-key": env.ANTHROPIC_API_KEY, worker.js:1529: "anthropic-version": "2023-06-01", worker.js:1530: }, worker.js:1531: body: JSON.stringify({ worker.js:1532: model: "claude-sonne…



**[2026-03-18]** *Sync issue troubleshooting* — score 4, assistant



> **Better alternative:** instead of calling a Worker route, run the extraction directly in Python on the VPS using the Claude API — same as how secondary sources are enriched. No Worker timeout, no neuron limit, full control. This is actually cleaner architecturally and consistent with the existing poller pattern.



**[2026-03-18]** *Sync issue troubleshooting* — score 4, assistant



> **Scraper cases (bulk)** — Workers AI (Qwen3-30b) — free, automated, no API cost. This is the established architecture decision and must stay that way at volume.



**[2026-03-18]** *Sync issue troubleshooting* — score 4, assistant



> - **Workers AI via Worker route** — free, but 30s timeout risk on large judgments - **Claude API via poller** — no timeout, but cost at scraper volume - **Workers AI via poller direct call** — no Worker timeout, free, but Workers AI isn't directly accessible from VPS (confirmed architecture decision — requires CF REST API token)



**[2026-03-18]** *What to do next* — score 4, assistant



> Before committing to either Queues or VPS handoff, this needs a clean design decision. The key question is: for manual console uploads (URL fetch and PDF), is it acceptable to move enrichment from Workers AI to Qwen3 on VPS — or does the "enrichment stays in Worker" principle apply equally to manual uploads as it does to the scraper?



**[2026-03-18]** *What to do next* — score 4, assistant



> These aren't contradictory — the decision was about **where the model runs**, not about **when**. Workers AI can still do the enrichment, just triggered by the poller rather than inline in the Worker request.



**[2026-03-18]** *What to do next* — score 4, human



> 1) From cc: Approach is sound overall but there's one fundamental problem and several gaps worth addressing before building. The fundamental problem: timeout isn't actually solved The proposal says "poller calls Workers AI Qwen3-30b for enrichment." But `env.AI.run` is a Worker binding — it's not directly callable from the VPS. To use it, the poller would have to POST to a new Worker route (e.g. `/api/pipeline/enrich-case`) that calls `summarizeCase()` internally. That Worker invocation still has the same 30s wall-clock limit. A large judgment with 5–6 sequential `callWorkersAI()` calls still times out — you've just moved the timeout from the upload request to a poller-triggered request. The…



**[2026-03-18]** *What to do next* — score 4, assistant



> **All three agree:** - Architecture is correct — decouple is the right call - VPS poller pattern is sound - Simple `enriched=0/1` boolean is insufficient — need proper status states and retry counts - Idempotency on write routes is essential - Atomic job claiming needed to prevent double-processing



**[2026-03-18]** *What to do next* — score 4, assistant



> Options staying fully free: 1. Worker route for enrichment — works for 90%+ of cases, fails on mega-judgments 2. VPS Qwen3 for enrichment — free, no timeout, but contradicts the architecture decision 3. Defer the async pattern until Cloudflare releases a free async/queue path



**[2026-03-18]** *What to do next* — score 4, assistant



> - `ctx.waitUntil()` / fire-and-forget — removed in v9 for good reason, silently drops calls at volume - CF REST API for Workers AI — requires paid API token outside free tier intent - VPS Qwen3 for enrichment — explicitly rejected multiple times as architecture decision - Accept timeouts — scraper gate is open soon, silent data loss is not acceptable



**[2026-03-18]** *What to do next* — score 4, assistant



> Queues solves it cleanly: - Worker receives upload → drops message on Queue → returns immediately (no timeout) - Queue consumer Worker processes `processCaseUpload()` with no wall-clock limit - No VPS involvement in enrichment — stays in Worker as per architecture decision - Free tier covers your volumes - No new API tokens needed



**[2026-03-19]** *Project state and priorities review* — score 4, assistant



> Also add to FUTURE ROADMAP: ``` - **Scraper noon schedule** — Task Scheduler set to 12pm daily · neurons reset 11am Hobart · do not move earlier without checking neuron reset time - **Neuron cap monitoring** — at 100 cases/day with large judgments (100+ chunks each) cap may be hit · if recurring, consider moving to Workers Paid ($5/month) or GPT-4o mini (\~$0.05/day) for chunk enrichment - **Cloudflare git integration** — disconnected session 8 · deploy manually via wrangler only ```



**[2026-03-19]** *Project state and priorities review* — score 4, assistant



> This'll show us the exact breakdown — might be that the chunks are `done=0` rather than `done=1`, which would mean the queue consumer never finished processing them.



**[2026-03-19]** *Side projects while waiting for scraper* — score 4, assistant



> That's not what the Master Prompt was supposed to produce. That looks like a **case authority chunk** — the prompt detected "TASSC 38, Barnes v Omant, Lusted v Jenkins" as case citations and produced a case authority chunk pointer rather than a doctrine chunk with the substantive content.



**[2026-03-20]** *Side projects while waiting for scraper* — score 4, assistant



> From CLAUDE.md: *"upload-corpus uses destructive upsert — do NOT re-run against already-ingested citations."* This means if the new chunks produce the same citation IDs as the old ones, they'll overwrite silently. If they produce different IDs, you'll have duplicates. The citation ID format needs to be locked before reprocessing starts.



**[2026-03-20]** *Side projects while waiting for scraper* — score 4, assistant



> From CLAUDE_arch.md: *"Use `gpt-4o-mini-2024-07-18`. Do NOT use gpt-5.2/5.4 — near-empty output in testing."* The consultants' prompts don't specify this but it's critical. Also `max_completion_tokens` not `max_tokens`, no `temperature` parameter.



**[2026-03-20]** *Side projects while waiting for scraper* — score 4, assistant



> **Consultant 1 (Document 8) — partially useful.** The Master prompt has gaps — the format example is incomplete (shows `INPUT TEXT BLOCK` placeholder instead of actual format). However their Repair Pass prompt for the CHUNK message (case law Pass 2) is valuable and confirms that finding. File it for the case law pipeline fix workstream.



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 4, assistant



> **Important constraint from history (early sessions):** The Pass 1 8k truncation problem was identified in the original sliding window discussion and the reason the chunked Queue architecture was built was precisely to solve full-judgment coverage. Pass 1 is intentionally only metadata extraction (first 8k) — the CHUNK pass is supposed to cover principles across the full text. So Pass 1 doesn't need to extract holdings from the whole judgment — **it needs to be better at extracting procedural context and case framing from what it does see**, so that each CHUNK call has accurate context to work with.



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 4, assistant



> 1. **Simplify `legislation` back to string array** — `["s 46 Criminal Code (Tas)"]` not objects — for D1 compatibility 2. **Keep max_tokens at 1,600** not 3,000 3. **Add `excerpt_role_hint` to user message** so calling code can pre-classify obvious header chunks 4. **Add `Chunk: N of M` to user message** — not neighbouring summaries (too complex for now) 5. **Do not use two-pass approach** — single pass only



**[2026-03-22]** *Checking ingest status* — score 4, assistant



> Done. Poller will pick them up on the next cycle. Watch for the large input warning and successful embed — **SSH/VPS, `\~/ai-stack`:**



**[2026-03-22]** *Checking ingest status* — score 4, assistant



> The simplest approach is a Python script that pages through `secondary_sources` via wrangler and inserts into `secondary_sources_fts` via the Worker's `upload-corpus` route — but that route re-ingests full chunks which we don't want.



**[2026-03-22]** *Checking ingest status* — score 4, assistant



> > **Secondary sources corpus — IMPORTANT:** all enriched=1 (set manually — raw_text IS the content, no Claude API enrichment needed). Do NOT run `--mode enrich` on these rows.



**[2026-03-22]** *Checking ingest status* — score 4, assistant



> Which means the VPS poller 401 may be the only issue, and it may simply be a stale key in the VPS `.env` rather than a credit problem. The Worker key is clearly valid and has credits.



## Vector Search \& Embeddings



**[2026-03-18]** *Reviewing Claude documentation files* — score 10, assistant



> - Location: `arcanthyr-console\\backfill_case_chunk_names.py` (local) · `/home/tom/backfill_case_chunk_names.py` (VPS) - Run from VPS only — fetches cases via Worker API (`https://arcanthyr.com/api/legal/library?type=cases`), updates Qdrant at `localhost:6334` - Field mapping: `result.cases[].ref` → citation · `result.cases[].title` → case_name - Re-run after any bulk case ingestion to backfill case_name into existing Qdrant payloads - Do NOT run from Windows — Qdrant port 6334 is localhost-only on VPS - Root cause of session 5 incident: original script used external IP (blocked) + npx subprocess (not on VPS) ```



**[2026-03-04]** *4 MAR 26* — score 6, assistant



> Qdrant isn't running. That's a problem — cases are going into D1 but no vectors are being written to Qdrant, which means semantic search won't work when you build it.



**[2026-03-04]** *4 MAR 26* — score 6, assistant



> This is an important gap — every case uploaded tonight has gone into D1 but none have vectors in Qdrant. Semantic search won't work until this is resolved.



**[2026-03-09]** *Processing compiled notes into Arcanthyr database with * — score 6, human



> Key finding: All errors are upload timeouts to `arcanthyr.com` — the Worker's 30s timeout is being hit on large cases (TASSC judgments). The scraper catches the timeout and logs `HTTP 0` but still marks the case as processed. Those timed-out cases (TASSC/2024/3, 4, 5, 8, 9, 10 etc.) may be missing from D1/Qdrant — scraper thought it succeeded but the Worker likely returned nothing. This needs verification before resuming.



**[2026-03-10]** *Claude.md context and suggestions* — score 6, human



> FAIL — timeout. The script's 30s timeout expired waiting for the Worker response. This means `handleUploadCorpus` is awaiting the nexus `/ingest` response synchronously, and embedding a large chunk takes >30s. Root cause: `handleUploadCorpus` in Worker.js awaits the nexus response — same issue that was fixed for `handleUploadCase` with fire-and-forget. That fix wasn't applied to `handleUploadCorpus`. Two options to fix: 1. Increase `timeout=30` in `ingest_corpus.py` to e.g. `timeout=90` — but won't help if the Worker itself hits the 30s Cloudflare limit 2. Make `handleUploadCorpus` fire-and-forget in Worker.js (same pattern as `handleUploadCase`) — requires Worker.js edit + deploy Option 2 i…



**[2026-03-11]** *11 MAR 26* — score 6, assistant



> Then on VPS, reset all 662 rows and re-embed. But first — we need to also check what field name the Worker's `fetch-for-embedding` route returns for the text content. If it returns `text` not `raw_text`, the fix won't work. CC:



**[2026-03-17]** *Section 95 tendency and coincidence evidence test* — score 6, assistant



> - Root cause of missing corpus chunks identified: nested bracket citation truncation bug in ingest_corpus.py metadata regex — citations containing `[year]` were truncated, causing ID collisions and silent DROP via INSERT OR IGNORE. \~85 chunks affected including all tendency evidence doctrine. - ingest_corpus.py: regex fix applied — `(.*?)` → `((?:[^\\[\]]|\\[[^\\[\]]*\])*)` in extract_metadata - Worker.js: INSERT OR IGNORE → UPSERT with ON CONFLICT DO UPDATE. embedded=0 always reset on conflict. Deployed version 17a7b2c4. - generate_manifest.py: new script — parses both corpus files, outputs corpus_manifest.json with id/heading/category/body_length/raw_text_hash per chunk. Ground truth for inge…



**[2026-03-17]** *Performance review* — score 6, assistant



> Both failures point to the same root cause — the semantic gap between natural language queries and the chunk vectors. The drug schedule noise is gone but the underlying retrieval problem remains for these doctrine queries.



**[2026-03-18]** *Project state and priorities review* — score 6, assistant



> The key insight is that case chunks and corpus chunks are fundamentally different content types — dense transcript vs clean doctrinal statements — and they shouldn't compete in the same scoring pool. They need separate thresholds and separate retrieval passes, then merge at the context assembly stage.



**[2026-03-18]** *Reviewing Claude documentation files* — score 6, assistant



> - case_name added to case chunk Qdrant payload — worker.js LEFT JOIN cases on fetch-case-chunks-for-embedding query + enrichment_poller.py metadata dict - 177 case chunks reset to embedded=0 and re-embedded — previous embed pass stored empty payloads (root cause: original embed pass ran before case_name field existed) - backfill_case_chunk_names.py rewritten — runs on VPS, fetches D1 data via Worker API, hits Qdrant at localhost:6334. Original script failed: used external IP (port blocked) and npx subprocess (not on VPS) - Two-stage case chunk retrieval added to server.py — second Qdrant pass filtered to type=case_chunk, threshold 0.15, top 4, merged before return - Prompt fix — Claude Case…



**[2026-03-18]** *Reviewing Claude documentation files* — score 6, assistant



> - case_name added to case chunk Qdrant payload — worker.js LEFT JOIN cases on fetch-case-chunks-for-embedding + enrichment_poller.py metadata dict updated - 177 case chunks reset to embedded=0 and re-embedded with full payload — previous embed pass had stored empty payloads (root cause: original embed ran before case_name field existed; backfill via PUT wiped remaining fields) - backfill_case_chunk_names.py rewritten — runs on VPS, fetches D1 data via Worker API, hits Qdrant at localhost:6334 · original script failed: used external IP (port 6334 blocked) and npx subprocess (not on VPS) - Two-stage case chunk retrieval added to server.py — second Qdrant pass filtered to type=case_chunk, thres…



**[2026-03-19]** *Project state and priorities review* — score 6, assistant



> History confirms this is a known recurring issue — the Neill-Fraser retrieval failure has happened before and the root cause identified in session 5 was that `case_name` was missing from the Qdrant payload. That was fixed in session 5 (backfill + re-embed with full payload). But the query "what were the grounds of appeal in Neill-Fraser" doesn't contain a citation pattern or "v " — it just contains the name "Neill-Fraser".



**[2026-03-20]** *Side projects while waiting for scraper* — score 6, assistant



> > Read `Arc v 4/CLAUDE_arch.md` fully before making any changes. > > Make the following updates: > > **1. Update date header** to `20 March 2026 (end of session 9)` > > **2. Update RETRIEVAL ARCHITECTURE section** — add to the end: > ``` > **Session 9 changes:** > - Case chunk threshold: 0.15 → 0.35 (reduces noise from irrelevant case chunks) > - HCA added to COURT_HIERARCHY: tier 4 (above CCA/FullCourt tier 3) > - Dead Nexus route removed: handleLegalQueryQwen + legal-query-qwen router entry deleted from worker.js > ``` > > **3. Add new CORPUS PIPELINE section** after the retrieval architecture section: > ``` > ## CORPUS PIPELINE — SECONDARY SOURCES (v2, session 9) > > **Corpus damage confi…



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> Good. Retrieval is working perfectly — 6 relevant chunks, good scores, right cases. The problem is simply that your default threshold of 0.72 is too strict for this query. The top score here is 0.7129, which sits just below it.



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> Ollama can see `qwen3:4b` fine. The 404 is coming from inside the Docker container — `server.py` calls `http://ollama:11434/api/chat` via the Docker network, but the warm-up curl you ran earlier was hitting `localhost:11434` from outside the container, which worked. The issue is `/api/chat` vs `/api/generate` — let's check which endpoint Ollama 0.16.3 actually uses:



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> If that returns a response, then `server.py` is using the wrong endpoint. Ollama switched from `/api/generate` to `/api/chat` at some point — we need to confirm which one your version supports.



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> Note the `-H "Content-Type: application/json"` — your earlier successful test had it, the server.py call might be missing it internally. If that works from outside the container but fails from inside, the issue is the Docker network hostname `ollama` not resolving correctly from `agent-general`.



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> Both good — `/api/generate` works from outside, and `agent-general` can reach Ollama on the internal network. The issue is that `requests.post` in server.py isn't sending the `Content-Type: application/json` header. The `json=` parameter in requests should set it automatically, but something is off.



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> The legislation text in D1 `legislation_sections` is actually clean — the section parser in `handleUploadLegislation` normalises whitespace with `.replace(/\\s+/g, ' ').trim()`. So the D1 copy is fine. The problem is the Qdrant copy, which was ingested from the raw `doc_text` before that normalisation.



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> The fix is straightforward — in `handleUploadLegislation`, change the Qdrant ingest call to use the cleaned, joined section texts rather than the raw `doc_text`. That way Qdrant gets the same normalised text that D1 has.



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> The problem is clear now: the `.txt` file you uploaded still has the PDF column layout artifacts (hyphenated line breaks, scrambled word order from the original PDF conversion). The Worker fix sends `sections.map(...)` to Qdrant, but the section parser is itself reading from the same broken source text, so the sections in D1 may also be partially garbled.



**[2026-03-08]** *8 MAR 26* — score 5, assistant



> The function looks correct — the Qdrant filter logic is fine. So the issue is upstream: the Worker's `handleLibraryDelete` probably isn't calling the nexus `/delete` endpoint at all, or is calling it with the wrong citation value.



**[2026-03-09]** *Processing compiled notes into Arcanthyr database with * — score 5, assistant



> The fix is also clear: **make the nexus ingest call fire-and-forget.** The Worker doesn't need to wait for nexus to finish chunking and embedding before returning a response to the scraper. Save to D1, kick off nexus ingest in the background, return immediately. The scraper gets a clean HTTP 200, no timeout.



**[2026-03-10]** *Claude.md context and suggestions* — score 5, human



> Returned empty — 0 results above 0.5 threshold. The chunk ingested but the query embedding didn't match it above threshold. This is worth flagging to Claude.ai: Likely cause: pplx-embed-context-v1 uses a different vector space / dimensionality than nomic-embed-text. The collection `general-docs-v2` was auto-created on first ingest with the pplx vector dimensions, and the query embedding is also pplx — so it should be consistent. The issue is more likely the score threshold is too high for this model's similarity scale, or the model is producing cosine scores in a different range than nomic. Suggest retry with `score_threshold: 0.0` to see the raw score the chunk actually gets: Bash IN



**[2026-03-11]** *RAG workflow plan issues* — score 5, human



> explain this more "For the web console to work reliably from anywhere, the embed step needs to be decoupled from the upload entirely. The cleanest version is what's in your CLAUDE.md future roadmap — an `embedded` flag on each D1 row. The upload just writes to D1 and sets `embedded = 0`. A separate background process on the VPS polls D1 for rows where `embedded = 0`, embeds them in manageable batches, and updates the flag when done." so the worker collects the file uplaode from the console. takes it to CF and houses it in the DB. once it's done it then sends the data via the CF tunnel to the vps for embedding with pplx-embed (which is hosted on my VPS?) and then the vector data from the embe…



**[2026-03-11]** *Project state review and pipeline fixes* — score 5, assistant



> You're right that the decoupled pipeline mostly solves this — the new poller runs VPS-local, no tunnel for the heavy embed work, and the `embedded` flag means any failure is visible and retryable. But it's still worth building a reconciliation check, because failures can still happen (Qdrant hiccup, Ollama timeout, network blip). The flag only helps if something actually sets it back to 0 on failure.



**[2026-03-11]** *Project state review and pipeline fixes* — score 5, assistant



> > "In Worker.js, `handleFetchForEmbedding` is returning 500. The issue is `url.searchParams` — `url` is not in scope inside the function. Fix it the same way as `handleFetchUnenriched` — parse the URL from `request.url` inside the function: `const urlObj = new URL(request.url); const batch = Math.min(parseInt(urlObj.searchParams.get('batch') || '10'), 50);` Then deploy."



**[2026-03-11]** *Project state review and pipeline fixes* — score 5, human



> Both functions already use `urlObj = new URL(request.url)` — the fix is already there. The 500 on `handleFetchForEmbedding` must be something else. The most likely cause: `source_id` and `chunk_index` columns don't exist in `secondary_sources` — those aren't in the original schema and weren't added by `migrate_schema_v2.sql`. Want me to verify by tailing the Worker log and hitting the endpoint directly to capture the actual error message?



**[2026-03-11]** *Project state review and pipeline fixes* — score 5, human



> The fix is to drop those two columns from the SELECT and just return id, text, enriched_text:.." "Deployed (`e578d7d8`). Fixed `source_id`/`chunk_index` out of both queries — replaced with `id, title, raw_text` (unenriched) and `id, title, raw_text, enriched_text` (for-embedding), ordered by `id`. Want me to verify with a quick curl then commit?"



**[2026-03-11]** *Project state review and pipeline fixes* — score 5, assistant



> The sleep IS there. So the fix is in the file but it's still failing. The problem isn't timing — Qdrant is returning 200 but `result` is null or the structure is different.



**[2026-03-11]** *Project state review and pipeline fixes* — score 5, assistant



> Ollama is fine. The embedding is working. The problem is the upsert itself. Check what Qdrant actually returns when we upsert:



**[2026-03-11]** *Project state review and pipeline fixes* — score 5, assistant



> The fix is to use `wait=true` in the upsert call so Qdrant waits for the write to complete before returning:



**[2026-03-11]** *Project state review and pipeline fixes* — score 5, assistant



> Actually skip that — the 400 started exactly when we added `?wait=true`. The previous version without it returned `acknowledged` and didn't error. The issue is this Qdrant version doesn't support `wait` as a query param — it needs to be in the request body or uses a different syntax.



**[2026-03-11]** *11 MAR 26* — score 5, assistant



> The "pipeline too complex" criticism doesn't really hold for your use case. The 6-stage pipeline exists because CPU embedding on VPS is slow — you can't do it synchronously in a Worker response. The enrichment/embed separation is a direct consequence of that constraint, not architecture astronautics. Collapsing it into a "queue job" as suggested just moves the complexity into a queue system, which is more infrastructure, not less.



**[2026-03-11]** *11 MAR 26* — score 5, assistant



> The fix is straightforward — reset these rows to `embedded=0` and update the poller to fall back to `raw_text` when `enriched_text` is null.



**[2026-03-12]** *12/3/26* — score 5, assistant



> The issue is what gets *returned* to the LLM, not what the LLM does with it. Qdrant returns the top 6 chunks by vector similarity. If the s 38 procedure is spread across 8 raw paragraphs in the original Hogan text, you'd need all 8 to get a coherent answer, but you'll only get the 6 most similar vectors — and "most similar" doesn't mean "most complete." You'd get fragments, and even Claude can't reconstruct what it wasn't given.



**[2026-03-15]** *15/3/26* — score 5, human



> The problem: `case_name` is sent by the Worker at line 174, but `ingest_text()` never reads it — it's not in the `metadata` dict (lines 94-104) and not explicitly added to the payload. `case_name` is silently dropped before the Qdrant upsert. The fix is a one-liner in server.py: add `"case_name": body.get("case_name")` to the `metadata` dict.



**[2026-03-16]** *Debugging script without interrupting execution* — score 5, assistant



> Ollama container is up but the poller is hitting `localhost:11434` — the issue is that inside the `agent-general` container, `localhost` refers to that container, not the host. It needs to reach Ollama via the Docker network.



**[2026-03-16]** *Debugging script without interrupting execution* — score 5, assistant



> Network is fine — `agent-general` can reach Ollama and the `pplx-embed` model is there. So the issue is something else. The poller is hitting `localhost` instead of `ollama` despite the env var being set correctly.



**[2026-03-16]** *Debugging script without interrupting execution* — score 5, assistant



> Found the answer in history. The issue is clear — `qdrant-general` is mapped as `127.0.0.1:6334->6333/tcp` on the host, but inside the `agent-general` container it needs to be reached via the Docker service name, not `localhost`.



**[2026-03-16]** *Performance review* — score 5, assistant



> Ollama is up and was happily embedding — those logs are from the first poller run last night (11:01–11:09 UTC = the 50 chunks that completed). The issue is the poller is connecting to `localhost:11434` instead of `ollama:11434`.



**[2026-03-17]** *Open claw in the stack* — score 5, assistant



> **Option 2 — Local machine with GPU** A secondhand RTX 3090 is around $500-700 AUD currently. Install Ollama locally, run inference there, point your VPS stack at your home machine. The issue is always-on reliability and home internet upload speed.



**[2026-03-17]** *Performance review* — score 5, assistant



> The chunk exists in Qdrant but scored below 0.3 for this query. The problem is the query "elements of common assault Tasmania" isn't semantically matching the chunk text which starts with "Concepts: assault, apply force, attempt, threaten..."



**[2026-03-17]** *Performance review* — score 5, assistant



> The tendency evidence chunks are there and scoring 0.66 — well above threshold. The problem is the query phrasing.



**[2026-03-17]** *Performance review* — score 5, assistant



> The issue is `top_k` controls both the Qdrant query limit AND the return limit. We need to separate them — query Qdrant with `top_k`, but after the concept search merger allow up to a higher return limit.



**[2026-03-18]** *Project state and priorities review* — score 5, assistant



> The issue is likely the score threshold or the semantic similarity between "DNA secondary transfer" and the actual chunk text which uses more technical language. The chunks talk about "secondary transfer via the sole of a shoe", "specific set of circumstances", "biological fluid" etc.



**[2026-03-18]** *Project state and priorities review* — score 5, assistant



> The issue is the 2024 chunks are sitting at embedded=0 waiting for the poller. With TASSC 3 having 103 chunks and TASSC 8 having 164 chunks, that's a lot of embedding to get through at \~8 seconds per chunk.



**[2026-03-18]** *Reviewing Claude documentation files* — score 5, assistant



> D1 fetch worked fine (13 cases found). The problem is Qdrant port 6334 isn't exposed to the public internet — it's bound to `127.0.0.1:6334` on the VPS, localhost-only by design.



**[2026-03-18]** *Reviewing Claude documentation files* — score 5, assistant



> The issue is simple: Qdrant's host-side port (`6334`) is bound to `127.0.0.1:6334` on the VPS — meaning it only accepts connections from localhost on the VPS itself, not from the public internet. So the backfill script running on your Windows machine can't reach it directly.



**[2026-03-18]** *Reviewing Claude documentation files* — score 5, assistant



> 1. **Qdrant** — use `localhost:6334` ✓ (fixed by running on VPS) 2. **D1 fetch** — can't use `npx wrangler` on VPS — need to either hardcode the citation→case_name data, or fetch it via the Worker REST API instead of wrangler



**[2026-03-18]** *Reviewing Claude documentation files* — score 5, assistant



> The fix is a full re-embed pass for all 153 case chunks, which will upsert the correct payload via the now-corrected `enrichment_poller.py`. Since the poller uses deterministic UUIDs, re-embedding will hit the same point IDs and overwrite the payload correctly.



**[2026-03-18]** *Reviewing Claude documentation files* — score 5, assistant



> If that returns case chunks, the fix is the two-stage retrieval already in the roadmap — separate lower-threshold Qdrant pass filtered to `type=case_chunk`. If it still returns nothing, the chunks aren't being embedded with meaningful vectors.



**[2026-03-18]** *Reviewing Claude documentation files* — score 5, assistant



> This is the two-stage retrieval problem from the roadmap. The fix is a separate Qdrant pass filtered to `type=case_chunk` with a much lower threshold, bypassing the main semantic gate.



**[2026-03-18]** *What to do next* — score 5, assistant



> The fix is a cleanup script that strips the Word artifact patterns from `raw_text` in D1, then resets `embedded=0` on those rows so the poller re-embeds them with clean text.



**[2026-03-18]** *What to do next* — score 5, assistant



> **Context:** Arcanthyr is a Tasmanian criminal law research platform. Stack: Cloudflare Worker + D1 + Qdrant + VPS Docker (server.py + enrichment_poller.py). Cases are ingested via console upload or fetch-by-URL. Currently, when a case is uploaded the Worker handles everything inline: fetch HTML → strip text → call Workers AI (Qwen3-30b) for enrichment (summarizeCase — up to 6 sequential inference calls on large judgments) → save to D1 → return. This times out on large judgments because the Worker has a 30s wall-clock limit.



**[2026-03-19]** *Project state and priorities review* — score 5, assistant



> The issue is likely the embedding step — when server.py gets a query, it needs to embed it via Ollama first, and if pplx-embed model isn't loaded it may be silently failing. Check the agent-general logs for what happened when we ran the search:



**[2026-03-19]** *Project state and priorities review* — score 5, assistant



> The problem is the query embedding isn't matching the case chunk text semantically — "DNA evidence issues" is abstract, while the chunk text is dense factual prose about specific testimony. The 0.15 threshold second pass should be catching this but it's only returning chunk 0 (now deleted) and not the substantive chunks.



**[2026-03-19]** *Project state and priorities review* — score 5, assistant



> 152 chunks in Qdrant. They're there. The issue is the semantic search isn't scoring any of them above 0.15 for this query.



**[2026-03-19]** *Side projects while waiting for scraper* — score 5, assistant



> The fix is either: 1. Re-process the Master corpus blocks with a prompt that preserves the substantive doctrine, or 2. Ingest the raw Hogan on Crime text directly without AI processing — let the embedding capture the actual content



**[2026-03-20]** *Token limit exceeded in API request* — score 5, assistant



> Report both outputs. If the curl returns chunks, the problem is in the baseline script itself (wrong auth header or field name). If it returns 0 or errors, the problem is in server.py or Qdrant.



**[2026-03-20]** *Token limit exceeded in API request* — score 5, assistant



> **The fix design:** The chunk_text is already stored in D1 `case_chunks.chunk_text` and already in the Qdrant payload (confirmed session 10). So the embedding already uses the raw prose. The problem is specifically what the LLM *sees* when a case chunk is retrieved — it gets the extracted JSON principles, not the reasoning prose.



**[2026-03-20]** *Token limit exceeded in API request* — score 5, assistant



> The fix is simple: when the enrichment poller assembles the Qdrant payload for a case chunk, use `chunk_text` as the primary payload text, with `principles_json` as supplementary metadata. Not the other way around.



**[2026-03-20]** *Side projects while waiting for scraper* — score 5, assistant



> The core insight both consultants and I agree on: the problem is not retrievability, it's reasoning substance. The embedding model is fine. The retrieval pipeline is fine. The chunks are empty. Fix the chunks and everything downstream improves automatically.



**[2026-03-20]** *Side projects while waiting for scraper* — score 5, assistant



> From session 5 history — case chunks are embedded from `chunk_text` with `case_name` in the payload. So the vector captures the raw judgment text semantically. That part is fine. The problem is what the LLM gets as context.



**[2026-03-20]** *Side projects while waiting for scraper* — score 5, assistant



> The fix is live. All new case chunk embeds from this point forward will store up to 3,000 chars in the Qdrant payload instead of 1,000.



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 5, assistant



> **Fixed by this change:** - Thin/generic principles in Qdrant payloads — replaced by `enriched_text` prose synthesis - LLM at query time seeing boilerplate-heavy raw prose truncated at 3k chars — replaced by dense legal reasoning



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 5, assistant



> This pulls 10 random deep-enriched cases and shows the first 300 chars of `facts` and 200 chars of `issues`. Paste the output and we'll immediately see whether the problem is thin prompting, content moderation blocking (facts/issues will be NULL or near-empty), or genuinely good extraction that happens to produce thin Qdrant payloads downstream.



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 5, assistant



> - **CHUNK prompt v3 deployed** — replaced single-line IF/THEN extraction prompt with 6-type classification engine (reasoning/evidence/submissions/procedural/header/mixed) · enriched_text field added as primary output (200-350 word prose synthesis for reasoning chunks, honest description for others) · reasoning_quotes field extracts verbatim judicial passages · subject_matter classification added · principles now stated in judge's own doctrinal terms not IF/THEN abstraction · why: old prompt produced same generic principle across 4-5 chunks of same case, hallucinated principles from transcript/header chunks, and output never reached LLM at query time since only raw chunk_text was embedded -…



**[2026-03-22]** *Checking ingest status* — score 5, assistant



> If Ollama is responsive, the issue is the chunk content itself — likely oversized text hitting the embedding model's token limit. We'd fix it by truncating the payload before sending to Ollama in `enrichment_poller.py`.



**[2026-03-22]** *Checking ingest status* — score 5, assistant



> Ollama is healthy. The issue is the chunk content itself. Pull the raw text from D1 to see what we're dealing with:



**[2026-03-22]** *Checking ingest status* — score 5, assistant



> These two chunks have unusually large `raw_text` values (15k and 26k chars) compared to the typical corpus chunk (\~3,000–5,000 chars). The session 9 payload truncation fix (`[:5000]`) was applied to the **Qdrant payload preview** (what gets stored as metadata) but the actual text passed to `get_embedding()` was never truncated — it always sent the full `raw_text` to Ollama. For 1,169 chunks this didn't matter because they were short enough to embed within the 30s timeout. These two were long enough to blow it.



**[2026-03-05]** *5 Mar 26* — score 4, assistant



> For context documents, the right architecture is not extraction at all. It's **chunked vector storage**. You upload the document, it gets split into chunks of \~500-800 tokens each, each chunk gets embedded by nomic-embed-text and stored in Qdrant with metadata tags (source title, page range, topic tags). When you later ask Qwen3 a question, the relevant chunks are retrieved by semantic similarity and injected as context. The 900-page document never needs to be read in full — only the relevant pieces surface when needed.



**[2026-03-05]** *5 Mar 26* — score 4, assistant



> My honest recommendation: for that specific 900-page document, chunked vector storage is the right answer because manual retrieval of relevant sections from 900 pages isn't practical. For shorter secondary sources (a journal article, a 20-page commentary), the tag-and-store approach is fine.



**[2026-03-05]** *5 Mar 26* — score 4, assistant



> Before we start building the document type architecture, do you want to do a quick Qdrant back-fill of the existing \~100 cases first? It would mean your cases are searchable semantically from the moment the new interface is ready, rather than having an empty vector store when you launch the new features.



**[2026-03-05]** *5 Mar 26* — score 4, human



> "Before we start building the document type architecture, do you want to do a quick Qdrant back-fill of the existing \~100 cases first? It would mean your cases are searchable semantically from the moment the new interface is ready, rather than having an empty vector store when you launch the new features." can we do this just for a test phase? we can always delete this wipe the whole db and start fresh when we know all the bugs are sorted?



**[2026-03-07]** *7 MAR 26* — score 4, assistant



> 1. **`/query` endpoint in server.py** — accepts `query_text` + `model` toggle, runs the search, then calls Qwen3 via Ollama instead of forwarding to the Worker for Claude 2. **`handleLegalQueryQwen` in Worker.js** — mirrors `handleLegalQuery` exactly but calls nexus `/query` instead of Anthropic API 3. **Route registration** — add `legal-query-qwen` to the legal router in the main fetch handler 4. **Toggle in search.html** — we'll do that after the backend is working (need to see search.html first, but backend first)



**[2026-03-07]** *7 MAR 26* — score 4, assistant



> The tradeoff is that D1 is only accessible from the CF Worker, not directly from the VPS. So the VPS could handle Qdrant ingestion directly, but D1 writes would still need to go through the Worker.



**[2026-03-07]** *7 MAR 26* — score 4, assistant



> A smarter routing layer would detect "s.XX [Act name]" patterns and route to `section-lookup` directly, bypassing Qdrant entirely. That's a meaningful improvement worth adding — the answer would always be authoritative text straight from D1 rather than a semantically-retrieved chunk.



**[2026-03-07]** *7 MAR 26* — score 4, assistant



> Known remaining issues to pick up next time: the two-column garbling in some Evidence Act sections (PDF limitation — AustLII HTML would fix it), and the Qdrant vectors for the Evidence Act still need a delete/re-ingest to get the clean text in there (we fixed D1 but Qdrant still has the old chunks). Worth doing that next session before resuming the scraper.



**[2026-03-08]** *8 MAR 26* — score 4, assistant



> Text quality looks good — readable, coherent sections, no garbling. But I notice `total_chunks` is showing 7 and 8 on these results, which means the 98 vectors are spread across multiple smaller sub-documents rather than one contiguous 98-chunk document. That's the batching working as expected — each batch of 20 sections got chunked separately by the nexus.



**[2026-03-10]** *Claude.md context and suggestions* — score 4, human



> The model blob (`f356b089ada0`) and manifest are both present on the host. The container volume is at `\~/ai-stack/ollama-data`. The approach is to copy the relevant blob and manifest into that volume. Let me check the container volume path: Bash IN



**[2026-03-10]** *Claude.md context and suggestions* — score 4, assistant



> The honest answer is: **we can't properly calibrate on one test chunk**. The right approach is to re-ingest the 5 Acts first (real data, known content), run a set of test queries against them, see what scores good and bad matches produce, then set the threshold accordingly.



**[2026-03-10]** *Claude.md context and suggestions* — score 4, assistant



> No change to the upload pipeline at all. The legislation upload goes through `handleUploadLegislation` in Worker.js → nexus `/ingest` → Ollama embed → Qdrant. The only thing that changed is which Ollama model sits at the embed step. Same chunking, same batching, same 20 sections/request logic. The Criminal Code multi-part upload architecture is unaffected.



**[2026-03-11]** *RAG workflow plan issues* — score 4, assistant



> That's actually what the Phase 5 design was gesturing at with "Claude API first, then Qwen3 comparison" — testing whether a cheaper/free model is sufficient before defaulting to paid. Worth doing that evaluation properly once the corpus is actually in Qdrant.



**[2026-03-11]** *RAG workflow plan issues* — score 4, assistant



> The SSH tunnel fix bypasses step 3 entirely — `ingest_corpus.py` calls nexus directly on localhost rather than going Worker → Cloudflare Tunnel → nexus. D1 already has the data so you don't need to touch the Worker at all. You're just completing step 4 for the 657 rows that are already sitting in D1 waiting to be embedded.



**[2026-03-11]** *RAG workflow plan issues* — score 4, assistant



> **Option C — Modify the Worker to do batch embedding** Instead of fire-and-forgetting per chunk, collect all chunks and make one nexus call with the full batch. One tunnel request, nexus handles the loop internally.



**[2026-03-11]** *Project state review and pipeline fixes* — score 4, human



> tom@vmi3098054:\~/ai-stack/agent-general/src$ tail -20 embed.log 2026-03-11 04:13:43,724 [WARNING] [EMBED] ⚠ Upsert returned ok but point not found in Qdrant — will retry next pass 2026-03-11 04:13:43,724 [INFO] [EMBED] 32/50 chunk_id=Criminal Code Act 1924 (Tas) s 310(4) 2026-03-11 04:13:43,851 [WARNING] [EMBED] ⚠ Upsert returned ok but point not found in Qdrant — will retry next pass 2026-03-11 04:13:43,851 [INFO] [EMBED] 33/50 chunk_id=Criminal Code Act 1924 (Tas) s 311 2026-03-11 04:13:43,987 [WARNING] [EMBED] ⚠ Upsert returned ok but point not found in Qdrant — will retry next pass 2026-03-11 04:13:43,987 [INFO] [EMBED] 34/50 chunk_id=Criminal Code Act 1924 (Tas) s 342 2026-03-11 0…



**[2026-03-11]** *Project state review and pipeline fixes* — score 4, human



> tom@vmi3098054:\~/ai-stack/agent-general/src$ sleep 5 \&\& tail -20 embed.log 2026-03-11 04:16:48,633 [WARNING] [EMBED] ⚠ Upsert returned ok but point not found in Qdrant — will retry next pass 2026-03-11 04:16:48,633 [INFO] [EMBED] 22/50 chunk_id=Criminal Code Act 1924 (Tas) s 250-4 2026-03-11 04:16:49,271 [WARNING] [EMBED] ⚠ Upsert returned ok but point not found in Qdrant — will retry next pass 2026-03-11 04:16:49,271 [INFO] [EMBED] 23/50 chunk_id=Criminal Code Act 1924 (Tas) s 252A 2026-03-11 04:16:49,911 [WARNING] [EMBED] ⚠ Upsert returned ok but point not found in Qdrant — will retry next pass 2026-03-11 04:16:49,911 [INFO] [EMBED] 24/50 chunk_id=Criminal Code Act 1924 (Tas) s 267 2…



**[2026-03-11]** *Project state review and pipeline fixes* — score 4, assistant



> Key things captured that weren't in the old version: - Pipeline v2 data flow and all poller commands - Qdrant upsert async behaviour and `?wait=true` gotcha - All 7 pipeline Worker routes documented - D1 schema current state - Correct priorities including legislation re-upload as Priority 2 - ingest_corpus.py revert flagged prominently - SCP command for updating poller on VPS



**[2026-03-11]** *11 MAR 26* — score 4, human



> tom@vmi3098054:\~$ while true; do python3 \~/ai-stack/agent-general/src/enrichment_poller.py --mode embed --batch 100 sleep 2 done 2026-03-11 08:36:47,970 [INFO] [EMBED] Fetching up to 100 chunks ready for embedding... 2026-03-11 08:36:48,424 [INFO] [EMBED] Got 50 chunks to embed. 2026-03-11 08:36:48,425 [INFO] [EMBED] 1/50 chunk_id=Criminal Rules 2006 (Tas) r 41A 2026-03-11 08:36:52,067 [WARNING] [EMBED] ⚠ Point not found after 3 verify attempts — leaving embedded=0 for retry 2026-03-11 08:36:52,067 [INFO] [EMBED] 2/50 chunk_id=Domestic Violence Orders (National Recognition) Act 2016 2026-03-11 08:36:55,710 [WARNING] [EMBED] ⚠ Point not found after 3 verify attempts — leaving embedded…



**[2026-03-11]** *11 MAR 26* — score 4, assistant



> The original design was Option 2 — the whole point of the enrichment pipeline was to prepend contextual metadata (citation, court, year, summary, outcome) to each chunk before embedding, so the vectors carry richer semantic context than raw text alone. That's what "Contextual Retrieval" meant in the early architecture notes.



**[2026-03-14]** *12/3/26* — score 4, assistant



> **secondary_sources (711 chunks):** - Pre-enriched via ChatGPT Master Prompt before upload — raw_text IS the content - enriched_text NULL across all rows — correct, do NOT run `--mode enrich` - All 244 original CITATION IDs were unique after collision fix (was 196 unique, 48 dropped) - 711 rows after re-ingest (splitter produces more granular chunks than citation count suggests) - `category` column populated: all current rows = `doctrine` - Embed pass in progress as of 14 Mar 2026 — expected final Qdrant count: \~1984



**[2026-03-14]** *14/3/26* — score 4, assistant



> **Already in CLAUDE.md ✅** - Enrichment model by content type table — correct, matches the architecture described - LLM metadata extraction before scraper resumes (Priority 4) - Schema versioning (embedding_model / embedding_version) — Priority 3 - Legislation enrichment — in future roadmap, deferred until cross-reference agent design is clearer - Auto-populate legislation metadata on upload — in future roadmap - Cross-reference agent — in future roadmap



**[2026-03-15]** *15/3/26* — score 4, assistant



> - The pipeline consistently uses idempotent operations rather than flags (`embedded=0/1` is the only state tracking, Qdrant uses PUT upsert, legislation uses `INSERT OR IGNORE`) - Adding a `xref_processed` flag would require a schema migration and adds complexity with no real benefit - The hashed ID approach is the same pattern already used across the stack



**[2026-03-15]** *Automating Hogan crime block reformatting workflow* — score 4, assistant



> > Do the following steps in order and report the result of each: > 1. SSH to `tom@31.220.86.192` and run `docker exec agent-general env | grep NEXUS_SECRET_KEY` — capture the exact key value from the live container > 2. Get the Qdrant point count before deletion: SSH and run `curl -s http://localhost:6334/collections/general-docs-v2` — extract `points_count` from the response > 3. Restart agent-general: SSH and run `cd \~/ai-stack \&\& docker compose restart agent-general`, then wait 5 seconds > 4. Confirm health: SSH and run `curl -s http://localhost:18789/health` > 5. Run the delete using the key captured in step 1: SSH and run `curl -s -X POST http://localhost:18789/delete-by-type -H "Conten…



**[2026-03-16]** *UI changes and ingest page updates* — score 4, assistant



> More importantly, your instinct about retrieval time is correct and is actually the better approach architecturally. The legislation sections are already in Qdrant as clean statutory text. When a query hits a relevant section, Claude (or Workers AI) receives the raw section text as context and can explain, analyse, and extract elements right there in the response. That's exactly what the Phase 5 design is supposed to do — the AI does the interpretive work at query time, not at ingest time.



**[2026-03-16]** *UI changes and ingest page updates* — score 4, assistant



> So manual cases bypass the enrichment poller entirely — they're enriched at upload time by Workers AI Llama, not by Claude API, and embedded inline via the nexus call rather than via the background embed pass.



**[2026-03-16]** *UI changes and ingest page updates* — score 4, assistant



> The scraper architecture is sound. Stick with Llama for bulk case ingestion. Check the embedder — should be nearly done.



**[2026-03-16]** *Performance review* — score 4, assistant



> Workers AI made sense early when the VPS was less capable and the architecture was simpler. Now the VPS is running a full nexus with server.py — adding a `/extract-metadata` route that calls Ollama internally is a natural extension of what already exists. It keeps everything on infrastructure you control, has no daily neuron budget, and Qwen3:4b is a better model than Llama 3.1 8B for structured extraction.



**[2026-03-17]** *Open claw in the stack* — score 4, assistant



> It's NVIDIA packaging their own local models (Nemotron) plus a secure sandbox runtime (OpenShell) specifically for OpenClaw. So instead of you manually setting up Ollama and choosing a model, NemoClaw does it in one command and adds:



**[2026-03-18]** *Reviewing Claude documentation files* — score 4, assistant



> - Location: `arcanthyr-console\\backfill_case_chunk_names.py` (local) + `/home/tom/backfill_case_chunk_names.py` (VPS) - Run from VPS only — fetches cases via Worker API (https://arcanthyr.com/api/legal/library?type=cases), updates Qdrant at localhost:6334 - Field mapping: `result.cases[].ref` → citation, `result.cases[].title` → case_name - Re-run after any bulk case ingestion to backfill case_name into existing Qdrant payloads - Do NOT run from Windows — Qdrant port 6334 is localhost-only on VPS ```



**[2026-03-19]** *Project state and priorities review* — score 4, human



> tom@vmi3098054:\~$ # SSH/VPS# SSH/VPS grep -n "case-chunks-for-embedding\\|case_chunks\\|CASE-EMBED" \~/ai-stack/agent-general/src/enrichment_poller.py | head -30 741: Fetch up to `batch` case_chunks where done=1 and embedded=0, 744: log.info(f'[CASE-EMBED] Fetching up to {batch} case chunks ready for embedding...') 746: f'{WORKER_URL}/api/pipeline/fetch-case-chunks-for-embedding', 755: log.info('[CASE-EMBED] No case chunks ready for embedding.') 758: log.info(f'[CASE-EMBED] Got {len(chunks)} chunks to embed.') 775: log.info(f'[CASE-EMBED] {i}/{len(chunks)} chunk_id={chunk_id}') 790: log.info(f'[CASE-EMBED] ✓ Embedded and verified') 793:…



**[2026-03-20]** *Fix pilot issues first* — score 4, assistant



> - **Embedding backlog** — 1,669 case chunks unembedded as of session 10 end · poller running overnight · check first thing next session - **process_blocks.py overnight run** — check failed blocks summary · stale 32000 error in summary is from prior failed run, not current - **CHUNK prompt reasoning field** — added and reverted session 10 · chunk_text already in Qdrant payload, reasoning field not needed · do not re-add - **master_corpus_part2.md committed to git** — partial pilot output accidentally committed · harmless, will be overwritten by overnight run - **Qwen3 /query endpoint timeout** — server.py Qwen3 inference times out when scraper hammering Ollama · not a problem for UI (uses Cla…



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 4, assistant



> **My recommendation: Option A.** It requires one schema addition (`enriched_text TEXT` on `case_chunks`), a prompt rewrite in worker.js CHUNK handler, and a one-off re-embed of existing 2,607 chunks. The poller already handles `case_chunk` embed pass — we'd just need to point it at `enriched_text` instead of `chunk_text` for the vector payload.



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 4, assistant



> **3. `enriched_text` is the primary output for embedding.** All three agree on this. Critically, v2 adds the recommendation to embed a combined string rather than `enriched_text` alone — case citation + subject matter + chunk type + issues + enriched_text + authorities + legislation. This is worth taking seriously given how pplx-embed-context-v1 works (it's a context-aware model — richer input = better vectors).



**[2026-03-23]** *What's next?* — score 4, assistant



> A `CLAUDE_decisions.md` — a dedicated log of architectural decisions and why they were made. Things like "why Qdrant over Weaviate", "why GPT-4o-mini over Workers AI for enrichment", "why D1 over Postgres". Your change logs capture some of this but a dedicated ADR (Architecture Decision Record) file would make it scannable.



## Retrieval Architecture



**[2026-03-17]** *Embed pass completion and Parsons ingestion tracking* — score 6, assistant



> We've done a lot today that needs capturing: - Confirmed procedure pass completed 15 March - Identified procedure chunks never ingested - Fixed `ingest_corpus.py` (PROCEDURE_ONLY flag, citation suffix, section-aware splitting) - Confirmed destructive upsert behaviour of `upload-corpus` - Auth and field name gotchas for server.py added - Retrieval baseline results (6 pass, 3 partial, 6 fail) with root cause analysis



**[2026-03-19]** *Project state and priorities review* — score 6, assistant



> History is very clear on this — it's a known, persistent problem. The Neill-Fraser DNA secondary transfer content has never reliably surfaced via semantic search. The root cause identified in the session 4/5 chat is:



**[2026-03-19]** *Side projects while waiting for scraper* — score 6, assistant



> What you described — "an intelligence with access to all the information in the DB" — is not how RAG works. The LLM never sees the database. It only ever sees the 6-10 chunks that retrieval decided to pass it. If retrieval picks the wrong chunks, the LLM has nothing to work with regardless of how much is in the corpus.



**[2026-03-11]** *RAG workflow plan issues* — score 5, assistant



> **Metadata enrichment** — this is the hard one and you're right that it needs Claude-level intelligence. The reason is that it's not just formatting — it's *understanding* the legal content well enough to correctly classify type, extract concepts, isolate rules, identify case authorities, and write a concept anchor sentence. A smaller model will produce inconsistent, lower quality metadata which then degrades retrieval quality for everything downstream. The quality of this step determines the quality of every search result forever. Cutting corners here is a false economy.



**[2026-03-18]** *What to do next* — score 5, assistant



> The "No response from model" in the console is a different issue — the retrieval layer is fine, the problem is in the response generation step. Likely the Claude API call is failing or timing out in the Worker.



**[2026-03-18]** *What to do next* — score 5, assistant



> Retrieval is excellent — 23 chunks, great sources. The problem is Workers AI is returning "No response from model." — the Llama inference call is failing silently.



**[2026-03-19]** *Project state and priorities review* — score 5, assistant



> So the case chunk retrieval is working correctly. The problem is the LLM is saying "no information found" despite getting 4 chunks. Either the 4 chunks don't contain grounds of appeal content, or the LLM prompt is being too conservative.



**[2026-03-19]** *Project state and priorities review* — score 5, assistant



> The problem is the LLM. It's receiving these chunks but then saying "no information found" — which means the issue is in the prompt or how the Worker is assembling context, not in retrieval.



**[2026-03-20]** *Side projects while waiting for scraper* — score 5, assistant



> Clear picture. The problem is exactly what Consultant 1 identified — the prompt extracts structured JSON metadata but the `chunk_text` itself is never stored in enriched form. The LLM reads the raw judgment text, outputs principles/holdings as JSON, and the raw text is discarded. No reasoning prose survives into the retrieval layer.



**[2026-03-10]** *Claude.md context and suggestions* — score 4, assistant



> **My recommendation:** migrate now, before Hogan on Crime goes in. Run the 0.6B variant first (fits comfortably in your VPS RAM alongside everything else), validate retrieval quality, then decide if the 4B is worth the memory trade-off. Want to map out the migration steps?



**[2026-03-14]** *12/3/26* — score 4, assistant



> - **Hogan on Crime procedural re-processing** — re-run blocks 027, 020, 008, 024, 021, 007 through Procedure Prompt, upload procedure chunks via console. Full book re-processing only if retrieval testing reveals material gap. - **Automated ingestion pipeline** — drag-and-drop in console → Claude API enrichment/splitting → embed. For smaller documents. Larger docs (Hogan on Crime scale) stay on manual ChatGPT pipeline. - **Legislation enrichment via Claude API** — plain English summaries, cross-references, key concepts. After cross-reference agent design is clear. - **Cross-reference agent** — nightly cron, citation graph in D1. - **Auto-populate legislation metadata on upload** — Claude API…



**[2026-03-14]** *14/3/26* — score 4, assistant



> **Deferred items:** - The agent itself is cron/VPS work — build after retrieval quality is validated - Legislation enrichment prompt — write after this design is confirmed



**[2026-03-15]** *Automating Hogan crime block reformatting workflow* — score 4, assistant



> **The retrieval testing approach is simpler for now though** — run your known practitioner queries, see what comes back, identify gaps. That's functionally equivalent to validation for your purposes and tells you what actually matters: whether the system returns useful results.



**[2026-03-18]** *Project state and priorities review* — score 4, assistant



> **CLAUDE_arch.md:** - Poller invocation section rewritten — tmux send-keys pattern explicitly flagged as DO NOT USE, manual attach process documented - Scraper config updated — gate cleared, progress file details, timeout note - ingest_corpus.py notes — block separator format, Python-only file creation warning, example snippet added - master_corpus total updated to 2,032 - Retrieval baseline table updated — all 15 passing - Session 4 UI changes section added - sentencing_first_offenders.md and debug_parse.py added to file locations - TASSC 2024 scraper timeouts added to known issues - tmux send-keys anti-pattern added to known issues



**[2026-03-18]** *What to do next* — score 4, assistant



> **CLAUDE_arch.md:** - New ASYNC JOB PATTERN section with full design decision, rejected alternatives, and build spec - Workers AI section updated — Qwen3 confirmed as current model, procedurePassPrompt validated - Qwen3 response shape fix documented - cases D1 schema notes added - Word artifact cleanup section added - scripts/ directory inventory added - Scraper config updated — Qwen3-30b replacing Llama reference - Retrieval baseline table updated with 18 Mar 2026 status - Known issues updated throughout



**[2026-03-19]** *Project state and priorities review* — score 4, assistant



> 1. **Accept it as a legacy data quality issue** — Neill-Fraser was ingested before the boilerplate stripper existed 2. **Add Neill-Fraser reingest to the roadmap** — delete and re-upload via the console to get clean chunks 3. **Move on** — the retrieval architecture is working correctly for clean data (confirmed by the 15/15 baseline)



## FTS5 / BM25 / RRF



**[2026-03-22]** *Reviewing recent conversation highlights* — score 11, assistant



> The root cause is the FTS5 insert in `handleUploadCorpus` has no `ON CONFLICT` clause. The fix is a one-line change in `worker.js`. Instead of:



**[2026-03-22]** *Checking ingest status* — score 11, assistant



> 1. **Embed pass confirmed complete** — 1,171/1,171 secondary source chunks embedded 2. **Two stuck chunks fixed** — `hoc-b042` and `hoc-b045` (15k/26k chars) were timing out at 30s · root cause: GPT-4o-mini enrichment expanded `raw_text` beyond timeout threshold · fix: raise `get_embedding()` timeout 30s→120s + large input warning log >8000 chars · re-embedded at full text after Qdrant point deletion + `embedded=0` reset 3. **FTS5 backfill complete** — `secondary_sources_fts` wiped and repopulated · 1,171 rows · all three retrieval passes now operational 4. **Retrieval baseline rerun** — estimated 14 pass / 3 partial / 0 fail · improvement over 12/4/1 5. **BRD doctrine chunk ingested** — `ho…



**[2026-03-20]** *Token limit exceeded in API request* — score 10, assistant



> **Revised diagnosis:** the issue is narrower than originally thought. It's not that case chunks are being displaced — it's that BM25 section reference matching is too broad, pulling in every "s38" hit regardless of relevance. The fix is tightening the section reference extraction to require word boundaries or more specific patterns.



**[2026-03-17]** *Successful data chunk processing* — score 9, assistant



> - **`execute_backfill.py`** — never written. First mentioned as a new item this session. No prior implementation found. - **Category normalisation SQL** — discussed and flagged multiple times but the actual UPDATE statements were never drafted. Just kept being deferred. - **Char-based windowing fix** — the problem is well documented (`fullText[8000:28000]` in `summarizeCase()`), and the design was discussed (overlapping scored windows, Qwen3 upgrade), but no actual fix was written. Deferred pending scraper unpause.



**[2026-03-20]** *Token limit exceeded in API request* — score 6, assistant



> **But here's the key finding — the answer is still good.** The LLM is correctly synthesising from the right chunks despite the noisy source list. So the RRF displacement is a sources display problem more than an answer quality problem.



**[2026-03-22]** *Reviewing recent conversation highlights* — score 6, assistant



> The FTS5 table needs to be wiped every time before a re-ingest. This is the same root cause — the FTS insert has no ON CONFLICT clause so it fails on any citation that already has an FTS row. The proper fix is to add `INSERT OR REPLACE` to that FTS insert in worker.js, but let's get the corpus in first.



**[2026-03-17]** *Performance review* — score 5, assistant



> **Tendency/propensity (Q7, Q8, Q13)** — the doctrine chunks ARE in the corpus. This is a semantic scoring problem, not a corpus gap. The fix is BM25 improvement — these queries don't contain section references so BM25 doesn't trigger. Adding keyword-based pre-retrieval on legal concepts (not just section numbers) would surface these chunks.



**[2026-03-20]** *Reviewing recent conversation highlights* — score 5, assistant



> The fix is to check whether the FTS5 table and its trigger still exist and are healthy. **PowerShell, `Arc v 4\\`:**



**[2026-03-22]** *Reviewing recent conversation highlights* — score 5, assistant



> Back to 500s — the FTS5 table is conflicting again because the first ingest run already populated it. The same problem as before: existing FTS5 rows, no ON CONFLICT clause.



**[2026-03-12]** *11 MAR 26* — score 4, assistant



> Key things captured: corpus raw_text re-embedding, BM25 live, enrichment model clarification (Workers AI for scraper, not poller), chunk ID collision warning, procedure chunk type roadmap, correct priorities order, SCP commands for server.py.



**[2026-03-15]** *15/3/26* — score 4, assistant



> The architecture was also confirmed in that session: - `case_citations` and `case_legislation_refs` tables as per the CLAUDE.md spec - Nightly cron, feeds BM25 and the stare decisis layer - Legislation enrichment prompt deferred until this design is confirmed (which we're now doing)



**[2026-03-15]** *15/3/26* — score 4, assistant



> Note: with only 8 cases currently the practical impact is minimal — but the architecture is live and will compound as the scraper runs. The `bm25_source: "case_legislation_ref"` marker also lets you distinguish in logs which BM25 path fired.



**[2026-03-15]** *15/3/26* — score 4, assistant



> - **authorities_extracted vs key_authorities** — D1 column is `authorities_extracted`. `key_authorities` is the Llama prompt field name only — does NOT exist as a D1 column. Do not use `key_authorities` in any Worker or agent query. - **case_name missing from Qdrant for existing 8 cases** — fix applied to server.py 15 Mar 2026 but only affects future ingests. Existing vectors show citation-only in LLM context. Backfill requires reingest-case route — deferred until scraper has run at volume. - **Unknown chunk in sources panel** — one semantic result with score 0.678 displaying as `unknown Unknown`. Pre-existing corpus chunk with incomplete metadata. Not related to xref or BM25 changes. - **Ll…



**[2026-03-16]** *Performance review* — score 4, assistant



> Replace the fixed character slice with a heading-boundary split — the same logic already implemented in `split_legal_doc.py`. That script identifies structural headings in judgments (REASONS, JUDGMENT, FINDINGS, ORDERS etc.) and splits on those boundaries. Applied to the scraper, instead of `fullText[8000:28000]` the Worker would:



**[2026-03-18]** *Project state and priorities review* — score 4, human



> i will give you some thoughts from 3 soureces to asit in your considerations: 3) "Good prompt — covers the constraints clearly and frames the tradeoffs well. A few things worth knowing before you drop it: D1 FTS5 — as of early 2026 Cloudflare D1 does support SQLite FTS5 (it was added in late 2023). `CREATE VIRTUAL TABLE` works via `wrangler d1 execute`. The main gotcha is that FTS5 tables can't be queried via standard D1 prepared statements with `?` placeholders for the FTS match expression — you have to string-interpolate the query, which means sanitising input on the Worker side. One thing missing from the prompt — the current BM25 "hack" already targets section references specifically (e.…



**[2026-03-18]** *What to do next* — score 4, assistant



> **Quick wins** - Write the Q5 Vallance BM25 fix — the chunk exists, it's just not surfacing. We can review the BM25 concept keywords in server.py and add `recklessness` / `Vallance` / `fault element` to the concept map - Draft the RAG workflow doc update (CLAUDE.md flags this) — two-run ingest sequence, PROCEDURE_ONLY flag, destructive upsert warning, updated chunk counts



**[2026-03-18]** *What to do next* — score 4, human



> A few things that don't need the embed pass to finish: Quick wins * Write the Q5 Vallance BM25 fix — the chunk exists, it's just not surfacing. We can review the BM25 concept keywords in server.py and add `recklessness` / `Vallance` / `fault element` to the concept map * Draft the RAG workflow doc update (CLAUDE.md flags this) — two-run ingest sequence, PROCEDURE_ONLY flag, destructive upsert warning, updated chunk counts Planning * Design the async job pattern on paper — Worker receives upload, posts to VPS, gets job ID back, frontend polls `/api/legal/job-status/:id`. Talk through the architecture before building it * Procedure Prompt second pass in `summarizeCase()` — spec out what needs…



**[2026-03-22]** *Checking ingest status* — score 4, assistant



> History confirms the wipe-then-reinsert approach is correct and has been done before safely (session 12 wiped FTS5 before re-ingest). The `DELETE FROM secondary_sources_fts` is a standard operation — used at line 1312 in worker.js for the delete route handler, and executed directly via wrangler in session 12.



## Cloudflare Worker \& D1



**[2026-03-17]** *Section 95 tendency and coincidence evidence test* — score 9, assistant



> The problem is we can't query D1 directly from Python without going through the Worker. Easiest approach is a set of wrangler commands we run in sequence as a checklist.



**[2026-03-04]** *4 MAR 26* — score 6, assistant



> But we need to fix the asset exposure permanently. The real solution here is to stop using `directory = "."` in `wrangler.toml` — pointing at your entire project root is the root cause of all of this.



**[2026-03-07]** *7 MAR 26* — score 6, assistant



> An `.oxps` file won't work directly — that's an OpenXPS document format which the Worker has no handler for. You need plain text.



**[2026-03-16]** *Performance review* — score 6, human



> Here is the complete inventory. Note one discrepancy from what's in CLAUDE_arch.md: `callWorkersAI` helper (line 31) — model: `@cf/meta/llama-3.1-8b-instruct` All calls through this helper use the same model. There is no `llama-3.2-3b-instruct` anywhere in the file — CLAUDE_arch.md had that wrong. #FunctionLineModelWhat it does1`summarizeCase()`289`llama-3.1-8b-instruct` (via helper)Single-pass: extracts facts, issues, holding, principles, legislation, offences as JSON from short cases2`summarizeCase()`304`llama-3.1-8b-instruct` (via helper)Two-pass pass 1: extracts facts, issues, case_name from opening section of long cases3`summarizeCase()`311`llama-3.1-8b-instruct` (via helper)Two-pass pa…



**[2026-03-18]** *Sync issue troubleshooting* — score 6, human



> Key finding: `callWorkersAI` already extracts `content` from `choices[0].message.content` at line 71, with fallbacks to `choices[0].text` and `result.response`. It does not check `reasoning_content`. The fix for `reasoning_content` belongs inside `callWorkersAI` itself — if `content` is null/empty, fall through to `reasoning_content` before the other fallbacks. That way all callers benefit, not just the METADATA pass. Change 2 should be made in `callWorkersAI`, not in the METADATA branch. Confirm you want me to apply it there, then I'll make both changes together. Now finding the METADATA pass1 call for Change 1 to confirm current token value: Grep "callWorkersAI.*pass1System.*800" (in c:\\Us…



**[2026-03-02]** *Case name extraction and console processing* — score 5, assistant



> Good — D1 wipe worked, clean slate with just 5 new cases so far, all dated `2024-01-01` correctly. The fix is working.



**[2026-03-04]** *4 MAR 26* — score 5, assistant



> So `.env` and `.wrangler` are both in `.gitignore` correctly — Git has never committed them. The problem is purely Wrangler's static asset upload ignoring `.gitignore`.



**[2026-03-04]** *4 MAR 26* — score 5, assistant



> The fix is to create a `public` subfolder, move only the frontend files into it, and point Wrangler there. Here's exactly what goes where:



**[2026-03-05]** *5 Mar 26* — score 5, assistant



> Quick fix — find this in the new Worker.js and check the issues handling. The problem is in `saveCaseToDb` where `summary.issues` is being passed directly. Let me look at what's happening:



**[2026-03-05]** *5 Mar 26* — score 5, assistant



> Worker is already deployed though so the fix is live — go ahead and re-upload the Evidence Act now while you sort the git sync.



**[2026-03-08]** *Secondary sources prompt development* — score 5, assistant



> That'll tell us whether the issue is in the upload flow itself or in how the Worker handles the batching.



**[2026-03-11]** *Project state review and pipeline fixes* — score 5, assistant



> Account looks fine. The issue is wrangler needs to be run from the `Arc v 4` directory where `wrangler.toml` lives:



**[2026-03-14]** *14/3/26* — score 5, assistant



> Llama is extracting judge and parties correctly — the issue was just that the script wasn't displaying them because it wasn't reading the response fields properly. The data is landing in D1 correctly via the UPDATE.



**[2026-03-16]** *UI changes and ingest page updates* — score 5, assistant



> Test approach: grab 5 judgments manually — 2 short Magistrates decisions, 2 long Supreme Court judgments, 1 TASCCA appeal — run them through the current Worker and inspect the D1 output for missing holdings or truncated legislation lists. That tells you exactly how bad the problem is before you fix it.



**[2026-03-17]** *Successful data chunk processing* — score 5, assistant



> If it returns something in the playground, the model works and the issue is in how the Worker is calling it. If it returns nothing, the model itself is broken on CF.



**[2026-03-18]** *Project state and priorities review* — score 5, assistant



> The fix is in the Worker — after PDF text extraction, it should run a quick regex over the extracted text to find the citation before rendering the form. The pattern needs to handle citations without a trailing number like `[2016] TASMC`.



**[2026-03-18]** *Project state and priorities review* — score 5, human



> The `court` field for secondary sources is aliased from `source_type` in the Worker query. In `renderLibRow`, `courtAbbrev(row.court)` is shown for all types. For secondary, that should be replaced with `row.category`. Let me check the exact current state: Read legal.html (lines 448-482) The `court` field on line 475 is shown for all types. For secondary, `row.court` = `source_type` (e.g. "pdf", "docx"). The fix is to show `row.category.toUpperCase()` instead for secondary rows, and suppress the `court` span entirely for them since category is already in the status pills. Edit legal.html Modified Bash Deploy updated legal.html IN



**[2026-03-18]** *Project state and priorities review* — score 5, assistant



> The D1 data is actually rich — 18 principles extracted, deep_enriched=1, s 402A references throughout. The problem is `holdings_extracted` is `[]` (empty array), and the library display is pulling from that field for the synopsis rather than `principles_extracted`.



**[2026-03-18]** *Sync issue troubleshooting* — score 5, assistant



> CF can't find the queue consumer export. The issue is almost certainly that Worker.js uses `export default { fetch, scheduled }` and the `queue` handler needs to be inside that same object, not as a separate `export const queue`.



**[2026-03-18]** *Sync issue troubleshooting* — score 5, assistant



> Actually — `Canceled` in CF Queues means the consumer exceeded the **wall-clock time limit**, not CPU. Free tier queue consumers get 15 minutes but the invocation is being canceled because the Worker is exceeding its own execution limit mid-processing.



**[2026-03-18]** *Sync issue troubleshooting* — score 5, assistant



> The fix is to save to D1 incrementally — write `enriched=1` in a separate update immediately after `saveCaseToDb` rather than relying on it being in the INSERT. But we already tried that and it got removed.



**[2026-03-18]** *Sync issue troubleshooting* — score 5, assistant



> Need to check the wrangler tail to confirm — but I suspect the issue is that `summarizeCase` itself is taking so long on a 458k char judgment that CF cancels before it even returns, so the reorder makes no difference.



**[2026-03-18]** *What to do next* — score 5, assistant



> The issue is the response is coming back but nothing is displaying in the UI. The Worker is returning 1.0kB which is very small — likely an error JSON or empty result rather than an actual answer.



**[2026-03-19]** *Project state and priorities review* — score 5, assistant



> Not a problem with our fix — the search endpoint is working fine. The issue is purely the AI inference step in the Worker.



**[2026-03-20]** *Side projects while waiting for scraper* — score 5, assistant



> Run all three and paste the results. They'll tell us definitively: scope of damage, what's in D1, and whether the fix is sufficient.



**[2026-03-05]** *5 Mar 26* — score 4, assistant



> **On extraction quality evaluation:** The approach is sound. The most useful version would be to pull 5-10 representative cases from D1 (a mix of courts and complexity), run them through your current Llama prompt, then compare against what a proper legal extraction should look like. Rather than me just doing my own extraction in a vacuum, it would be more targeted to look at the *actual Llama output* from your D1 records and identify where it's failing — thin facts, garbled case names, generic principles, missed legislation references, etc. That gives you a real defect list to fix rather than a theoretical comparison.



**[2026-03-06]** *5 Mar 26* — score 4, assistant



> The secret approach is better for a production key — it stores encrypted in Cloudflare and never appears in plaintext in any file, including `.env`. Use that.



**[2026-03-09]** *Processing compiled notes into Arcanthyr database with * — score 4, assistant



> The only real constraint is file upload size through the Worker — Cloudflare has a 100MB request body limit on paid plans, 10MB on free. A 420-page Word doc is typically 5-15MB so you'd likely be fine, but it's worth knowing.



**[2026-03-14]** *14/3/26* — score 4, assistant



> **AFTER ALL CHANGES:** - Run `git add -A`, `git commit`, `git push origin master` as separate commands - Do NOT run `npx wrangler deploy` — Tom will handle that after reviewing



**[2026-03-14]** *14/3/26* — score 4, assistant



> - `git add -A` - `git commit -m "UI corrections: blue replaces gold, Georgia for output text, index centred layout and pulse hover"` - `git push origin master` - Do NOT run `npx wrangler deploy` — Tom will handle that after review



**[2026-03-14]** *14/3/26* — score 4, assistant



> **After changes:** - `git add -A` - `git commit -m "Phase 5: add citation discipline and answer grounding rules to query prompt"` - `git push origin master` - Do NOT run `npx wrangler deploy` — Tom will review and deploy



**[2026-03-15]** *15/3/26* — score 4, assistant



> **CRITICAL naming:** D1 column is `authorities_extracted`. `key_authorities` is the Llama prompt field name only — it does NOT exist as a D1 column. Do not use `key_authorities` in any D1 query.



**[2026-03-16]** *Performance review* — score 4, assistant



> It was a pragmatic early design choice. Judgments vary enormously in length and structure. Rather than parsing the document intelligently, the Worker just grabs a fixed middle section on the assumption that the substantive reasoning lives somewhere in characters 8,000 to 28,000. For short to medium judgments that assumption holds reasonably well.



**[2026-03-17]** *Section 95 tendency and coincidence evidence test* — score 4, human



> PS C:\\Users\\Hogan\\OneDrive\\Arcanthyr\\arcanthyr-console\\Arc v 4> npx wrangler deploy ⛅️ wrangler 4.66.0 (update available 4.74.0) ───────────────────────────────────────────── ▲ [WARNING] Use "worker.js" instead of "Worker.js" to avoid issues with case-sensitive file systems [different-path-case] 🌀 Building list of assets... ✨ Read 9 files from the assets directory C:\\Users\\Hogan\\OneDrive\\Arcanthyr\\arcanthyr-console\\Arc v 4\\public 🌀 Starting asset upload... No updated asset files to upload. Proceeding with deployment... Total Upload: 87.72 KiB / gzip: 19.31 KiB Your Worker has access to the following bindings: Binding Resource env.DB (arcanthyr) D1 Database env.AI…



**[2026-03-17]** *Section 95 tendency and coincidence evidence test* — score 4, assistant



> While we wait — let's think about the backfill execution problem. The new backfill_enriched_text.py outputs a SQL file with 1,138 UPDATE statements. The old approach was to execute that SQL file via wrangler, but D1 has a limit on how many statements it can execute in one call.



**[2026-03-18]** *Reviewing Claude documentation files* — score 4, human



> PS C:\\Users\\Hogan\\OneDrive\\Arcanthyr\\arcanthyr-console\\Arc v 4> npx wrangler deploy ⛅️ wrangler 4.75.0 ─────────────────── ▲ [WARNING] Use "Worker.js" instead of "worker.js" to avoid issues with case-sensitive file systems [different-path-case] 🌀 Building list of assets... ✨ Read 9 files from the assets directory C:\\Users\\Hogan\\OneDrive\\Arcanthyr\\arcanthyr-console\\Arc v 4\\public 🌀 Starting asset upload... No updated asset files to upload. Proceeding with deployment... Total Upload: 102.30 KiB / gzip: 23.00 KiB Your Worker has access to the following bindings: Binding Resource env.CASE_QUEUE (arcanthyr-case-processing) Queue env.DB (arcanthyr)…



**[2026-03-18]** *Project state and priorities review* — score 4, human



> ⛅️ wrangler 4.66.0 (update available 4.75.0) ───────────────────────────────────────────── ▲ [WARNING] Use "worker.js" instead of "Worker.js" to avoid issues with case-sensitive file systems [different-path-case] 🌀 Building list of assets... ✨ Read 9 files from the assets directory C:\\Users\\Hogan\\OneDrive\\Arcanthyr\\arcanthyr-console\\Arc v 4\\public 🌀 Starting asset upload... No updated asset files to upload. Proceeding with deployment... Total Upload: 98.00 KiB / gzip: 21.76 KiB Your Worker has access to the following bindings: Binding Resource env.CASE_QUEUE (arcanthyr-case-processing) Queue env.DB (arcanthyr) D1 Datab…



**[2026-03-18]** *What to do next* — score 4, assistant



> Before I commit to a design I need to know one thing — does CC need to check what the current `fetch-case-url` handler in Worker.js actually does? Specifically whether it calls `summarizeCase()` inline or whether it delegates elsewhere. That determines whether Cloudflare Queues or a different approach is needed.



**[2026-03-20]** *Fix pilot issues first* — score 4, human



> how much to temp set open ai chat gpt 5 mini instead of worker? or claude? which is better/ cheaper and can do it?



**[2026-03-23]** *What's next?* — score 4, assistant



> And it'll generate production-ready React/TSX. Very handy if you ever want to rebuild the frontend properly rather than hand-rolling everything in worker.js.



## Corpus \& Case Ingestion



**[2026-03-05]** *5 Mar 26* — score 13, assistant



> The fix is to **do the parsing in the scraper/client side before upload** rather than in the Worker. You send pre-parsed sections as JSON in the upload payload instead of asking the Worker to parse the raw text under CPU pressure.



**[2026-03-04]** *4 MAR 26* — score 6, assistant



> Now close that D1 console tab and go to your PowerShell or VS Code terminal to check the scraper log. The D1 console only understands SQL — PowerShell commands won't work there.



**[2026-03-09]** *Secondary sources prompt development* — score 6, assistant



> This is the key insight — the `legislation` row gets committed first, then if the sections loop throws partway through, you get a registered part with no sections and no way to re-upload because the duplicate check blocks it.



**[2026-03-18]** *What to do next* — score 6, assistant



> The key insight from CC's review: **Worker v9 already removed the fire-and-forget nexus call**. The pattern is already there — the fetch-case-url handler just needs to stop calling `processCaseUpload()` inline and instead do what the scraper does: write to D1 and return.



**[2026-03-20]** *Token limit exceeded in API request* — score 6, assistant



> Good report. The key finding is that IDs are generated at ingest time from `[CITATION:]` values or heading slugs — so ID stability depends entirely on whether the headings/citations in the reprocessed corpus match the old ones.



**[2026-03-22]** *Reviewing recent conversation highlights* — score 6, assistant



> **The catch for you:** it's currently Mac-only — Windows is not supported. Your Arcanthyr setup runs on Windows, so Dispatch won't work for controlling the ingest/embed process remotely.



**[2026-03-02]** *Case name extraction and console processing* — score 5, assistant



> **Issue 1 — Old bad records still in DB** Records like `id: "TASSC-2024-9"`, `citation: "TASSC 2024 9"`, `court: "unknown"` — these are from the very first scraper run before our citation fix. They survived the D1 wipe somehow, or were re-ingested before the fix was deployed.



**[2026-03-04]** *4 MAR 26* — score 5, assistant



> The issue is in the scraper's response parsing. The proxy returns `{"result":{"html":"...","status":200}}` but the scraper is likely looking for `{"html":"...","status":200}` at the top level — one level too shallow.



**[2026-03-04]** *4 MAR 26* — score 5, assistant



> Good. The problem is clear. `fetchRecentAustLIICases` calls AustLII directly via `fetch(url, ...)` on lines 84-87. It needs to call `handleFetchPage` internally instead, exactly like the proxy endpoint does.



**[2026-03-04]** *4 MAR 26* — score 5, assistant



> So the data is fine and the Worker logic is fine. The bug must be in the frontend. Let me check one more thing — whether `performLegalSearch` is actually being called on page load, because if it isn't the results panel starts empty and the filters appear broken even though they work fine once a search is triggered: ``` This block is not supported on your current device yet. ```



**[2026-03-05]** *5 Mar 26* — score 5, assistant



> The path is correct — `/api/legal/search-cases`. The issue is it's returning 0 which means the query ran but found nothing. That's odd given \~100 cases are in D1. Let me check if there's an auth requirement on that endpoint: ``` This block is not supported on your current device yet. ```



**[2026-03-05]** *5 Mar 26* — score 5, assistant



> Code is correct and live. The problem is curl isn't sending `Content-Length` with `--data-binary` in this context. Try with `-H "Content-Length: 26"` explicitly, or better yet just use the `/ingest` endpoint as a proxy test — we know that works.



**[2026-03-05]** *5 Mar 26* — score 5, assistant



> Check what's actually failing — add some error detail. But first, let's just test if the issue is the `raw_text` field by checking the legislation table schema: ``` This block is not supported on your current device yet. ```



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> The issue is it's still too large to send through the Worker in one hit. But we can split it into Parts and upload each separately. Let me check how many Parts there are: ``` This block is not supported on your current device yet. ```



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> Unless the body starts with a bare number. Check s.37 content on AustLII — "Leading questions" has subsections. Let me check if the issue is actually that `sectionPattern` itself has `g` flag and `lastIndex` is drifting. When using a regex with `g` flag in a `while` loop, `lastIndex` advances with each match — `nextMatchPos` should be correct.



**[2026-03-08]** *Understanding project state and priorities* — score 5, assistant



> If it is a scanned PDF, the fix is to use the AustLII plain-text `.txt` version instead. Do you have a `.txt` version of the Criminal Code, or were the 9 split files `.txt`?



**[2026-03-09]** *Processing compiled notes into Arcanthyr database with * — score 5, assistant



> The fix is straightforward: when you build the `master_corpus.md` parser in `handleUploadSecondarySource`, the translation happens there. The parser reads `[TYPE: sentencing principle]` and writes it into the `category` field. Reads `[ACT: Criminal Code Act 1924 (Tas)]` and writes it into `legislation`. And so on.



**[2026-03-10]** *Claude.md context and suggestions* — score 5, human



> The key is no `await` on the `fetch` call — it fires and returns immediately without waiting for nexus to respond. `handleUploadCorpus` currently does `const r = await fetch(...)` and then `await r.json()` — both awaited, blocking the Worker until nexus finishes. The fix is to strip those awaits and return a fixed response immediately, like `processCaseUpload` does. This is a targeted single-function edit in Worker.js. Ready to apply on instruction.



**[2026-03-15]** *Automating Hogan crime block reformatting workflow* — score 5, assistant



> This is a different problem — the new `blocks_3k/block_001.txt` only contains the index/admin content from the original block (legislation lists, Sgt Askew note) because the splitter put that content in block 1 and the substantive legal doctrine starts in block 2 onwards.



**[2026-03-16]** *Performance review* — score 5, assistant



> Positive — directly improves extraction quality, especially for longer CCA and Supreme Court decisions which are the most legally significant cases in the corpus. No downstream pipeline changes needed — the fix is entirely within the Worker's case processing logic.



**[2026-03-16]** *Performance review* — score 5, assistant



> Second order — once the fix is validated against the three test cases in CLAUDE.md, the scraper tap opens. That means the corpus starts growing automatically — new decisions as they're handed down, backfill of historical decisions. That's when Arcanthyr starts becoming genuinely comprehensive rather than a manually curated sample. Everything downstream — the stare decisis layer, citation network, contradiction detection — depends on having a large, high-quality case corpus. This fix is the gate to all of that.



**[2026-03-17]** *Building case summary with multi-pass extraction* — score 5, assistant



> If that's what happened, the fix is to upload via the scraper pipeline instead — paste the AustLII URL for Parsons into the scraper rather than uploading the PDF directly. The scraper fetches the HTML version which doesn't need OCR and is much faster.



**[2026-03-17]** *Successful data chunk processing* — score 5, human



> i havent done this "The problem in the Worker is that `callWorkersAI` returns `response.response` which contains both the reasoning text AND the JSON. The JSON parser hits the reasoning text first and fails. The fix is to extract just the JSON from the response rather than parsing the whole thing. Tell CC: In `Worker.js`, find `callWorkersAI` function (around line 32). Change the return line from: javascript



**[2026-03-18]** *Project state and priorities review* — score 5, human



> `extractPdfTextForCase` itself just iterates PDF.js pages and joins with `' '` + `'\\n\\n'` — no async gaps, returns the full string synchronously after the loop. Answer to your question — no OCR path can race with this. `autoFillCaseMetadata` is called with the raw `extractedText` variable, not read back from the textarea. There is no other call site for `autoFillCaseMetadata` anywhere in `app.js` or `ingest.html`, and no `input`/`change` listener on `uploadCaseText` that could trigger it again. The one thing worth noting: `autoFillCaseMetadata` receives `extractedText` (untrimmed), but the textarea gets `extractedText.trim()`. That's fine — trimming wouldn't affect a citation in the header.…



**[2026-03-18]** *Sync issue troubleshooting* — score 5, assistant



> The fix is to split `processCaseUpload` so the D1 write happens earlier — immediately after `summarizeCase` returns, before the procedure pass and nexus ingest. That way even if CF cancels mid-procedure-pass, the core data is already saved.



**[2026-03-18]** *What to do next* — score 5, assistant



> The 11 March session explicitly shows: the timeout on corpus upload was fixed by removing `await` from the nexus ingest call — same fire-and-forget pattern. That's `ctx.waitUntil()` in practice.



**[2026-03-19]** *Side projects while waiting for scraper* — score 5, assistant



> The fix is to get Barnes v Omant and Lusted v Jenkins ingested — those are the actual authority. The scraper running today will help if they're in the TASSC catalogue.



**[2026-03-01]** *Case name extraction and console processing* — score 4, assistant



> If those come back as citations (`[2020] TASSC 12`) rather than names, the older cases are bad and a re-ingest is worth doing. If they look fine, you may not need to bother.



**[2026-03-02]** *Case name extraction and console processing* — score 4, assistant



> **How it would work:** ``` VPS scraper → Cloudflare Worker (fetch proxy) → AustLII ``` Instead of the VPS hitting AustLII directly, it asks your Worker to fetch the page, the Worker fetches it from Cloudflare's edge (thousands of rotating IPs globally), returns the HTML to the VPS, VPS processes and uploads as normal.



**[2026-03-05]** *5 Mar 26* — score 4, assistant



> The back-fill script will run from your Windows machine — it queries D1 via the Wrangler API, then POSTs each case to the nexus ingest endpoint. Actually the simplest approach is a Python script that calls your own Worker's D1 query endpoint to get all cases, then replays them to nexus.



**[2026-03-07]** *7 MAR 26* — score 4, assistant



> That's a reasonable tradeoff for legislation uploads specifically, because: - You're not uploading legislation regularly — it's a one-time or rare event - The Criminal Code specifically is a known large document - You already have a local scraper workflow, so local scripts aren't foreign to you



**[2026-03-08]** *Understanding project state and priorities* — score 4, assistant



> **Option A — Increase batch size to nexus** Instead of 20 sections per ingest call, send 50-100. Fewer round trips, same result. Risky if nexus has payload limits though.



**[2026-03-11]** *RAG workflow plan issues* — score 4, assistant



> Given where Arcanthyr is heading with automated ingest as a core feature, the split-brain architecture is going to keep causing friction. Worth keeping in mind as a longer term consideration.



**[2026-03-11]** *Claude.md context and suggestions* — score 4, assistant



> We need a different approach for corpus ingest — rather than fire-and-forget from the Worker, we should call nexus directly from `ingest_corpus.py` on your local machine. Want to tackle that now?



**[2026-03-12]** *12/3/26* — score 4, assistant



> **Key constraints I'll keep front of mind:** - PowerShell: no `\&\&`, no `grep`, wrangler d1 from `Arc v 4/` with `--remote` - Corpus: do NOT run `--mode enrich` on the 662 secondary source rows — raw_text is the content - Deploy checklist: verify `public/` only before every wrangler deploy



**[2026-03-14]** *14/3/26* — score 4, assistant



> So the design is already correct. No changes needed to the upload-case flow before resuming the scraper — just confirm the current Llama prompt fields match the current D1 schema and we're good.



**[2026-03-14]** *14/3/26* — score 4, assistant



> **My honest assessment:** Don't touch the upload-case flow before resuming the scraper. The current design is sound. The priority before resuming is:



**[2026-03-15]** *Debugging script without interrupting execution* — score 4, assistant



> > 1. Open `ingest_corpus.py` > 2. Find the `INPUT_FILE` variable and change it to the full absolute path of `master_corpus_part2.md` — which is in `Arc v 4/` > 3. Save the file > 4. Do not run anything — Tom will run the dry-run and ingest from PowerShell



**[2026-03-16]** *Debugging script without interrupting execution* — score 4, assistant



> **ingest_corpus.py updates:** - Deduplication pass added (lines 100-111) — first occurrence unchanged, subsequent get `[2]`, `[3]` suffixes - Pre-flight duplicate warning printed before ingest



**[2026-03-18]** *Project state and priorities review* — score 4, assistant



> **How it would work:** Instead of your local machine fetching AustLII pages, a Cloudflare Worker cron job uses the [Browser Rendering API](https://developers.cloudflare.com/browser-rendering/) to fetch pages directly from Cloudflare's edge — completely automated, no local machine needed.



**[2026-03-19]** *Project state and priorities review* — score 4, assistant



> The original design was **100 cases per session**, set on 4 March when the rate limiting and AustLII concerns were first addressed. The 10-20 second delay + business hours gate + 100 case limit was the considered safe configuration.



**[2026-03-20]** *Token limit exceeded in API request* — score 4, assistant



> So the wipe-before-ingest approach is exactly what was planned last session. The CC brief I gave you is correct — get the D1 counts (total / procedure / master) before authorising any deletes.



**[2026-03-20]** *Side projects while waiting for scraper* — score 4, assistant



> > Read `C:\\Users\\Hogan\\OneDrive\\Arcanthyr\\arcanthyr-console\\process_blocks.py` fully and confirm you've read it before making any changes. > > Make the following changes: > > **1. Add a REPAIR_PROMPT constant** after the existing MASTER_PROMPT and PROCEDURE_PROMPT constants. The repair prompt text is: > > ```python > REPAIR_PROMPT = textwrap.dedent("""\\ > You are a compliance and repair formatter for a legal secondary-source corpus. > > You will receive: > - SOURCE_BLOCK_TEXT: the original source block > - DRAFT_OUTPUT: the prior Master pass output > > Your task is ONLY to fix structural compliance problems while preserving substantive prose. > You MUST NOT summarise, sanitise, or replace re…



## VPS / server.py



**[2026-03-18]** *What to do next* — score 10, assistant



> OK. The problem it solves: right now `fetch-case-url` and large file uploads timeout because the Worker has a 30s execution limit and large judgments take longer to process. The fix is to hand off to the VPS immediately and poll for completion.



**[2026-03-05]** *5 Mar 26* — score 6, assistant



> If you've been writing it in a more freeform way (like "Nexus Key — abc123xyz") that won't work with `python-dotenv` — it needs the `KEY=value` format exactly.



**[2026-03-11]** *RAG workflow plan issues* — score 6, assistant



> Good catch — that's an important correction. The SSH tunnel approach as described won't work then, because the nexus call is server-side inside the Worker, not client-side in the Python script. You can't intercept it with a local SSH tunnel.



**[2026-03-17]** *Building case summary with multi-pass extraction* — score 6, assistant



> **Option 3 — Fix the PDF timeout** — move PDF processing off the Worker into an async VPS job. Worker receives the upload, hands it off to server.py, returns immediately with a job ID, frontend polls for completion. Properly fixes the root cause but significant build work.



**[2026-03-05]** *5 Mar 26* — score 5, assistant



> The fix is simple: **the browser should send the raw PDF bytes to the Worker, and the Worker extracts text server-side using pdfminer on the VPS via the nexus endpoint — or more practically, we skip PDF.js entirely for legislation and use a different approach.**



**[2026-03-05]** *5 Mar 26* — score 5, assistant



> Same error — so the body is definitely reaching the server empty. The issue is in `read_body()` — it's reading `Content-Length` but curl with `--data-binary` may be setting it differently. Let me check the actual server.py that got written to the VPS:



**[2026-03-05]** *5 Mar 26* — score 5, assistant



> File looks correct. The problem is the container is still running the **old** code — it was built into the Docker image, not reading the file live. Check how it's mounted:



**[2026-03-07]** *8 MAR 26* — score 5, assistant



> Also, can you check the Worker logs in the Cloudflare dashboard for the delete request — specifically whether the `/delete` call to the nexus actually fired and what it returned? That'll tell us if the issue is in the Worker or in server.py.



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> That works fine in the container directly. So the issue is the server is running the **old** server.py that doesn't have `extract_pages` — the one that only has `extract_text`. When it tries `from pdfminer.high_level import extract_text as pdfminer_extract` it succeeds, but the old code path is what's running.



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> Still no logs even with `-u`. The issue is the volume mount — `./agent-general:/app/docs` is mounting the entire `agent-general` directory, which means the `logs` directory inside it is being used, not Docker's log driver. The print output may be going to `/app/logs/` inside the container instead.



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> The issue is the Downloads folder still has the old file. When you downloaded the new server.py, did Windows save it as `server (1).py` to avoid overwriting? Check your Downloads folder for any file named `server (1).py` or similar.



**[2026-03-11]** *RAG workflow plan issues* — score 5, assistant



> **The fix is already written in your CLAUDE.md** — SSH tunnel Option A, redirect the embed call to `localhost:18789`, bypass Cloudflare entirely for the bulk embed run. D1 write stays via Worker as normal. That's the right call.



**[2026-03-11]** *RAG workflow plan issues* — score 5, assistant



> Good catch from CC — that's an important correction. The fix is right: keep the Worker call for D1, add a second direct call to nexus from the script.



**[2026-03-11]** *RAG workflow plan issues* — score 5, assistant



> Updated. The SSH tunnel held — which means the fix was correct and the tunnel was never fundamentally broken, just overwhelmed by volume from the Worker side. Good confirmation of the diagnosis.



**[2026-03-15]** *Automating Hogan crime block reformatting workflow* — score 5, human



> Response from running the curl on the VPS itself: `{"error": "unauthorized"}` That means even when the X-Nexus-Key header is populated directly on the VPS from: `$(docker exec agent-general env | grep NEXUS_SECRET_KEY | cut -d= -f2)` the /delete-by-type route still returns 401 unauthorized. So the issue is not PowerShell quoting or SSH escaping.



**[2026-03-18]** *Reviewing Claude documentation files* — score 5, assistant



> The fix is straightforward — checkout the committed server.py and SCP it to VPS. But first confirm what's in git vs what's on VPS:



**[2026-03-06]** *5 Mar 26* — score 4, assistant



> So the architecture is clean: - **Cloudflare secret store** — `ANTHROPIC_API_KEY` (and `NEXUS_SECRET_KEY`) - **VPS .env** — `NEXUS_SECRET_KEY` only (for the Docker container) - **Local `.env`** — Wrangler config for local dev only, gitignored - **Git/GitHub** — no secrets ever



**[2026-03-11]** *RAG workflow plan issues* — score 4, assistant



> The trade-off is the Worker becomes thinner (basically just a frontend proxy) and you're now responsible for the VPS database — backups, uptime, disk.



**[2026-03-15]** *15/3/26* — score 4, assistant



> > CC — implement the three new Worker routes (`fetch-cases-for-xref`, `write-citations`, `write-legislation-refs`) using the same inline auth pattern as the existing pipeline routes — inline `X-Nexus-Key` check against `env.NEXUS_SECRET_KEY`, and pass `corsHeaders` as used elsewhere in the file. Do not use `checkNexusKey` or `unauthorizedResponse` — those don't exist. Wire all three into the route dispatcher. Then deploy.



## General Architecture \& Process



**[2026-03-05]** *5 Mar 26* — score 5, human



> So this is most (not all) of the relevant files for your context. What i want to do is using the 100 or so cases we have, evaluate the extraction quality, say by comparing what llama has done to say what you would do with the same information, and if necessary twek the extraction directions or add prompts to the extraction code to enhance extration quality. does that sound like a plan? do you have a suggestion or plan beter than this or this method? Also, ultimately cases will only be (albiet a large % of) some of the docs uploaded or scraped. so the extraction rules will need to be different subject to what is being uploaded/ scraped. Obviously all scraped matters will be, but if i'm upload…



**[2026-03-05]** *5 Mar 26* — score 5, assistant



> **The fix is prompt-level.** The current prompt is almost certainly asking for principles without giving Llama a strong enough definition of what a legal principle is. We need to add something like:



**[2026-03-07]** *7 MAR 26* — score 5, assistant



> **bodyStartMatch logic** Looks for `\\n\\d+[A-Z]?\\.?\\s+[A-Z][^\\n]{3,}\\n\\(` — section line followed immediately by `(` on next line. This works for the Evidence Act because subsections start with `(1)`. May fail for Acts where the first section has no subsections (body starts with plain prose). Worth monitoring on next legislation upload.



**[2026-03-08]** *Understanding project state and priorities* — score 5, human



> the issue is that the Code is just one of a number of large pieces of legislation... And they me in differnt forms too. The cth law comes in more than one word file for a single act (so probs need to figure out the way of being able to load multiple parts of the same act, anyway), but others are jsut as large as the CODE. So if i can figure out an easy way of simply draging them in as a single doc or pdf, or in a series when it comes that way, without havving to mess around makes it easier later. so whats the issue? the extraction is too detailed for the amount of time available? theres no sumarry or analysis, like ther is for cases, so it should be quicker than those, but i appreciaate pfd…



**[2026-03-09]** *Secondary sources prompt development* — score 5, assistant



> Almost certainly the old txt files from the earlier approach — back when the plan was to split the Criminal Code into parts manually as txt files and upload them that way, before we switched to the single PDF + OCR pipeline.



**[2026-03-11]** *11 MAR 26* — score 5, assistant



> Stop the loop with Ctrl+C. The fix is to either increase the verify retry delay or skip verification entirely for secondary_sources (verification matters more for legislation where we mark the whole Act done).



**[2026-03-16]** *Debugging script without interrupting execution* — score 5, human



> Deployed. Here's a full summary of every change made: [styles.css](Arc v 4/public/styles.css) * `--bg`: `#0e0e0e` → `#000000` (pure black) * `--surface`: `#1a1a1a` → `#141414` * `--surface-raise`: `#242424` → `#1e1e1e` * `--border`: `#2e2e2e` → `#505050` (lighter grey for contrast against black) * `--border-heavy`: `#444444` → `#666666` (lighter grey for contrast against black) * `--text`: `#f0ece4` (warm parchment) → `#ffffff` * `--text-mid`: `#b8b0a4` (warm grey) → `rgba(255,255,255,0.7)` * `--text-dim`: `#706860` (brown) → `rgba(255,255,255,0.5)` * `--ink`: `#f0ece4` → `#ffffff` * `--ink-dim`: `#242424` → `#1e1e1e` * `--amber`: `#c8972a` (gold) → `#ffffff` * `--amber-dim`: `#2a2210` (ambe…



**[2026-03-17]** *Performance review* — score 5, assistant



> The drug schedule entries are legislation sections — they'll have `type: "legislation"`. The fix is to filter out legislation sections with very short text (schedule entries are typically under 100 characters) since they have no legal reasoning value.



**[2026-03-08]** *8 MAR 26* — score 4, assistant



> In `legal.html`, find the Act Title input field in the legislation upload form. Change its placeholder to `e.g. Evidence Act 2001` and add a small hint text directly below the field (a `<small>` or similar) that reads: `Title only — do not include jurisdiction or year. Use the fields below for those.`



**[2026-03-08]** *8 MAR 26* — score 4, assistant



> In `legal.html`, find the Act Title input field in the legislation upload form. Change its placeholder to `Evidence Act` and add a small hint text directly below the field (a `<small>` or similar) that reads: `Title only — do not include jurisdiction or year. Use the fields below for those.`



**[2026-03-09]** *Secondary sources prompt development* — score 4, assistant



> 2. **Yes, better way** — the Network tab approach is cleaner. Open browser devtools (F12), go to the Network tab, upload just Part 1 of the Criminal Code PDF through the legislation upload form, and capture the response from `/api/legal/upload-legislation`. That response will contain the extracted text and tell us exactly what the OCR produced and where parsing failed.



**[2026-03-16]** *Debugging script without interrupting execution* — score 4, human



> 28 duplicate CITATION values found across both files: Case citations: * `B v Visser [2000` * `Bonde v Morrison [2015` * `Brown v Jones [2021` * `Brown v Tasmania [2019` * `Cannell v G; G v Cannell [2018` * `Howe v S [2013` * `Irons v Moore [2019` * `Jeffrey v Black [1977` * `Kerr v Brown [2013` * `Lindley v Rutter [1981` * `Palmer v Tasmania [2024` * `Pickett v Tasmania [2022` * `Police v FRS [2020` * `Police v Quinn [2019` * `R v Falconer [1990` * `Shaw v Tasmania [2022` * `Smith v Marshall [2024` * `State of Tasmania v Allie and Maple [2025` * `Sundram v Bearman [2020` * `Tasmania v Scott [2025` * `Wheaton v Wilson [2017` Legislation citations: * `Evidence Act 2001 (Tas) s 97` * `Evidence…



**[2026-03-18]** *Reviewing Claude documentation files* — score 4, assistant



> With: ```python "You are a Tasmanian criminal law research assistant. " "Answer questions using the provided excerpts, which may include raw judgment text, synthesised doctrine, or legislation. " "Be precise and cite specific cases. " "When excerpts contain raw judgment text, reason from and synthesise what is there — do not refuse to answer simply because the text lacks a clean doctrinal statement. " "Only say the material is insufficient if the excerpts are genuinely silent on the topic. " "Format your answer in plain prose — no markdown headers, no bullet points unless listing cases." ```



**[2026-03-18]** *Reviewing Claude documentation files* — score 4, assistant



> With: ```js "You are a Tasmanian criminal law research assistant. Answer using the provided excerpts, which may include raw judgment text, synthesised doctrine, or legislation. Be precise and cite specific cases. When excerpts contain raw judgment text, reason from and synthesise what is there — do not refuse to answer simply because the text lacks a clean doctrinal statement. Only say the material is insufficient if the excerpts are genuinely silent on the topic. Format in plain prose - no markdown headers." ```



**[2026-03-22]** *Data pipeline cleanup and message prompt optimization* — score 4, assistant



> IF "reasoning": enriched_text — Write 200-320 words in flowing legal prose: - Open with the legal issue or question this passage addresses - State the court's reasoning in the judge's own terms — not paraphrased generically - If the court applied or distinguished an authority, name it and state the specific principle it stands for - Quote 1-2 verbatim sentences (in quotation marks) where the court states the ratio or key principle - Close with the practical legal consequence or what this means for future cases - Do NOT use IF/THEN format in enriched_text — write as a legal analyst would brief a colleague



**[2026-03-22]** *Checking ingest status* — score 4, human



> I’m checking the Tasmanian statute, the cited High Court authorities, and whether the “Walters direction” is accurately described or overstated. One problem already: the statutory cite looks wrong. In Tasmania, the general criminal standard of proof is stated in the Evidence Act 2001 (Tas) s 141, not the Criminal Code Act 1924 s 13. Thought for 54s Not fully correct. The main problems are: * The statutory citation is wrong. In Tasmania, the general criminal standard of proof is stated in Evidence Act 2001 (Tas) s 141(1), not Criminal Code Act 1924 (Tas) s 13. Section 141 says the prosecution case in a criminal proceeding must be proved beyond reasonable doubt. * I could not verify that “the…



---



## Session 15 Decisions — 23 March 2026



**[2026-03-23]** *UI rebuild — separate repo, Cloudflare Pages* — session 15



> Decided to build the new UI as a completely separate repository (`arcanthyr-ui`) on Cloudflare Pages rather than extending the existing `Arc v 4` worker/HTML approach. Rationale: the current UI is a monolith baked into worker.js and static HTML; a React/Vite app gives proper component structure, hot reload, and a clean separation of frontend from backend. The existing worker.js backend is left entirely untouched — only CORS headers and `/api/auth/login` are added. All retrieval, enrichment, and D1 routes remain unchanged.



**[2026-03-23]** *UI design system locked before build starts* — session 15



> Full design system agreed and frozen before handing to Claude Code: Libre Baskerville serif throughout (legal document feel), dark chrome `#0A0C0E` + light reading pane `#F8F6F1`, IBM accent blue `#4A9EFF`, white compass rose sigil GIF on landing page. Five views: Landing, Research, Upload, Library, Share modal. Rationale: locking design before build avoids mid-build pivots that waste implementation effort and produce inconsistent components.



**[2026-03-23]** *CLAUDE_decisions.md as persistent session artefact* — session 15



> Created `CLAUDE_decisions.md` (377 passages, 1,535 lines, 8 sections) extracted from 30 past Claude.ai conversations via `extract_decisions.py`. Decided CC maintains it going forward — user appends decisions by telling CC what was decided and why. File lives in `Arc v 4/` and is uploaded each session alongside CLAUDE.md and CLAUDE_arch.md. Re-extract quarterly from fresh conversation exports.



**[2026-03-23]** *CORS headers must precede UI build* — session 15



> Worker.js currently has no CORS headers. The arcanthyr-ui frontend (Cloudflare Pages, different origin) cannot call the Worker API without them. Adding CORS is the first worker.js change required before any UI API calls can be tested — do not start UI build without this in place first.



---



## Session 19 Decisions — 24 March 2026



**[2026-03-24]** *Deploy React frontend via Worker static assets, not Cloudflare Pages* — session 19



> Decided to serve arcanthyr-ui from the existing arcanthyr-api Worker via `[assets]` binding rather than setting up a separate Cloudflare Pages project. Rationale: Pages deploy required separate project configuration, custom domain routing, and CORS was already solved for arcanthyr.com. Serving from the Worker keeps the entire app (API + frontend) under one deployment unit — `npx wrangler deploy` pushes both. arcanthyr-ui.pages.dev is now redundant and can be deleted.



**[2026-03-24]** *Do not add _redirects to arcanthyr-ui/public/* — session 19



> Adding a `_redirects` file to `public/` caused Workers Assets to enter an infinite redirect loop (error 10021). SPA routing is handled by `not_found_handling = "single-page-application"` in wrangler.toml — this is sufficient and the only correct approach. Never add _redirects back.



**[2026-03-24]** *Model toggle names: Sol and V'ger* — session 19



> Claude API query path renamed to "Sol", Workers AI (Qwen3-30b) path renamed to "V'ger". V'ger is the default. These are UI labels only — no backend routing changes. The naming is thematic, not technical.



**[2026-03-24]** *Stop poller before embed pass when enriched_text is absent* — session 19



> Discovered 85 chunks were embedded from chunk_text (raw text) because the poller ran before re-enrichment completed. Stopping the poller after 85 to prevent further wasted embed passes was the correct call — chunk_text vectors are lower quality than enriched_text vectors and will need to be replaced anyway. Rule: always verify enriched_text IS NOT NULL on target chunks before starting poller CASE-EMBED pass.



**[2026-03-24]** *Globe moved to Compose page, not Landing* — session 19



> The Three.js Earth globe was moved off the Landing page (which now uses a VanishingInput search bar instead) and onto the Compose page. Rationale: Landing page should be fast and focused on the search entry point; globe is a cosmetic feature better suited to a secondary page. Replaces the cobe-based globe that had rendering issues.



---



*377 passages from 135 conversations + session 15 additions.*

---

## Session 23 — 28 March 2026

**[2026-03-28]** *Synthesis GPT-4o-mini call confirmed producing correct new-format principles* — session 23

> Spot-checked [2020] TASSC 1 after re-merge. principles_extracted contained prose statements with `principle`/`statute_refs`/`keywords` fields — no `type`, `confidence`, or `authorities_applied`. Synthesis is working correctly when enriched_text is populated on reasoning/mixed chunks.

**[2026-03-28]** *requeue-merge routing bug: WHERE clause excluded the cases that needed re-merging* — session 23

> Route queries `WHERE deep_enriched=0` but the 274+ early-merged cases are `deep_enriched=1` (they already merged, just with bad principles). With `LIMIT N` landing on the 275 pending cases first, and the runtime chunk check rejecting all of them (chunks not done), the route returned `requeued:0` every time. The cases that needed re-merging were invisible to the query.

**[2026-03-28]** *Added target:remerge parameter rather than changing default behaviour* — session 23

> Chose to add an optional `target` field rather than change the default WHERE clause. Rationale: default path (deep_enriched=0) still needed for normal pending-case merges. Adding a separate code path for `target='remerge'` (deep_enriched=1, reset then enqueue) preserves existing behaviour and makes the intent explicit at call time. No risk of accidentally re-merging already-good cases.

**[2026-03-28]** *Deferred bulk re-merge until cron clears pending chunks* — session 23

> 2,086 chunks still done=0 across ~221 cases. Firing target:remerge now would re-merge those 221 cases before their chunks have enriched_text, producing the same old-format fallback. Decision: wait until done=0=0 (est. ~April 5-6), then fire `{"target":"remerge","limit":330}` to cover all old-format cases in one batch.

**[2026-03-28]** *Deferred scraper investigation — pipeline quality over volume* — session 23

> Scraper last log entry 24 March. Task Scheduler status unknown. Decision: focus on chunk pipeline quality (synthesis, re-merge) before adding new cases. Scraper re-investigation deferred to next session.

**[2026-03-29]** *Session 24 — case_name bug diagnosis* — score 8, assistant

> Root cause: model instruction failure, not code bug. Qwen3 picks up "CRIMINAL DIVISION" header text instead of party names. Prompt fix with negative constraint + citation fallback. 31 affected rows patched via regex extraction from raw_text.


## Session 25 Decisions — 29 March 2026

1. **runDailySync is a feature, not legacy** — do not delete. Original design: once scraper works backwards through historical cases, runDailySync handles forward-looking capture of new decisions. Fix: update to use fetch-page proxy. Rationale: verified against session 3 conversation history where the feature was designed.

2. **Scraper re-enablement gated on prompt review** — sequence locked: cron finishes → bulk re-merge → retrieval baseline → evaluate enrichment quality → review prompts → then re-enable. Rationale: no value adding cases processed under unvalidated prompts.

3. **handleFetchSectionsByReference — tighten LIKE, not replace with FTS5** — false positive from broad `%N%` pattern confirmed but retrieval baseline unaffected. Fix is tighter LIKE pattern with `s` prefix boundary, not FTS5 replacement. Rationale: proportionate fix; FTS5 overkill for this use case.

4. **Corpus placeholders — 2 of 5 are real gaps, defer to Procedure Prompt session** — block_023 and block_028 need source material from rag_blocks/. Don't fix in corpus files if they're getting reprocessed through Procedure Prompt anyway. Rationale: avoids duplicate work.

5. **Legislation Act name in embed text, not just metadata** — prepend human-readable title to both embed vector and Qdrant payload text. Rationale: payload text is what Claude sees in retrieved context; metadata-only fix doesn't solve the identification problem.

## Session 30 decisions — 3 April 2026

- **Staged legislation and prompt deploys separately (blast radius isolation)** — legislation re-embed and Pass 1 prompt revision were treated as independent tasks and deployed in sequence rather than combined. Why: legislation re-embed has a 10-step validation procedure with a hard stop at step 4 (start-time check). Combining it with a Worker.js deploy would have created ambiguity if either failed. Each change validated independently before proceeding to the next.

- **Opus + extended thinking used for Pass 1 prompt revision** — all three Pass 1 prompt rewrites (pass1System, pass1Prompt, singlePassPrompt) were drafted by Opus with extended thinking rather than CC drafting inline. Why: prompts affect data quality at scale — all future case ingests go through these prompts, and a wrong case_name requires a patch script (confirmed: 31 rows patched session 24). Extended thinking ensures reasoning through edge cases (CRIMINAL DIVISION structure, SURNAME normalisation, citation suffix stripping) before committing. Now codified as a SESSION RULES trigger condition for all future prompt engineering decisions.

- **Deferred Ingest Validation Layer (Pydantic)** — Pydantic schema validation for enrichment_poller.py output deferred despite its clear value. Why: the two specific bugs it would have caught (missing citation/source_id in secondary source payloads, missing Act-title prefix in legislation embed_text) are now fixed at source. Corpus is clean post-session-29/30 re-embeds. No bulk ingests imminent. Building it now adds complexity without protecting against an active threat. Trigger condition set: next bulk ingest or model swap. Design spec captured in OUTSTANDING PRIORITIES #13.

- **Systemic finding: two fixes marked deployed without VPS confirmation** — root cause analysis: session 25 legislation prefix fix and session 27 secondary source citation fix were both written to CLAUDE.md as deployed but neither was SCP'd to the VPS. Root cause: enrichment_poller.py had no documented SCP procedure (server.py had one since session 9). The local file was edited and the session closed assuming the bind mount would pick it up — it does not, restart is required. Resolution: (1) SCP rules for enrichment_poller.py added to SESSION RULES; (2) 10-step Poller Deploy Validation Procedure made permanent in CLAUDE.md with hard verification gate at step 4 (container start time must postdate file mtime). Pattern generalised: any VPS-side file change must follow the same SCP → grep → restart → verify sequence.

## Session 28 decisions — 31 March 2026

- **Pass 3 threshold lowered 0.35 → 0.25, limit 4 → 8** — Ratten v R [1972] 1 AC 378 not surfacing in res gestae queries despite correct Qdrant payload. Diagnosis: chunk scored below 0.35 due to thin concepts line (no "res gestae" term present). Threshold lowered as secondary sources are curated corpus with low noise risk. Why not lower further: 0.25 already very permissive — below this risk of irrelevant chunks outweighs recall gain.

- **Concepts enrichment approach: targeted metadata expansion only** — GPT-4o-mini expands CONCEPTS/TOPIC/JURISDICTION lines and adds a search anchor sentence. Body prose deliberately untouched — Master Prompt preservation work from sessions 9-12 must not be overwritten. Why not full re-enrichment: would destroy verbatim/near-verbatim content that took significant effort to produce and is the core retrieval quality asset.

- **Worker fetch route preferred over CF API token for local scripts** — enrich_concepts.py uses GET /api/pipeline/fetch-secondary-raw rather than Cloudflare D1 REST API. Why: no CLOUDFLARE_API_TOKEN exists locally and has never been set up. Worker route with NEXUS_SECRET_KEY is simpler, already authenticated, and consistent with all other local scripts in the project.

- **Ratten v R manual raw_text fix as diagnostic** — before building the enrichment script, Ratten raw_text was manually updated via wrangler d1 and re-embedded by deleting the Qdrant point and letting the poller pick it up. This confirmed the scoring gap hypothesis and validated the fix approach before committing to the full 1,188 chunk enrichment run.

- **Debug log left in server.py Pass 3** — chunk_id list logged unconditionally on every query. Useful for ongoing retrieval diagnostics. Review for removal or conditional flag after enrichment pass completes and retrieval quality confirmed improved.

## Session 27 decisions

- Secondary sources drag-and-drop built on VPS /process-document (existing) rather than Worker-side processing — avoids Worker CPU/time limits for large documents
- python-docx baked into Dockerfile.agent rather than pip-installed at runtime — prevents silent failures after force-recreate
- Pass 3 threshold set to 0.35 (matching case chunk Pass 2) rather than lowering global threshold — preserves precision on Pass 1 while improving secondary source recall
- Full 1,188 secondary source re-embed approved overnight rather than targeted subset — clean overwrite confirmed safe (deterministic UUID5, no ghost points from Path A for poller-embedded chunks)
- Targeted Hearsay test deferred in favour of full reset — all chunks had same payload bug, targeted test would have required second full reset anyway

## Session 34 decisions

- **Citation-derived `cases.id` replacing UUID** — `crypto.randomUUID()` was generating a new UUID on every `handleUploadCase` call. The `cases` table has `citation TEXT NOT NULL UNIQUE`, so `INSERT OR REPLACE` on a duplicate citation was deleting the existing row (and all its enrichment data — `principles_extracted`, `deep_enriched`, `holdings_extracted`, etc.) and inserting a new row with a fresh UUID. Every scraper re-run of an already-ingested citation silently destroyed enrichment. Fix: `citationToId()` function produces a stable, deterministic, human-readable ID (e.g. `2026-tassc-2`) from the citation string. Zero ID collisions confirmed across all 580 existing citations before migration. All 580 existing UUID rows backfilled in a single D1 UPDATE. No code change required elsewhere — no FK constraints on `cases.id`, no retrieval path reads `cases.id` (all lookups use `citation`), Qdrant payloads do not reference `cases.id`. INSERT changed to `INSERT OR IGNORE` so re-uploads of existing citations are no-ops.

- **`INSERT OR IGNORE` chosen over `INSERT OR REPLACE` for case uploads** — after confirming that `citation UNIQUE` already existed on the live DB (not just in schema.sql), `INSERT OR REPLACE` was the proximate cause of enrichment data loss. `INSERT OR IGNORE` is the correct semantic for the scraper use case: "add this case if it doesn't exist, otherwise leave it alone." A deliberate re-scrape/re-enrich of a specific case should use the `reprocess-case` route instead. Applied to both `handleUploadCase` and `handleFetchCaseUrl`.

## Session 35 decisions — 4 April 2026

- **Case chunk pass dedup pattern** — the case chunk second-pass in `search_text()` was deduping against `{c.get("_id") for c in chunks if "_id" in c}`. Key `_id` is only set on chunks appended by the case chunk pass itself; chunks from the main semantic pass use `_qdrant_id` (Qdrant UUID). So the dedup set was always empty on first iteration, allowing duplicates of any case chunk that also appeared in the main pass. Fix mirrors the session 27 secondary source pattern exactly: build `existing_qdrant_ids_cc` from `_qdrant_id` values of all existing chunks, check `str(hit.id) in existing_qdrant_ids_cc`. Finding: the session 27 fix for this was committed to git but never SCP'd to VPS — third instance of the git-deployed-but-not-VPS-deployed pattern (after sessions 25 and 27). The git-vs-VPS gap continues to be a failure mode worth guarding against.

- **runDailySync proxy: VPS preferred over Cloudflare direct fetch** — Cloudflare Worker `fetch()` uses Cloudflare edge IPs which can be rate-limited or pattern-matched by sites that detect datacenter IP ranges. VPS proxy (`POST /fetch-page` on server.py) routes requests through the VPS residential-equivalent IP. Critically: VPS is NOT IP-blocked by AustLII (confirmed curl 200). The "VPS IP blocked" note in CLAUDE.md was incorrect — it conflated the Python scraper getting 404s (an AustLII page-structure issue) with an IP block. `env` threading was required through `fetchCaseContent` and all call sites since `handleFetchPage` had no `env` param; default `null` preserves backward compatibility for any path that doesn't pass env (falls back to direct fetch).

- **fetchCaseUrl method omission from api.js** — `Upload.jsx` `uploadUrl()` called `api.uploadCase({ url })` because `api.fetchCaseUrl` didn't exist. The `upload-case` Worker handler expected `case_text + citation`; receiving only `{ url }` meant `citation` was `undefined`, and `citation.match()` threw "Cannot read properties of undefined (reading 'trim')". The error pointed at `.trim()` rather than `.match()` because `citation.match()` was the first property access — the stack trace reported the property access on undefined as a trim error due to Cloudflare's minified runtime. Lesson: when a UI endpoint submits to a wrong route, the error will look like a type error in the handler, not a routing error. Check wrangler tail route logs first.

- **`handleFetchSectionsByReference` LIKE tightening** — changed from `id LIKE '%' || ? || '%'` to four-clause OR pattern requiring `s ` prefix before the section number and a delimiter (space, hyphen, comma) or end-of-string after. Prevents `s38` from matching IDs containing `138`, `238`, `block_038` etc. Section number is sent as bare digits (e.g. `"38"`) from server.py — the `s ` prefix must be part of the SQL pattern, not the bind parameter.

## Session 38 decisions — 5 April 2026

- **MCP-first over wrangler relay for D1/Workers ops** — Cloudflare Developer Platform MCP (claude.ai connector) and Cloudflare API MCP (mcp.cloudflare.com) installed at user scope. Decision: use these in preference to routing queries through wrangler CLI when CC needs to inspect D1 rows, Worker deployments, KV/R2 state, or Queue status. Why: wrangler requires a terminal relay (Tom runs the command, pastes output back); MCP tools let CC query live infra directly in a single turn. The two MCPs are complementary: claude.ai connector covers D1 CRUD and resource management; CF API MCP covers the full 2500+ endpoint Cloudflare REST surface (Workers analytics, Queues, Pages, etc.) accessible in Code Mode. Authentication is to Tom's Cloudflare account (confirmed: `def9cef091857f82b7e096def3faaa25`).

- **hex-ssh MCP locked to VPS scope** — `@levnikolaevich/hex-ssh-mcp` installed project-scoped in `Arc v 4/.mcp.json` with four hard restrictions: `ALLOWED_HOSTS=31.220.86.192` (VPS only), `ALLOWED_DIRS=/home/tom/ai-stack` (ai-stack directory only), `ALLOWED_LOCAL_DIRS=C:\Users\Hogan\OneDrive\Arcanthyr` (Arcanthyr local only), `REMOTE_SSH_MODE=safe`. Why: blast-radius limiting — CC can read/write VPS files within ai-stack without being able to wander to system directories or unrelated hosts. The file is gitignored to prevent SSH key paths from entering version history. Pending: Windows ssh-agent setup so the passphrase-protected key can be used without prompting.

- **Mandatory security audit before any third-party tool adoption** — process established this session after two findings: (1) `ancoleman/qdrant-rag-mcp` rejected because its default embedding dimensions (384) are incompatible with Arcanthyr's Qdrant index (1024-dim `general-docs-v2`); installing it would have created a silently-broken parallel RAG system; (2) `alirezarezvani/claude-skills` `.mcp.json` contained an undisclosed call to `api.tessl.io` (Tessl platform onboarding), deleted before use. Neither issue was visible from the README. Audit method: read every non-markdown file via Fetch MCP for raw content; check for `fetch(`, `axios`, `request(`, hardcoded URLs, credential references, and outbound connections. This process is now documented in SESSION RULES as a standing requirement for future tool adoption.

- **Context7 preferred over CC training data for library docs** — Context7 MCP installed at user scope to feed current Wrangler, Qdrant Python client, and Vite documentation into CC context. Why: CC's training data cutoff means Wrangler API suggestions (especially D1 and Queues) and Qdrant client method signatures have been wrong in past sessions (e.g. wrong queue binding syntax, stale Qdrant `upsert` vs `upload_points` naming). Context7 resolves library ID from package name and returns versioned docs at query time — prevents stale API suggestions without requiring Tom to paste docs manually.

- **Playwright MCP for post-deploy UI verification** — Playwright installed at user scope. Decision: use for smoke-testing arcanthyr.com after worker.js/frontend deploys rather than asking Tom to manually check the UI. Typical use: navigate to arcanthyr.com, run a test query, screenshot the result, confirm reading pane renders correctly. Complements but does not replace manual review for design-quality changes. Not suitable for authenticated flows if JWT handling changes (Playwright session won't have a valid token unless explicitly set up).

- **Sequential Thinking MCP for architecture decisions** — installed at user scope as a structured reasoning aid for complex multi-step decisions. Complements the existing Opus referral rule (defer to Opus + extended thinking for prompt engineering, schema design, and any decision affecting 100+ rows). Sequential Thinking is appropriate for CC-side planning tasks where Opus consultation isn't warranted but a simple linear answer is insufficient — e.g. retrieval debugging sequences, migration step ordering, dependency analysis.

- **Skills repos not auto-loaded — require explicit invocation** — the three cloned skill repos (`vercel-agent-skills`, `jezweb-claude-skills`, `alirezarezvani-claude-skills`) are available at `~/.claude/skills/` but skills must be explicitly invoked by name. They are not passively injected into context. Why: 200+ alirezarezvani skills in context on every turn would consume significant context budget for low-probability utility. Invoke specific skills (e.g. `frontend-design`, `senior-frontend`, `rag-architect`) when the task clearly matches the skill's domain.

## Session 40 decisions — 5 April 2026

- **Skills install — 13 new skills to ~/.claude/skills/** — 4 from obra/superpowers (`systematic-debugging`, `verification-before-completion`, `test-driven-development`, `subagent-driven-development`) and 9 from sickn33/antigravity-awesome-skills (`rag-engineer`, `vector-database-engineer`, `embedding-strategies`, `python-pro`, `async-python-patterns`, `docker-expert`, `prompt-engineering`, `context-window-management`, `bash-linux`). Why: `systematic-debugging` and `verification-before-completion` directly encode existing session rules ("diagnose fully before fixing", "evidence over claims"); RAG/vector/embedding skills target retrieval pipeline work; python/async/docker target VPS backend; prompt-engineering targets CHUNK prompt and synthesis quality review.

- **Plugin marketplace install not available in CC 2.1.71** — `/plugin marketplace add` and `/plugin install` are not real Claude Code CLI commands. CC 2.1.71 has no plugin subcommand — only a `--plugin-dir` session flag. Used manual git clone + `cp` to `~/.claude/skills/` instead. This is the correct install method for user-scope skills.

- **Superpowers security audit finding** — `systematic-debugging` contains 2 non-markdown files: `condition-based-waiting-example.ts` (TypeScript test utility — `waitForEvent*` polling helpers, no network calls) and `find-polluter.sh` (bash bisection script — iterates test files, runs `npm test`, no outbound connections). Both audited clean. All other Superpowers and Antigravity skill directories contained markdown only.

- **using-git-worktrees skipped** — Superpowers includes a `using-git-worktrees` skill; not installed. Current project uses a linear git workflow on master with no worktree-based parallel development. The skill would add noise without utility given the single-branch, single-developer context.

- **Monorepo migration: git root moved from `Arc v 4/` to `arcanthyr-console/`** — The repo was rooted at `Arc v 4/` (the Cloudflare Worker directory) while `arcanthyr-ui/` lived outside it at `arcanthyr-console/arcanthyr-ui/`. The build pipeline copied `arcanthyr-ui/dist/` into `Arc v 4/public/` before each wrangler deploy — meaning built JS was flowing across the git root boundary and accumulating as untracked files. Separately, cross-layer bugs (e.g. session 33: wrong field name in JSX + missing field in Worker SQL SELECT — two separate files, two separate layers) required CC to hold both sides in context simultaneously, which was impossible with separate repos. Atomic commits across Worker and UI routes were also not possible. Decision: move git root up to `arcanthyr-console/`. The `arcanthyr-ui` separate repo (initialised session 35, 2 commits) was absorbed — its `.git` removed and files tracked under the monorepo. `Arc v 4/scripts/` directory deleted — all active scripts (ingest_corpus.py, retrieval_baseline.sh, etc.) are now at `arcanthyr-console/` root; one-off backfill scripts are gitignored. Root `.gitignore` created. New operational rule: git commands run from `arcanthyr-console/`; wrangler/npx commands still from `Arc v 4/`. The GitHub remote (`arcanthyr-console.git`) was already named for the root — only the local git root needed moving.

## Session 43 decisions — 7 April 2026

- **Fixed scraper court code TAMagC→TASMC** — TAMagC is the internal label used by the Worker's court map; TASMC is the actual AustLII path segment. All magistrates years were completing with 0 cases silently. Confirmed correct code via direct URL check before fixing.

- **Raised scraper consecutive_misses 5→20** — older/low-volume court years have non-sequential case numbering. Threshold of 5 caused premature year completion when gaps exceeded 5 consecutive numbers. 20 provides sufficient tolerance without excessive empty requests.

- **Extended scraper year floor 2005→2000** — AustLII has Tasmanian cases back to at least 2000. No downside to extending; cases that don't exist return 404 and are skipped.

- **Fixed performMerge synthesis to extract holdings alongside principles** — synthesis prompt previously returned a bare principles array. Interlocutory rulings (bail, hearsay applications, voir dire) were producing empty holdings_extracted because no single chunk contained a complete holding. Synthesis pass reads all enriched reasoning text and is better positioned to identify the overall ruling. Changed output schema to {principles, holdings} object.

- **Deferred s 361A procedural mechanism capture in CHUNK enriched_text** — gap identified in quality audit of [2025] TASSC 6. Procedural mechanism (how the application was brought) not being captured. Deferred: header/procedural chunks have low retrieval weight, and the mechanism is usually visible in the catchwords which are embedded in chunk__0 enriched_text anyway. Low priority fix.

## Session 45 decisions — 8 April 2026

- **Kept 2018–2026 in scraper_progress.json, cleared 2017 and earlier** — D1 counts for 2018–2026 look healthy (70–99 cases/year across courts); pre-2018 counts were too low to trust (consecutive_misses=5 caused premature year completion). Clearing only the suspect years avoids unnecessary re-scraping of good data.

- **Set WakeToRun=True on both scraper scheduled tasks rather than adding BIOS RTC wake** — PC is sleeping not fully powered off; WakeToRun is sufficient and simpler. BIOS route noted as fallback if PC is ever fully powered off at scheduled times.

- **handleUploadCorpus FTS5 fallback: confirm row before propagating error** — D1 FTS5 writes can time out after the main row write has already committed. Rather than a blanket suppress, the fallback does a SELECT confirmation first — if the row isn't there, the original error propagates unchanged. This avoids masking genuine failures while handling the known FTS5 timeout pattern safely.

## Session 39 decisions — 8 April 2026

- **Tags for secondary sources deferred to enrichment poller, not generated at upload time** — poller uses GPT-4o-mini with full document text, yielding better tag quality at no extra cost vs a Workers AI call at upload time
- **Author field dropped from secondary source upload modal** — no retrieval value; not worth the UI noise
- **date_published auto-set to upload timestamp in Worker rather than collected from user** — upload date is always known and sufficient for D1 display purposes
- **source_type added to Qdrant payload (not tags/author/date)** — only field among the new additions with meaningful retrieval/filter value at embedding time

## Session 45 decisions — 11 April 2026

- **[2026-04-11] Hardcode agent-general port as 18789 in docker-compose.yml** — docker compose interpolates `${VAR}` in ports mapping from `.env` only at parse time; `env_file:` applies to container env only; invariant single-instance ports should always be hardcoded to avoid ephemeral port assignment on restart
- **[2026-04-11] Pydantic validation uses log-and-skip pattern, not fail-hard** — overly strict schema could reject valid rows on edge cases (e.g. short case_name); skip preserves retry opportunity by not marking embedded=1; failures are queryable via Docker logs

## Session 46 decisions — 11 April 2026

- **[2026-04-11] Strip CONCEPTS headers in poller before embedding** — `[CONCEPTS:]` and `Concepts:` headers were the dominant semantic signal in raw_text for all secondary sources with NULL enriched_text, polluting vectors and causing retrieval misses (confirmed: BRD chunks scored 0.48–0.51, losing to "reasonable belief" chunks at 0.55). Regex strip applied to both embed text and Qdrant text payload field.

- **[2026-04-11] Re-embed all 1,201 secondary sources with NULL enriched_text** — reset embedded=0 after poller fix deployed; cleaner vectors expected across all HOC doctrine, legislation annotation, and manually ingested secondary chunks.

- **[2026-04-11] Created ~/ai-stack/.env with pinned port vars** — docker compose was silently assigning ephemeral ports due to missing env file; host-side diagnostic tooling (curl to Qdrant, Ollama) was broken without this fix.

**[2026-04-11]** *Sentencing extraction — include all chunk types in synthesis input*

> Root cause of 263/313 criminal cases with NULL procedure_notes: cases were processed before session 22 when sentencing second pass was implemented. Secondary issue: sentencingTexts in performMerge() filtered to reasoning/mixed/procedural chunks only, excluding evidence chunks that contain the sentencing matrix (prior history, victim impact, personal circumstances) for first-instance sentencing remarks. Fix: removed chunk_type filter entirely — all chunk_text now fed to SENTENCING_SYNTHESIS_PROMPT. The 40k char cap still prevents token blowout.

**[2026-04-11]** *Defer Option C (CHUNK-level sentencing enriched_text branch)*

> Option C would add a conditional branch to the CHUNK v3 prompt: for criminal cases, write structured 150-250 word sentencing extractions instead of generic 80-word evidence descriptions. Retrieval benefit is real (Qdrant search for sentencing facts would improve), but synthesis quality fix via Option A (include all chunks in merge input) is sufficient. Deferred to retrieval tuning phase. Cost if implemented: ~$15-20 GPT for 729-case CHUNK re-run.

**[2026-04-11]** *Expand sentencing_found guard clause*

> Appeal courts that varied or reviewed (rather than imposed) a sentence were returning sentencing_found: false under the old guard clause. Updated to explicitly cover imposed/varied/confirmed/reviewed. Only returns false for judgments with no sentence quantum discussion at all.

## Session 48 decisions — 11 April 2026

**[2026-04-11]** *Parties field D1 binding fix*

Qwen3 returns `parties` as a JSON array. D1 can't bind JS arrays directly → `D1_TYPE_ERROR`. Two options: `JSON.stringify()` (preserves structure, needs parse on read) or `.join(", ")` (flat string, display-ready). Chose join — parties is only used for display in case detail view, never parsed back into an array. Matches how `issues` was already handled.

**[2026-04-11]** *Scraper 500 vs 404 handling*

AustLII returns HTTP 500 during transient outages. Previous scraper treated 500 identically to 404 (increment consecutive_misses), so a 30-min outage window could exhaust the miss threshold and mark a year "done" with 0 cases. Fix: on 500, sleep 60–90s and retry once before counting as miss. Capped at one retry to prevent infinite loops during extended outages. Separate per-court year ranges also added (COURT_YEARS dict) so TASMC range could start at 2026 without affecting other courts.

## Session 49 decisions — 11 April 2026

**Retrieval baseline expanded to 31 queries before RRF overhaul**
Added Q19–Q31 covering sentencing range, manifestly excessive appeals, suspended sentence breach, non-parole period, search warrant execution, committal procedure, bail principles, appeal against conviction, provocation, FVO variation, FVO contravention sentencing, expert evidence, right to silence. Rationale: 18-query baseline was evidence-law heavy and insufficient for fair pre/post RRF comparison across all practice areas.

**Pre-RRF baseline saved as ~/retrieval_baseline_pre_rrf.txt**
Locked before any retrieval pipeline changes. This is the comparison file for the RRF overhaul.

**RRF overhaul confirmed ready for implementation — no further Opus consultation**
Opus spec from April 5 session is complete. Four-leg prefetch design, Python-side BM25 synthetic merge, phased rollout (Step 1 → baseline → Step 2). Implementation session can proceed directly using that spec.

**Route/column names must be verified from source before use in commands**
Pattern: I generated /api/pipeline/requeue-merge (wrong) and WHERE criminal=1 (wrong column) without verifying. Rule added: ask CC to grep/read before constructing any command with route paths or column names not explicitly confirmed this session.

## Session 50 decisions — 13 April 2026

**Sentencing synthesis cap raised 40K → 120K chars**
- Context: 40K cap set in session 31 without documented rationale. gpt-4o-mini supports 128K token context; 40K ≈ 10K tokens is ~12× more conservative than necessary. CCA judgments of 24+ chunks have ~60K chars total — sentencing discussion in last 3–4 chunks was being truncated silently.
- Decision: raise to 120K chars. Verified no timeout issues on Roland v Tasmania (24 chunks). 25-second AbortController is the real timeout protection and remains unchanged.
- Alternative considered: reversing chunk order so sentencing chunks come first under the cap. Rejected — adding caseRow.holding to context is simpler and more reliable as a primary fix.

**caseRow.holding added to sentencing synthesis prompt**
- Context: `cases.holding` (Pass 1 extracted outcome) contains explicit sentence quantum (e.g. "sentenced to three years imprisonment, backdated to August 9, 2015"). This field was in D1 but never passed to sentencing synthesis — absent from both CHUNK and MERGE handler caseRow SELECTs.
- Decision: add `holding` to both SELECTs; surface as `Outcome (Pass 1 summary)` in sentUser before chunk texts. Appears before the 120K truncation point regardless of judgment length.
- Why important for CCA: CCA sentencing appeal judgments often confirm or vary a sentence without re-stating the quantum in the reasoning chunks — it appears only in the Pass 1 extracted holding.

## Session 51 decisions — 13 April 2026

**Subject_matter filter: cache-based penalty over Option A re-embed**
Decision: Implemented hourly in-memory cache (SM_PENALTY=0.65) rather than Option A (full case chunk re-embed to get subject_matter into Qdrant payload).
Why: Option A requires ~4-hour re-embed of 18K+ case chunks and full misclassification audit first. Cache approach required zero re-embed, deployed in one session, and fixed all three target partials (Q4/Q10/Q14). Option A remains available for future enhancement (enables native Qdrant filtering in Pass 1 without cache overhead).

**Q2 BRD fix: disambiguation anchors on competing chunks, pure text on target chunks**
Decision: Fixed Q2 by adding domain anchor sentences to 6 competing secondary source chunks rather than adding disambiguation language to BRD enriched_text.
Why: Attempted to add "distinct from George v Rockett" to BRD enriched_text — this caused BRD chunks to drop out of top-6 entirely. The embedding model cannot reason about negation; "I am not about X" is semantically equivalent to "I am about X." Rule established: disambiguation belongs on competing chunks; target chunk text must be purely about the target domain.

**RRF deferred: corpus prerequisites not met**
Decision: Deferred RRF implementation to a future session when corpus exceeds 50K vectors.
Why: At ~20K vectors with a single embedding model, all retrieval legs use the same signal. Wrong-domain chunks accumulate multi-leg RRF score via surface vocabulary overlap — same regression observed in session 41 (reverted in session 42). Prerequisites per Opus session 42 analysis: corpus >50K vectors, independent retrieval signals across legs, per-leg diagnostics, comprehensive doctrine coverage. None met at current scale.

## Session 52 decisions — 13 April 2026

### 500K case text cap (not 2M)
**Context:** Raised case text truncation cap from 200K. Considered 2M.
**Decision:** 500K cap across all handlers.
**Rationale:** Each chunk generates one GPT-4o-mini call. 500K = ~167 chunks (~$1.67/case). 2M = ~667 chunks (~$6.67/case) plus queue congestion blocking other cases and OpenAI rate limit risk. 500K is generous for Tasmanian case law — even long CCA multi-ground appeals fit comfortably. Truncation logging captures anything that does hit the cap for manual review.

### No automatic re-fetch for truncated cases
**Context:** Considered building an automatic AustLII re-fetch into the truncation resolution workflow.
**Decision:** No automatic re-fetch. User deletes the truncated case and re-uploads via existing upload page.
**Rationale:** Keeps the feature simple. The existing upload flow (paste URL) already handles fresh case ingestion. Adding a re-fetch path would duplicate the upload pipeline with a special uncapped variant. The truncation_log + Library UI gives visibility; the fix path is manual but adequate for the low volume of affected cases (20 backfilled).

### Option B (chunk before truncate) rejected
**Context:** Proposed chunking full text before truncating for storage, so all content enters case_chunks even if cases.full_text is capped.
**Decision:** Rejected — not compatible with async architecture.
**Rationale:** Chunking happens in the METADATA queue consumer, which reads cases.full_text from D1. The queue exists to avoid 30s Worker timeout on large cases. Moving chunking into the upload handler would defeat the async design. Raising the cap (Option A) achieves the same goal without restructuring the pipeline.

### node --check validation rule for CC edits
**Context:** CC str_replace broke a template literal in worker.js, causing wrangler deploy to fail with unterminated string literal.
**Decision:** Mandatory `node --check worker.js` after any CC edit, before deploying.
**Rationale:** CC works from context window snippets and can clip multi-line template strings at boundaries. `node --check` catches parse errors in <1 second. Zero cost, prevents wasted deploy cycles.

## Session 53 decisions — 13 April 2026

**Test-first before code change on timeout hypothesis**
Before modifying the sentencing synthesis timeout or token limit, reset 3 representative cases (short, medium, large) and checked D1 directly after requeue. Confirmed size-dependent failure (short/medium passed, large failed) without writing a line of code. This approach — D1 spot-check rather than tail log scrolling — is the correct diagnostic pattern for queue consumer failures going forward.

**Raise sentencing synthesis limits conservatively, not maximally**
Timeout raised 25s → 45s (not 60s+) and tokens raised 2000 → 4000 (not 8000). GPT-4o-mini procedure_notes + 2-4 principles should complete within 4000 tokens for all realistic cases. Overly large limits increase cost and slow queue throughput unnecessarily.

**Stop requeue-merge loop on race condition detection**
When requeue-merge loop returned 250 × 7+ iterations for a 1234-case corpus, identified race condition (queue processing resets deep_enriched=1, loop re-picks). Stopped loop manually. ~1750 messages already queued is sufficient — idempotent overwrite is acceptable. Rule: for future bulk requeue-merge operations, fire exactly ceil(total_cases / 250) calls manually rather than looping until zero.

## Session 54 decisions — 14 April 2026

**[2026-04-14] Scraper progress.json audit — 8 entries cleared**
Removed TASSC_2025, TASFC_2025, TASSC_2024, TASCCA_2024, TASFC_2024, TASCCA_2017, TASFC_2017, TASSC_2007. Root causes: 2024/2025 marked done under old consecutive_misses=5 config before session 43 fix; 2017 CCA/fullcourt completed with zero results (AustLII numbering gaps exceeded threshold); 2007 TASSC aborted mid-run on 500 outage. TASMC ceiling (2025) left unchanged — no 2026 magistrates cases exist on AustLII. INSERT OR IGNORE makes re-scraping already-ingested cases safe.

**[2026-04-14] Sentencing backfill route built but paused on quality failure**
Built runSentencingBackfill + admin route. Architectural design confirmed correct by Opus. Quality testing failed: 3 test cases averaged 10.7/25 (threshold 14/25). Decision: do not process remaining 482 candidates under current prompt. Existing 89 notes are quality-suspect. Backfill route remains deployed but must not be fired until SENTENCING_SYNTHESIS_PROMPT passes a 5-case validation.

**[2026-04-14] Six failure modes identified in SENTENCING_SYNTHESIS_PROMPT**
(1) Wrong-document classification — hedges instead of sentencing_found:false on non-sentencing judgments. (2) Hallucinated comparables — invents "court relied on comparable cases" when zero are cited. (3) Hallucinated principles — invokes generic sentencing concepts not in the source. (4) Mitigating factor blindness — denies mitigating factors the source explicitly enumerates. (5) Sentence structure terminology errors — conflates global/concurrent/cumulative. (6) Missing appellate analytical structure — misses the legal test, appellate reasoning, and appeal court's own comparators for sentence appeals. Fix requires prompt rewrite with stronger negative gate, no-comparables rule, no-principles rule, mitigating factor checklist, sentence structure precision, and appellate posture detection. Phase 0 (TASMC test) first to confirm model-level vs prompt-level fix.

**[2026-04-14] sentencing_status column deferred pending prompt fix**
Opus recommended adding sentencing_status TEXT (NULL/'success'/'failed'/'not_sentencing') to cases table to fix the observability gap in procedure_notes IS NULL. Decision: implement after SENTENCING_SYNTHESIS_PROMPT revision is validated. Rationale: column is only useful once the prompt produces trustworthy output — populating 'success' on bad notes creates a false signal. Implement as part of the same deploy as the revised prompt.

**[2026-04-14] Reject "QUALITY UNDER REVIEW" UI warning for existing 89 notes**
Proposed adding a UI warning on the Library reading pane for pre-revision procedure_notes. Rejected: adds temporary UI complexity, the 89 notes are actively misleading practitioners, and the chunks in D1 are the real evidence — not the generated notes. Decision: set existing 89 notes back to NULL at the start of next session before any other work. The re-process step after prompt revision will rebuild them correctly.

**[2026-04-14] Confirmed: quality and architecture fixes are sequential, not parallel**
Quality fix (prompt revision + validation) must precede architecture fix (sentencing_status column), which must precede backfill, which must precede cron. Running the backfill route under a bad prompt contaminates the corpus and makes the architecture fix misleading (populating 'success' on hallucinated notes). Resist the temptation to tackle architecture while quality is broken.

## Session 55 decisions — 14 April 2026

### Decision: Option A (prompt-only fix) over Option B (re-enrichment) for sentencing extraction
- **Problem:** procedure_notes quality was failing — thin generalizations, mislabeled inputs, hallucinated comparables, no appellate framing
- **Root cause:** NOT that evidence chunks were excluded from input (they weren't — code reads ALL chunks). The prompt said "reasoning sections" which primed the model to skip factual content, and the decision rule didn't cover non-sentencing criminal judgments
- **Option A (chosen):** Rewrite the prompt only. No code changes to input assembly except renaming the label. No re-enrichment, no re-embedding, zero upstream changes
- **Option B (rejected):** Revise CHUNK prompt to produce richer evidence enriched_text, then re-embed all evidence chunks. Risk: changes embedding content in Qdrant, alters retrieval behaviour corpus-wide, requires full retrieval baseline rerun. Rejected because it bundles a retrieval change with a sentencing fix
- **Why A wins:** enriched_text does double duty — it's the embedding source AND the synthesis input. Touching enriched_text to fix sentencing would change retrieval vectors for all evidence chunks. Option A isolates the fix to the sentencing synthesis step only

### Decision: Null all 89 existing procedure_notes before validation
- **Why:** Session 54 identified quality failures. Leaving bad data in place while testing new prompt would contaminate any corpus-level quality assessment. Clean slate ensures the backfill route only writes new-prompt outputs

### Decision: case_type logged but not stored to D1
- **Why:** Informational for validation logs. If it proves useful for future filtering (e.g. separate retrieval behaviour for appeals vs first-instance), a column can be added later. No schema change needed now

## Session 56 decisions — 14 April 2026

**Stale roadmap audit performed** — cross-referenced all outstanding items against conversation history and live D1 data. Items removed as resolved: bare-year case_name appending (patched session 26, D1 clean), Pass 2 Qwen3 prompt review (quality confirmed acceptable, merge synthesis bypasses it), Phase 0 TASMC diagnosis (done session 55), backfill validation gate (passed session 55), Q2 BRD baseline (fixed session 46), re-process 89 procedure_notes (covered by active backfill). Rationale: CLAUDE.md was accumulating stale items that created false work and obscured genuine priorities. Clean slate approach — only confirmed-outstanding items remain.

**subject_matter filter Part 3 sequencing** — Part 3 (reset embedded=0 on ~19,000 case_chunks) deliberately deferred to overnight run. Rationale: re-embed takes 2–3 hours; running during active session would degrade retrieval for the duration. Retrieval continues working throughout (old vectors stay in place until overwritten). server.py filter must not be deployed until embedded=0 count returns 0 — deploying early silently kills all case chunk retrieval for un-re-embedded points.

**Qdrant point ID format** — case chunk point IDs are hashed to UUIDs, not stored as raw citation strings. Direct lookup by `"[2025] TASSC 32__chunk__11"` fails with format error. Use scroll with payload filter to find points. Document this in component notes if not already present.

## Session 57 decisions — 14 April 2026

### Arcanthyr MCP server — scratched
Evaluated and dismissed. The web UI already does full retrieval + Qwen3 synthesis. An MCP wrapper would just relay Qwen3's output through Claude — no meaningful gain, double synthesis cost, auth complexity. Not worth building.

### Qwen3 UI toggle (third button) — confirmed already resolved
Session history confirmed this was discussed and closed in a prior session. Sol/V'ger two-button toggle is correct. The `legal-query-qwen` route is a legacy VPS path predating Workers AI. No third button needed.

### xref_agent criminal filter — criminal/mixed only
Decision: filter `fetch-cases-for-xref` to `subject_matter IN ('criminal', 'mixed')`. Rationale: Arcanthyr's purpose is Tasmanian criminal law research; civil/administrative citation data adds noise without value. The 5 pre-existing rows from [2026] TASSC 1 (a civil standing case) were left in place as pre-existing data but will not be added to further.

### xref_agent treatment upgrade — deterministic keyword lookup, not LLM
Decision: post-process `treatment='cited'` using keyword matching on the `why` field rather than a second LLM call. Rationale: the `why` text already contains enough signal for reliable upgrades (e.g. "applied the test in" → applied); an LLM pass would add latency and cost for marginal gain. Deterministic and auditable.

### sentencing_status column — additive observability fix
Decision: add `sentencing_status TEXT` to cases table with values NULL/'success'/'failed'/'not_sentencing'. Rationale: `procedure_notes IS NULL` was overloaded — meant both "not yet processed" and "failed silently." `WHERE sentencing_status='failed'` now enables precise retry targeting without heuristic keyword queries. 305 NOT_SENTENCING sentinel strings cleaned from procedure_notes in same operation.

### truncation_log -1 entries — false positives, no code fix needed
Decision: mark 18 of 20 truncation_log entries as confirmed without re-fetching. Rationale: all 18 had raw_text under 500K and deep_enriched=1 — they were never actually truncated. The -1 values came from a one-time session 52 D1 command, not a code bug. Only [2022] TASSC 11 and [2021] TASSC 27 (genuinely over 500K) required re-fetch.

## Session decisions — 15 Apr 2026

### Web Audio API over HTMLAudioElement for TTS playback
**Decision:** Use AudioContext/Web Audio API instead of HTMLAudioElement
**Reason:** Browser autoplay policies block HTMLAudioElement without prior user gesture. Web Audio API with unlockAudio() called synchronously in click/submit handlers bypasses this reliably across browsers and iOS.

### CPU-only torch install
**Decision:** Install torch with --index-url https://download.pytorch.org/whl/cpu
**Reason:** Default torch install pulls 2GB+ CUDA/cuDNN wheels. VPS has no GPU so CUDA is wasteful. CPU-only build is ~250MB and functionally identical for this use case.

### NEXUS_SECRET_KEY not on VPS
**Decision/Finding:** The NEXUS_SECRET_KEY is not stored on the VPS — it lives in the local .env and is injected into the Worker as an environment variable. VPS curl diagnostics must use the key from the local .env directly.

### Voice preference in localStorage (D1 deferred)
**Decision:** Store voice preference in localStorage for now, D1 sync deferred
**Reason:** Single-user platform, localStorage is sufficient. D1 sync adds schema changes with no immediate benefit. Revisit when multi-device access becomes a regular workflow.

### Mute button removed
**Decision:** Remove global mute toggle from UI
**Reason:** OS/browser-level muting is sufficient. UI mute adds complexity and visual noise with no meaningful benefit over system controls.

### Ambient clips as live TTS (static file hosting deferred)
**Decision:** Ambient clips call /api/tts live rather than serving pre-generated static files
**Reason:** Pre-generated files require static asset hosting infrastructure not yet set up. Live calls add 1-3s latency but are simpler. Revisit when latency becomes noticeable in practice.

## Session 58 decisions — 15 April 2026

**Strip at source, not at embed time (ingest_corpus.py)**
Decision: remove `Concepts:` prepend from ingest_corpus.py rather than stripping in poller. Rationale: stripping what you just constructed is wasteful; nothing downstream reads the prefix; clean at source is always preferable to cleaning downstream.

**strip_frontmatter() dual-case design**
Decision: two-case function rather than block-only regex. Case 1 handles `---` delimited blocks (107 of 114 affected rows); Case 2 handles bare inline headers (remaining rows, session-46 format). Validated against 6 test cases including mid-body safety check before writing to any file.

**D1 raw_text cleaned in place alongside embedded=0 reset**
Decision: clean raw_text in D1 at same time as resetting embedded=0, not just re-embedding over dirty text. Rationale: if future pipeline runs raw_text without strip logic, dirt re-emerges; cleaning at source prevents silent re-corruption.

**Opus deferred for embed_quality feedback loop design**
Decision: immediate fixes (regex patch, D1 clean, delete broken chunks) handled by CC this session. Systemic quality feedback loop (embed_quality column, pre-embed validation, zero-result logging) deferred to Opus consultation before implementation. Rationale: schema changes and pipeline validation logic affecting all future embeds warrant Opus review.

**MOSS-TTS networking: 0.0.0.0 bind required**
Decision: MOSS-TTS systemd service must bind on 0.0.0.0, not 127.0.0.1. Rationale: Docker containers cannot reach host loopback; bridge gateway 172.19.0.1 is the correct target but only works if the host service listens on all interfaces.

## Session 59 decisions — 15 April 2026

**Replace MOSS-TTS with OpenAI TTS API**
MOSS-TTS-Nano on CPU takes ~2m13s per synthesis — confirmed by `time curl` test. Unsuitable for any real-time use. OpenAI TTS (`tts-1` model) returns audio in 1-2 seconds at ~$0.015/1M chars. Decision: replace the MOSS-TTS block in server.py `/tts` route with OpenAI API call next session. Static WAV files handle all preset phrases; OpenAI handles live read-aloud of query responses only.

**Static WAV files over server-side TTS caching**
Initial plan was to prime a server-side WAV cache at startup. Abandoned in favour of serving pre-recorded files directly from Cloudflare CDN as static assets. Simpler, zero latency, zero VPS involvement, no startup delay. Files live in `public/Voices/` and are deployed with the Worker.

**iptables-persistent over ufw**
ufw was removed as a side effect of installing iptables-persistent. Decision: accept this — the raw iptables rules already in place (from Docker) provide equivalent protection for core services. iptables-persistent saves rules to `/etc/iptables/rules.v4` on reboot. ufw chains in the filter table are empty passthrough and harmless.

**NEXUS_SECRET_KEY rotation deferred**
Key was exposed in session 58 conversation history. Risk assessed as low (Anthropic systems, not public). Rotation deferred — not forgotten. Must be done before any colleague access or MCP server rollout.

## Session 60 decisions — 15 Apr 2026

**VPS .env.secrets path — corrected in CLAUDE.md**
Correct path for all VPS secret lookups is `~/ai-stack/.env.secrets`. CLAUDE.md had `~/ai-stack/.env` which returns nothing. Both NEXUS_SECRET_KEY and OPENAI_API_KEY are in `.env.secrets`. Standard curl pattern: `grep NEXUS_SECRET_KEY ~/ai-stack/.env.secrets | cut -d= -f2`.

**OpenAI TTS over MOSS-TTS**
MOSS-TTS synthesises at ~2m13s per phrase on CPU — not viable for real-time. Replaced with OpenAI `tts-1` API. Sub-1s latency confirmed. onyx (male) / nova (female) default mapping. No local model dependency.

**Static MP3s over live TTS API**
Decision: replace all live TTS calls with pre-generated static MP3s served from Cloudflare CDN. Rationale: zero latency, no API cost per play, no server dependency, simpler frontend. Phrases are fixed and known — no dynamic TTS needed. 72 samples (9 voices × 8 phrases) generated for voice selection. Implementation next session: commit MP3s to public/Voices/, wire frontend triggers, remove /tts route from server.py and Worker.

**subject_matter Part 2 was never deployed**
Session 57 close notes incorrectly stated Parts 1+2 deployed. VPS code check this session confirmed Part 2 (poller metadata dict) was absent. Classic SCP failure mode — session notes confirmed deployed without verifying VPS file. Part 1 confirmed via worker.js code inspection. Part 2 fixed and deployed this session. Part 3 re-embed running naturally via backlog.

## Session 61 decisions — 15 April 2026

**Citation pattern validation overrides AI extraction**
Decision: `courtFromCitation()` uses deterministic citation pattern match to override AI-extracted court value in both upload handlers. Returns null for no match (AI value preserved). Applied at ingest time, not as a backfill.
Rationale: Citation patterns (TASMC, TASSC, TASCCA, TASFC) are unambiguous identifiers. AI extraction has demonstrably misclassified court values (session 49: 69 TASMC cases marked supreme). Deterministic check has zero false positive risk for known Tasmanian court codes.

**Domain filter uses cache-based exclusion, not Qdrant hard filter**
Decision: When user selects a domain filter, server.py hard-excludes case_chunks whose citation maps to a non-matching subject_matter in the in-memory sm_cache, rather than using Qdrant MatchAny payload filter.
Rationale: Qdrant payload hard filter requires all case chunks to have correct subject_matter in their Qdrant payload. Embedding backlog (~3,849 chunks) means many existing points lack subject_matter in payload. Cache-based approach uses D1-derived data which is fully populated. Will be swapped to Qdrant payload filter once backlog clears and re-embed completes.

**Synthesis feedback loop: curated not automatic**
Decision: Saved answers go to a staging queue (approved=0 in secondary_sources) before ingestion. Tom reviews and approves before embedding. No auto-ingestion path.
Rationale: Legal knowledge base where accuracy is the whole point. A bad auto-saved answer would be retrievable and self-reinforcing in future queries. Review gate is the only acceptable design. Approved field defaults to 1 for all existing rows — only synthesised rows land with approved=0.

## Session 62 decisions — 15 Apr 2026

**Baseline returns 0 chunks — not a regression, KEY path issue**
Decision: 31-query baseline returning 0 results after NEXUS rotation is a shell/env issue in retrieval_baseline.sh, not a retrieval architecture regression. Direct curl with pasted key returns correct results. Root cause partially diagnosed: script was reading from ~/ai-stack/.env (empty — secrets live in .env.secrets); `cut -d= -f2` also dropped trailing `=` from base64 key. Both fixed but script still fails at session close — carry to next session.

**Corpus health check runs as monthly VPS cron, not as a Worker cron**
Decision: corpus_health_check.py runs via VPS crontab (`0 2 1 * *`) rather than a Worker cron trigger or queue-based approach.
Rationale: The health check makes dozens of sequential GPT-4o-mini calls (one per cluster × two passes). Worker cron triggers have a 30-second wall-clock limit and no way to chain long async sequences. Python on VPS has no time limit, can sleep between API calls, and can log progress. The only Worker involvement is as a data sink (write report and cluster assignments via admin routes).

**GPT-4o-mini for clustering, contradiction, and gap detection**
Decision: All three health check passes use gpt-4o-mini-2024-07-18 via raw requests (no openai SDK).
Rationale: (1) The openai Python SDK is not installed in agent-general Docker image — enrichment_poller.py confirmed this pattern (raw requests throughout). (2) gpt-4o-mini is adequate for classification and gap-finding tasks. (3) Using the same HTTP pattern as the rest of the codebase avoids a new dependency.

**800-char raw_text truncation per chunk in health check**
Decision: Each chunk's raw_text is truncated to 800 chars before being included in the contradiction/gap prompt.
Rationale: A corpus of 1,200+ secondary sources across 20+ clusters would exceed gpt-4o-mini's context window if sent in full. 800 chars preserves the key doctrinal content (first paragraph, definition, test elements) while staying within safe per-cluster token budgets. Clustering uses title+category only (no raw_text at all) — even lighter.

**Cluster stability diff deferred**
Decision: Run-to-run cluster diff (comparing this run's cluster labels to the previous run's assignments) was considered but deferred.
Rationale: Cluster labels are free-form strings generated by GPT each run — "tendency_evidence" might become "tendency_and_coincidence_evidence" between runs even with identical input chunks. String matching is unreliable and embedding similarity matching for labels adds complexity. The feature adds value mainly when the corpus has grown substantially between runs. Deferred until cluster label stability becomes a real operational pain point.

**Session closer verification rule added**
Decision: After CC runs the session close commit, always run `git status` from arcanthyr-console/ root to confirm all claimed new files are actually present in git.
Rationale: This session, CC logged "created" for files that may not have been written to disk in a prior session. The git status check catches this before the session window closes.

## Session 63 decisions — 15 April 2026

**Header chunks: intentionally never embed**
Decision: restore `AND cc.enriched_text IS NOT NULL` gate to `fetch-case-chunks-for-embedding` SQL rather than adding a `chunk_text` fallback. Rationale: header chunks (citation, parties, catchwords) have no retrieval value — embedding them adds Qdrant noise and dilutes semantic search quality. The gate excludes them at source; the Python-level poller skip becomes a harmless safety net. They sit permanently at embedded=0 and are excluded from backlog counts.

**force-recreate vs restart for env changes**
Decision: always use `docker compose up -d --force-recreate <service>` after any key rotation or env_file change. `docker compose restart` preserves the environment baked in at container creation — the new key never reaches the running process. Documented as a session rule to prevent recurrence.

## Session 64 decisions — 17 April 2026

**CONCEPTS strip confirmed permanent**
Decision: Do not restore Concepts headers for future content. Strip stays in enrichment_poller.py.
Rationale: Session 46 diagnosis was correct — headers pollute vectors when body prose is already rich. The failure mode is not the strip but the assumption that all body prose is self-sufficient. The fix is upstream in enrichment prompts, not restoring the header dependency.

**Stub quarantine: soft-quarantine not hard delete**
Decision: Stub chunks identified by the detector go to a quarantined_chunks D1 table and are filter-flagged in Qdrant, not hard-deleted from either store.
Rationale: Hard Qdrant deletes are irreversible without re-embedding. Corpus impact of quarantine needs verification via baseline gate before permanent removal. Reversibility is non-negotiable given two previous incidents of silent corpus damage (session 26 payload bug, session 46 CONCEPTS strip side-effect).

**Do not use GPT-4o-mini to expand stub content from titles**
Decision: Stubs where source is unavailable are quarantined or deleted, not expanded via LLM.
Rationale: LLM synthesis without source material for legal content carries unacceptable hallucination risk. A fabricated legal proposition that enters the retrieval layer becomes citable fiction. Opus flagged this explicitly. Zero tolerance.

**Legislation penalty: whitelist approach**
Decision: Extend SM_PENALTY to legislation chunks except a whitelist of Core Criminal Acts. Adjacent Acts penalised unless keyword bridge matches query topic.
Rationale: Uniform legislation exemption (current state) allows Misuse of Drugs Act s1 to outrank correct common assault chunks (Q1 confirmed regression). Uniform extension of penalty would silently kill correct Evidence Act / Criminal Code hits. Whitelist is the only approach that fixes the regression without introducing new false negatives.

**Enrichment prompt fix: vocabulary front-loading**
Decision: Master Prompt and CHUNK prompt v3 to be revised to instruct GPT-4o-mini to open body prose with explicit statute section, defined doctrine term, and key case citations rather than generic synonyms.
Rationale: Embedding vector determined entirely by body prose (Concepts strip permanent). Body prose that opens with "the provision confers a discretion" rather than "s138 Evidence Act confers a discretion to exclude improperly obtained evidence" produces a vector that drifts to generic legal space. Front-loading specialist vocabulary is the only way to ensure the correct chunk ranks correctly after the strip. Opus consultation prompt prepared and referred.

## Session 65 decisions — 17 April 2026

**[2026-04-17]** *Vocabulary anchoring at embedding time, not enrichment time* — score 10, architectural

> The Opus consultation (session 64) diagnosed vocabulary anchoring as an enrichment prompt problem. The system review (session 65) reframed it: the metadata needed for anchoring (CONCEPTS, ACT, CASE, legislation, key_authorities) is already extracted and stored in D1. It's discarded at embedding time by strip_frontmatter(). The fix is to extract it and prepend as a "Key terms:" anchor before the embedding model sees the text. This is better than enrichment prompt changes because: (1) applies retroactively to all existing content via re-embed, (2) iteratable without GPT cost, (3) doesn't conflict with Master Prompt fidelity or CHUNK v3 classification logic, (4) metadata quality is already good.

**[2026-04-17]** *Case chunks FTS5 index — closing the BM25 coverage gap* — score 8, retrieval

> Case chunks had zero BM25/keyword coverage. Secondary sources had FTS5 since session 3. Named-section queries ("s 138 Evidence Act") and named-case queries relied entirely on vector similarity for case chunk retrieval. With 25,000+ case chunks, this was a significant gap. Added case_chunks_fts (FTS5, porter tokenizer) with a parallel BM25 pass in server.py and a new fts-search-chunks Worker route.

**[2026-04-17]** *Query logging as infrastructure before optimization* — score 7, operational

> Deployed query_log table to capture every retrieval query with enough context for post-hoc analysis: paraphrastic vs doctrine-naming split, weak retrieval detection (top score < 0.55), and before/after comparison via client_version. Wired inline in both query handlers. Non-fatal pattern — logging failure cannot break queries.

**[2026-04-17]** *Cowork writes, CC deploys* — score 6, workflow

> Established workflow split: Cowork (claude.ai) handles all analysis, D1 queries via Cloudflare MCP, and file edits in the Arc v 4 mount. CC handles deploy commands only (wrangler deploy, SCP, docker compose). Eliminates lengthy CC supplementary prompts — CC gets surgical edits instead of page-long instructions. hex-ssh MCP for Cowork would close the remaining VPS read gap.

## Session 66-67 decisions — 17 April 2026

**Legislation penalty: 3-tier whitelist with keyword bridge**
Decision: Extend apply_sm_penalty() to legislation chunks using a whitelist-based system rather than uniform penalty or uniform exemption.
Rationale: Uniform exemption (pre-session 66 state) allowed non-criminal legislation to outrank correct doctrine chunks (Q1 common assault beaten by Misuse of Drugs Act s1). Uniform penalty would suppress correct Evidence Act / Criminal Code / Sentencing Act hits. Whitelist is the only approach that fixes regression without introducing new false negatives. Keyword bridge on adjacent Acts (e.g. query containing "drug" exempts Misuse of Drugs Act) prevents over-penalising contextually relevant non-core legislation. LEG_PENALTY_ADJACENT set at 0.85 — lighter than full SM_PENALTY 0.65 because adjacent Acts are often topically relevant, just not the primary target.

**handleRequeueMerge scoping: array bypass of deep_enriched gate**
Decision: body.citations array skips the deep_enriched=1 constraint; body.citation (singular) and unscoped calls retain it.
Rationale: Explicit citation targeting implies deliberate re-processing — the caller knows which cases to hit. The deep_enriched gate exists to prevent accidental bulk re-runs, which is irrelevant when specific citations are named. Removing the gate only for explicit targeting preserves safety for batch operations.

**Query expansion deferred behind re-embed baseline**
Decision: Do not implement query expansion until vocabulary anchor re-embed completes and is baselined.
Rationale: Vocabulary anchors (session 65) and query expansion solve the same recall problem from different ends — anchor enriches the embedding, expansion enriches the query. Building both simultaneously prevents isolating which change improved results. If anchors close the gap, expansion may be unnecessary. If they don't, expansion's marginal impact can be measured cleanly.

**Deploy gap pattern — third occurrence documented**
Decision: case_chunks_fts BM25 pass from session 65 confirmed absent from server.py. Added to outstanding priorities for re-implementation after re-embed completes.
Rationale: This is the third occurrence of the deploy-gap pattern (sessions 25, 27, 65) where session closer logged code as deployed but it never reached VPS. Pattern is now well-documented. Implementation deferred to avoid conflating BM25 impact with vocabulary anchor impact in baseline comparisons.

**subject_matter audit: Rattigan confirmed correctly classified**
Decision: Tasmania v Rattigan [2021] TASSC 28 confirmed as workers compensation case — correctly classified as administrative. Full audit complete, no further misclassifications found. Prior KNOWN ISSUES entry was flagging a non-issue.

## Session 68 decisions — 17 April 2026

### BM25 case_chunks_fts: append at low score, not interleave
- **Decision:** Deploy BM25 case_chunks_fts hits appended at `BM25_SCORE_KEYWORD = 1/(60+12) ≈ 0.0139` — they cannot displace semantic results. Only competitive mechanism is multi-signal boost if a BM25 hit already exists in semantic results.
- **Why:** Interleaving (giving BM25 hits score 0.50 to compete with mid-tier semantic) risks the same vocabulary-overlap failure that killed RRF in session 41 — wrong-domain chunks accumulating competitive score via surface term overlap. Append-first lets us baseline the recall improvement without displacement risk.
- **Evaluation gate:** Documented in BM25_INTERLEAVE_EVALUATION_PLAN.md. Interleave only after Part A baseline shows no regression and interleave adds measurable improvement.

### Stare decisis cited_by: match on case_name, not citation
- **Decision:** Resolve citation→case_name in handleCaseAuthority before the cited_by query, matching against case_name (case-insensitive, trimmed) instead of citation.
- **Why:** `case_citations.cited_case` stores authority names extracted by GPT ("House v The King"), not bracket citations. This is by design in xref_agent.py — GPT extracts `auth.get('name')` which is the case name as cited in the judgment text. Changing xref_agent to extract bracket citations would be fragile (many cited authorities don't have bracket citations in the citing judgment). Matching on name is the correct direction.
- **Risk:** Case name collisions (e.g. "R v Smith" could match multiple cases). Mitigated by case-insensitive exact match — partial matches won't fire. Accepted risk: Tasmanian corpus has mostly unique case names.

### query_id generation: Option B (inline UUID at handler start)
- **Decision:** Generate `queryId = crypto.randomUUID()` at the start of both query handlers, return in response as `query_id`, use as foreign key for synthesis_feedback.
- **Why:** Simpler than Option A (separate pre-query INSERT) — query_log row and feedback rows share the same UUID without requiring a pre-query D1 round-trip. query_id is available for the zero-result early return path and the normal path equally.
Rationale: D1 audit of all 26 R v / Tasmania v / Police v cases with non-criminal subject_matter confirmed no misclassifications. Subject_matter accuracy is now validated for the filter pipeline.

## Session 69 decisions — 18 April 2026

**Save to Nexus: approved column default 1 for backwards compatibility**
Decision: `ALTER TABLE secondary_sources ADD COLUMN approved INTEGER DEFAULT 1` — all existing 1,199 rows auto-set to approved=1. Only Save to Nexus rows land with approved=0.
Rationale: Setting default to 0 would break the poller gate (`AND approved = 1`) for all existing rows, requiring a mass UPDATE before embed could proceed. Default 1 means zero disruption to existing pipeline.

**Query history: soft delete, not hard delete**
Decision: query_log entries use `deleted INTEGER DEFAULT 0` soft delete. Row stays in D1 for analytics, just hidden from UI.
Rationale: query_log serves dual purpose — analytics (query patterns, model usage, retrieval scoring) and user-facing history. Hard deleting would destroy analytics data. Soft delete preserves both functions.

**Query history: no auth on read/delete routes**
Decision: GET /api/research/history and POST /api/research/history-delete require no X-Nexus-Key.
Rationale: Read-only history is non-sensitive (user's own queries on a single-user system). Soft delete is reversible and also non-destructive. Adding auth would require threading the Nexus key through the Research page JS — unnecessary complexity for a single-user deployment.

**PowerShell Split("=",2)[1] for base64 key extraction**
Decision: All PowerShell key extraction patterns updated from `Split("=")[1]` to `Split("=",2)[1]`.
Rationale: Base64 keys end with `=` padding characters. `Split("=")` produces 3+ array elements; `[1]` picks the middle segment, dropping the trailing `=`. `Split("=",2)` limits to 2 parts: everything before the first `=` and everything after (including trailing `=`). Same root cause as the bash `cut -d= -f2` vs `cut -d= -f2-` fix in sessions 61-63.

**Save to Nexus delete action: full Qdrant + FTS5 + D1 cleanup**
Decision: Delete action on approved secondary sources removes from all three stores (Qdrant vectors, FTS5 index, D1 row), not just D1.
Rationale: Leaving orphaned Qdrant vectors after D1 delete would cause retrieval to return results that can't be resolved to source text. FTS5 orphans would cause stale BM25 hits. All three stores must be cleaned atomically.

## Session 70 decisions — 18 April 2026

**CLAUDE.md restructure — state-first section order**
Reordered CLAUDE.md from rules-first to state-first: SYSTEM STATE → OUTSTANDING PRIORITIES → KNOWN ISSUES → SESSION RULES → changelog → procedures. Rationale: a session that opens with system state and priorities before rules means the rules are read with context. Also places the most volatile sections (state, priorities) at the top where they're always read, and stable reference material (procedures, baseline) at the tail where truncation is acceptable. Alternative considered: keep rules first (original layout) — rejected because rules without state context are harder to apply correctly.

**3-session changelog retention window**
CLAUDE.md keeps exactly 3 session changelog blocks. Older blocks archived to CLAUDE_changelog.md (new fifth file). Rationale: changelogs serve two functions — (a) telling the current session what just changed, and (b) recording why a past decision was made. Function (a) only needs 2–3 sessions. Function (b) is served by CLAUDE_decisions.md. The 82% changelog ratio (1,316 of 1,598 lines) was causing measurable context dilution. Alternative considered: date-based cutoff — rejected because session count is more predictable and easier to automate in the session-closer skill.

**CLAUDE_changelog.md as separate file (not folded into CLAUDE_decisions.md)**
Changelogs and decisions serve different retrieval patterns. Decisions answer "why did we choose X over Y?" Changelogs answer "what changed in session N?" Mixing them makes both harder to scan. CLAUDE_decisions.md is already 3,687 lines — adding 1,200 lines of changelog would push it past 4,800. Alternative considered: fold into CLAUDE_decisions.md — rejected for retrieval pattern mismatch and size concerns.

**FUTURE ROADMAP moved exclusively to CLAUDE_arch.md**
Roadmap is architectural aspiration, not operational instruction. OUTSTANDING PRIORITIES in CLAUDE.md is the current sprint list. Having both in the same file caused reconciliation drift — session-closer updated priorities but didn't always sync the roadmap. Session-closer skill now includes a roadmap reconciliation step.

**Conversation archive flows — decision reasoning vs rich flows**
Decision reasoning from deleted conversations → CLAUDE_decisions.md as structured entries. Rich conversation flows too nuanced to compress → Vault wiki articles via wiki-processor skill. No sixth MD file created. Rationale: decisions and conversation flows have different shelf lives and retrieval patterns; forcing both into one format loses value from each.

**Skip hand-maintained CLAUDE_decisions.md summary**
Decided against adding a "Recent Decisions" summary to the top of CLAUDE_decisions.md. The file is generated by extract_decisions.py — a hand-maintained summary would go stale. Conditional loading rule is sufficient: the file is only opened during deep architectural review. Future improvement: modify extract_decisions.py to auto-generate the summary section if the file grows unwieldy.

## Session 71 decisions — 18 April 2026

- **Stub quarantine build/deploy split** — Built and pre-staged all quarantine components (D1 inserts, Qdrant script, server.py patch) in parallel with re-embed, but held filter deploy until post-re-embed baseline. Rationale: deploying the filter before the baseline would conflate vocabulary anchor impact with stub quarantine impact, making it impossible to measure either as an isolated delta. The baseline must capture vocabulary anchors alone first.

- **Steps 3 and 4 gated on embedding analysis** — Both vocabulary injection and enrichment prompt fix explicitly deferred until post-re-embed baseline is measured. If vocabulary anchors produce strong improvement, both may be deprioritised indefinitely. Rationale: the session 65 re-embed is the minimal intervention; more invasive corpus rewrites should only proceed if the minimal intervention is insufficient.

- **Health check false positive documented** — Tendency evidence contradiction (session 64 health check) confirmed as false positive. The two chunks describe correct law in different contexts (s 94 EA exempts bail proceedings). Addressed by authoring substantive s 94 chunk rather than modifying either existing chunk.

- **SYSTEM STATE check rule** — After sending Opus on two tasks already marked LIVE in SYSTEM STATE (legislation whitelist, stare decisis UI), rule added: always check SYSTEM STATE table before proposing any item as outstanding work. Prevents wasted Opus context spend on already-completed features.

---

## Session 72 decisions — 19 April 2026

**[2026-04-19]** *auslaw-mcp — clone outside `~/ai-stack/` tree, pin by digest, isolated docker network* — score 10, assistant

> Threat model: third-party MCP server from a GitHub author Tom has no prior trust relationship with. Static audit (nine steps, `audit-auslaw-mcp.sh`) returned YELLOW — well-constructed but not clean enough to drop into the same docker network as Qdrant/Ollama/agent-general. Three isolation decisions:
>
> 1. **Clone path outside `~/ai-stack/`** — cloning inside the tree risks accidentally inheriting `ai-stack_default` network membership via compose project auto-detection, or being swept up in a future `docker compose up` from `~/ai-stack/`. Using `~/auslaw-mcp` as a separate compose project guarantees a distinct network namespace.
> 2. **Pin image by digest, not tag** — `ghcr.io/russellbrenner/auslaw-mcp:latest` would silently pull new code on any `docker compose pull` or forced recreate. Pinning `@sha256:480e8968...` means the container is deterministic — any change requires explicit digest update + re-audit of the new build.
> 3. **Explicit isolated network (`auslaw-mcp_auslaw-isolated`, bridge `br-09cccc527fb4`)** — even within a separate compose project, the default bridge network is shared across unrelated containers on the same host. Declaring a named isolated network in the compose file makes the isolation visible and diff-able.
>
> Combined with the five-entry SSRF allowlist (hostname-string matching — adequate for this threat model since DNS rebinding isn't in scope for a local-stdio MCP) and tcpdump-verified traffic (53 packets, single destination = AustLII infra), the residual risk profile is acceptable. `runDailySync` already exposes the VPS IP to AustLII, so auslaw-mcp introduces zero new IP-exposure surface. Verdict: GO.

**[2026-04-19]** *tcpdump audit — user-run with `-Z tom`, not passwordless sudo* — score 9, assistant

> Initial instinct was to add a passwordless sudoers entry for tcpdump to run it unattended. Rejected: passwordless sudo for any binary that can open raw sockets and write to arbitrary paths is a strictly worse security posture than typing `sudo` once. User-run tcpdump via `-Z tom` (drop to tom after opening the socket, pcap owned by tom) gives the same observability outcome with no lasting privilege escalation. General rule for future audit sessions: prefer per-invocation auth over standing privilege, even for read-only tools.

**[2026-04-19]** *Windows Claude Code MCP registration — `add-json` with backtick-escaped double quotes* — score 8, assistant

> `claude mcp add -- ssh ...` was expected to work (the `--` convention should stop flag parsing) but did not — the CLI kept parsing `-i` after the `--`. PowerShell single-quoted JSON also mangled internal quotes. The reliable pattern is `claude mcp add-json` with backtick-escaped `"` inside the JSON payload. Documented in CLAUDE_init.md for future MCP installs. Lesson: never assume `--` stops flag parsing in a shell wrapper around a Node CLI; test explicitly.

**[2026-04-19]** *`/fetch-page` is NOT an HTTP CONNECT proxy — `HTTPS_PROXY` recommendation retracted* — score 9, assistant

> Initial hardening recommendation was to force auslaw-mcp's AustLII traffic through the existing VPS `/fetch-page` proxy via `HTTPS_PROXY=http://localhost:...`. This would have centralised the outbound point and applied the same rate-limiting and UA spoofing used by the scraper. Wrong: `/fetch-page` is a URL-param FastAPI endpoint (`GET /fetch-page?url=...`), not an HTTP CONNECT proxy. `HTTPS_PROXY` expects a server that speaks the proxy protocol; `/fetch-page` speaks normal HTTP. Retracted mid-session. If central outbound gating is wanted later, it requires either (a) a real proxy (Squid/mitmproxy in front of the network), or (b) modifying auslaw-mcp to call `/fetch-page` explicitly per-URL — both are non-trivial and deferred.

**[2026-04-19]** *Scope drift flagged mid-session; Tom chose to finish* — score 7, assistant

> Initial ask was "is auslaw-mcp safe to install?" Work expanded through audit → hardening plan → deployment → runtime validation. Flagged explicitly mid-session that this was beyond the original question. Tom's call: finish the hardening pass now rather than ship a half-audited install. Pattern to recognise in future audit sessions: the audit itself answers "is it safe enough for your threat model *as-is*?"; hardening is a separate decision that should be called out rather than absorbed silently.

## Session 73 decisions — 19 April 2026

### Decision: Deploy stub quarantine before BM25 FTS (flipped CLAUDE.md priority order)
**Context:** CLAUDE.md listed BM25 FTS deploy as Priority #2, stub quarantine as #3.
**Decision:** Deploy quarantine first. Reasoning: (a) smaller, bounded change — single must_not filter + payload flag on 253 known points, low deploy risk; (b) sequencing logic — quarantine removes noise, BM25 adds signal; removing noise first gives BM25 a cleaner floor against which to measure its contribution. Doing BM25 first would mean quarantine's subsequent cleanup partially masks BM25 gains.
**Outcome:** Validated — quarantine moved 18P→22P, BM25 moved 22P→24P. Clean separable deltas.

### Decision: Extend stub quarantine filter to all three passes (not just Pass 3)
**Context:** Original patch targeted only Pass 3 (secondary_source pass) because quarantined rows are all secondary_sources.
**Decision:** Extend must_not to Pass 1 (new Filter wrapper) and Pass 2 (append to existing Filter) after Phase 4 canary revealed "Activation for Young Offenders - Public Interest" leaking through Pass 1 at 0.5008.
**Reasoning:** Pass 1 was unfiltered, so any secondary_source point scoring above the 0.45 Pass-1 threshold bypassed the Pass-3-only filter. Defence-in-depth applied to Pass 2 even though case_chunks have no quarantined field — protects against future payload schema changes.
**Outcome:** Q31 + Q16 canaries confirmed stub-absent post-fix. Baseline +4P delta validated.

### Decision: Apply BM25 FTS as surgical patch, not whole-file SCP
**Context:** Session 68 wrote fetch_case_chunks_fts() into local server.py but never deployed to VPS. Simplest approach would have been SCP'ing local file up.
**Decision:** Extract the three BM25 hunks from local copy, apply to live VPS file via hex-ssh.
**Reasoning:** Earlier in this session, three must_not quarantine patches landed on the live VPS server.py via hex-ssh. Local copy did not have them. Whole-file SCP would have silently reverted the quarantine work. Surgical extraction preserves both changesets.
**Pattern:** Reusable for any future "session N code written locally, not deployed" scenario when intervening VPS patches exist.

### Decision: Defer Track 2 (remote MCP at auslaw.arcanthyr.com) indefinitely
**Context:** Original MCP build plan proposed hosting auslaw-mcp as remote MCP via subdomain + nginx + SSL + custom Claude.ai connector. Intent: access auslaw tools from browser-based Claude.ai sessions on any machine.
**Decision:** Don't build. auslaw-mcp is now live via CC on Windows (session 72). That covers 90% of the use case. The remaining 10% (browser-based claude.ai sessions needing auslaw tools, e.g. from work terminal) is narrow and the build tax is high: nginx config, subdomain + SSL, auth scheme, stdio→HTTP transport layer, ongoing maintenance when upstream updates. Not worth it until specific browser-MCP friction is encountered repeatedly.
**Related decision (session 57):** "Arcanthyr MCP server — scratched" was a different context (wrapper over Arcanthyr synthesis) but the same reasoning applies: auth complexity + maintenance overhead + marginal gain.

### Decision: Quick Search Phase 5 full-judgment fetch against /fetch-page, not auslaw-mcp HTTP bridge
**Context:** auslaw-mcp has strong AustLII HTML parsing with paragraph numbers + OCR fallback. Tempting to use it as backend for the arcanthyr.com Phase 5 reading pane.
**Decision:** Build Phase 5 directly against existing /fetch-page, render sanitised HTML (preserving paragraph numbers — not stripped text), cache in new `austlii_cache` D1 table with 30-day TTL, fall back to "Open on AustLII" link on fetch failure.
**Reasoning:** /fetch-page is already proven and already on the VPS. auslaw-mcp is stdio-only — would require a FastAPI wrapper to expose HTTP, new surface and new maintenance. If parsing quality proves inadequate later, retrofit an auslaw-mcp bridge — but don't build preemptively for a problem not yet encountered.

## Session 74 decisions — 19 April 2026

**Split-constant design for BM25 scoring paths.** BM25_SCORE_KEYWORD serves the boost path (additive delta for chunks already in results via multi-signal confirmation). BM25_INTERLEAVE_SCORE serves the novel-hit path (synthetic score for newly-introduced FTS chunks that need to compete with semantic). Using a single constant for both paths creates a scaling trap: gentle nudge values (0.0139) are right for additive boost but too weak for novel-hit competition; competitive values (0.50) are right for novel-hit interleave but create additive monster scores (semantic 0.47 + 0.50 boost = 0.97) in the boost path, reintroducing the RRF-era vocabulary-contamination failure mode via the back door. Rule: dual-purpose score constants require dual-purpose auditing. Any time a synthetic score constant's value changes, verify both its novel-assignment site and its additive-boost site independently.

**"Corpus gap" diagnoses require retrieval-exhaustion first.** Session 73 diagnosed Q16 (Neill-Fraser DNA) as a corpus content gap — "no appellate Neill-Fraser material in corpus". Session 74 interleave deploy surfaced [2021] TASCCA 12 and [2019] TASSC 10, both confirmed genuine Neill-Fraser appellate proceedings. Material was in corpus; semantic retrieval couldn't bridge the vocabulary gap. Rule: before declaring content gaps, exhaust FTS, exhaust interleave, exhaust alternative query phrasings. The 2025 query "neill fraser dna secondary transfer" failed against session 73 retrieval not because the corpus lacked content but because the semantic embeddings didn't bridge "neill fraser" to chunks phrasing it as "Chappell" or "secondary transfer of DNA in a murder". Keyword bridge via FTS closed the gap.

**Plan doc implementation requires live-code audit before application.** BM25_INTERLEAVE_EVALUATION_PLAN.md specified a `chunks.sort()` addition before the domain filter. CC's Phase 0 read of live server.py showed line 587 already performs the same flat score sort as the final operation — the proposed addition would have been a byte-identical no-op three lines earlier. Plan docs are written against expected state; live code may have drifted since the plan was written. Rule: Phase 0 (read + report live state) is non-negotiable before Phase 1 (write) on any session involving server.py, worker.js, or any long-lived canonical file.

## Session 75 decisions — 19 April 2026

### FTS5 dedup policy — keep newest rowid per chunk_id
When sweeping duplicate chunk_ids from `case_chunks_fts`, keep the row with MAX(rowid) (most recent insertion), drop older rowids. Rationale: validated empirically against D1 — in 5/5 sampled duplicate chunk_ids, `case_chunks.enriched_text` exactly matched the MAX(rowid) FTS row's `enriched_text`. Because D1 was the source of the last Qdrant embed, keeping newest-FTS aligns all three stores (D1 / FTS / Qdrant). Inverse policy (keep oldest) would create FTS-vs-D1-vs-Qdrant mismatch. Policy codified in the DELETE SQL used session 75 and in the CC brief for the worker.js FTS5 upsert fix (Worker e5934624).

### Aliasing scope — 4 queries → 2 queries based on corpus-gap verification
Session-74 nominated Q10/Q14/Q23/Q24 as aliasing candidates. Session 75 pre-flight D1 check revealed Q10 and Q24 target chunks do not exist (corpus gaps, not retrieval defects) and Q14 is not a vocabulary mismatch. Narrowing scope to Q12 + Q23 before committing to any anchor-edit mechanism prevents wasting effort on chunks that can't be lifted by aliasing because they don't exist to be lifted. Verification-before-design pattern — applied upstream of anchor design, not during it.

### Path A session closure rationale
Anchor patch design deferred to next (Opus-consulted) session rather than attempted in session 75. Two tightly-coupled open questions — (1) aliasing mechanism for Q12 + Q23 anchors, (2) anchor generation refinement to address the MDA s 29 over-generalisation case — should be resolved in a single Opus consult, not sequentially. Attempting to design aliasing on top of a known-imprecise anchor heuristic would require re-design if the anchor heuristic changes. CLAUDE_decisions.md rule reinforced: prompt engineering decisions affecting data quality at scale are Opus-consult territory.

### Stale baseline file confusion — cost analysis
Twenty-minute diagnostic chase into a phantom quarantine leak was caused by grep defaulting to `~/retrieval_baseline_results.txt` which was Apr 16 data (pre-quarantine). Root cause: generic filename used for the "working" baseline while timestamped snapshots preserve history. Mitigation logged as Known Issue — use timestamped files (`_post_interleave.txt` is session 74 canonical). Longer-term fix worth considering: `retrieval_baseline.sh` should save to a timestamped file AND update a `_latest` symlink, retiring the generic `_results.txt` name entirely.

## Session 76 decisions — 19 April 2026

### Additive anchor injection is low-leverage — body text dominates the embedding vector
Session 76 tested whether the session-65 `Key terms:` anchor prepend is a useful lever for injecting practitioner-synonym vocabulary into corpus chunks. Result: zero baseline movement after injecting "unfavourable witness, hostile witness" into the CONCEPTS lines of 5 s 38 EA doctrinal chunks. Diagnosis: the anchor is a 5-10-term prepend against 500-4,700-char bodies. Against that surface ratio, a few added anchor tokens cannot reshape the vector past the body's own semantics. Rule: do not use anchor-CONCEPTS edits to inject alias vocabulary. The anchor is a subtractive lever (prune antonym tokens to de-rank false positives), not an additive one.

### Practitioner↔statutory aliasing closes via query-side expansion, not corpus-side edits
Session 76 closed with the null baseline result on Q12 and Q23 despite two intervention passes (anchor + body). Body injection worked on probes whose wording overlapped the injected prose but not on natural user phrasings. This establishes that practitioner↔statutory aliasing is a query-side variance problem — users ask the same concept in many ways, and no finite per-chunk edit set can cover all phrasings. Resolution: query expansion (rewrite user query into N variants pre-retrieval, merge results). One implementation covers all pairs. Promoted Priority #6 → Priority #1 in consequence.

### Subtractive anchor patching (antonym pruning) validated as a high-leverage technique
MDA s 29 "Search Powers" chunk had `warrantless search, Tasmanian law, police authority` in its CONCEPTS line. These tokens collided with the "search warrant execution" query even though the chunk is semantically antonymic. Removing the antonym + overly-generic tokens from CONCEPTS and replacing them with positive-phrasing domain terms (`Misuse of Drugs Act s 29, drug search power, drug possession, reasonable suspicion`) dropped the chunk out of Q23 top-3. Asymmetry recap: anchor additions are weak, anchor deletions are strong. This is architecturally consistent — pollution concentrated in a small anchor has disproportionate effect; a few alias tokens scattered into a small anchor do not.

### Positive-phrasing prompt rule is retroactive-inert; existing antonym-polluted CONCEPTS stay polluted
The rule added to `enrichment_poller.py` Pass 2 prompt instructs the enricher to phrase all CONCEPTS terms positively. This only affects new ingests — existing chunks already in D1 retain whatever antonym tokens they were enriched with at their original ingest time. A corpus audit (grep for `warrantless`, `without warrant`, `non-consensual`, `not admissible`, `uncorroborated` in raw_text) would surface candidates for one-by-one subtractive rewrite. Defer the audit unless a new pollution symptom surfaces on baseline.

### Probes separate "mechanism broken" from "mechanism works conditionally"
When baseline produces a null result after an intervention, run a probe query that uses the exact injected vocabulary before concluding the mechanism failed. Session 76's probe queries ("cross-examining an unfavourable witness hostile witness common law", "knock and announce warrant") lifted patched chunks to #1, proving body injection mechanically works. Without probes, we would have misread the null benchmark result as "body injection doesn't work" when the correct diagnosis was "body injection works but user phrasings diverge from injected prose". Rule: after any corpus-side retrieval intervention, run both the natural benchmark query AND a probe query aligned with the injected vocabulary. The delta between the two isolates mechanism efficacy from phrasing coverage.

### Uniqueness check before every REPLACE-based UPDATE
Before applying any `UPDATE ... SET col = replace(col, pattern, replacement)` to D1, run a count query: `(length(raw_text) - length(replace(raw_text, pattern, ''))) / length(pattern)` — expect exactly 1. Zero means the pattern is wrong and the UPDATE would be a silent no-op. Greater than 1 means the REPLACE would fire in multiple places, corrupting the chunk. Pre-flight uniqueness avoids silent data corruption that is hard to detect after the fact. Note: D1 has a compound-SELECT term limit — 7 UNION ALL subqueries hit it; split into batches of 3-4 if running multi-chunk uniqueness in one query.

### `top_k` is not a valid payload field on `/search`
Passing `"top_k": 12` in the search request body causes the endpoint to return 0 chunks (field rejected or filter-applied-incorrectly). The server default is 6 and the baseline script sends no top_k parameter. The known issue in CLAUDE.md referring to a server-side cap at 12 describes an internal min/max bound on server-read values, not a client-settable parameter. When probing retrieval, omit top_k entirely.

## Session 77 decisions — 19 April 2026

**Variant generation: GPT-4o-mini in server.py over Workers AI Qwen3 in worker.js.** Workers AI bindings (`env.AI.run`) are only accessible from worker.js, which would force query expansion into a two-file change with a new Worker→VPS contract (a `query_variants` array in the search request body). GPT-4o-mini runs inside server.py on the existing OpenAI key pipe — the same path `enrichment_poller.py` Pass 2 uses — keeping the patch single-file. Latency 300–600ms vs 1.5–3s for the 30B Qwen3 model at Cloudflare edge. Cost negligible at practitioner query volume. Reversibility: one file vs two. Decisive factor was architectural simplicity, not cost.

**Variant count: N=3 generated + original query = 4 Pass 1 calls total.** Three variants cover the main aliasing corridor (statutory / practitioner / doctrinal) without eating the latency budget. Prepending the original query guarantees no regression against unmodified search — variants are additive, never substitutive. N≥4 gives diminishing returns because legal vocabulary clusters naturally into three lanes (statute text, courtroom shorthand, textbook doctrine). Any query whose concept doesn't appear under one of those three framings also won't benefit from a fourth framing.

**Fan-out concurrency: ThreadPoolExecutor(max_workers=4).** Sequential fan-out would multiply Pass 1 latency by 4. Qdrant calls are I/O-bound HTTP to localhost:6334, so Python threads work fine under the GIL — no async/await refactor of the surrounding sync request handler needed. Parallel execution collapses fan-out latency to max(Pass 1 latency per leg) rather than sum.

**Per-future exception handling in the merge loop.** The original Phase 2 diff used a list comprehension over `as_completed().result()`, which re-raises any transient Qdrant error and 500s the whole search. With 4 concurrent Pass 1 calls the failure probability multiplies. Wrapping each `.result()` call in try/except and logging the failure preserves the "additive, never worse" property — a broken variant leg drops silently from the merge, the other legs still contribute. The original query leg reuses the already-computed `query_vector`, so it has the same failure surface as pre-expansion code; worst case is all variant legs fail and behaviour is identical to `QUERY_EXPANSION_ENABLED=false`.

**Few-shot examples: gate-adjacent (Q12/Q23 patterns) over neutral.** Accepted controlled "teaching-to-the-test" risk in exchange for a fast mechanism-works signal on the first baseline run. Mitigated post-deploy by running generalisation probes using natural-phrasing variants ("witness refusing to cooperate during evidence in chief", "police entering premises to execute warrant Tasmania") which confirmed the prompt performs semantic rewriting rather than keyword-matching to its examples. Probe 1 correctly disambiguated "refusing to cooperate" to s 36/s 128 EA rather than generating s 38 variants blindly — strong signal that the prompt reads query semantics, not surface features. If probes had missed, next step would have been example-swap, not prompt-rewrite.

**Generalisation probe pattern for query-side interventions.** After any query-side retrieval intervention that uses few-shot examples, run natural-language variants of the gate queries to distinguish "mechanism works" from "prompt memorised the gate." The delta between gate performance and probe performance isolates intrinsic efficacy from example-fit. Mirrors the session-76 probe-query pattern for corpus-side interventions (which distinguished "mechanism broken" from "mechanism works conditionally"). Rule: gate queries validate the mechanism; probe queries validate the design.

## Session 78 decisions — 19 April 2026

**subject_matter Pass 2 filter: Qdrant MatchAny over cache-based penalty.** Pass 2 already had a strict `must=[type=case_chunk]` filter — adding `MatchAny(any=["criminal","mixed"])` to the same `must` list is a native Qdrant-side exclusion requiring zero network round-trips. The existing cache-based `apply_sm_penalty()` path was designed before `subject_matter` existed in Qdrant payloads and operates on retrieved chunks post-query. The native filter short-circuits retrieval before scoring, which is both more efficient and cleaner semantically. The cache penalty is retained in Pass 2 as defence-in-depth for cases whose Qdrant payloads predate the session 60 re-embed (where `subject_matter` may be missing). The two mechanisms are complementary, not redundant.

**source_type column as Qdrant type discriminator (Option D) over citation-prefix detection (Option B).** Option B would have routed chunks with a citation ID starting with `authority-` to a different Qdrant type. Rejected because: (1) the check is invisible — it depends on a naming convention with no schema enforcement; (2) it couples ingest ID format to routing logic permanently; (3) it produces silent misbehaviour if IDs ever change. Option D uses the existing `source_type` column in D1 secondary_sources and the `SYNTHESIS_TYPES` constant in enrichment_poller.py — zero schema changes, auditable via `SELECT source_type, COUNT(*) FROM secondary_sources GROUP BY source_type`, rollback by removing the set entry or overriding `source_type` on the rows. Rule: always prefer explicit stored state over derived/implied state for routing decisions.

**Isolation-before-ingest ordering for new Qdrant types.** Phase 2b (server.py must_not filters + poller SYNTHESIS_TYPES routing) was deployed and committed before any authority-synthesis chunk was ingested into D1. This sequencing means there is no window where authority chunks can appear in normal retrieval results — the exclusion filter is live before the first chunk exists. The converse (ingest-then-filter) would require a race-free deployment to avoid a brief exposure window. Ordering cost: one extra commit and deploy cycle. Risk averted: temporary contamination of 31-query baseline during next scrape batch or poller run. Rule: for any new Qdrant type that should not surface in existing passes, deploy the must_not filter before the first chunk of that type is created.

## Session 79 decisions — 20 April 2026

**Dedicated ingest script vs regenerate-then-reuse-existing-pipeline** — Phase 2c faced a format mismatch between `build_authority_chunks.py` output (233 .md files with metadata-first order, no `[TYPE:]`, no `<!-- block -->` separator) and `ingest_corpus.py` expectations. Two options: (A) fix the generator + extend `ingest_corpus.py` to accept a third block type and regenerate all 233 files; (B) write a dedicated `scripts/ingest_authority_chunks.py` that treats each staged file as a single atomic chunk. Chose B. Reasons: staged files were already structurally valid (all 233 had consistent CITATION/TITLE/CATEGORY metadata); authority-synthesis chunks are a genuinely distinct content type from master-corpus chunks (no TOPIC/ACT/CASE fields, fixed CATEGORY `citation-graph`), so a separate ingest path maps cleanly to the architecture; extending the battle-tested `ingest_corpus.py` risked main-path regression for zero net gain; regeneration burns tokens. Cost: every future authority regeneration still needs the dedicated script — accepted.

**Live-D1-beats-history when state mutates silently** — original Phase 2c run plan included a post-insert `UPDATE secondary_sources SET enriched=1` step, sourced from conversation-history snapshots showing `handleUploadCorpus` hardcoding `enriched=0`. First dry-run revealed `enriched=1` already set on insert — Worker had been updated silently at some point between the history snapshot and now. Rule: for Worker/D1 state that's trivially checkable via a single MCP query (INSERT defaults, column existence, current row counts), run the query first and use history only for intent/rationale. `conversation_search` is valuable for understanding why a past decision was made, less reliable for the current state of moving parts.

**Cloudflare Worker bulk-ingest delay rule: 1.0s/chunk** — empirically established this session. At 0.5s delay (120/min), Worker throttles in burst clusters around positions #50 and #150 (consistent with burst-token-bucket depletion). At 1.0s delay (60/min), zero throttling across 233 chunks. File as standing rule for any new `/api/legal/upload-corpus` bulk script — start at 1.0s; only optimise down after a >500-chunk benchmark run.

**Authoring gaps deferred to post-scrape baseline.** Q9 (guilty plea discount / Sentencing Act s 11A) and Q26 (unreasonable verdict / M v The Queen) were diagnosed as corpus content gaps but not authored this session. Rationale: scraper is still running and will add ~hundreds of cases before it completes; the post-scrape baseline may surface additional gaps or close these two via newly-scraped case law. Authoring against an incomplete corpus risks solving gaps that the scraper will solve automatically, or missing gaps that will only become visible post-scrape. Rule: do not invest in doctrine authoring until the scraper is complete and the baseline has been re-run against the full corpus.

## Session 82 decisions — 20 April 2026

**Q9 corpus gap reframed — common law, not statute:** Prior sessions diagnosed Q9 (guilty plea discount) as fixable by ingesting Sentencing Act s 11A. This was wrong — Tasmania has no statutory guilty plea discount. s 11A covers sexual offences aggravating factors. The fix is secondary source authoring on the Tasmanian common law discount doctrine (quantum, timing, methodology) citing relevant TASCCA/TASSC authorities.

**Legislation upload: HTML without history is canonical format:** Confirmed via testing that HTML copy from legislation.tas.gov.au with history disabled, saved as .txt, produces the cleanest section boundary detection. PDF produces pagination artifacts; HTML-with-history bloats vectors with amendment reference noise. This preference is now documented in the UI dropzone helper text.

**Batch insert pattern for legislation:** CPU timeout on large Acts (100+ sections) resolved by replacing sequential D1 loop with `env.DB.batch()` chunked at 99 statements. This is now the standard pattern for any bulk legislation ingest — consistent with `handleWriteCitations` and `handleMarkEmbedded`.

## Session 83 — 20 April 2026

**Decision: FTS5 phrase-match-first with silent AND fallback for user-facing Word Search.**

Options considered: (1) pure phrase match — fails on 80% of multi-word queries where user types conceptually-related words not adjacent in source; (2) pure AND-of-tokens — loses phrase precision, "restraint order" finds chunks mentioning restraint and order in any context; (3) expose Boolean operators to users — UX hostile, legal practitioners will not learn FTS5 syntax; (4) phrase match with silent AND fallback — chosen.

Rationale: single-token queries (`restraint`) collapse to AND-of-one = all-instances, intuitive. Multi-token queries try phrase first (`"restraint order"` in FTS5) — if hits exist, user gets precise sequence matches; if zero hits, silent fallback to AND returns the looser match set with a UI-visible note ("(all words match)"). No Boolean characters enter the user-visible surface. Sanitiser strips `"`, `*`, `()`, `:`, `NEAR`, `AND`, `OR`, `NOT` before query construction so inputs like `R v *` don't accidentally invoke prefix mode.

**Decision: SCP LF↔CRLF handling — priority-1 remediation for session 84.**

Options considered: (1) accept CRLF diff inflation as documented, continue as-is — rejected, session 83 proved it is destructive not cosmetic; (2) switch all VPS round-trips to hex-ssh — preferred for reads and writes, slower for bulk SCP; (3) add `.gitattributes` with `eol=lf` pins — catches new files, doesn't fix existing corrupted tails; (4) pre-commit parse hook — catches truncation before it hits git history.

Chosen: combination of (3) + (4) + selective (2). `.gitattributes` normalises future checkouts, pre-commit hook using `@babel/parser` (already available in `arcanthyr-ui/node_modules/`) blocks commits of truncated `.js`/`.jsx` files, hex-ssh replaces SCP for any file we edit bidirectionally (worker.js, server.py, enrichment_poller.py). Retrospective audit of existing tracked files via `git show HEAD:<path>` syntactic-completeness check added as an explicit priority task.

**Decision: `@babel/parser` replaces `node --check` as pre-deploy gate.**

`node --check worker.js` returned exit 0 silently on a file truncated at `pass1.judge || ` with unclosed template literal, unterminated `.bind(` call, and no `export default`. Failure mode unexplained — possibly parser recovery or a bug in node 20's check mode on large files with mixed line endings. `@babel/parser` with `{ sourceType: 'module', plugins: ['jsx'] }` caught it instantly. New rule: `npm run build` OR explicit babel parse before every `wrangler deploy`. `node --check` remains useful for quick iteration but not as the last gate.

## Session 84 decisions — 20 April 2026

**Pre-commit hook: bash + null-separated loop required for space-containing paths.** Initial hook spec used `#!/bin/sh` with `for f in $STAGED` loop. Failed immediately on first commit: `Arc v 4/Worker.js` split into three tokens on spaces. Fix: `#!/bin/bash` shebang (process substitution requires bash), `git diff --cached -z --name-only --diff-filter=ACM` with `while IFS= read -r -d '' f` loop. This is the correct pattern for any git hook in this repo — document as the canonical hook template.

**`node --check` retired as pre-deploy gate.** Confirmed false-positive: exit 0 on worker.js truncated at `pass1.judge ||` (no closing paren, no `export default`). `npm run build` (rolldown) is the correct gate — it exercises the full module graph. `@babel/parser` in the pre-commit hook catches parse errors earlier. `node --check` only validates V8 tokenisation, not module structure.

**SKILL.md "truncation" was a session-closer false positive.** The session-closer generated a report of truncation at line 40 of `arcanthyr-session-closer/SKILL.md`. CC cat confirmed 94 lines, intact. This is consistent with the documented session-closer false-commit pattern (session closers have previously generated false "created" entries for files never written). The session-closer's own output is not a reliable source of file state — always verify with CC reads.

## Session 85 decisions — 20 April 2026

**word-search two-query architecture** — `bm25()` and `snippet()` are FTS5 auxiliary functions that SQLite rejects in any query with a JOIN or GROUP BY (`SQLITE_ERROR: unable to use function bm25 in the requested context`). Fix: Step 1 queries `case_chunks_fts` alone (`SELECT citation, bm25(...) AS rank ... ORDER BY rank LIMIT 200`) to get ranked citations, Step 2 dedupes in JS and fetches case metadata via `WHERE citation IN (...)`. Court filter moved to JS post-fetch to avoid consuming a bound-variable slot and to stay under D1's 100-variable limit. Verified 4ms query time at D1 level.

**D1 100 bound-variable limit** — D1's `.bind()` accepts a maximum of 100 positional parameters per statement. Passing all 200 deduped FTS citations to `WHERE citation IN (?)` would breach this. Fix: slice deduplicated citations to `limit` (≤100) before building the IN clause. `limit` is capped at 100 max in the route, so the IN clause never exceeds 100 placeholders.

**AustLII VPS proxy bypass** — Contabo VPS IP range is blocked by AustLII at the network level (curl returns 000, no HTTP response). The existing `handleFetchPage` VPS proxy path is therefore unusable for AustLII search. Fix: `handleAustLIIWordSearch` calls `fetch()` directly from the Cloudflare Worker edge with browser-mimicking headers (`User-Agent`, `Referer`, `Accept`, `Accept-Language`). Cloudflare edge IPs are not blocked by AustLII. This applies only to the word-search route — the scraper still routes through the edge proxy for individual case fetches.

**AustLII sinosrch URL format** — AustLII search results use `/cgi-bin/viewdoc/` paths (not bare `/au/cases/tas/`). Correct URL pattern: `/cgi-bin/viewdoc/au/cases/tas/(COURT)/YEAR/NUM.html?context=1;query=...`. Parser regex must match the `viewdoc` prefix. Case name link text contains nested `<b>` tags (query term highlighting) — regex uses `[\s\S]*?` capture with post-processing `replace(/<[^>]+>/g, '')` to strip tags, plus `replace(/&amp;/g, '&')` entity decode and `replace(/\s*[\d{4}].*$/, '')` to strip AustLII's appended citation+date suffix.

## Session 86 decisions — 20 April 2026

**Jade URL format — AustLII-style path, not `/article/search`**
Initial `buildJadeUrl` used `https://jade.io/article/search?query=<encoded_citation>` (assumed, not verified). Live test returned HTTP 500. Correct format confirmed by browser navigation: `https://jade.io/au/cases/tas/COURT/YEAR/NUM` — same path structure as AustLII but with `jade.io` as the domain. BarNet documentation confirms this. Citation parser extracts year/court/num from `[YEAR] COURT NUM` format and builds the path. `TAMagC` preserved in mixed case via the court map value (input uppercased for lookup only).

**Jade login friction — leave alone**
Jade requires login on first click in a fresh browser session. Decision: do not attempt to automate or embed credentials. Once logged in via normal Chrome usage the session persists for weeks. `search_type` column makes `client_version` effectively redundant for slicing query log data — `client_version` left as `'v68-history'` permanently (dead column).

**Phase 5 fetch path — CF edge, not VPS proxy**
AustLII blocks the VPS IP (confirmed from prior sessions). `handleFetchJudgment` fetches direct from CF edge using the same browser-mimicking headers as `handleAustLIIWordSearch` — no VPS proxy. `handleFetchPage` was explicitly not reused as it routes through VPS for AustLII URLs.

**Phase 5 viewer — `dangerouslySetInnerHTML` deliberate**
Using `dangerouslySetInnerHTML` to render fetched AustLII HTML is appropriate here: private authenticated tool, known content source, no user-generated input. Plain-text fallback would lose judgment formatting. Decision recorded to avoid future "safety" refactoring.

**`austlii_cache` 800KB truncation guard**
HTML truncated at 800KB before D1 upsert to stay within D1 row size limits. No judgment in the Tasmanian corpus is expected to approach this limit in practice; guard is defensive only.

## Session 87 decisions — 21 April 2026

**AmendmentPanel moved from case pane to Legislation tab** — Originally wired into the case reading pane iterating over legislation_extracted. Tom confirmed he only wants Acts/sections displayed in the case pane; the amendment history belongs on the Legislation tab where it's associated with the Act itself. UI-only move; routes and D1 unchanged.

**resolve-act as primary path, source_url as cache** — Rather than requiring manual source_url population for every new Act, the resolve-act Worker route resolves live on first use and writes source_url back to D1 as a side-effect. This means new legislation added to the corpus self-registers on first use without any pipeline changes. The 5-Act backfill is an optimisation (avoids live lookup latency) not a correctness requirement.

**Bill page URL strategy: Google site-search fallback** — parliament.tas.gov.au migrated to slug-based bill page URLs derived from bill titles, which cannot be reconstructed from Act number + year alone (the only data available from the projectdata API). Rather than linking to 404s or the generic bills index, the "Locate Hansard ↗" button constructs a targeted Google search (`site:parliament.tas.gov.au "N of YYYY"`) that reliably surfaces the correct bill page as the first result. Proper fix (year index scrape + bill number matching) deferred — current solution is functionally adequate.

**case_legislation_refs noisy by design** — Confirmed the column stores free-text citation strings extracted by the enrichment pipeline, not structured identifiers. Format is inconsistent (leading section refs, non-Tas Acts, bare section numbers). Not a bug — the resolve-act normalization handles this at query time.

**Option 3 Hansard search widget — deferred, design captured** — A proper in-panel search experience would add two buttons per amendment row: "Find bill page ↗" (Google site:search as currently implemented) and "Search Hansard ↗" linking to the Funnelback-powered `search.parliament.tas.gov.au` with the bill name pre-filled. Proposed URL format: `https://search.parliament.tas.gov.au/s/search.html?query={billName}&collection=parliament-hansard` — exact Funnelback parameters need one manual confirmation test (open the search, submit a query, copy resulting URL). No backend required — pure frontend URL construction from data already in the amendments response (`name`, `actNo`, `year`). Deferred pending Hansard URL format confirmation.

## Session 88 decisions — 21 April 2026

**auslaw-mcp (a) rate budget confirmed moot:** The original concern was MCP queries to `/fetch-page` starving the scraper's AustLII allowance. Confirmed today via curl that the Contabo VPS IP is TCP-blocked by AustLII at network level (SYN silently dropped, exit 28, HTTP 000). `/fetch-page` cannot reach AustLII from the VPS regardless of any rate budget. Sub-item (a) closed without implementation.

**GitHub MCP (item d) — no new config required:** The guide written in a prior session specified `ghcr.io/github/github-mcp-server` with `--read-only` flag. The existing user-scope `github` MCP already in `~/.claude.json` satisfies this requirement. Verified via successful `mcp__github__get_file_contents` call. No new container or config needed.

**auslaw-mcp two-step search pattern — canonical workflow:** `search_cases` cannot work from VPS due to AustLII TCP block. Canonical pattern for CC/Cowork sessions needing topic-based case discovery: (1) `POST https://arcanthyr.com/api/legal/word-search` with `X-Nexus-Key` to get citations via CF edge; (2) feed citations to auslaw-mcp `search_by_citation` for full text. Documented in SESSION RULES. No code changes required — purely a workflow documentation fix.

**s38 CONCEPTS prepend via D1 concatenation:** The `update-secondary-raw` Worker route returns 404 for IDs containing spaces (known bug, undiagnosed root cause). Fix: D1 `UPDATE ... SET raw_text = '[CONCEPTS:] ...' || char(10) || ... || raw_text WHERE id = '...'` concatenation avoids needing full raw_text content and bypasses the broken route entirely. This is the correct pattern for any future secondary source raw_text prepend where the ID contains spaces.

## Session 89 decisions — 21 April 2026

**gpt-4.1-mini-2025-04-14 adopted as standard mini model** — Replaces gpt-4o-mini-2024-07-18 across all worker.js and server.py call sites. Cost increase (~2.5–3× over gpt-4o-mini) accepted given improved instruction following and structured output reliability. Pinned version string used throughout — alias strings avoided as they can silently redirect after deprecation events.

**claude-sonnet-4-6 adopted for Sol path** — Drop-in replacement for claude-sonnet-4-20250514 at identical pricing ($3/$15 per MTok). No prompt changes required.

**Synthesis dedup tightened to 3–5 principles** — Existing corpus not retroactively re-merged; principles_extracted is display-only (Library pane) and has no retrieval impact. Bulk requeue-merge across 1,900+ cases not justified for a cosmetic quality improvement. Tighter dedup accrues on new ingests and future targeted re-merges only.

**Subject_matter audit methodology confirmed** — Audit query `SELECT citation, case_name, subject_matter FROM cases WHERE subject_matter != 'criminal' AND (case_name LIKE 'R v%' OR case_name LIKE 'Tasmania v%' OR case_name LIKE 'Police v%')` is the canonical audit tool. DPP-initiated contempt proceedings (`R v [surname]`) are correctly classified as civil — they are not criminal prosecutions for substantive offences and should not retrieve on criminal law queries. Audit result: clean as of session 89.

**update-secondary-raw diagnosis** — The route reads `id` from JSON body and uses a parameterized query; spaces in IDs are handled correctly. Session 88 404s were hand-typed ID mismatches. The silent `{ ok: true, updated: 0 }` on no-match was a separate bug (now fixed). The route works correctly when IDs are sourced from the fetch-secondary-raw API response, as enrich_concepts.py does.

**Corpus block formatting approach** — Raw practitioner notes formatted into corpus chunks manually (Claude.ai) rather than via the GPT format-and-upload path, to ensure doctrinal accuracy and correct vocabulary anchors in CONCEPTS fields. Suitable for small batches of known-good source material. GPT path remains correct for bulk or third-party source uploads.

## Session 90 decisions — 21 April 2026

> **Legislation vocabulary anchor — Opus-designed format (session 90)**
> Uniform minimal format: `Key terms: {act_title}; s {section_number} {heading}.\n\n{raw_text}`. Prepend only, embed-only (not written back to D1 or Qdrant payload). Whitelist-agnostic — SM penalty and anchor are orthogonal. No part/division field included (unpopulated in D1 for all current Acts). No variation by section length — branching adds complexity with no benefit; short-section filter in Pass 1 already handles sub-200-char sections. Session 76 rule binds: anchor stabilises, does not inject. Every token in anchor already in section's domain.

> **Stage 1 → Stage 2 → Stage 3 reset sequence (session 90)**
> Evidence Act re-embedded first (Stage 1, 245 sections) to validate anchor format against known target query (Q14) before applying to remaining corpus. Stage 1 baseline confirmed zero regressions → Stage 2 (1,027 sections) reset and re-embedded → Stage 2 baseline confirmed zero structural regressions (Q21 improvement attributed to query expansion variance, not Stage 2 anchors — Sentencing Act deferred to Stage 3). Stage 3 (459 sections, first embed) initiated. Correct reset gate: `legislation.embedded` Act-level flag, not `legislation_sections.embedding_model` (unreliable — Stage 1+2 sections embedded before that column was written).

> **Synthesis feedback loop — parked (session 90)**
> Decision: do not build. Rationale: corpus still growing at volume; saved answers built from incomplete source material would be superseded by better retrieval as scraper continues; six-file build (worker.js, enrichment_poller.py, server.py, Research.jsx, Library.jsx, api.js) non-trivial for value that is additive not multiplicative at current corpus size; dedupe suppression means saved answers would stop surfacing anyway as underlying chunks improve. The `approved` column (session 68) and `POST /api/pipeline/feedback` route (session 68) are retained as partial infrastructure. Revisit when scraper stops adding large batches regularly and retrieval quality is stable.

> **Q9 and Q26 authoring approach (session 90)**
> Chunks authored without confirmed TASCCA authority on quantum (Q9) or local application (Q26). Honest gaps noted in chunk text rather than citing unverified interstate benchmarks or fabricating local authority. Pattern: author the doctrine accurately, flag the gap explicitly in the chunk body, supplement later if TASCCA authority surfaces via scraper or manual review using update-secondary-raw.

## Session 91 decisions — 22 April 2026

**Synthesis dedup approach — legal distinctness test over surface similarity** — The session 89 "near-synonymous" grouping cue was insufficient because it keyed on phrasing overlap, not conceptual identity. Two principles can share zero surface words but express the same legal concept (e.g. "broad sentencing discretion" and "sentencing is not a mathematical exercise"). The replacement uses an explicit legal distinctness test: two principles are duplicates only if they state the same rule, applying to the same legal test, under the same provision or doctrine. Tendency and coincidence evidence — both using "significant probative value" language — are the canonical example of shared vocabulary across distinct doctrines embedded in the prompt. Nuance preservation rule added: when merging, prefer the formulation carrying the most specific detail (statutory reference, named authority, Tasmanian qualification). Old dedup bullets replaced entirely rather than layered to avoid instruction conflicts.

**Parallel CC workflow** — First session using two CC instances on independent sub-tasks concurrently (Stream A: Qdrant court field + striprtf; Stream B: synthesis dedup). Tom and Claude.ai coordinate and oversee; CC instances implement in parallel. Pattern confirmed viable with no quality loss. To be applied wherever tasks have no shared state dependency.

## Session 92 decisions — 22 April 2026

**Quota-aware final cap over score boosting** — Opus confirmed quota approach is architecturally correct. Score boosting rejected: counter-multiplier compounds tuning burden without solving the structural issue; a boost strong enough to guarantee inclusion would distort cases where case_chunks should dominate. Quota expresses the actual invariant; boosting approximates it and hopes the numbers work out.

**SWAP_MIN_SCORE = 0.40** — Pass 3 retrieval threshold (0.25) is a recall floor, not a relevance floor. 0.40 aligns with Pass 1's threshold — if a secondary source competes at Pass 1 level, it competes for the guarantee slot. Q14's 0.4549 clears it; 0.25–0.40 borderline chunks don't.

**Quota conditioned on secondary_source type, not Pass 3 provenance** — Opus recommendation: source-agnostic rule survives pass restructuring, future pass additions, or secondary_source sub-type splits without rewiring. Pass 3 always fires so "conditional on Pass 3" collapses to "any secondary in pre-cap list" — equivalent when stated correctly.

**Q14 closed as semantic ceiling** — vocabulary patch + anchor fix delivered maximum achievable score improvement (~0.47). Gap to case_chunk floor (~0.15) is structural: "leading questions technique" query too broad, examination/witness vocabulary in case_chunks dominates cosine similarity. Corpus content correct and complete; practitioner querying "s 37 Evidence Act leading questions" retrieves chunk in top 3. Declared known limitation, not pipeline defect.

**Synthesis prompt party name constraint — deferred to next session** — hallucination identified (invented "Police v FRS" for [2020] TASMC 9). Mitigation is a single sentence addition to synthesis prompt. Deferred to allow a full synthesis prompt review pass rather than piecemeal additions. Risk: low — only affects citations where chunk lacks party names.

**Query suggestion feature — threshold-only variant preferred** — LLM-generated specific query strings risk hallucinated section numbers in a legal context. Threshold-only trigger (static warning string when top score < threshold) has no hallucination risk, zero latency cost, and is actionable for practitioner users. Parked alongside synthesis feedback loop — implement when corpus growth stabilises.

**Per-case scraper resume — deferred, freshness fix prioritised** — scoping confirmed per-case resume is low value while corpus is fully scraped. Active year freshness (frozen done entries) is the live risk. Fix: delete active year entries from progress.json + TASMC_2026 scope addition. Structural resume work deferred indefinitely.

## Session 93 decisions — 22 April 2026

- **Option A on "Police v FRS"** — Practitioner shorthand, not corpus bug. Criminal summary matters are routinely styled "Police v X" in Tasmanian practice even where AustLII formal parties name informants. No corpus cleanup required; `cases.case_name`, case_chunks.enriched_text, and two authored secondary_sources chunks retain the shorthand by design.

- **Skip performMerge party name clause** — performMerge operates on a single case's own material (`caseRow.case_name`, facts, issues, chunks). No cross-case citation generation, no pathway to fabricate party names for cases other than the one being synthesised. Adding the constraint here would increase instruction density without addressing any real failure mode. Party name constraint scoped to query-time synthesis only (Sol + V'ger).

- **Defer V'ger [LEGISLATION] label fix to separate session** — Audit identified V'ger context serialisation omits the `[LEGISLATION]` label that Sol applies, affecting section-query responses via V'ger. Genuine functional gap but unrelated to the party-name patch. Bundling would complicate regression attribution on the party-name change. Separate session keeps the two deploys cleanly isolated.

- **Synthesis prompt density rewrite skipped** — Audit confirmed all three prompts (performMerge, Sol, V'ger) are well-calibrated to their target models. Sonnet 4.6 handles Sol's fuller CRITICAL CITATION RULES + ANSWER STRUCTURE block comfortably. Qwen3's compact numbered RULES list suits its weaker instruction-following. performMerge's BAD/GOOD examples earn their token cost. No simplification or consolidation needed.

- **Promoted retrieval recall defects to outstanding priorities not known issues** — Q2 and Q5 misses are concrete, measurable recall failures on specific chunks that exist and are embedded. Not a stable characteristic to document and work around — they're defects requiring diagnosis. VPS Qdrant probe is the next-session entry point (check scores on known-good chunks against query vector).

## Session 94 decisions — 23 April 2026

**Court payload backfill executed rather than deferred.**
The court band re-rank was silently inert across 26,157 points since the session 91 anchor re-embed. Deferring leaves payload in an inconsistent state (new ingests write court, old don't) and accumulates retrieval-correctness liability on any query where a TASMC chunk scores within 0.05 of a CCA/Supreme chunk. Executed with baseline-gated revert path; Q9 TASCCA re-rank confirmed live post-patch, zero regressions. The alternative of re-embed-to-fix was rejected as unnecessary — `set_payload` with citation+type filter is idempotent, minutes not hours, zero vector drift.

**Q9 chunk rewrite shipped despite spot-fix character.**
Acknowledged as a spot fix (one chunk, one query pair) rather than systemic work. Rationale for shipping anyway: closes outstanding priority raised session 93, corrects authoring note factually wrong about TASCCA quantum authority existing, and discharges authoring debt before it compounds. Pass 3 + quota-aware cap retrieval path was already live; chunk sits at 0.4268 (above SWAP_MIN_SCORE=0.40) and loses quota slot to a higher-scoring competitor. Accepting the ceiling rather than further vocabulary optimisation — ceiling is known secondary-source structural behaviour, not a Q9 defect.

**Variant-draw stabilisation deferred to dedicated session.**
Identified in session 94 diagnostic as the single biggest remaining lever on retrieval quality. Scoped as its own session because: (a) requires A/B baseline comparison design between multiple remediation options (temp=0+seed vs leg-weighted merge vs deterministic expansion); (b) corpus-wide effects warrant Opus consultation per the architectural-decisions pattern; (c) tonight's session was already structurally loaded with diagnostic + payload backfill + chunk authoring. Variant stabilisation likely flips multiple baseline queries in a single change when it lands.

**0.4268 score on vocabulary-perfect chunk treated as watch item, not actioned.**
manual-b3603-chunk contains the exact practitioner query terms in both CONCEPTS anchor and body prose, and still scores 0.4268. Hypothesis: `strip_frontmatter` does not strip `[KEY:]` bracket-tag headers, leaving header metadata in the embed input and diluting the body signal by ~20-25%. If confirmed, this is a corpus-wide embedding quality issue affecting all 1,448 secondary source chunks authored in bracket-tag format. Deferred to single-grep verification next session rather than actioned tonight — the verification cost is negligible and tonight's session was already long.

## Session 95 decisions — 24 April 2026

- **Variant stabilisation deployment paused mid-CC-brief.** CC Brief 2 complete and internally validated (Step 0 pre-fix capture ran cleanly); Step 1 greenlight withheld pending three-model outside-view on whether continued retrieval tuning is justified. Rationale: Tom raised over-optimisation concern — stable 28P/3Pa/0M baseline across ~15 tuning sessions with no concrete user-experienced failures and a "each fix surfaces next issue" pattern. Claude acknowledged having framed option A (temp=0+seed+6-variants) by bundling methodology (determinism) with quality (over-generation) and selling the bundle on its weakest component. Clean separation forced: determinism ≠ quality improvement; 5 option framework built (4 technical levers + stop option).

- **strip_frontmatter bracket-tag fix scope reframed from corpus-wide to targeted 270-chunk cleanup.** D1 telemetry via Cloudflare MCP showed 73% of secondary_sources chunks (1,055 of 1,444) are already handled correctly by existing `strip_frontmatter()` Case 2 (concepts-as-literal-first-line). Only 270 chunks — the `[DOMAIN:]+[CITATION:]` + `### Heading` cohort — have bracket tags surviving to embedding. This reframes the fix from "corpus-wide embedding quality lever" to "targeted 270-chunk cleanup" and lowers its impact ceiling. Rationale: scope decisions should follow live data inspection rather than hypothesised worst case. Deferred pending strategic review outcome.

- **Three-model outside-view adopted as strategic decision mechanism.** Methodology: Tom pastes identical seeking-advice prompt to Opus (self), GPT-5, and a third model; gathers 3 reports; anonymises them (labels randomised); writes own preliminary synthesis; uploads to fresh Claude instance with evaluator prompt; evaluator is explicitly blind to project context (no MDs provided). Rationale for withholding MDs from evaluator: the MDs encode the same framing that may be driving the over-optimisation pattern; giving them to the evaluator would re-inject the bias the triangulation is designed to escape. Optional cross-validation via non-Claude evaluator to control for intra-family self-preference.

- **Baseline measurement methodology gap formalised.** Single-run baseline snapshots inadequate for A/B comparison given 31/31 top-1 citation drift between runs. Future retrieval A/B work requires minimum 3 runs per state, with variance captured alongside mean. Session 94's post-court-backfill snapshot is a single draw from a wider distribution and should not be treated as a fixed reference. Implemented retroactively this session via 2 additional pre-fix runs on VPS.

- **Grade-level robustness becomes a first-class observation.** 31/31 top-1 drift across 3 runs produced a stable 28P/3Pa/0M grade in all 3 samples. System is robust at the user-facing grade level while noisy at internal retrieval ordering. Raises the meta-question — surfaced in the seeking-advice prompt — of whether the internal variance matters at all to real outcomes, or whether it's cosmetic churn that baseline grading correctly absorbs.

## Session 96 decisions — 24 April 2026

**[2026-04-24]** *Retrieval layer frozen — Option 5 selected over Options 1–4, Option 2 pre-committed as class-specific response*

> The instrument (31-query binary-graded eval) has ≈±15pp resolution at 95% CI and cannot detect improvements below ~10pp of genuine movement. All four technical options (1: instrumentation, 2: vocab dictionary, 3: cross-encoder rerank, 4: embedding upgrade) require a resolving instrument to be worth running; only Option 5 (stop) doesn't require it. Option 2 pre-committed as approved response if real-use failures cluster on vocabulary/abbreviation-class — avoids re-litigation when the trigger fires. Rationale from Report B: the feedback loop driving ~15 sessions of tuning was running below the instrument's resolution floor — work felt like engineering but the instrument couldn't resolve the decisions being made.
>
> **Empirical vs prior-plausibility:** change made on prior-plausibility + statistical reasoning about instrument resolution — NOT empirical (by construction, since the instrument cannot produce empirical evidence of "stop is better"). Acceptable because the alternative (continue) also has no empirical support, and the cost of stopping is reversible on real-use trigger.

**[2026-04-24]** *`flagged_by` column added now rather than post-hoc*

> Built with multi-user auth in mind though there are no non-admin users yet. Server defaults `flagged_by='admin'` when no identity provided. Rationale: retrofitting user attribution after accumulating unattributed data produces unrecoverable nulls in the historical record. Better to eat the small complexity cost now. CRITICAL future note: when real user auth is wired up, `flagged_by` must be read from authenticated session state server-side, NOT from request body — currently the server accepts any body-supplied value, which is safe only while no non-admin users exist.

**[2026-04-24]** *No auth on `POST /api/legal/mark-insufficient`*

> Route sets one boolean + optional 500-char note on one D1 row. No corpus touch, no LLM call, no cost. Rate-limited at Cloudflare Worker level. Worst case: polluted feedback signal. Gating behind X-Nexus-Key would defeat the route's purpose (non-admin feedback capture). Different risk profile from `/api/legal/update-secondary-raw`, `/api/admin/requeue-*`, flag-synthesis — those touch corpus content or trigger LLM work and correctly require key auth.

**[2026-04-24]** *No separate `query_log.md` vault file*

> Original spec called for a markdown file logging real-use queries. Replaced with D1 `query_log` feedback columns + UI button. Markdown approach was a manual discipline tax — would have decayed within two weeks of practitioner use. Button approach: one click when answer is insufficient, zero work otherwise. Denominator (all queries) already captured automatically; the UI button captures only the failures. Trade-off: under-reports relative to a forced-entry log, but that's the right trade for a sole-operator tool. The button is really for future non-admin users whose failure-clicks will be better signal than Tom's anyway (practitioner-blind-spot).

**[2026-04-24]** *MCP D1 PRAGMA truncation — diagnostic workflow change*

## Session 97 decisions — 24 April 2026

- **V'ger `${principles}` omission scoped out** — the V'ger context serialisation block also omits the `${principles}` append that Sol includes. Discovered during session 97 fix. Deliberately left out of scope to keep session 97 a single-line targeted change with isolated regression attribution. Documented in KNOWN ISSUES; treat as a separate future session task.

## Session 98 decisions — 24 April 2026

- **`handleRequeueMerge` citation scoping — confirmed already fixed, never in MDs.** Live code inspection revealed `body.citations` array path and `body.citation` single-citation path both present inside `target="remerge"` branch. The item in userMemories was stale. Removed from deferred list with no action required.

- **Stage 3 legislation embed roadmap item removed.** SYSTEM STATE confirms all 8 Acts at `embedded=1`. Roadmap entry "verify complete" was stale; removed.

- **Q14 retrieval diagnostic roadmap item removed.** Confirmed semantic ceiling per sessions 91–96 and present in KNOWN ISSUES as such. Roadmap entry framed it as an open diagnostic, which was stale. Removed. KNOWN ISSUES entry retained as the canonical record.

- **V'ger `${principles}` fix shipped.** Scoped out of session 97 on isolation grounds (keep that deploy to a single-line change). Delivered session 98 as its own targeted change. KNOWN ISSUES entry deleted.

- **Word artifact cleanup: 411/1,444 rows.** `gen_cleanup_sql.py` written as reusable tool rather than another one-off script. Key implementation note: `subprocess.run` on Windows requires `encoding='utf-8', errors='replace'` when capturing wrangler stdout — Windows default cp1252 silently fails on non-ASCII D1 content, surfacing as `TypeError: JSON object must be str, not NoneType` rather than a UnicodeDecodeError.

- **RTF + auto-populate shipped.** Both were partially pre-implemented in `Upload.jsx` from prior sessions — RTF accept/handleDrop branches and citation/court extraction existed. Only `stripRtf` body and `caseName` were missing. Roadmap entries referenced `app.js` as target file, which does not exist; actual file is `arcanthyr-ui/src/pages/Upload.jsx`. Both roadmap entries removed on completion.

- **`.gitattributes` already comprehensive.** Session brief assumed absent; file existed with five rules covering `.js`, `.jsx`, `.py`, `.md`, `.json` all `eol=lf` plus `text=auto`. No action needed.

> The Cloudflare Developer Platform MCP `d1_database_query` tool silently truncated PRAGMA output at cid 17 on the 18-column `query_log` table, which masked a pre-existing `sufficient` column at cid 18. Concrete risk: schema-existence checks that rely on PRAGMA will silently miss late-cid columns and propose redundant ALTERs (which may or may not error depending on the specific collision). New standard: use `SELECT <col> FROM <table> LIMIT 0` for single-column existence checks on any table wider than ~15 columns; reserve PRAGMA for narrow tables or where the output can be visually confirmed to include the expected cid range.

## Session 99 decisions — 24 April 2026

**Parliament bill slug resolver — approach chosen:** Worker-side fetch of parliament.tas.gov.au year index (`/bills/bills{YEAR}`), two-pass regex (href-pattern `-{N}-of-{YEAR}` first, link-text fallback for edge cases). No KV caching — parliament site is fast enough, not a hot path. Route placed in `/api/legal/` rate-limited block (no X-Nexus-Key) to match `amendments` and `fetch-judgment` auth pattern and because AmendmentPanel has no credential mechanism.

**DLQ design — threshold and pending check:** retry_count incremented per CHUNK Queue delivery attempt; dlq=1 set at threshold 3 (matches Cloudflare Queue default max_retries, avoids double-retry). Pending check updated from `done=0` to `done=0 AND dlq=0` corpus-wide — cases with one dead chunk now complete their merge from remaining chunks rather than blocking indefinitely.

**Auslaw MCP Track 2 — removed from roadmap:** VPS is TCP-blocked by AustLII at network level (SYN drop confirmed). A remote MCP at auslaw.arcanthyr.com would hit the same block for all search functionality. Only `search_by_citation` survives from VPS context, which CC already handles via hex-ssh. No net benefit over current setup.

## Session 100 decisions — 24 April 2026

**LLM variant-draw stabilisation — formally closed**
Root cause confirmed session 94: GPT-4.1-mini default temperature ~1.0, no seeding, produces different variant sets per call, score swings up to 0.08. Session 95 finding: grade-level P/Pa/M stable across 3 baseline runs despite 31/31 top-1 citation drift. Session 100 decision: benign noise, no action. Relevant chunks are in the retrieved pool on every run; which ranks #1 varies but user-facing answer quality is stable. Seeding or determinism constraints would trade coverage for stability at unknown cost and below measurement resolution anyway.

**Misclassification audit — complete, no misclassifications found**
Ran the documented audit SQL (`SELECT citation, case_name, subject_matter FROM cases WHERE subject_matter != 'criminal' AND (case_name LIKE 'R v%' OR case_name LIKE 'Tasmania v%' OR case_name LIKE 'Police v%')`). Returned 11 cases; all verified legitimately non-criminal — "R v [tribunal/body]" is judicial review nomenclature in Australian law, not a prosecution. Pilling cases already confirmed workers comp. Rattigan already corrected to criminal. Option A re-embed audit prerequisite cleared. Option A itself remains deferred: cache penalty working, retrieval frozen, re-embed of 26K points not justified.

**Antonym-polluted CONCEPTS audit — retired**
Ran audit SQL (`raw_text LIKE '%warrantless%' OR '%without warrant%' OR '%non-consensual%' OR '%not admissible%' OR '%uncorroborated%'`). 35 matches; all chunks whose subject IS the absence of a warrant or consent — the CONCEPTS rule explicitly permits antonym terms when the chunk's literal subject is that absence. No corpus action needed. Watch trigger (real-use sufficient=0 showing contamination) is sufficient; no proactive audit cadence required.

**Tags column — removed from roadmap**
No taxonomy defined, no feature depends on it, category field handles taxonomy adequately. Population would require GPT enrichment pass, Qdrant payload update, and UI work for unknown retrieval benefit. Not worth building at current corpus size and query patterns.

**runDailySync fix plan — CF edge fetch confirmed viable, deferred**
History recovered: runDailySync is an intentional design (not dead code) for forward-looking new-case capture once scraper completes historical pass. Two problems: (a) fetchRecentAustLIICases uses VPS proxy path which is dead (VPS IP TCP-blocked by AustLII); (b) saveCaseToDb predates queue pipeline — bypasses CHUNK/MERGE enrichment entirely. Fix: (a) direct CF-edge fetch with browser headers (identical pattern to handleAustLIIWordSearch — CF edge IPs not blocked by AustLII, proven by word-search and fetch-judgment routes working in production); (b) replace saveCaseToDb with CASE_PROCESSING_QUEUE.send({ type: 'METADATA' }); (c) remove Resend email block. Deferred: scraper already covers current-year cases as part of normal sweep; runDailySync adds nothing until scraper stops sweeping 2026. No technical conflict running both concurrently (INSERT OR IGNORE handles collisions). CC brief issued session 100, execution deferred to next session.

**CHUNK max_tokens — confirmed non-issue:** D1 measurement: 2 of 26,034 enriched chunks reach ≥2,900 chars; longest is 2,984 chars ≈ 750 tokens, well under the 1,500 output token ceiling. Those 2 chunks are near the poller's 3,000 char embedding truncation limit, not the LLM output limit. No action required; item removed from roadmap.
