# BM25 Interleave vs Append — Evaluation Plan

**Status:** Deferred until Part A (BM25 case_chunks_fts append) is deployed and baselined.

## Current Behaviour (Part A — Append)

BM25 case_chunks_fts hits are appended after all Qdrant semantic results with a synthetic score of `BM25_SCORE_KEYWORD = 1/(60+12) ≈ 0.0139`. They cannot displace semantic results. The only competitive mechanism is the multi-signal boost — if a BM25 hit already exists in semantic results, its score gets bumped by 0.0139.

## What Interleave Means

Give BM25 hits a synthetic score calibrated to compete with mid-tier semantic results (0.50–0.55 range), then re-sort the combined pool before the final `top_k` cap. A BM25 hit for "s 138 voir dire" would potentially displace a 0.48-scoring wrong-domain chunk.

## Risk

Same risk that killed RRF in session 41: vocabulary-matched wrong-domain chunks accumulating competitive score via surface term overlap. BM25 hits on "reasonable doubt" could include self-defence chunks mentioning "reasonable" as often as BRD chunks.

## Mitigations

1. `apply_sm_penalty()` already applied to all BM25 hits (Part A implementation)
2. Set interleave score conservatively: start at **0.50** (just above Pass 1 threshold 0.45 — BM25 hits only compete with borderline semantic results, not strong ones above 0.65)
3. Only interleave if the BM25 hit is NOT already in `seen_ids` (novel hits only — existing hits already boosted via multi-signal)
4. Scope the re-sort: re-sort only within the appended pool (positions after Pass 1 cap), not the full result set — strong Pass 1 results are untouchable

## Implementation (One-Line Change + Three-Line Addition)

In `server.py`, after the BM25 case_chunks_fts block:

```python
# Change 1: Score constant
BM25_SCORE_KEYWORD = 0.50  # was 1/(60+12) ≈ 0.0139

# Change 2: After BM25 case_chunks_fts append, before domain filter:
# Re-sort all results so BM25 keyword hits compete on score
chunks.sort(key=lambda c: -c["score"])
```

That's it. The final sort + top_k cap at the end of `search_text()` already handles the rest.

## Evaluation Methodology

1. Deploy Part A (append at 0.0139), run full 31-query baseline — confirm no regressions vs session 64 (13P/9Pa/9M or better)
2. Change `BM25_SCORE_KEYWORD` from 0.0139 to 0.50, SCP + force-recreate
3. Run full 31-query baseline again
4. Per-query diff: for any query that changed category (pass→partial, partial→pass, etc.), log which chunk was displaced and which was added
5. If pass count improves or holds: keep interleave. If any pass→fail regression: revert score to 0.0139 immediately.

## Decision Gate

- Pass count must be ≥ Part A baseline (no net regression)
- Zero pass→fail regressions allowed
- If both conditions met: interleave becomes default
- If marginal: try intermediate score values (0.40, 0.45) before abandoning
