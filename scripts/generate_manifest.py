import os
import re
import json
import hashlib

FILES = [
    r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\master_corpus_part1.md",
    r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\master_corpus_part2.md",
]
OUTPUT = r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\corpus_manifest.json"

def extract_metadata(chunk):
    meta = {}
    for m in re.finditer(r'\[([A-Z]+):\s*((?:[^\[\]]|\[[^\[\]]*\])*)\]', chunk):
        meta[m.group(1)] = m.group(2).strip()
    last_marker = list(re.finditer(r'\[[A-Z]+:.*?\]', chunk))
    prose = chunk[last_marker[-1].end():].strip() if last_marker else chunk
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

manifest = []
seen_citations = {}

for filepath in FILES:
    chunks = parse_file(filepath)
    source_file = os.path.basename(filepath)
    print(f"{source_file}: {len(chunks)} chunks")
    for i, chunk in enumerate(chunks):
        heading = extract_heading(chunk)
        meta, prose = extract_metadata(chunk)
        concepts = meta.get('CONCEPTS', '')
        text = f"Concepts: {concepts}\n\n{prose}" if concepts else prose
        citation = meta.get('CITATION') or heading_to_slug(heading)
        # Apply same dedup logic as ingest_corpus.py
        if citation not in seen_citations:
            seen_citations[citation] = 1
            final_id = citation
        else:
            seen_citations[citation] += 1
            final_id = f"{citation} [{seen_citations[citation]}]"
        manifest.append({
            "source_file": source_file,
            "chunk_index": i,
            "id": final_id,
            "citation_raw": meta.get('CITATION', ''),
            "heading": heading,
            "category": meta.get('CATEGORY', 'doctrine'),
            "body_length": len(text),
            "raw_text_hash": hashlib.sha256(text.encode('utf-8')).hexdigest(),
        })

print(f"\nTotal: {len(manifest)} chunks")
short = [m for m in manifest if m['body_length'] < 100]
if short:
    print(f"WARNING: {len(short)} chunks under 100 chars body length:")
    for s in short:
        print(f"  [{s['id']}] {s['body_length']} chars")

with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)

print(f"\nManifest written to {OUTPUT}")
