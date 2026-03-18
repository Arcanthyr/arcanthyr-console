import re
import time
import json
import sys
import os
import requests

BASE_DIR      = r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4"
INPUT_FILES   = [
    os.path.join(BASE_DIR, "master_corpus_part1.md"),
    os.path.join(BASE_DIR, "master_corpus_part2.md"),
]
ENV_FILE      = os.path.join(BASE_DIR, ".env")
UPLOAD_URL    = "https://arcanthyr.com/api/legal/upload-corpus"
ENRICHED_URL  = "https://arcanthyr.com/api/pipeline/write-enriched"
DRY_RUN       = "--dry-run" in sys.argv

# ---------------------------------------------------------------------------
# Read NEXUS_SECRET_KEY from .env
# ---------------------------------------------------------------------------
nexus_key = None
if os.path.exists(ENV_FILE):
    with open(ENV_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("NEXUS_SECRET_KEY="):
                nexus_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                break

if not nexus_key and not DRY_RUN:
    print("ERROR: NEXUS_SECRET_KEY not found in .env — cannot set enriched=1 after ingest.")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Shared parsing helpers (identical to ingest_corpus.py)
# ---------------------------------------------------------------------------
HEADING_PATTERN = re.compile(r"(?m)^(?P<heading>###? .+)\n(?=(?:\s*\n)*\[DOMAIN:)")

def strip_separators(raw):
    return re.sub(
        r"^\s*<!-- block_\d+ (?:master|procedure) -->\s*$\n?",
        "",
        raw,
        flags=re.MULTILINE,
    )

def split_chunks(cleaned):
    matches = list(HEADING_PATTERN.finditer(cleaned))
    chunks = []
    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(cleaned)
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
    return chunks

def extract_metadata(chunk):
    meta = {}
    for m in re.finditer(r'\[([A-Z]+):\s*(.*?)\]', chunk):
        meta[m.group(1)] = m.group(2).strip()
    last_marker = list(re.finditer(r'\[[A-Z]+:.*?\]', chunk))
    if last_marker:
        prose = chunk[last_marker[-1].end():].strip()
    else:
        prose = chunk
    prose = re.sub(r'^#{2,3} .+\n?', '', prose).strip()
    return meta, prose

def heading_to_slug(heading):
    slug = heading.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'\s+', '-', slug.strip())
    return 'secondary-' + slug[:80]

def extract_heading(chunk):
    m = re.match(r'^#{2,3} (.+)', chunk)
    return m.group(1).strip() if m else chunk[:60]

def build_payload(chunk):
    heading = extract_heading(chunk)
    meta, prose = extract_metadata(chunk)
    concepts = meta.get('CONCEPTS', '')
    text = f"Concepts: {concepts}\n\n{prose}" if concepts else prose
    citation = meta.get('CITATION') or heading_to_slug(heading)
    return citation, {
        "text": text,
        "citation": citation,
        "source": heading,
        "summary": meta.get('TOPIC', ''),
        "doc_type": meta.get('TYPE', ''),
        "category": meta.get('CATEGORY', 'doctrine'),
        "legislation": meta.get('ACT', ''),
        "jurisdiction": meta.get('DOMAIN', ''),
        "court": meta.get('CASE', ''),
        "year": None,
        "outcome": "",
        "principles": "",
        "offences": "",
    }

# ---------------------------------------------------------------------------
# Parse both files and collect all (citation, payload) pairs in order
# ---------------------------------------------------------------------------
all_entries = []  # list of (citation, payload, source_file)

for path in INPUT_FILES:
    label = os.path.basename(path)
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    cleaned = strip_separators(raw)
    chunks = split_chunks(cleaned)
    print(f"{label}: {len(chunks)} chunks")
    for chunk in chunks:
        citation, payload = build_payload(chunk)
        all_entries.append((citation, payload, label))

# ---------------------------------------------------------------------------
# Identify citations that appear more than once
# ---------------------------------------------------------------------------
from collections import Counter
citation_counts = Counter(c for c, _, _ in all_entries)
duplicate_citations = {c for c, n in citation_counts.items() if n > 1}

print(f"\nTotal citations: {len(all_entries)}")
print(f"Duplicate citation keys: {len(duplicate_citations)}")

if not duplicate_citations:
    print("No duplicates found — nothing to reingest.")
    sys.exit(0)

# ---------------------------------------------------------------------------
# Walk entries: skip first occurrence, collect later occurrences with [N] suffix
# ---------------------------------------------------------------------------
seen = {}
to_ingest = []  # list of (final_citation, payload)

for citation, payload, source_file in all_entries:
    if citation not in duplicate_citations:
        seen[citation] = 1
        continue  # not a duplicate group — skip entirely

    if citation not in seen:
        # First occurrence — already ingested by ingest_corpus.py, skip
        seen[citation] = 1
        continue

    # Second, third, ... occurrence — collect with suffix
    seen[citation] += 1
    n = seen[citation]
    new_citation = f"{citation} [{n}]"
    new_payload = dict(payload, citation=new_citation)
    to_ingest.append((new_citation, new_payload, source_file))

print(f"Chunks to reingest (2nd+ occurrences): {len(to_ingest)}\n")

for final_citation, payload, source_file in to_ingest:
    print(f"  [{source_file}] {final_citation}")

print()

if DRY_RUN:
    print("Dry run — no POSTs sent.")
    sys.exit(0)

# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------
success = 0
fail = 0

for final_citation, payload, source_file in to_ingest:
    # Step 1: POST to upload-corpus
    try:
        r = requests.post(
            UPLOAD_URL,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=30,
        )
        if r.status_code != 200:
            print(f"FAIL upload [{final_citation}] HTTP {r.status_code}")
            fail += 1
            time.sleep(1)
            continue
    except Exception as e:
        print(f"ERR  upload [{final_citation}] {e}")
        fail += 1
        time.sleep(1)
        continue

    # Step 2: Set enriched=1 via pipeline route
    try:
        r2 = requests.post(
            ENRICHED_URL,
            headers={
                "Content-Type": "application/json",
                "X-Nexus-Key": nexus_key,
            },
            data=json.dumps({"chunk_id": final_citation, "enriched_text": None}),
            timeout=30,
        )
        if r2.status_code == 200:
            print(f"OK   [{final_citation}]")
            success += 1
        else:
            print(f"WARN upload OK but enriched update failed [{final_citation}] HTTP {r2.status_code}")
            success += 1  # row is in D1, just needs manual enriched=1
    except Exception as e:
        print(f"WARN upload OK but enriched update failed [{final_citation}] {e}")
        success += 1

    time.sleep(1)

total = len(to_ingest)
print(f"\nDone — {total} chunks | {success} OK | {fail} FAIL")
if fail:
    print("Re-run to retry failed chunks — upload-corpus uses INSERT OR IGNORE so safe to repeat.")
