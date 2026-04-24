"""
gen_cleanup_sql.py
Scans secondary_sources.raw_text for Word formatting artifacts and
generates UPDATE SQL to replace them with clean ASCII equivalents.
Run from arcanthyr-console\\ root in PowerShell (not via CC).
Output: cleanup.sql + a summary to stdout.
"""

import subprocess
import json

WRANGLER_DIR = r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4"

REPLACEMENTS = [
    ("“", '"'),   # left double quote
    ("”", '"'),   # right double quote
    ("‘", "'"),   # left single quote
    ("’", "'"),   # right single quote
    ("–", "-"),   # en dash
    ("—", "--"),  # em dash
    ("…", "..."), # ellipsis
    (" ", " "),   # non-breaking space
    ("­", ""),    # soft hyphen
    ("﻿", ""),    # BOM
]

def run_d1(sql):
    cmd = f'npx wrangler d1 execute arcanthyr --remote --json --command "{sql.replace(chr(34), chr(92)+chr(34))}"'
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=WRANGLER_DIR, shell=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr[:500])
    data = json.loads(result.stdout)
    return data[0]["results"] if isinstance(data, list) else data.get("results", [])

def needs_cleaning(text):
    return any(ch in text for ch, _ in REPLACEMENTS)

def clean(text):
    for ch, replacement in REPLACEMENTS:
        text = text.replace(ch, replacement)
    return text

def escape_sql_string(s):
    return s.replace("'", "''")

print("Fetching secondary_sources...")
rows = run_d1("SELECT id, raw_text FROM secondary_sources")
print(f"  {len(rows)} rows fetched")

dirty = [(r["id"], r["raw_text"]) for r in rows if needs_cleaning(r["raw_text"] or "")]
print(f"  {len(dirty)} rows contain Word artifacts")

if not dirty:
    print("Nothing to clean.")
    exit(0)

# Preview first 5
print("\nFirst 5 IDs to clean:")
for id_, _ in dirty[:5]:
    print(f"  {id_}")

statements = []
for id_, raw in dirty:
    cleaned = clean(raw)
    escaped_id = escape_sql_string(id_)
    escaped_text = escape_sql_string(cleaned)
    statements.append(f"UPDATE secondary_sources SET raw_text = '{escaped_text}', embedded = 0 WHERE id = '{escaped_id}';")

out_file = "cleanup.sql"
with open(out_file, "w", encoding="utf-8") as f:
    f.write("\n".join(statements))

print(f"\n{len(statements)} UPDATE statements written to {out_file}")
print("Review cleanup.sql, then apply with:")
print(f'  npx wrangler d1 execute arcanthyr --remote --file cleanup.sql')
print("\nNote: embedded=0 is set on cleaned rows so poller re-embeds them.")
