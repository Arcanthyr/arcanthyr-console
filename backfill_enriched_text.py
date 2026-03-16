"""
backfill_enriched_text.py
--------------------------
Parses master_corpus_part1.md and master_corpus_part2.md using the same
logic as ingest_corpus.py, then UPDATEs D1 secondary_sources rows by
setting enriched_text and enriched=1, matched on id = citation.

Run from PowerShell:
    python backfill_enriched_text.py --dry-run     # preview first 5 matches
    python backfill_enriched_text.py               # write UPDATE SQL file

Then execute the SQL against D1 via wrangler.
"""

import os
import re
import sys
import json

# ── Config ────────────────────────────────────────────────────────────────────

PART_FILES = [
    r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\master_corpus_part1.md",
    r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\master_corpus_part2.md",
]

OUTPUT_SQL = r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\backfill_enriched.sql"

DRY_RUN = "--dry-run" in sys.argv

# ── Helpers (mirrors ingest_corpus.py exactly) ────────────────────────────────

def heading_to_slug(heading):
    slug = heading.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'\s+', '-', slug.strip())
    return 'secondary-' + slug[:80]

def extract_heading(chunk):
    m = re.match(r'^#{2,3} (.+)', chunk)
    return m.group(1).strip() if m else chunk[:60]

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

def parse_corpus_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        raw = f.read()

    cleaned = re.sub(
        r"^\s*<!-- block_\d+ (?:master|procedure) -->\s*$\n?",
        "",
        raw,
        flags=re.MULTILINE,
    )

    heading_pattern = re.compile(
        r"(?m)^(?P<heading>###? .+)\n(?=(?:\s*\n)*\[DOMAIN:)"
    )

    matches = list(heading_pattern.finditer(cleaned))
    chunks = []
    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(cleaned)
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)

    return chunks

def build_payloads(chunks):
    payloads = []
    seen_citations = {}

    for chunk in chunks:
        heading = extract_heading(chunk)
        meta, prose = extract_metadata(chunk)

        concepts = meta.get('CONCEPTS', '')
        if concepts:
            enriched_text = f"Concepts: {concepts}\n\n{prose}"
        else:
            enriched_text = prose

        citation = meta.get('CITATION') or heading_to_slug(heading)

        # Deduplicate exactly as ingest_corpus.py does
        if citation not in seen_citations:
            seen_citations[citation] = 1
        else:
            seen_citations[citation] += 1
            citation = f"{citation} [{seen_citations[citation]}]"

        payloads.append({
            "id": citation,
            "enriched_text": enriched_text,
        })

    return payloads

# ── SQL escaping ──────────────────────────────────────────────────────────────

def sql_escape(s):
    """Escape single quotes for SQLite."""
    return s.replace("'", "''")

# ── Main ──────────────────────────────────────────────────────────────────────

all_payloads = []
for filepath in PART_FILES:
    print(f"Parsing: {filepath}")
    chunks = parse_corpus_file(filepath)
    payloads = build_payloads(chunks)
    print(f"  → {len(payloads)} chunks extracted")
    all_payloads.extend(payloads)

print(f"\nTotal chunks: {len(all_payloads)}")

if DRY_RUN:
    print("\n── Dry run: first 5 entries ──\n")
    for p in all_payloads[:5]:
        print(f"ID:    {p['id']}")
        print(f"TEXT:  {p['enriched_text'][:120]}...")
        print()
    sys.exit(0)

# Write SQL file — one UPDATE per chunk
print(f"\nWriting SQL to: {OUTPUT_SQL}")

# D1 wrangler can only handle ~50 statements per execute call reliably.
# We write all statements to a file; user executes in batches if needed.
# But since wrangler --file has no row limit documented, we try all at once
# and note the batch approach as fallback.

lines = []
for p in all_payloads:
    escaped_text = sql_escape(p['enriched_text'])
    escaped_id   = sql_escape(p['id'])
    lines.append(
        f"UPDATE secondary_sources SET enriched_text='{escaped_text}', enriched=1 WHERE id='{escaped_id}';"
    )

with open(OUTPUT_SQL, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Written {len(lines)} UPDATE statements.")
print()
print("Next step — execute against D1:")
print(f'  npx wrangler d1 execute arcanthyr --remote --file "backfill_enriched.sql"')
print()
print("If that times out, run in batches:")
print("  python backfill_enriched_text.py --batch")
