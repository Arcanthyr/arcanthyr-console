#!/usr/bin/env python3
"""
enrichment_poller.py — Arcanthyr Pipeline v2
============================================================
VPS background poller: enriches unenriched secondary_sources
chunks via Claude API, then embeds via pplx-embed to Qdrant.

Runs on VPS in ~/ai-stack/agent-general/src/ or anywhere with
access to the VPS-local Qdrant (port 6334) and Ollama (port 11434).

Usage:
  python enrichment_poller.py              # run once (default: batch of 10)
  python enrichment_poller.py --mode enrich   # enrichment pass only
  python enrichment_poller.py --mode embed    # embedding pass only
  python enrichment_poller.py --batch 20      # larger batch
  python enrichment_poller.py --loop          # continuous loop (cron alternative)
  python enrichment_poller.py --status        # print pipeline counts and exit

Environment variables (set in .env or export):
  WORKER_URL        https://arcanthyr.com   (no trailing slash)
  NEXUS_SECRET_KEY  <wrangler secret value>
  ANTHROPIC_API_KEY <anthropic key>
  QDRANT_URL        http://localhost:6334   (default)
  OLLAMA_URL        http://localhost:11434  (default)
  COLLECTION        general-docs-v2        (default)
============================================================
"""

import os
import sys
import json
import time
import uuid
import argparse
import logging
import re
import requests
from typing import Optional

# ── Logging ────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('enrichment_poller.log', encoding='utf-8')
    ]
)
log = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────
WORKER_URL        = os.environ.get('WORKER_URL',        'https://arcanthyr.com')
NEXUS_SECRET_KEY  = os.environ.get('NEXUS_SECRET_KEY',  '')
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
QDRANT_URL        = os.environ.get('QDRANT_URL',        'http://localhost:6334')
OLLAMA_URL        = os.environ.get('OLLAMA_URL',        'http://localhost:11434')
COLLECTION        = os.environ.get('COLLECTION',        'general-docs-v2')
EMBED_MODEL       = 'argus-ai/pplx-embed-context-v1-0.6b:fp32'
CLAUDE_MODEL      = 'claude-sonnet-4-20250514'

NEXUS_HEADERS = {
    'Content-Type': 'application/json',
    'X-Nexus-Key':  NEXUS_SECRET_KEY
}

# ── Master Prompt ───────────────────────────────────────────────
# Adapted from RAG_Workflow_Arcanthyr_v1.docx Master Prompt (locked).
# Called per chunk. Returns formatted markdown; we extract ## FORMATTED CHUNKS.

MASTER_PROMPT_SYSTEM = """You are processing ONE CHUNK of a legal research document for ingestion into a vector search and AI retrieval system.

The source material contains mixed personal notes and commentary on Tasmanian criminal law, including legislation, legal concepts, doctrinal analysis, evidentiary principles, sentencing principles, and case references.

If output budget becomes constrained, prioritise in this order:
1. Complete formatted chunks
2. Coverage report
3. Validation report
4. Deduplication report

Never truncate the formatted chunk set."""

MASTER_PROMPT_TEMPLATE = """You are processing ONE PART of a large legal research document for ingestion into a vector search and AI retrieval system.

The source material contains mixed personal notes and commentary on Tasmanian criminal law, including legislation, legal concepts, doctrinal analysis, evidentiary principles, sentencing principles, and case references.

Your task is to perform ALL of the following in a single pass on the uploaded part only:
1. FORMAT the source into semantically clean, self-contained retrieval chunks.
2. VERIFY COVERAGE by checking whether any substantive legal content in the source part was omitted from the formatted output.
3. VALIDATE STRUCTURE by checking the formatted output against the structural and metadata rules below.

Do not summarise or omit substantive legal analysis.
Work only on the uploaded part.
Do not rely on prior or later parts.
Do not ask for confirmation.
Output in Markdown only.

SOURCE INDEX PASS

Before producing any formatted chunks, perform a SOURCE INDEX PASS.

Scan the uploaded source block and identify every distinct doctrinal unit present. Examples include:
- statutory provisions
- offence definitions
- elements of offences
- defences
- evidentiary rules
- sentencing principles
- procedural rules
- interpretive doctrines
- case authorities

Case Authority Detection: during this scan, detect all case citations embedded in the text. Look for patterns such as:
- [YYYY] TASSC
- [YYYY] TASCCA
- [YYYY] HCA
- R v
- DPP v

Each detected authority must be recorded as a doctrinal unit and converted into a case authority chunk.

Create a list titled:

## SOURCE DOCTRINAL UNITS

Each item must be a concise description of one doctrinal unit. This list must represent the complete conceptual coverage of the source block. Do not begin formatting chunks until this list is complete. Each doctrinal unit listed must produce at least one formatted chunk unless the material is clearly duplicative.

PRIMARY OBJECTIVE

Convert the uploaded source part into semantically clean, self-contained chunks optimised for vector retrieval.

Each chunk must be fully understandable in isolation with no reliance on surrounding sections.

If the source already complies, preserve the substance and structure unless changes are required for compliance.

FORMATTING RULES

HEADING STRUCTURE

Use three heading levels only.

Level 1 — Major Act or major doctrinal topic.
Example: # Criminal Code Act 1924 (Tas)

Level 2 — Specific statutory provision or major legal concept.
Example: ## Criminal Code Act 1924 (Tas) s 156 — Culpable Homicide

Level 3 — Sub-rule or analytical component.
Example: ### Elements of the Offence

RULE ISOLATION

Each chunk must describe only one legal rule, definition, doctrinal test, evidentiary rule, sentencing principle, procedural rule, interpretive principle, or analytical principle.

If a section discusses multiple rules or tests, split it into separate chunks with distinct headings.

METADATA MARKERS

Immediately below every Level 2 or Level 3 heading include metadata markers in this exact order when supported by the source text:

[DOMAIN: Tasmanian Criminal Law]
[ACT: full Act name]
[SECTION: section number]
[CITATION: full legislative citation]
[TYPE: offence / element of offence / defence / statutory definition / legal doctrine / evidentiary rule / sentencing principle / procedural rule / interpretive principle / case authority]
[CASE: full case citation]
[TOPIC: concise legal topic]
[CONCEPTS: 5–10 supported keywords or search phrases]

Rules:
- Only include metadata supported by the source text.
- Never invent statutes, sections, cases, or doctrines.
- Omit [SECTION:] if not tied to a specific section.
- Omit [ACT:] and [CITATION:] if the chunk is not statutory.
- Omit [CASE:] unless the chunk is about or materially relies on a cited case.

Minimum required for every chunk: [DOMAIN:] [TYPE:] [TOPIC:] [CONCEPTS:]
If legislation is analysed also require: [ACT:] [CITATION:]
If case authority is analysed also require: [CASE:]

CONCEPTS FIELD

Provide 5–10 concepts supported by the source text.
Include: doctrinal terminology, synonyms, related legal ideas, plain-language search phrases.
Prefer mixed legal and natural-language phrasing.

CHUNK STRUCTURE

Each chunk must follow this structure:
Heading
Metadata markers
Prose explanation

Rules:
- The chunk must stand alone.
- Include full statutory references in the text.
- Do not rely on surrounding headings.
- Remove cross-references such as: see above / see below / as discussed earlier / refer to / noted earlier
- Rewrite cross-references as complete standalone explanations.

CONCEPT ANCHOR RULE

The first sentence of each chunk must clearly state the rule or legal concept being explained.

CHUNK LENGTH

Target length: 150–350 words. Hard maximum: 450 words.

If a discussion exceeds 450 words, split into logically distinct sub-topics with new headings.
Never use continuation headings such as: (cont.) / continued / part 2
Instead use semantic headings such as: Admissibility Test / Elements / Exception / Mental Element

CASE AUTHORITY BLOCKS

When a case is cited as authority for a legal rule, create a separate authority chunk.

Structure: ### Authority — [short description of rule]

Metadata must include: [DOMAIN:] [TYPE: case authority] [CASE: full citation] [TOPIC:] [CONCEPTS:]

CLEANING RULES

Remove: page numbers / headers and footers / redundant whitespace / duplicate content / cross-references

REVIEW FLAG

If heading level, metadata classification, rule separation, or source interpretation is uncertain, mark the affected chunk: [REVIEW]

COVERAGE VERIFICATION

After formatting, compare output against the uploaded source part only. List any omitted substantive material under [UNPROCESSED].

STRUCTURAL VALIDATION

Perform all 12 structural checks. Only report checks where an issue exists.

MANDATORY OUTPUT FORMAT

Output exactly in this order:

# PART OUTPUT

## SOURCE DOCTRINAL UNITS
[List of all doctrinal units identified in the source block before formatting begins.]

## FORMATTED CHUNKS
[Full formatted Markdown chunk set for this uploaded part.]

## SOURCE TOPICS IDENTIFIED
[List all major headings, topics, doctrines, statutory provisions, and authorities identified in the source part.]

## COVERAGE REPORT
Either: "No substantive omissions detected in this part."
Or: a list headed [UNPROCESSED] containing each suspected omission.

## VALIDATION REPORT
For each issue found, report: Check number / Heading / Quoted text (first 50 words) / Explanation
If no issue exists for a check, do not report it.

## DEDUPLICATION REPORT
Either: "No substantive duplicates detected in this part."
Or: list duplicate chunks and specify which version should be retained.

## FINAL STATUS
State one of:
- READY FOR APPEND TO MASTER FILE
- READY FOR APPEND WITH MINOR REVIEW
- NEEDS REVISION BEFORE APPEND

---

SOURCE CHUNK TO PROCESS:

{chunk_text}"""


FOLLOWUP_PROMPT = """The coverage report identified unprocessed items. Please now format the following unprocessed doctrinal units as additional chunks following the same formatting rules and metadata schema. Do not repeat chunks already produced.

Unprocessed items:
{unprocessed_items}"""


# ── D1 access via Worker routes ─────────────────────────────────

def fetch_unenriched_chunks(batch: int) -> list[dict]:
    """Fetch up to `batch` rows from secondary_sources where enriched=0."""
    # We call the Worker's D1 fetch route (read-only, no auth needed for GET)
    # The Worker needs a GET /api/pipeline/fetch-unenriched route.
    # For now we call it directly — see Worker CHANGE 5 in worker_pipeline_v2_diff.js
    resp = requests.get(
        f'{WORKER_URL}/api/pipeline/fetch-unenriched',
        params={'batch': batch},
        headers={'X-Nexus-Key': NEXUS_SECRET_KEY},
        timeout=15
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get('chunks', [])


def fetch_unenriched_for_embedding(batch: int) -> list[dict]:
    """Fetch up to `batch` rows where enriched=1, embedded=0."""
    resp = requests.get(
        f'{WORKER_URL}/api/pipeline/fetch-for-embedding',
        params={'batch': batch},
        headers={'X-Nexus-Key': NEXUS_SECRET_KEY},
        timeout=15
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get('chunks', [])


def write_enriched(chunk_id: str, enriched_text: str) -> bool:
    """POST enriched_text back to Worker → D1."""
    resp = requests.post(
        f'{WORKER_URL}/api/pipeline/write-enriched',
        headers=NEXUS_HEADERS,
        json={'chunk_id': chunk_id, 'enriched_text': enriched_text},
        timeout=15
    )
    resp.raise_for_status()
    return resp.json().get('ok', False)


def write_enrichment_error(chunk_id: str, error: str) -> None:
    """Record enrichment failure in D1."""
    try:
        requests.post(
            f'{WORKER_URL}/api/pipeline/write-enriched',
            headers=NEXUS_HEADERS,
            json={'chunk_id': chunk_id, 'error': error[:500]},
            timeout=15
        )
    except Exception:
        pass  # best-effort


def mark_embedded(chunk_ids: list[str]) -> bool:
    """Mark a batch of chunks as embedded=1 in D1."""
    resp = requests.post(
        f'{WORKER_URL}/api/pipeline/mark-embedded',
        headers=NEXUS_HEADERS,
        json={'chunk_ids': chunk_ids},
        timeout=15
    )
    resp.raise_for_status()
    return resp.json().get('ok', False)


def get_pipeline_status() -> dict:
    resp = requests.get(f'{WORKER_URL}/api/pipeline/status', timeout=15)
    resp.raise_for_status()
    return resp.json()


# ── Claude API enrichment ───────────────────────────────────────

def call_claude(chunk_text: str) -> str:
    """
    Call Claude API with Master Prompt.
    Returns full response text.
    Raises on API error.
    """
    headers = {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
    }
    body = {
        'model':      CLAUDE_MODEL,
        'max_tokens': 4096,
        'system':     MASTER_PROMPT_SYSTEM,
        'messages': [
            {
                'role':    'user',
                'content': MASTER_PROMPT_TEMPLATE.format(chunk_text=chunk_text)
            }
        ]
    }
    resp = requests.post(
        'https://api.anthropic.com/v1/messages',
        headers=headers,
        json=body,
        timeout=120
    )
    resp.raise_for_status()
    data = resp.json()
    return data['content'][0]['text']


def call_claude_followup(original_response: str, unprocessed_items: str) -> str:
    """Second call for NEEDS REVISION — process unprocessed doctrinal units."""
    headers = {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
    }
    body = {
        'model':      CLAUDE_MODEL,
        'max_tokens': 4096,
        'system':     MASTER_PROMPT_SYSTEM,
        'messages': [
            {
                'role':    'user',
                'content': MASTER_PROMPT_TEMPLATE.format(chunk_text='[See follow-up]')
            },
            {
                'role':    'assistant',
                'content': original_response
            },
            {
                'role':    'user',
                'content': FOLLOWUP_PROMPT.format(unprocessed_items=unprocessed_items)
            }
        ]
    }
    resp = requests.post(
        'https://api.anthropic.com/v1/messages',
        headers=headers,
        json=body,
        timeout=120
    )
    resp.raise_for_status()
    data = resp.json()
    return data['content'][0]['text']


def extract_formatted_chunks(response_text: str) -> Optional[str]:
    """
    Extract the ## FORMATTED CHUNKS section from Claude's response.
    Returns the chunk markdown, or None if section not found.
    """
    match = re.search(
        r'##\s+FORMATTED CHUNKS\s*\n(.*?)(?=\n##\s+[A-Z]|\Z)',
        response_text,
        re.DOTALL | re.IGNORECASE
    )
    if match:
        return match.group(1).strip()
    return None


def extract_final_status(response_text: str) -> str:
    """Extract the FINAL STATUS line."""
    match = re.search(
        r'##\s+FINAL STATUS\s*\n(.*?)(?=\n##|\Z)',
        response_text,
        re.DOTALL | re.IGNORECASE
    )
    if match:
        return match.group(1).strip()
    return 'UNKNOWN'


def extract_unprocessed(response_text: str) -> Optional[str]:
    """Extract [UNPROCESSED] items from coverage report for follow-up prompt."""
    match = re.search(
        r'\[UNPROCESSED\](.*?)(?=\n##|\Z)',
        response_text,
        re.DOTALL
    )
    if match:
        return match.group(1).strip()
    return None


# ── Embedding ───────────────────────────────────────────────────

def get_embedding(text: str) -> list[float]:
    """Get pplx-embed embedding from Ollama."""
    resp = requests.post(
        f'{OLLAMA_URL}/api/embeddings',
        json={'model': EMBED_MODEL, 'prompt': text},
        timeout=30  # was 180 — fail fast, don't hang the loop
    )
    resp.raise_for_status()
    return resp.json()['embedding']


def upsert_qdrant(chunk_id: str, vector: list[float], payload: dict) -> bool:
    """Upsert a single point to Qdrant."""
    # Use a deterministic UUID from chunk_id for idempotent upserts
    point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, chunk_id))
    resp = requests.put(
        f'{QDRANT_URL}/collections/{COLLECTION}/points',
        json={
            'points': [{
                'id':      point_id,
                'vector':  vector,
                'payload': {**payload, 'chunk_id': chunk_id}
            }]
        },
        timeout=30
    )
    resp.raise_for_status()
    return resp.json().get('status') == 'ok'


def verify_qdrant_point(chunk_id: str) -> bool:
    """
    Confirm a point actually landed in Qdrant by querying its deterministic ID.
    Returns True if found, False if missing.
    """
    point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, chunk_id))
    try:
        time.sleep(2)
        resp = requests.get(
            f'{QDRANT_URL}/collections/{COLLECTION}/points/{point_id}',
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get('result') is not None
        return False
    except Exception:
        return False


def get_all_qdrant_chunk_ids() -> set:
    """
    Scroll through all Qdrant points and collect chunk_id payload values.
    Used for reconciliation.
    """
    chunk_ids = set()
    offset = None
    while True:
        body = {'limit': 100, 'with_payload': True, 'with_vector': False}
        if offset:
            body['offset'] = offset
        resp = requests.post(
            f'{QDRANT_URL}/collections/{COLLECTION}/points/scroll',
            json=body,
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        for point in data['result']['points']:
            cid = point.get('payload', {}).get('chunk_id')
            if cid:
                chunk_ids.add(cid)
        offset = data['result'].get('next_page_offset')
        if not offset:
            break
    return chunk_ids


def reset_embedded_flag(chunk_ids: list[str]) -> bool:
    """Reset embedded=0 for a list of chunk_ids via Worker route."""
    resp = requests.post(
        f'{WORKER_URL}/api/pipeline/reset-embedded',
        headers=NEXUS_HEADERS,
        json={'chunk_ids': chunk_ids},
        timeout=15
    )
    resp.raise_for_status()
    return resp.json().get('ok', False)


def run_reconcile_pass() -> dict:
    """
    Compare D1 embedded=1 rows against Qdrant.
    Any chunk marked embedded in D1 but missing from Qdrant gets reset to embedded=0
    so the embedding pass will automatically re-process it.

    Run this: python enrichment_poller.py --mode reconcile
    """
    log.info('[RECONCILE] Fetching all Qdrant chunk_ids...')
    qdrant_ids = get_all_qdrant_chunk_ids()
    log.info(f'[RECONCILE] Qdrant has {len(qdrant_ids)} chunk_ids in payload')

    log.info('[RECONCILE] Fetching all D1 embedded=1 chunk_ids...')
    resp = requests.get(
        f'{WORKER_URL}/api/pipeline/fetch-embedded',
        headers={'X-Nexus-Key': NEXUS_SECRET_KEY},
        timeout=15
    )
    resp.raise_for_status()
    d1_chunks = resp.json().get('chunks', [])
    d1_ids = {c['id'] for c in d1_chunks}
    log.info(f'[RECONCILE] D1 has {len(d1_ids)} chunks marked embedded=1')

    missing = [cid for cid in d1_ids if cid not in qdrant_ids]
    log.info(f'[RECONCILE] Missing from Qdrant: {len(missing)} chunks')

    if not missing:
        log.info('[RECONCILE] ✓ D1 and Qdrant are in sync — nothing to do')
        return {'d1_embedded': len(d1_ids), 'qdrant_points': len(qdrant_ids), 'missing': 0, 'reset': 0}

    # Log the missing IDs
    log.warning(f'[RECONCILE] Missing chunk_ids:')
    for cid in missing:
        log.warning(f'  {cid}')

    # Reset embedded=0 so the embedding pass picks them up
    log.info(f'[RECONCILE] Resetting {len(missing)} chunks to embedded=0...')
    reset_embedded_flag(missing)
    log.info(f'[RECONCILE] ✓ Reset complete — run --mode embed to re-embed')

    return {
        'd1_embedded':   len(d1_ids),
        'qdrant_points': len(qdrant_ids),
        'missing':       len(missing),
        'reset':         len(missing)
    }


# ── Pipeline passes ─────────────────────────────────────────────

def run_enrichment_pass(batch: int) -> dict:
    """
    Fetch up to `batch` unenriched chunks, call Claude API per chunk,
    write enriched_text back to D1.
    Returns summary counts.
    """
    log.info(f'[ENRICH] Fetching up to {batch} unenriched chunks...')
    chunks = fetch_unenriched_chunks(batch)

    if not chunks:
        log.info('[ENRICH] No unenriched chunks found.')
        return {'processed': 0, 'ok': 0, 'errors': 0}

    log.info(f'[ENRICH] Got {len(chunks)} chunks to process.')
    ok = 0
    errors = 0

    for i, chunk in enumerate(chunks, 1):
        chunk_id   = chunk['id']
        chunk_text = chunk.get('raw_text') or chunk.get('text', '')
        log.info(f'[ENRICH] {i}/{len(chunks)} chunk_id={chunk_id} ({len(chunk_text)} chars)')

        if not chunk_text.strip():
            write_enrichment_error(chunk_id, 'Empty chunk text')
            errors += 1
            continue

        try:
            # First Claude call
            response   = call_claude(chunk_text)
            status     = extract_final_status(response)
            chunks_out = extract_formatted_chunks(response)

            log.info(f'[ENRICH]   FINAL STATUS: {status}')

            # Follow-up call if NEEDS REVISION
            if 'NEEDS REVISION' in status.upper():
                unprocessed = extract_unprocessed(response)
                if unprocessed:
                    log.info(f'[ENRICH]   Running follow-up for unprocessed items...')
                    followup   = call_claude_followup(response, unprocessed)
                    extra      = extract_formatted_chunks(followup)
                    if extra and chunks_out:
                        chunks_out = chunks_out + '\n\n' + extra
                    elif extra:
                        chunks_out = extra

            if not chunks_out:
                raise ValueError('Could not extract ## FORMATTED CHUNKS from response')

            write_enriched(chunk_id, chunks_out)
            log.info(f'[ENRICH]   ✓ Written to D1 ({len(chunks_out)} chars)')
            ok += 1

        except Exception as e:
            log.error(f'[ENRICH]   ✗ Error: {e}')
            write_enrichment_error(chunk_id, str(e))
            errors += 1

        # Polite delay — Claude API rate limits
        if i < len(chunks):
            time.sleep(2)

    log.info(f'[ENRICH] Pass complete: {ok} ok, {errors} errors')
    return {'processed': len(chunks), 'ok': ok, 'errors': errors}


def run_embedding_pass(batch: int) -> dict:
    """
    Fetch up to `batch` enriched-but-not-embedded chunks,
    embed via pplx-embed, upsert to Qdrant, mark embedded=1 in D1.
    Returns summary counts.
    """
    log.info(f'[EMBED] Fetching up to {batch} chunks ready for embedding...')
    chunks = fetch_unenriched_for_embedding(batch)

    if not chunks:
        log.info('[EMBED] No chunks ready for embedding.')
        return {'processed': 0, 'ok': 0, 'errors': 0}

    log.info(f'[EMBED] Got {len(chunks)} chunks to embed.')
    ok_ids = []
    errors = 0

    for i, chunk in enumerate(chunks, 1):
        chunk_id     = chunk['id']
        # Prefer enriched_text for embedding; fall back to raw text
        embed_text   = chunk.get('enriched_text') or chunk.get('raw_text', '')
        metadata     = {
            'source_id':   chunk.get('source_id', ''),
            'chunk_index': chunk.get('chunk_index', 0),
            'text':        embed_text[:5000],
            'type':        'secondary_source',
            'category':    chunk.get('category', 'doctrine')
        }

        log.info(f'[EMBED] {i}/{len(chunks)} chunk_id={chunk_id}')

        try:
            vector = get_embedding(embed_text)
            upsert_qdrant(chunk_id, vector, metadata)

            # Verify the point actually landed — retry up to 5 times with 1s between
            verified = False
            for attempt in range(1, 6):
                if verify_qdrant_point(chunk_id):
                    verified = True
                    break
                if attempt < 5:
                    time.sleep(1)
            if verified:
                ok_ids.append(chunk_id)
                log.info(f'[EMBED]   ✓ Embedded and verified')
                print(f"[embed] OK: {chunk_id}", flush=True)  # heartbeat
            else:
                log.warning(f'[EMBED]   ⚠ Point not found after 5 verify attempts — leaving embedded=0 for retry')
                errors += 1
        except Exception as e:
            log.error(f'[EMBED]   ✗ Error: {e}')
            errors += 1

    # Batch-mark embedded in D1
    if ok_ids:
        mark_embedded(ok_ids)
        log.info(f'[EMBED] Marked {len(ok_ids)} chunks as embedded=1 in D1')

    log.info(f'[EMBED] Pass complete: {len(ok_ids)} ok, {errors} errors')
    return {'processed': len(chunks), 'ok': len(ok_ids), 'errors': errors}


def run_case_chunk_embedding_pass(batch: int = 10) -> dict:
    """
    Fetch up to `batch` case_chunks where done=1 and embedded=0,
    embed via pplx-embed, upsert to Qdrant, mark embedded=1 via Worker route.
    """
    log.info(f'[CASE-EMBED] Fetching up to {batch} case chunks ready for embedding...')
    resp = requests.get(
        f'{WORKER_URL}/api/pipeline/fetch-case-chunks-for-embedding',
        params={'batch': batch},
        headers={'X-Nexus-Key': NEXUS_SECRET_KEY},
        timeout=15
    )
    resp.raise_for_status()
    chunks = resp.json().get('chunks', [])

    if not chunks:
        log.info('[CASE-EMBED] No case chunks ready for embedding.')
        return {'processed': 0, 'ok': 0, 'errors': 0}

    log.info(f'[CASE-EMBED] Got {len(chunks)} chunks to embed.')
    ok_ids = []
    errors = 0

    for i, chunk in enumerate(chunks, 1):
        chunk_id    = chunk['id']
        embed_text  = chunk.get('chunk_text', '')
        metadata    = {
            'chunk_id':    chunk_id,
            'citation':    chunk.get('citation', ''),
            'chunk_index': chunk.get('chunk_index', 0),
            'case_name':   chunk.get('case_name') or '',
            'text':        embed_text[:3000],
            'type':        'case_chunk',
            'source':      'AustLII',
        }

        log.info(f'[CASE-EMBED] {i}/{len(chunks)} chunk_id={chunk_id}')

        try:
            vector = get_embedding(embed_text)
            upsert_qdrant(chunk_id, vector, metadata)

            verified = False
            for attempt in range(1, 6):
                if verify_qdrant_point(chunk_id):
                    verified = True
                    break
                if attempt < 5:
                    time.sleep(1)
            if verified:
                ok_ids.append(chunk_id)
                log.info(f'[CASE-EMBED]   ✓ Embedded and verified')
                print(f"[case-embed] OK: {chunk_id}", flush=True)
            else:
                log.warning(f'[CASE-EMBED]   ⚠ Point not found after 5 verify attempts — leaving embedded=0 for retry')
                errors += 1
        except Exception as e:
            log.error(f'[CASE-EMBED]   ✗ Error: {e}')
            errors += 1

    if ok_ids:
        mark_resp = requests.post(
            f'{WORKER_URL}/api/pipeline/mark-case-chunks-embedded',
            headers=NEXUS_HEADERS,
            json={'chunk_ids': ok_ids},
            timeout=15
        )
        mark_resp.raise_for_status()
        log.info(f'[CASE-EMBED] Marked {len(ok_ids)} chunks as embedded=1 in D1')

    log.info(f'[CASE-EMBED] Pass complete: {len(ok_ids)} ok, {errors} errors')
    return {'processed': len(chunks), 'ok': len(ok_ids), 'errors': errors}


def run_legislation_embedding_pass(batch: int = 5) -> dict:
    """Embed legislation sections. Fetches by Act, embeds each section, marks Act embedded when done."""
    url = f"{WORKER_URL}/api/pipeline/fetch-legislation-for-embedding?batch={batch}"
    resp = requests.get(url, headers={'X-Nexus-Key': NEXUS_SECRET_KEY}, timeout=30)
    resp.raise_for_status()
    sections = resp.json().get('sections', [])
    if not sections:
        log.info('[LEG] No legislation sections to embed.')
        return {'embedded': 0, 'acts_completed': 0}

    from collections import defaultdict
    by_act = defaultdict(list)
    for s in sections:
        by_act[s['leg_id']].append(s)

    total_embedded = 0
    completed_acts = []

    for leg_id, act_sections in by_act.items():
        leg_title = act_sections[0]['leg_title']
        log.info(f'[LEG] Embedding {len(act_sections)} sections for: {leg_title}')
        ok = True
        for s in act_sections:
            embed_text = s['text']
            if not embed_text.strip():
                continue
            metadata = {
                'leg_id':         leg_id,
                'leg_title':      leg_title,
                'section_id':     s['section_id'],
                'section_number': s['section_number'],
                'heading':        s['heading'],
                'text':           embed_text[:3000],
                'type':           'legislation'
            }
            try:
                vector = get_embedding(embed_text)
                upsert_qdrant(s['section_id'], vector, metadata)
                total_embedded += 1
            except Exception as e:
                log.error(f'[LEG] ERROR on section {s["section_number"]}: {e}')
                ok = False
                break
        if ok:
            completed_acts.append(leg_id)

    if completed_acts:
        mark_url = f'{WORKER_URL}/api/pipeline/mark-legislation-embedded'
        requests.post(mark_url, json={'leg_ids': completed_acts},
                      headers={'X-Nexus-Key': NEXUS_SECRET_KEY}, timeout=15).raise_for_status()
        log.info(f'[LEG] Marked {len(completed_acts)} Act(s) as embedded=1')

    log.info(f'[LEG] Pass complete: {total_embedded} sections embedded, {len(completed_acts)} Acts completed')
    return {'embedded': total_embedded, 'acts_completed': len(completed_acts)}


# ── CLI ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Arcanthyr enrichment/embedding poller')
    parser.add_argument('--mode',  choices=['enrich', 'embed', 'both', 'reconcile'], default='both')
    parser.add_argument('--batch', type=int, default=50)
    parser.add_argument('--loop',  action='store_true', help='Run continuously (60s sleep between passes)')
    parser.add_argument('--status', action='store_true', help='Print pipeline status and exit')
    args = parser.parse_args()

    # Validate env
    if not NEXUS_SECRET_KEY:
        log.error('NEXUS_SECRET_KEY not set')
        sys.exit(1)
    if args.mode in ('enrich', 'both') and not ANTHROPIC_API_KEY:
        log.error('ANTHROPIC_API_KEY not set')
        sys.exit(1)

    if args.status:
        status = get_pipeline_status()
        print(json.dumps(status, indent=2))
        return

    if args.mode == 'reconcile':
        result = run_reconcile_pass()
        print(json.dumps(result, indent=2))
        return

    def run_once():
        if args.mode in ('enrich', 'both'):
            run_enrichment_pass(args.batch)
        if args.mode in ('embed', 'both'):
            run_embedding_pass(args.batch)
            run_case_chunk_embedding_pass(batch=args.batch)
            run_legislation_embedding_pass(batch=args.batch)

    if args.loop:
        log.info('[POLLER] Loop mode — Ctrl+C to stop')
        while True:
            run_once()
            log.info('[POLLER] Sleeping 60s...')
            time.sleep(15)
    else:
        run_once()


if __name__ == '__main__':
    main()
