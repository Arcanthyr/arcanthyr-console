#!/usr/bin/env python3
"""
xref_agent.py — Cross-reference agent for Arcanthyr
Reads authorities_extracted and legislation_extracted from D1 cases via Worker API.
Writes normalised rows to case_citations and case_legislation_refs tables.
Idempotent — uses INSERT OR IGNORE with deterministic SHA1 IDs.

Usage:
  python3 xref_agent.py --mode citations      # process case citations only
  python3 xref_agent.py --mode legislation    # process legislation refs only
  python3 xref_agent.py --mode both           # process both (default)
  python3 xref_agent.py --status              # print counts and exit
"""

import argparse
import hashlib
import json
import logging
import os
import sys
from datetime import datetime, timezone

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
WORKER_URL       = os.environ.get('WORKER_URL', 'https://arcanthyr.com')
NEXUS_SECRET_KEY = os.environ.get('NEXUS_SECRET_KEY', '')
BATCH_SIZE       = 100

NEXUS_HEADERS = {
    'Content-Type': 'application/json',
    'X-Nexus-Key':  NEXUS_SECRET_KEY,
}

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def make_id(*parts: str) -> str:
    """Deterministic SHA1 ID from one or more string parts."""
    combined = '|'.join(p.strip().lower() for p in parts)
    return hashlib.sha1(combined.encode()).hexdigest()

def today() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')

def fetch_cases_page(offset: int) -> list:
    """Fetch one page of cases with xref data from Worker."""
    resp = requests.get(
        f"{WORKER_URL}/api/pipeline/fetch-cases-for-xref",
        params={'limit': BATCH_SIZE, 'offset': offset},
        headers={'X-Nexus-Key': NEXUS_SECRET_KEY},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get('ok'):
        raise RuntimeError(f"Worker error: {data.get('error')}")
    return data.get('cases', [])

def write_citation_rows(rows: list) -> int:
    """POST citation rows to Worker. Returns inserted count."""
    if not rows:
        return 0
    resp = requests.post(
        f"{WORKER_URL}/api/pipeline/write-citations",
        json={'rows': rows},
        headers=NEXUS_HEADERS,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get('inserted', 0)

def write_legislation_rows(rows: list) -> int:
    """POST legislation ref rows to Worker. Returns inserted count."""
    if not rows:
        return 0
    resp = requests.post(
        f"{WORKER_URL}/api/pipeline/write-legislation-refs",
        json={'rows': rows},
        headers=NEXUS_HEADERS,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get('inserted', 0)

# ---------------------------------------------------------------------------
# Processing
# ---------------------------------------------------------------------------
def process_citations(cases: list) -> list:
    """
    Parse authorities_extracted from each case.
    Returns list of case_citations rows ready to write.
    """
    rows = []
    for case in cases:
        citing = case.get('citation', '').strip()
        if not citing:
            continue
        raw = case.get('authorities_extracted', '[]') or '[]'
        try:
            authorities = json.loads(raw) if isinstance(raw, str) else raw
        except json.JSONDecodeError:
            log.warning(f"[XREF] Bad authorities_extracted JSON for {citing} — skipping")
            continue
        if not isinstance(authorities, list):
            continue
        for auth in authorities:
            if not isinstance(auth, dict):
                continue
            cited = auth.get('name', '').strip()
            if not cited:
                continue
            treatment = auth.get('treatment', '').strip().lower() or None
            why = auth.get('why', '').strip() or None
            row_id = make_id(citing, cited)
            rows.append({
                'id':          row_id,
                'citing_case': citing,
                'cited_case':  cited,
                'treatment':   treatment,
                'why':         why,
                'date_added':  today(),
            })
    return rows

def process_legislation_refs(cases: list) -> list:
    """
    Parse legislation_extracted from each case.
    Returns list of case_legislation_refs rows ready to write.
    """
    rows = []
    for case in cases:
        citation = case.get('citation', '').strip()
        if not citation:
            continue
        raw = case.get('legislation_extracted', '[]') or '[]'
        try:
            refs = json.loads(raw) if isinstance(raw, str) else raw
        except json.JSONDecodeError:
            log.warning(f"[XREF] Bad legislation_extracted JSON for {citation} — skipping")
            continue
        if not isinstance(refs, list):
            continue
        for ref in refs:
            if not isinstance(ref, str) or not ref.strip():
                continue
            ref = ref.strip()
            row_id = make_id(citation, ref)
            rows.append({
                'id':              row_id,
                'citation':        citation,
                'legislation_ref': ref,
                'date_added':      today(),
            })
    return rows

# ---------------------------------------------------------------------------
# Modes
# ---------------------------------------------------------------------------
def run_citations():
    log.info("[XREF] Starting citations pass...")
    offset = 0
    total_cases = 0
    total_inserted = 0
    while True:
        cases = fetch_cases_page(offset)
        if not cases:
            break
        log.info(f"[XREF] Processing {len(cases)} cases (offset {offset})")
        rows = process_citations(cases)
        inserted = write_citation_rows(rows)
        total_cases += len(cases)
        total_inserted += inserted
        log.info(f"[XREF] Wrote {inserted}/{len(rows)} citation rows (new inserts)")
        if len(cases) < BATCH_SIZE:
            break
        offset += BATCH_SIZE
    log.info(f"[XREF] Citations pass complete — {total_cases} cases processed, {total_inserted} rows inserted")

def run_legislation():
    log.info("[XREF] Starting legislation refs pass...")
    offset = 0
    total_cases = 0
    total_inserted = 0
    while True:
        cases = fetch_cases_page(offset)
        if not cases:
            break
        log.info(f"[XREF] Processing {len(cases)} cases (offset {offset})")
        rows = process_legislation_refs(cases)
        inserted = write_legislation_rows(rows)
        total_cases += len(cases)
        total_inserted += inserted
        log.info(f"[XREF] Wrote {inserted}/{len(rows)} legislation ref rows (new inserts)")
        if len(cases) < BATCH_SIZE:
            break
        offset += BATCH_SIZE
    log.info(f"[XREF] Legislation pass complete — {total_cases} cases processed, {total_inserted} rows inserted")

def run_status():
    log.info("[XREF] Fetching status...")
    cases = fetch_cases_page(0)
    log.info(f"[XREF] Worker reachable. First page returned {len(cases)} cases with xref data.")
    log.info("[XREF] For table counts run these D1 queries:")
    log.info("  SELECT COUNT(*) FROM case_citations;")
    log.info("  SELECT COUNT(*) FROM case_legislation_refs;")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description='Arcanthyr cross-reference agent')
    parser.add_argument('--mode', choices=['citations', 'legislation', 'both', 'status'],
                        default='both', help='Operation mode')
    args = parser.parse_args()

    if not NEXUS_SECRET_KEY:
        log.error("NEXUS_SECRET_KEY not set — export it before running")
        sys.exit(1)

    if args.mode == 'status':
        run_status()
    elif args.mode == 'citations':
        run_citations()
    elif args.mode == 'legislation':
        run_legislation()
    else:  # both
        run_citations()
        run_legislation()

if __name__ == '__main__':
    main()
