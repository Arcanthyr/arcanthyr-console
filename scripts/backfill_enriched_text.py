import json
import re
import os

MANIFEST_FILE = r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\corpus_manifest.json"
CORPUS_FILES = {
    "master_corpus_part1.md": r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\master_corpus_part1.md",
    "master_corpus_part2.md": r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\master_corpus_part2.md",
}
OUTPUT_SQL = r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\backfill_enriched_text.sql"

def extract_metadata(chunk):
    meta = {}
    for m in re.finditer(r'\[([A-Z]+):\s*((?:[^\[\]]|\[[^\[\]]*\])*)\]', chunk):
        meta[m.group(1)] = m.group(2).strip()
    last_marker = list(re.finditer(r'\[[A-Z]+:.*?\]', chunk))
    prose = chunk[last_marker[-1].end():].strip() if last_marker else chunk
    prose = re.sub(r'^#{2,3} .+\n?', '', prose).strip()
    return meta, prose

def parse_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        raw = f.read()
    cleaned = re.sub(
        r"^\s*<!-- block_\d+ (?:master|procedure) -->\s*$\n?",
        "", raw, flags=re.MULTILINE,
    )
    heading_pattern = re.compile(r"(?m)^(?P<heading>###? .+)\n(?=(?:\s*\n)*\[DOMAIN:)")
    matches = list(heading_pattern.finditer(cleaned))
    chunks = []
    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(cleaned)
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
    return chunks

# Load manifest
with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
    manifest = json.load(f)

# Build lookup: (source_file, chunk_index) -> manifest entry
manifest_lookup = {
    (m['source_file'], m['chunk_index']): m
    for m in manifest
}

# Parse all corpus files and build enriched_text by chunk index
updates = []
missing = []
short = []

for filename, filepath in CORPUS_FILES.items():
    chunks = parse_file(filepath)
    print(f"{filename}: {len(chunks)} chunks parsed")
    for i, chunk in enumerate(chunks):
        key = (filename, i)
        if key not in manifest_lookup:
            missing.append(key)
            continue
        entry = manifest_lookup[key]
        chunk_id = entry['id']
        meta, prose = extract_metadata(chunk)
        concepts = meta.get('CONCEPTS', '')
        enriched_text = f"Concepts: {concepts}\n\n{prose}" if concepts else prose
        if len(enriched_text.strip()) < 50:
            short.append(chunk_id)
        updates.append((chunk_id, enriched_text))

print(f"\nTotal updates prepared: {len(updates)}")
if missing:
    print(f"WARNING: {len(missing)} chunks not found in manifest")
if short:
    print(f"WARNING: {len(short)} chunks have very short enriched_text (<50 chars):")
    for s in short:
        print(f"  {s}")

# Write SQL file
with open(OUTPUT_SQL, 'w', encoding='utf-8') as f:
    for chunk_id, enriched_text in updates:
        safe_id = chunk_id.replace("'", "''")
        safe_text = enriched_text.replace("'", "''")
        f.write(f"UPDATE secondary_sources SET enriched_text = '{safe_text}', enriched = 1 WHERE id = '{safe_id}';\n")

print(f"\nSQL written to {OUTPUT_SQL}")
print("Review the SQL file, then run it via wrangler d1 execute")
