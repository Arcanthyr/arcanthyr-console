"""
ARCANTHYR — Qdrant Backfill Script
===================================
Reads all cases from D1 via the Worker search-cases endpoint and replays
each one to nexus.arcanthyr.com/ingest to populate Qdrant.

This is a TEST PHASE backfill. The Qdrant collection can be wiped and
re-ingested cleanly once all pipeline bugs are resolved.

Usage:
    python qdrant_backfill.py

Configuration:
    Create a .env file in the Local Scraper folder (same folder as this script)
    with the following line:

        NEXUS_SECRET_KEY=your_actual_key_here

    .env format rules:
        - One entry per line
        - KEY=value  (no quotes, no spaces around the =)
        - Lines starting with # are comments and are ignored

    Do NOT commit .env to GitHub. Add it to .gitignore.
"""

import os
import json
import time
import logging
import requests
from dotenv import load_dotenv

# Load secrets from .env in same folder as this script
_script_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(_script_dir, ".env"))

NEXUS_SECRET_KEY = os.environ.get("NEXUS_SECRET_KEY", "")

# Config
WORKER_URL = "https://arcanthyr.com/api/legal"
NEXUS_URL  = "https://nexus.arcanthyr.com/ingest"
DELAY_BETWEEN_CALLS = 2
PAGE_SIZE = 100

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.path.join(_script_dir, "qdrant_backfill.log")),
    ]
)


def fetch_all_cases():
    all_cases = []
    offset = 0
    while True:
        logging.info(f"Fetching cases from D1 (offset={offset}, limit={PAGE_SIZE})...")
        try:
            r = requests.post(f"{WORKER_URL}/search-cases",
                json={"limit": PAGE_SIZE, "offset": offset}, timeout=30)
            r.raise_for_status()
            data = r.json()
            data = data.get("result", data)
        except Exception as e:
            logging.error(f"Failed to fetch cases: {e}")
            break
        cases = data.get("cases", [])
        total = data.get("total", 0)
        all_cases.extend(cases)
        logging.info(f"  Got {len(cases)} cases (total in D1: {total})")
        if len(all_cases) >= total or len(cases) == 0:
            break
        offset += PAGE_SIZE
    return all_cases


def ingest_case(case):
    citation  = case.get("citation", "")
    case_name = case.get("case_name", citation)
    court     = case.get("court", "")
    facts     = case.get("facts", "")
    issues    = case.get("issues", "")
    holding   = case.get("holding", "")
    summary   = " ".join(filter(None, [facts, issues, holding]))

    principles_raw = case.get("principles_extracted") or "[]"
    try:
        principles_list = json.loads(principles_raw) if isinstance(principles_raw, str) else principles_raw
        principles_text  = " ".join(p.get("principle", p) if isinstance(p, dict) else str(p) for p in principles_list)
        principles_plain = [p.get("principle", p) if isinstance(p, dict) else str(p) for p in principles_list]
    except Exception:
        principles_text, principles_plain = "", []

    year = ""
    if "[" in citation:
        try:
            year = citation.split("]")[0].replace("[", "").strip()
        except Exception:
            pass

    payload = {
        "citation": citation, "case_name": case_name, "source": "AustLII",
        "text": (summary + " " + principles_text).strip(), "summary": summary,
        "category": "criminal", "jurisdiction": "Tasmania", "court": court,
        "year": year, "outcome": holding, "principles": principles_plain,
        "legislation": [], "offences": [],
    }

    try:
        r = requests.post(NEXUS_URL, json=payload,
            headers={"Content-Type": "application/json", "X-Nexus-Key": NEXUS_SECRET_KEY},
            timeout=60)
        r.raise_for_status()
        return True, r.json().get("chunks_stored", "?")
    except Exception as e:
        return False, str(e)


def main():
    if not NEXUS_SECRET_KEY:
        print("ERROR: NEXUS_SECRET_KEY not found.")
        print("Create a .env file in the Local Scraper folder with:")
        print("    NEXUS_SECRET_KEY=your_actual_key_here")
        return

    logging.info("=== Qdrant Backfill Started ===")
    cases = fetch_all_cases()
    if not cases:
        logging.error("No cases fetched from D1 — aborting.")
        return

    logging.info(f"Total cases to ingest: {len(cases)}")
    success_count, fail_count, total_chunks = 0, 0, 0

    for i, case in enumerate(cases, 1):
        citation = case.get("citation", f"unknown-{i}")
        ok, result = ingest_case(case)
        if ok:
            success_count += 1
            total_chunks  += int(result) if str(result).isdigit() else 0
            logging.info(f"[{i}/{len(cases)}] OK {citation} — {result} chunk(s)")
        else:
            fail_count += 1
            logging.error(f"[{i}/{len(cases)}] FAIL {citation} — {result}")
        if i < len(cases):
            time.sleep(DELAY_BETWEEN_CALLS)

    logging.info(f"=== Complete === success={success_count} failed={fail_count} chunks={total_chunks}")
    print(f"\nDone. {success_count} ingested, {fail_count} failed, {total_chunks} total chunks in Qdrant.")

if __name__ == "__main__":
    main()
