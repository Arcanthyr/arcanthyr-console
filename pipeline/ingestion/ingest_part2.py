import os
import re
import time
import json
import sys
import requests

PROCEDURE_ONLY = False
MASTER_ONLY    = False  # set True to ingest only master block chunks

INPUT_FILE = r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\master_corpus_part2.md"
WORKER_ENDPOINT = "https://arcanthyr.com/api/legal/upload-corpus"
DRY_RUN = "--dry-run" in sys.argv

# Read corpus
with open(INPUT_FILE, "r", encoding="utf-8") as f:
    raw = f.read()

# Split into sections by block separator, preserving block type.
section_pattern = re.compile(r"^[ \t]*<!-- block_\d+ (master|procedure) -->[ \t]*$", re.MULTILINE)
separators = list(section_pattern.finditer(raw))

# Split on headings where the following non-empty line starts with [DOMAIN:.
heading_pattern = re.compile(
    r"(?m)^(?P<heading>#+ .+)\n(?=(?:\s*\n)*\[[A-Z]+:)"
)

# chunks is a list of (block_type, chunk_text)
chunks = []
for i, sep in enumerate(separators):
    block_type = sep.group(1)
    start = sep.end()
    end = separators[i + 1].start() if i + 1 < len(separators) else len(raw)
    section_text = raw[start:end]
    matches = list(heading_pattern.finditer(section_text))
    for j, match in enumerate(matches):
        c_start = match.start()
        c_end = matches[j + 1].start() if j + 1 < len(matches) else len(section_text)
        chunk = section_text[c_start:c_end].strip()
        if chunk:
            chunks.append((block_type, chunk))

if PROCEDURE_ONLY:
    chunks = [(bt, c) for bt, c in chunks if bt == 'procedure']
    print(f"Total procedure chunks detected: {len(chunks)} (PROCEDURE_ONLY=True)")
if MASTER_ONLY:
    chunks = [(bt, c) for bt, c in chunks if bt == 'master']
else:
    print(f"Total chunks detected: {len(chunks)}")

def extract_metadata(chunk):
    """Extract [FIELD: value] markers and return (metadata_dict, prose)."""
    meta = {}
    # Find all [KEY: value] markers
    for m in re.finditer(r'\[([A-Z]+):\s*((?:[^\[\]]|\[[^\[\]]*\])*)\]', chunk):
        meta[m.group(1)] = m.group(2).strip()
    # Prose = everything after the last metadata marker
    last_marker = list(re.finditer(r'\[[A-Z]+:.*?\]', chunk))
    if last_marker:
        prose = chunk[last_marker[-1].end():].strip()
    else:
        prose = chunk
    # Strip heading line from prose if present
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

# Build payloads
payloads = []
sample_metadata = []
for block_type, chunk in chunks:
    heading = extract_heading(chunk)
    meta, prose = extract_metadata(chunk)
    if len(sample_metadata) < 3:
        sample_metadata.append((heading, meta))

    concepts = meta.get('CONCEPTS', '')
    if concepts:
        text = f"Concepts: {concepts}\n\n{prose}"
    else:
        text = prose

    citation = meta.get('CITATION') or heading_to_slug(heading)
    if PROCEDURE_ONLY and not citation.endswith(' [procedure]'):
        citation = citation + ' [procedure]'

    payload = {
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
    payloads.append((citation, payload))

# Deduplicate CITATION values — append [2], [3], ... to repeated occurrences
seen_citations = {}
deduped_payloads = []
for citation, payload in payloads:
    if citation not in seen_citations:
        seen_citations[citation] = 1
        deduped_payloads.append((citation, payload))
    else:
        seen_citations[citation] += 1
        new_citation = f"{citation} [{seen_citations[citation]}]"
        print(f"WARNING: duplicate CITATION renamed: '{citation}' -> '{new_citation}'")
        payload = dict(payload, citation=new_citation)
        deduped_payloads.append((new_citation, payload))
payloads = deduped_payloads

if DRY_RUN:
    print("\nDry run: first 3 chunk metadata extractions\n")
    for i, (heading, meta) in enumerate(sample_metadata, start=1):
        print(f"{i}. {heading}")
        print(json.dumps(meta, indent=2, ensure_ascii=False))
        print()
    sys.exit(0)

# Ingest
total = len(payloads)
success = 0
fail = 0

print(f"Ingesting {total} chunks to {WORKER_ENDPOINT}\n")

for citation, payload in payloads:
    try:
        r = requests.post(
            WORKER_ENDPOINT,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=30,
        )
        if r.status_code == 200:
            print(f"OK   [{citation}]")
            success += 1
        else:
            print(f"FAIL [{citation}] {r.status_code}")
            fail += 1
    except Exception as e:
        print(f"ERR  [{citation}] {e}")
        fail += 1

    time.sleep(1)

print(f"\nDone - {total} chunks | {success} OK | {fail} FAIL")
