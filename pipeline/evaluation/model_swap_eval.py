"""
model_swap_eval.py — Model swap evaluation harness for Arcanthyr
================================================================
Compares incumbent vs candidate models for Pass 1 (metadata extraction)
and Pass 2 (chunk enrichment) without touching live data.

FINDINGS FROM STEP 1 (Context7 docs lookup, 21 Apr 2026):
- GLM-4.7-Flash: NOT available on Cloudflare Workers AI. GLM/THUDM models are
  not in the current Workers AI model catalog. Confirmed via Context7 lookup
  against live Cloudflare Workers AI docs. Task 5 Step 1 finding: BLOCKED for
  the GLM candidate. Recommend using an available alternative instead —
  see CANDIDATE_PASS1_MODEL comment below.
- GPT-OSS-120B: NOT available on Cloudflare Workers AI under that name.
  Workers AI does not host OpenAI GPT series. The highest-parameter open model
  currently available on Workers AI is @cf/meta/llama-3.3-70b-instruct-fp8-fast.
  See CANDIDATE_PASS2_MODEL comment below.

DECISION: Tom must confirm substitute candidate models before running this eval.
The script is wired with placeholder strings that will fail at runtime if not
replaced. Update CANDIDATE_PASS1_MODEL and CANDIDATE_PASS2_MODEL before running.

USAGE:
  # Install deps (run from arcanthyr-console/):
  pip install requests tabulate python-dotenv

  # Set env vars or create .env in the same directory:
  #   CLOUDFLARE_ACCOUNT_ID=def9cef091857f82b7e096def3faaa25
  #   CLOUDFLARE_API_TOKEN=<your Workers AI API token — NOT the account API key>
  #   NEXUS_SECRET_KEY=<from ~/ai-stack/.env.secrets on VPS>
  #   WORKER_URL=https://arcanthyr.com

  python scripts/model_swap_eval.py

  # Flags:
  #   --pass1-only     Skip Pass 2 chunk eval
  #   --pass2-only     Skip Pass 1 metadata eval
  #   --dry-run        Print prompts without calling any API

DECISION RULES (hardcoded comments — do not change without Opus consultation):
  Pass 1: Candidate must match or exceed Qwen3 field recall on >=80% of test cases.
          Specifically: candidate field_recall >= incumbent field_recall for
          case_name, judge, parties, facts, issues on each case.
  Pass 2: Candidate must not regress on retrieval baseline. This means:
          (a) enriched_text must be non-null on >=95% of chunks
          (b) chunk_type must be a valid type string on 100% of chunks
          (c) principle count must be in [0,2] range per chunk (enforced by gate)
          Run the retrieval baseline (~/retrieval_baseline.sh) separately after
          any live model swap before committing to the change.

WHAT TOM NEEDS TO PROVIDE BEFORE RUNNING:
  (a) TEST_CASE_CITATIONS — 10-15 case citations for Pass 1 eval.
      Recommended: span criminal/civil/admin, vary judgment length.
      Suggested selection (edit as needed):
        short judgments (<10K chars):   2-3 magistrates court decisions
        medium judgments (10-50K):      4-5 supreme court criminal matters
        long judgments (>50K):          2-3 CCA appeals
        civil/admin:                    2-3 non-criminal matters
      Leave as [] to skip Pass 1 eval.

  (b) TEST_CHUNK_IDS — 20-30 chunk IDs for Pass 2 eval.
      Format: "{citation}__chunk__{N}" e.g. "[2023] TASSC 5__chunk__3"
      Recommended: 20-30 chunks from criminal cases, mix of reasoning/evidence/
      submissions/procedural types to test type-gate enforcement.
      Leave as [] to skip Pass 2 eval.
"""

import os
import json
import time
import argparse
import textwrap
from typing import Optional
import requests

# ── Deps (tabulate is optional — falls back to plain print) ─────────────────
try:
    from tabulate import tabulate
    HAS_TABULATE = True
except ImportError:
    HAS_TABULATE = False

# ── Load .env if present ─────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv optional — use exported env vars

# ── CONFIG — update these before running ─────────────────────────────────────

# Workers AI model strings for Pass 1
INCUMBENT_PASS1_MODEL  = "@cf/qwen/qwen3-30b-a3b-fp8"

# GLM-4.7-Flash is NOT available on Workers AI (confirmed 21 Apr 2026).
# Substitute options available on Workers AI (pick one):
#   "@cf/meta/llama-3.3-70b-instruct-fp8-fast"  — best available open model
#   "@cf/meta/llama-3.1-70b-instruct"            — proven, stable
#   "@cf/mistral/mistral-7b-instruct-v0.1"       — fast, lighter
# REPLACE THIS STRING before running:
CANDIDATE_PASS1_MODEL  = "REPLACE_ME_GLM_NOT_AVAILABLE"

# GPT-4o-mini model string for Pass 2 (OpenAI API)
INCUMBENT_PASS2_MODEL  = "gpt-4o-mini-2024-07-18"

# GPT-OSS-120B is NOT available on Workers AI (confirmed 21 Apr 2026).
# If testing an OpenAI model: use a different OpenAI model string.
# If testing a Workers AI model for Pass 2: update CANDIDATE_P2_IS_WORKERS_AI = True
# and set to a valid Workers AI model string.
# REPLACE THIS STRING before running:
CANDIDATE_PASS2_MODEL  = "REPLACE_ME_GPT_OSS_NOT_AVAILABLE"
CANDIDATE_P2_IS_WORKERS_AI = False  # True = use Workers AI REST API; False = use OpenAI API

# ── POPULATE THESE BEFORE RUNNING ────────────────────────────────────────────
TEST_CASE_CITATIONS = [
    # Add 10-15 Tasmanian case citations here.
    # Examples:
    # "[2023] TASSC 5",
    # "[2022] TASMC 18",
    # "[2021] TASCCA 3",
]

TEST_CHUNK_IDS = [
    # Add 20-30 chunk IDs here. Format: "{citation}__chunk__{N}"
    # Examples:
    # "[2023] TASSC 5__chunk__2",
    # "[2022] TASMC 18__chunk__5",
]

# ── ENV VARS ─────────────────────────────────────────────────────────────────
CLOUDFLARE_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "def9cef091857f82b7e096def3faaa25")
CLOUDFLARE_API_TOKEN  = os.environ.get("CLOUDFLARE_API_TOKEN", "")  # Workers AI token
NEXUS_SECRET_KEY      = os.environ.get("NEXUS_SECRET_KEY", "")
WORKER_URL            = os.environ.get("WORKER_URL", "https://arcanthyr.com")
OPENAI_API_KEY        = os.environ.get("OPENAI_API_KEY", "")

WORKERS_AI_BASE = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run"
SLEEP_BETWEEN   = 0.5  # seconds between API calls to avoid rate limits

# ═══════════════════════════════════════════════════════════════════════════
# PROMPTS (verbatim from worker.js as of session 88 — do not edit)
# ═══════════════════════════════════════════════════════════════════════════

# ── Pass 1 — single-pass system prompt (from summarizeCase() in worker.js) ──
# Source: worker.js lines ~372-392 (singlePassPrompt variable)
PASS1_SYSTEM_PROMPT = """You are extracting verified legal information from an Australian court judgment for a practitioner database.
Do not guess or invent. If something is not clearly present, use null.
Return ONLY a single valid JSON object. No explanation, no markdown, no text before or after the JSON.

Extract these fields:
- case_name: party names from the VERY FIRST LINE of the document (e.g. "R v Smith", "DPP v Jones", "Tasmania v Brown (No 2)"). Stop before the first "[" character — do not include the citation. If the first line is missing or unclear, extract from the CITATION field. NEVER use court division labels ("Criminal", "Civil", "Criminal Division", "Civil Division"). If PARTIES uses SURNAME, Given Names format, normalise to Given Names Surname in title case.
- judge: presiding judge(s) surname and title (e.g. "Blow CJ", "Brett J"). If multiple, comma-separated string.
- parties: party names from the case title, normalised from SURNAME, Given Names to natural order.
- facts: 3-4 concrete sentences: parties, charges or dispute, key events, outcome at first instance if appeal.
- issues: JSON array of 1-5 legal questions the court answered (each a short question string). Must be an array, never a single string.
- holdings: array matching issues order — the court's direct answer to each issue (1 sentence each).
- legislation: all Acts and sections materially relied on. Array of strings e.g. ["Sentencing Act 1997 (Tas) s 11"].
- key_authorities: cases cited and how treated. Array of objects: { "name": "...", "treatment": "applied|followed|distinguished|mentioned", "why": "..." }

PRINCIPLES — extract the court's key legal holdings as case-specific propositions.

Each principle must be a concrete statement of what THIS court decided on THIS set of facts — not a generic rule of law that could appear on any case. Include the court's reasoning where it adds value.

Maximum 8 principles total. 1 primary per issue + up to 2 supporting (only if genuinely distinct).

BAD (generic, could be any case):
- "General deterrence is a relevant sentencing consideration"
- "The court applied the relevant statutory test"

GOOD (case-specific, tells you why THIS case matters):
- "A 12-month suspended sentence was appropriate for a first-offender domestic assault involving a single punch causing bruising, where the offender had completed a behavioural change program and the victim did not support a custodial sentence"
- "The appellant's failure to disclose gambling debts totalling $180,000 was fatal to her Testators Family Maintenance claim because adequate provision cannot be assessed without full financial disclosure"
- "The tendency evidence was admissible because the accused's pattern of targeting intoxicated women at licensed venues had significant probative value that substantially outweighed any prejudicial effect, applying the framework in IMM v The Queen"

Each principle object must include:
- "principle": the case-specific propositional statement (1-2 sentences, in the court's own doctrinal language where possible)
- "statute_refs": array of relevant Act and section references (e.g. ["Sentencing Act 1997 (Tas) s 11"]) — empty array if none
- "keywords": 2-4 short topic keywords (e.g. ["sentencing", "domestic violence", "deterrence"])


Rules:
- case_name must be party names only — never a court division label, never a bare year, never just a citation.
- If a field cannot be determined, use null or [].
- The very first character of your response must be {

Output JSON with keys: case_name, judge, parties, facts, issues, holdings, principles, legislation, key_authorities"""

# ── Pass 2 — CHUNK v3 system prompt (from worker.js CHUNK queue handler) ────
# Source: worker.js lines ~4659-4740 (systemPrompt variable in CHUNK handler)
PASS2_SYSTEM_PROMPT = """You are an Australian legal judgment enrichment engine. You analyse a single excerpt from a court judgment and output ONLY valid JSON.

Your goal is retrieval-quality enrichment for a legal research system. Extract only what is genuinely supported by THIS excerpt. Do not infer a legal principle unless the excerpt itself contains judicial reasoning, an applied legal test, or a clearly expressed legal conclusion by the judge.

STEP 1 — CLASSIFY the chunk. You must assign one of these types:
- "reasoning" — judicial analysis, statement or application of a legal test, ratio decidendi, obiter dicta, the judge's reasoning on a legal issue
- "evidence" — witness testimony, cross-examination transcript, factual narrative, exhibit descriptions
- "submissions" — arguments advanced by counsel or parties, not the judge's own conclusions
- "procedural" — grounds of appeal, charge history, pleadings, orders, procedural background
- "header" — court/citation/parties/judge/dates/catchwords metadata with no substantive reasoning
- "mixed" — genuinely contains both judicial reasoning and one or more other types

STEP 2 — EXTRACT based on type. These rules are absolute:
1. Do NOT extract legal principles from evidence, submissions, procedural, or header chunks. Cross-examination about a firearm does not establish an assault principle. Only the judge's reasoning does.
2. Do NOT restate generic criminal law doctrine unless the judge explicitly states or applies it in THIS excerpt.
3. Do NOT attempt to state the overall case holding unless this specific chunk contains it.
4. Principles must be stated in the judge's own doctrinal language — NOT as simplified IF/THEN abstractions. Preserve the specific conditions, qualifications, and statutory anchors as the judge expressed them.
5. Quality over quantity. One precisely stated principle is better than three generic ones. Maximum 2 principles per chunk; usually 0 or 1. If no clear principle exists, return [].
6. Only include authorities actually named in the excerpt text — not your background knowledge.
7. Only include legislation actually cited in the excerpt text.
8. Use facts_summary and issues only as case context. Extract only from the EXCERPT.

OUTPUT — respond with ONLY valid JSON, no markdown fences, no commentary:

{
  "chunk_type": "reasoning|evidence|submissions|procedural|header|mixed",
  "subject_matter": "criminal|civil|administrative|family|mixed|unknown",
  "enriched_text": "string",
  "principles": [
    {
      "principle": "string — the court's doctrinal statement with its specific conditions as expressed by the judge",
      "type": "ratio|obiter",
      "confidence": "high|medium",
      "statute_refs": ["s 46 Criminal Code (Tas)"],
      "authorities_applied": ["case name"],
      "keywords": ["specific legal terms — 3 to 6, not generic words like criminal or law"]
    }
  ],
  "holdings": [
    {
      "holding": "string",
      "topic": "string",
      "basis": "factual|legal|procedural"
    }
  ],
  "legislation": ["s 46 Criminal Code (Tas)"],
  "key_authorities": [
    {
      "name": "string",
      "treatment": "applied|followed|distinguished|cited|referred to|not followed",
      "proposition": "string"
    }
  ],
  "reasoning_quotes": [
    {
      "quote": "string — verbatim sentence max 200 chars",
      "why_selected": "string"
    }
  ],
  "confidence": "high|medium|low"
}

FIELD SPECIFICATIONS:

enriched_text is REQUIRED and is the primary field for semantic embedding.

For reasoning chunks (200-350 words): Open with one sentence that explicitly names the statute section (e.g. "s 138 of the Evidence Act 2001 (Tas)"), defined doctrine (e.g. "the totality principle"), or authoritative case (e.g. "Mill v The Queen") that this chunk applies. Do not use generic descriptions like "the provision" or "the legal issue" — name the specific legal object. Then state the principle or test in the judge's own doctrinal terms. For each authority cited, state what specific principle it stands for in this case. Include 1-2 verbatim sentences from the judicial reasoning in quotation marks. Note any statutory provisions interpreted. Close with the specific conclusion reached.

For evidence chunks (80-150 words): Open with "This chunk contains [witness testimony / cross-examination / factual narrative] regarding [specific topic]." Summarise factual content. Note what legal issue it is relevant to. Do NOT state legal principles.

For submissions chunks (80-150 words): Open with "This chunk contains [appellant/respondent/Crown] submissions regarding [specific topic]." Summarise the argument. Note which legal issue it addresses.

For procedural chunks (50-100 words): Describe the procedural content.

For header chunks (50-80 words): Open with "This chunk contains the judgment header for [case name]." List metadata present.

principles — only for reasoning or mixed chunks; empty array otherwise; max 2
holdings — only for reasoning or mixed chunks; empty array otherwise; max 3
legislation — string array; only what appears in the excerpt; max 5; empty array otherwise
key_authorities — only cases named in the excerpt; max 5; empty array otherwise
reasoning_quotes — only for reasoning or mixed chunks; max 2; each quote max 200 chars; empty array otherwise
confidence — high if clearly reasoning with explicit principles; medium if reasoning present but implicit; low if ambiguous or thin"""

# ── Pass 2 — CHUNK user message template (mirrors worker.js CHUNK handler) ──
def build_chunk_user_content(citation: str, chunk_index: int, chunk_text: str,
                              court: str = "", judge: str = "",
                              facts: str = "", issues: str = "",
                              subject_matter: str = "", total_chunks: int = 0) -> str:
    role_hint = "unknown"
    if chunk_index == 0 and _is_likely_header(chunk_text):
        role_hint = "header"
    return "\n".join([
        f"Case: {citation}",
        f"Court: {court or 'Not stated'}",
        f"Judge: {judge or 'Not stated'}",
        f"Date: Not stated",
        f"Chunk: {chunk_index + 1} of {total_chunks or '?'}",
        f"Hint: {role_hint}",
        f"Subject matter (from metadata): {subject_matter or 'Not yet classified'}",
        f"Case context — Facts: {facts or ''}",
        f"Case context — Issues: {issues or ''}",
        "",
        "--- EXCERPT START ---",
        chunk_text,
        "--- EXCERPT END ---",
    ])

def _is_likely_header(chunk_text: str) -> bool:
    upper_labels = sum(1 for line in chunk_text.splitlines()
                       if len(line) >= 4 and line.strip() == line.strip().upper() and ':' in line)
    has_markers = any(kw in chunk_text.upper() for kw in
                      ["COURT:", "CITATION:", "PARTIES:", "JUDGE:", "HEARD:", "DELIVERED:"])
    return upper_labels >= 3 or has_markers

# ═══════════════════════════════════════════════════════════════════════════
# API HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def call_workers_ai(model: str, system_prompt: str, user_content: str,
                    max_tokens: int = 4000) -> Optional[str]:
    """Call Cloudflare Workers AI REST API. Returns raw text response or None."""
    if not CLOUDFLARE_API_TOKEN:
        raise ValueError("CLOUDFLARE_API_TOKEN env var not set")
    url = f"{WORKERS_AI_BASE}/{model}"
    payload = {
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_content},
        ],
    }
    resp = requests.post(url,
                         headers={"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"},
                         json=payload, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    # Workers AI response shape varies by model
    return (
        data.get("result", {}).get("response") or
        data.get("result", {}).get("choices", [{}])[0].get("message", {}).get("content") or
        data.get("response") or
        ""
    )

def call_openai(model: str, system_prompt: str, user_content: str,
                max_tokens: int = 4000) -> Optional[str]:
    """Call OpenAI chat completions API. Returns raw text response or None."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY env var not set")
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}",
                 "Content-Type": "application/json"},
        json={
            "model": model,
            "max_completion_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_content},
            ],
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("choices", [{}])[0].get("message", {}).get("content", "")

# ═══════════════════════════════════════════════════════════════════════════
# DATA FETCH HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def fetch_case_raw_text(citation: str) -> Optional[dict]:
    """
    Fetch raw case data via Worker API.
    Uses GET /api/legal/cases then filters, or direct D1 via wrangler as fallback.

    NOTE: /api/legal/case-status only returns enrichment status, not raw_text.
    For raw_text we need the library endpoint which returns processed fields.
    Raw text is not exposed via a public endpoint — see comment below.

    FALLBACK: If raw_text is not available via API, use wrangler d1 execute:
      npx wrangler d1 execute arcanthyr --remote --command \
        "SELECT citation, full_text, court, judge, facts, issues FROM cases WHERE citation = '[YYYY] TASSC N'"
    and paste into TEST_CASE_RAW_TEXT dict below.
    """
    # Library endpoint returns enriched fields for display — not raw judgment text.
    # For eval purposes, use the cases endpoint and extract what's available.
    url = f"{WORKER_URL}/api/legal/cases"
    headers = {"X-Nexus-Key": NEXUS_SECRET_KEY} if NEXUS_SECRET_KEY else {}
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        cases = data if isinstance(data, list) else data.get("result", [])
        for case in cases:
            if case.get("citation") == citation:
                return case
    except Exception as e:
        print(f"  [!] fetch_case_raw_text failed for {citation}: {e}")
    return None

def fetch_chunk_text(chunk_id: str) -> Optional[dict]:
    """
    Fetch chunk text via Worker FTS search (approximate — finds by chunk_id).
    Returns dict with chunk_text and citation, or None.

    NOTE: There is no direct "fetch chunk by ID" Worker route.
    Use GET /api/pipeline/fts-search-chunks?q={chunk_id} as a proxy.
    For accurate eval, populate TEST_CHUNK_DATA manually or via wrangler:
      npx wrangler d1 execute arcanthyr --remote --command \
        "SELECT id, citation, chunk_index, chunk_text FROM case_chunks WHERE id = '[2023] TASSC 5__chunk__2'"
    """
    url = f"{WORKER_URL}/api/pipeline/fts-search-chunks"
    headers = {"X-Nexus-Key": NEXUS_SECRET_KEY} if NEXUS_SECRET_KEY else {}
    try:
        resp = requests.get(url, params={"q": chunk_id, "limit": 1},
                            headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        chunks = data.get("chunks", [])
        if chunks:
            return chunks[0]
    except Exception as e:
        print(f"  [!] fetch_chunk_text failed for {chunk_id}: {e}")
    return None

# ── Optional: pre-populate raw data to avoid API round-trips ─────────────────
# If fetch helpers fail (e.g. raw_text not exposed), populate these manually
# via wrangler d1 execute and paste results here.
# Format: { citation: { "full_text": "...", "court": "...", ... } }
TEST_CASE_RAW_TEXT: dict = {}

# Format: { chunk_id: { "chunk_text": "...", "citation": "...", "chunk_index": N } }
TEST_CHUNK_DATA: dict = {}

# ═══════════════════════════════════════════════════════════════════════════
# SCORING HELPERS
# ═══════════════════════════════════════════════════════════════════════════

PASS1_FIELDS = ["case_name", "judge", "parties", "facts", "issues"]

def score_pass1_response(raw_response: str) -> dict:
    """Parse JSON response and score field recall."""
    scores = {f: 0 for f in PASS1_FIELDS}
    parsed = None
    try:
        clean = raw_response.replace("```json", "").replace("```", "").strip()
        start, end = clean.find("{"), clean.rfind("}")
        if start != -1 and end != -1:
            parsed = json.loads(clean[start:end + 1])
    except Exception:
        pass

    if not parsed:
        return {"fields": scores, "field_recall": 0.0, "parse_ok": False, "raw": raw_response[:300]}

    for f in PASS1_FIELDS:
        val = parsed.get(f)
        if val and val not in (None, "", [], "null"):
            scores[f] = 1

    recall = sum(scores.values()) / len(PASS1_FIELDS)
    return {
        "fields": scores,
        "field_recall": recall,
        "parse_ok": True,
        "principle_count": len(parsed.get("principles", [])),
        "raw": raw_response[:300],
    }

VALID_CHUNK_TYPES = {"reasoning", "evidence", "submissions", "procedural", "header", "mixed"}

def score_pass2_response(raw_response: str) -> dict:
    """Parse JSON response and score chunk enrichment quality."""
    parsed = None
    try:
        clean = raw_response.replace("```json", "").replace("```", "").strip()
        start, end = clean.find("{"), clean.rfind("}")
        if start != -1 and end != -1:
            parsed = json.loads(clean[start:end + 1])
    except Exception:
        pass

    if not parsed:
        return {
            "parse_ok": False,
            "enriched_text_ok": False,
            "chunk_type_valid": False,
            "principle_count": 0,
            "raw": raw_response[:300],
        }

    chunk_type = parsed.get("chunk_type", "")
    enriched_text = parsed.get("enriched_text", "")
    principles = parsed.get("principles", [])

    return {
        "parse_ok": True,
        "enriched_text_ok": bool(enriched_text and len(enriched_text) > 20),
        "chunk_type_valid": chunk_type in VALID_CHUNK_TYPES,
        "chunk_type": chunk_type,
        "principle_count": len(principles),
        "principles_in_range": 0 <= len(principles) <= 2,
        "raw": raw_response[:300],
    }

# ═══════════════════════════════════════════════════════════════════════════
# PASS 1 EVAL — METADATA EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════

def run_pass1_eval(dry_run: bool = False) -> None:
    if not TEST_CASE_CITATIONS:
        print("\n[PASS 1] No test citations configured — skipping.\n")
        return

    print(f"\n{'='*70}")
    print(f"PASS 1 EVAL — Metadata Extraction")
    print(f"  Incumbent:  {INCUMBENT_PASS1_MODEL}")
    print(f"  Candidate:  {CANDIDATE_PASS1_MODEL}")
    print(f"  Cases:      {len(TEST_CASE_CITATIONS)}")
    print(f"{'='*70}\n")

    if CANDIDATE_PASS1_MODEL == "REPLACE_ME_GLM_NOT_AVAILABLE":
        print("[!] CANDIDATE_PASS1_MODEL not set — update the script before running.\n")
        return

    results = []

    for citation in TEST_CASE_CITATIONS:
        print(f"  Processing: {citation}")

        # Fetch raw case text
        case_data = TEST_CASE_RAW_TEXT.get(citation) or fetch_case_raw_text(citation)
        if not case_data:
            print(f"    [!] Could not fetch case data — skipping")
            results.append({"citation": citation, "error": "no data"})
            continue

        full_text = case_data.get("full_text", "") or case_data.get("raw_text", "")
        if not full_text:
            print(f"    [!] No full_text available — raw_text not exposed via API.")
            print(f"        Fetch manually: SELECT full_text FROM cases WHERE citation = '{citation}'")
            results.append({"citation": citation, "error": "no full_text in API response"})
            continue

        court = case_data.get("court", "")
        user_content = f"Citation: {citation}\nCourt: {court}\n\nCase text:\n{full_text[:22000]}"

        if dry_run:
            print(f"    [DRY RUN] Would call both models with {len(user_content)} chars of content")
            continue

        # Call incumbent (Workers AI)
        incumbent_result = {"field_recall": None, "parse_ok": False}
        try:
            t0 = time.time()
            raw = call_workers_ai(INCUMBENT_PASS1_MODEL, PASS1_SYSTEM_PROMPT, user_content, max_tokens=4000)
            elapsed = time.time() - t0
            incumbent_result = score_pass1_response(raw or "")
            incumbent_result["elapsed_s"] = round(elapsed, 1)
            print(f"    Incumbent:  recall={incumbent_result['field_recall']:.0%}  "
                  f"parse={'OK' if incumbent_result['parse_ok'] else 'FAIL'}  "
                  f"t={elapsed:.1f}s")
        except Exception as e:
            print(f"    Incumbent FAILED: {e}")
            incumbent_result["error"] = str(e)

        time.sleep(SLEEP_BETWEEN)

        # Call candidate (Workers AI)
        candidate_result = {"field_recall": None, "parse_ok": False}
        try:
            t0 = time.time()
            raw = call_workers_ai(CANDIDATE_PASS1_MODEL, PASS1_SYSTEM_PROMPT, user_content, max_tokens=4000)
            elapsed = time.time() - t0
            candidate_result = score_pass1_response(raw or "")
            candidate_result["elapsed_s"] = round(elapsed, 1)
            print(f"    Candidate:  recall={candidate_result['field_recall']:.0%}  "
                  f"parse={'OK' if candidate_result['parse_ok'] else 'FAIL'}  "
                  f"t={elapsed:.1f}s")
        except Exception as e:
            print(f"    Candidate FAILED: {e}")
            candidate_result["error"] = str(e)

        time.sleep(SLEEP_BETWEEN)

        results.append({
            "citation": citation,
            "incumbent": incumbent_result,
            "candidate": candidate_result,
            "candidate_wins": (
                (candidate_result.get("field_recall") or 0) >=
                (incumbent_result.get("field_recall") or 0)
            ),
        })

    if dry_run:
        return

    # Summary
    valid = [r for r in results if "incumbent" in r and "candidate" in r]
    if not valid:
        print("\n[PASS 1] No valid results to summarise.\n")
        return

    wins = sum(1 for r in valid if r["candidate_wins"])
    win_rate = wins / len(valid)
    threshold = 0.80

    print(f"\n{'─'*70}")
    print(f"PASS 1 SUMMARY — {wins}/{len(valid)} cases candidate >= incumbent")
    print(f"  Win rate: {win_rate:.0%}  (threshold: {threshold:.0%})")
    print(f"  Decision: {'CANDIDATE PASSES' if win_rate >= threshold else 'CANDIDATE FAILS — keep incumbent'}")
    print(f"{'─'*70}")

    rows = [
        [
            r["citation"],
            f"{r['incumbent'].get('field_recall', 0):.0%}" if r.get("incumbent") else "ERR",
            f"{r['candidate'].get('field_recall', 0):.0%}" if r.get("candidate") else "ERR",
            "CANDIDATE" if r.get("candidate_wins") else "incumbent",
        ]
        for r in valid
    ]
    headers = ["Citation", "Incumbent Recall", "Candidate Recall", "Winner"]
    if HAS_TABULATE:
        print(tabulate(rows, headers=headers, tablefmt="simple"))
    else:
        print(f"{'Citation':<40} {'Inc Recall':>12} {'Cand Recall':>12} {'Winner':>10}")
        for row in rows:
            print(f"{row[0]:<40} {row[1]:>12} {row[2]:>12} {row[3]:>10}")

# ═══════════════════════════════════════════════════════════════════════════
# PASS 2 EVAL — CHUNK ENRICHMENT
# ═══════════════════════════════════════════════════════════════════════════

def run_pass2_eval(dry_run: bool = False) -> None:
    if not TEST_CHUNK_IDS:
        print("\n[PASS 2] No test chunk IDs configured — skipping.\n")
        return

    print(f"\n{'='*70}")
    print(f"PASS 2 EVAL — Chunk Enrichment")
    print(f"  Incumbent:  {INCUMBENT_PASS2_MODEL} (OpenAI API)")
    cand_api = "Workers AI" if CANDIDATE_P2_IS_WORKERS_AI else "OpenAI API"
    print(f"  Candidate:  {CANDIDATE_PASS2_MODEL} ({cand_api})")
    print(f"  Chunks:     {len(TEST_CHUNK_IDS)}")
    print(f"{'='*70}\n")

    if CANDIDATE_PASS2_MODEL == "REPLACE_ME_GPT_OSS_NOT_AVAILABLE":
        print("[!] CANDIDATE_PASS2_MODEL not set — update the script before running.\n")
        return

    results = []

    for chunk_id in TEST_CHUNK_IDS:
        print(f"  Processing: {chunk_id}")

        # Fetch chunk data
        chunk_data = TEST_CHUNK_DATA.get(chunk_id) or fetch_chunk_text(chunk_id)
        if not chunk_data:
            print(f"    [!] Could not fetch chunk data — skipping")
            print(f"        Fetch manually: SELECT id, citation, chunk_index, chunk_text FROM case_chunks WHERE id = '{chunk_id}'")
            results.append({"chunk_id": chunk_id, "error": "no data"})
            continue

        chunk_text = chunk_data.get("chunk_text") or chunk_data.get("enriched_text", "")
        citation = chunk_data.get("citation", "")
        chunk_index = chunk_data.get("chunk_index", 0)

        if not chunk_text:
            print(f"    [!] No chunk_text available")
            results.append({"chunk_id": chunk_id, "error": "no chunk_text"})
            continue

        user_content = build_chunk_user_content(
            citation=citation,
            chunk_index=chunk_index,
            chunk_text=chunk_text,
        )

        if dry_run:
            print(f"    [DRY RUN] Would call both models with {len(user_content)} chars")
            continue

        # Call incumbent (OpenAI)
        incumbent_result = {"enriched_text_ok": False, "chunk_type_valid": False}
        try:
            t0 = time.time()
            raw = call_openai(INCUMBENT_PASS2_MODEL, PASS2_SYSTEM_PROMPT, user_content, max_tokens=1600)
            elapsed = time.time() - t0
            incumbent_result = score_pass2_response(raw or "")
            incumbent_result["elapsed_s"] = round(elapsed, 1)
            print(f"    Incumbent:  et={'OK' if incumbent_result['enriched_text_ok'] else 'FAIL'}  "
                  f"type={incumbent_result.get('chunk_type', '?')}  "
                  f"principles={incumbent_result.get('principle_count', 0)}  "
                  f"t={elapsed:.1f}s")
        except Exception as e:
            print(f"    Incumbent FAILED: {e}")
            incumbent_result["error"] = str(e)

        time.sleep(SLEEP_BETWEEN)

        # Call candidate
        candidate_result = {"enriched_text_ok": False, "chunk_type_valid": False}
        try:
            t0 = time.time()
            if CANDIDATE_P2_IS_WORKERS_AI:
                raw = call_workers_ai(CANDIDATE_PASS2_MODEL, PASS2_SYSTEM_PROMPT, user_content, max_tokens=1600)
            else:
                raw = call_openai(CANDIDATE_PASS2_MODEL, PASS2_SYSTEM_PROMPT, user_content, max_tokens=1600)
            elapsed = time.time() - t0
            candidate_result = score_pass2_response(raw or "")
            candidate_result["elapsed_s"] = round(elapsed, 1)
            print(f"    Candidate:  et={'OK' if candidate_result['enriched_text_ok'] else 'FAIL'}  "
                  f"type={candidate_result.get('chunk_type', '?')}  "
                  f"principles={candidate_result.get('principle_count', 0)}  "
                  f"t={elapsed:.1f}s")
        except Exception as e:
            print(f"    Candidate FAILED: {e}")
            candidate_result["error"] = str(e)

        time.sleep(SLEEP_BETWEEN)

        results.append({
            "chunk_id": chunk_id,
            "incumbent": incumbent_result,
            "candidate": candidate_result,
        })

    if dry_run:
        return

    # Summary
    valid = [r for r in results if "incumbent" in r and "candidate" in r]
    if not valid:
        print("\n[PASS 2] No valid results to summarise.\n")
        return

    inc_et_ok  = sum(1 for r in valid if r["incumbent"].get("enriched_text_ok"))
    cand_et_ok = sum(1 for r in valid if r["candidate"].get("enriched_text_ok"))
    cand_type_ok = sum(1 for r in valid if r["candidate"].get("chunk_type_valid"))
    n = len(valid)

    et_rate  = cand_et_ok / n
    type_rate = cand_type_ok / n

    print(f"\n{'─'*70}")
    print(f"PASS 2 SUMMARY — {n} chunks evaluated")
    print(f"  Incumbent enriched_text OK:  {inc_et_ok}/{n} ({inc_et_ok/n:.0%})")
    print(f"  Candidate enriched_text OK:  {cand_et_ok}/{n} ({et_rate:.0%})  (threshold: 95%)")
    print(f"  Candidate chunk_type valid:  {cand_type_ok}/{n} ({type_rate:.0%})  (threshold: 100%)")
    passes = et_rate >= 0.95 and type_rate >= 1.0
    print(f"  Decision: {'CANDIDATE PASSES initial gate' if passes else 'CANDIDATE FAILS — keep incumbent'}")
    print(f"  NOTE: Retrieval baseline must be run separately after any live swap.")
    print(f"{'─'*70}")

    rows = [
        [
            r["chunk_id"][-40:],
            "OK" if r["incumbent"].get("enriched_text_ok") else "FAIL",
            r["incumbent"].get("chunk_type", "?"),
            "OK" if r["candidate"].get("enriched_text_ok") else "FAIL",
            r["candidate"].get("chunk_type", "?"),
            r["candidate"].get("principle_count", "?"),
        ]
        for r in valid
    ]
    headers = ["Chunk ID (tail)", "Inc ET", "Inc Type", "Cand ET", "Cand Type", "Cand #P"]
    if HAS_TABULATE:
        print(tabulate(rows, headers=headers, tablefmt="simple"))
    else:
        for row in rows:
            print("  " + " | ".join(str(c) for c in row))

# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(description="Arcanthyr model swap evaluation harness")
    parser.add_argument("--pass1-only", action="store_true", help="Run Pass 1 eval only")
    parser.add_argument("--pass2-only", action="store_true", help="Run Pass 2 eval only")
    parser.add_argument("--dry-run",    action="store_true", help="Print prompts, no API calls")
    args = parser.parse_args()

    if not args.pass2_only:
        run_pass1_eval(dry_run=args.dry_run)

    if not args.pass1_only:
        run_pass2_eval(dry_run=args.dry_run)

    print("\nDone.")

if __name__ == "__main__":
    main()
