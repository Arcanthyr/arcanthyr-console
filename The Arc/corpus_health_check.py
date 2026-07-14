"""
Arcanthyr Corpus Health Check
Monthly automated quality audit for secondary source chunks.

Reads all secondary source chunks, clusters them by topic via GPT-4o-mini,
then runs contradiction detection and topic gap detection per cluster.
Writes a structured report to D1 via the Worker API.

Env vars (injected into agent-general via .env.secrets):
  OPENAI_API_KEY   — OpenAI API key
  NEXUS_SECRET_KEY — Worker admin auth header
  WORKER_URL       — Worker base URL (default: https://arcanthyr.com)
"""
import os
import json
import uuid
import time
import requests
from datetime import datetime

WORKER_BASE = os.environ.get("WORKER_BASE_URL") or os.environ.get("WORKER_URL", "https://arcanthyr.com")
NEXUS_KEY = os.environ["NEXUS_SECRET_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
HEADERS = {"X-Nexus-Key": NEXUS_KEY, "Content-Type": "application/json"}

# ── Helpers ───────────────────────────────────────────────────────────────────

def call_mini(system_prompt, user_prompt, run_id_for_log=""):
    """Call GPT-4o-mini with a JSON-only response; retry once on parse failure.
    Uses raw requests — matches enrichment_poller.py pattern (no openai SDK needed).
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    for attempt in range(2):
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            },
            json={
                "model": "gpt-4o-mini-2024-07-18",
                "messages": messages,
                "temperature": 0,
                "max_completion_tokens": 4000,
            },
            timeout=90,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:]) if len(lines) > 1 else raw
            raw = raw.rsplit("```", 1)[0].strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            if attempt == 0:
                messages.append({"role": "assistant", "content": raw})
                messages.append({"role": "user", "content": "You did not respond with valid JSON. Respond with JSON only — no markdown fences, no preamble."})
            else:
                print(f"[PARSE ERROR] Failed to parse JSON after retry. run={run_id_for_log}")
                return None


def fetch_all_chunks():
    """Pull all secondary source chunks from D1 via the Worker paginated route.
    Returns list of dicts with keys: id, title, category, raw_text.
    """
    chunks = []
    offset = 0
    while True:
        r = requests.get(
            f"{WORKER_BASE}/api/pipeline/fetch-secondary-raw",
            headers=HEADERS,
            params={"offset": offset, "limit": 100},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        if not data.get("ok") or not data.get("chunks"):
            break
        chunks.extend(data["chunks"])
        if len(data["chunks"]) < 100:
            break
        offset += 100
    return chunks  # [{id, title, category, raw_text}]


# ── Prompts ────────────────────────────────────────────────────────────────────

CLUSTER_SYSTEM = """You are classifying Tasmanian criminal law secondary source chunks into topic clusters based on their title and category.

Rules:
- Group chunks that cover the same legal topic, doctrine area, or procedural domain
- Use descriptive lowercase_snake_case labels (e.g. "tendency_evidence", "sentencing_principles", "bail_applications", "hearsay_exceptions")
- A chunk can only belong to one cluster
- Aim for clusters of 5–20 chunks. If a cluster would exceed 20, split into sub-topics. If under 5, consider merging with the nearest related cluster.
- "checklist" and "practice note" category chunks should be grouped with their substantive topic, not into a separate "checklists" cluster

Respond with valid JSON only: {"clusters": {"cluster_label": ["chunk_id_1", "chunk_id_2", ...], ...}}"""

CONTRADICTION_SYSTEM = """You are a legal corpus quality auditor for Tasmanian criminal law. Your task is to identify genuine contradictions between chunks in a topic cluster — cases where two chunks give conflicting instructions about what the current law requires, permits, or provides in the same circumstances.

CRITICAL DISTINCTIONS — do NOT flag as contradictions:
- Temporal evolution: a chunk describing the pre-amendment position and a chunk describing the post-amendment position are complementary, not contradictory. Look for date references, amendment citations, or "formerly"/"now" language.
- Jurisdictional variation: a chunk describing the Commonwealth position and a chunk describing the Tasmanian position are complementary.
- Sentencing ranges: different ranges for different offence variants, severity levels, or factual scenarios are expected, not contradictory.
- Perspective differences: the same procedure described from a judge's perspective vs a practitioner's checklist vs a statutory summary are complementary.
- Specificity differences: a general rule chunk and an exception-to-that-rule chunk are complementary.

A GENUINE CONTRADICTION exists only when: a practitioner reading both chunks and attempting to follow both simultaneously would receive conflicting instructions about what the current law requires in the same factual and legal circumstances, with no way to reconcile them by scope, time, jurisdiction, or specificity.

Respond with valid JSON only. No markdown fencing, no preamble, no explanation outside the JSON structure."""

CONTRADICTION_USER = """Below is a cluster of secondary source chunks on the same legal topic. Identify any apparent contradictions between pairs of chunks.

For each contradiction found, provide:
- "chunk_a": ID of the first chunk
- "chunk_b": ID of the second chunk
- "description": what the conflict is (max 40 words)
- "confidence": "high", "medium", or "low"
- "why_contradiction": one sentence on why this appears to be a genuine conflict
- "why_not": one sentence on why it might not be a contradiction

If no contradictions are found, return {{"contradictions": []}}.

Response schema:
{{"contradictions": [{{"chunk_a": "", "chunk_b": "", "description": "", "confidence": "", "why_contradiction": "", "why_not": ""}}]}}

CHUNKS:
{chunks_json}"""

GAP_SYSTEM = """You are a legal corpus completeness auditor for Tasmanian criminal law. Your task is to identify legal concepts, tests, doctrines, or principles that are referenced or implied within a topic cluster's chunks but lack a dedicated explanatory chunk in that cluster.

WHAT TO FLAG:
- A case name cited for a principle, but the principle itself is not explained in any chunk in this cluster
- A statutory test referenced by section number but no chunk provides a standalone explanation of that test's elements
- A legal doctrine or element named but assumed rather than explained

WHAT NOT TO FLAG:
- Foundational concepts any criminal practitioner knows: "beyond reasonable doubt", "elements of the offence", "burden of proof", "standard of proof", "mens rea", "actus reus", "voir dire"
- Case names where the principle IS substantively explained in the same chunk that cites it
- Concepts that belong to a clearly different legal topic area — classify these as "cross_domain" instead

ERR ON THE SIDE OF FLAGGING. False positives are acceptable. Missing a real gap reduces the tool's value.

Respond with valid JSON only. No markdown fencing, no preamble, no explanation outside the JSON structure."""

GAP_USER = """Below is a cluster of secondary source chunks on the same legal topic. Identify concepts, tests, or doctrines that are referenced or implied but lack a dedicated explanatory chunk in this cluster.

For each gap found, provide:
- "concept": the missing concept, test, or doctrine name
- "referenced_in": array of chunk IDs where it was referenced
- "description": what the missing chunk should cover (max 30 words)
- "classification": "intra_cluster" or "cross_domain"

If no gaps are found, return {{"gaps": []}}.

Response schema:
{{"gaps": [{{"concept": "", "referenced_in": [], "description": "", "classification": ""}}]}}

CHUNKS:
{chunks_json}"""

# ── Main ──────────────────────────────────────────────────────────────────────

def run_health_check():
    run_id = str(uuid.uuid4())
    run_date = datetime.utcnow().strftime("%Y-%m-%d")
    print(f"[HEALTH CHECK] Starting run {run_id} — {run_date}")

    # 1. Fetch all chunks
    chunks = fetch_all_chunks()
    print(f"[HEALTH CHECK] Fetched {len(chunks)} secondary source chunks")
    if not chunks:
        print("[HEALTH CHECK] No chunks to process — aborting")
        return

    # 2. Build metadata for clustering — use title field, with raw_text first line as fallback
    meta = []
    for c in chunks:
        title = (c.get("title") or "").strip()
        if not title:
            first_line = (c.get("raw_text") or "").split("\n")[0].strip()[:100]
            title = first_line
        meta.append({
            "id": c["id"],
            "title": title[:120],
            "category": (c.get("category") or "").strip(),
        })

    cluster_result = call_mini(
        CLUSTER_SYSTEM,
        f"CHUNKS:\n{json.dumps(meta)}",
        run_id,
    )
    if not cluster_result or "clusters" not in cluster_result:
        print("[HEALTH CHECK] Clustering failed — aborting")
        return

    clusters = cluster_result["clusters"]
    print(f"[HEALTH CHECK] {len(clusters)} clusters identified")

    # 3. Write cluster assignments to Worker (best-effort — report continues even if this fails)
    assignments = [
        {"chunk_id": cid, "cluster_label": label}
        for label, ids in clusters.items()
        for cid in ids
    ]
    try:
        r = requests.post(
            f"{WORKER_BASE}/api/admin/health-clusters",
            headers=HEADERS,
            json={"run_id": run_id, "run_date": run_date, "assignments": assignments},
            timeout=30,
        )
        r.raise_for_status()
        print(f"[HEALTH CHECK] Cluster assignments written ({len(assignments)} rows)")
    except Exception as e:
        print(f"[HEALTH CHECK] Warning: cluster assignment write failed: {e}")

    # 4. Build chunk lookup by id
    chunk_lookup = {c["id"]: c for c in chunks}

    # 5. Run health prompts per cluster
    all_contradictions = []
    all_gaps = []
    small_clusters = []
    error_clusters = []

    for label, ids in clusters.items():
        if len(ids) < 3:
            small_clusters.append({"cluster": label, "chunk_ids": ids})
            print(f"[HEALTH CHECK] Skipping small cluster '{label}' ({len(ids)} chunks)")
            continue

        # Truncate raw_text to 800 chars per chunk — token budget guard
        cluster_chunks = []
        for cid in ids:
            c = chunk_lookup.get(cid)
            if c:
                raw = (c.get("raw_text") or "")[:800]
                title = (c.get("title") or "").strip() or raw.split("\n")[0][:100]
                cluster_chunks.append({"id": cid, "title": title, "raw_text": raw})

        chunks_json_str = json.dumps(cluster_chunks)
        print(f"[HEALTH CHECK] Running checks for cluster '{label}' ({len(cluster_chunks)} chunks)")

        # Contradiction pass
        try:
            contradictions = call_mini(
                CONTRADICTION_SYSTEM,
                CONTRADICTION_USER.format(chunks_json=chunks_json_str),
                run_id,
            )
            if contradictions and contradictions.get("contradictions"):
                for item in contradictions["contradictions"]:
                    item["cluster"] = label
                all_contradictions.extend(contradictions["contradictions"])
        except Exception as e:
            print(f"[HEALTH CHECK] Contradiction pass failed for '{label}': {e}")
            error_clusters.append({"cluster": label, "pass": "contradiction", "error": str(e)})

        # Gap pass (small sleep to avoid rate limit on large corpora)
        time.sleep(0.5)
        try:
            gaps = call_mini(
                GAP_SYSTEM,
                GAP_USER.format(chunks_json=chunks_json_str),
                run_id,
            )
            if gaps and gaps.get("gaps"):
                for item in gaps["gaps"]:
                    item["cluster"] = label
                all_gaps.extend(gaps["gaps"])
        except Exception as e:
            print(f"[HEALTH CHECK] Gap pass failed for '{label}': {e}")
            error_clusters.append({"cluster": label, "pass": "gap", "error": str(e)})

    # 6. Assemble report
    intra_gaps = [g for g in all_gaps if g.get("classification") == "intra_cluster"]
    cross_gaps = [g for g in all_gaps if g.get("classification") == "cross_domain"]
    high_contradictions = [c for c in all_contradictions if c.get("confidence") == "high"]
    other_contradictions = [c for c in all_contradictions if c.get("confidence") != "high"]

    report_json = {
        "run_id": run_id,
        "run_date": run_date,
        "cluster_count": len(clusters),
        "small_clusters": small_clusters,
        "error_clusters": error_clusters,
        "contradictions": {
            "high_confidence": high_contradictions,
            "other": other_contradictions,
        },
        "gaps": {
            "intra_cluster": intra_gaps,
            "cross_domain": cross_gaps,
        },
    }

    summary_text = (
        f"Run {run_date}: {len(clusters)} clusters, "
        f"{len(high_contradictions)} high-confidence contradictions, "
        f"{len(intra_gaps)} intra-cluster gaps, "
        f"{len(cross_gaps)} cross-domain references"
    )
    print(f"[HEALTH CHECK] {summary_text}")

    # 7. Write report to Worker
    try:
        r = requests.post(
            f"{WORKER_BASE}/api/admin/health-reports",
            headers=HEADERS,
            json={
                "id": run_id,
                "summary_text": summary_text,
                "report_json": report_json,
                "cluster_count": len(clusters),
                "contradiction_count": len(all_contradictions),
                "gap_count": len(all_gaps),
            },
            timeout=30,
        )
        r.raise_for_status()
        print(f"[HEALTH CHECK] Complete — report {run_id} written to D1")
    except Exception as e:
        print(f"[HEALTH CHECK] Failed to write report: {e}")


if __name__ == "__main__":
    run_health_check()
