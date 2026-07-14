#!/usr/bin/env python3
"""
Phase 1: Generate authority-synthesis chunks for the most-cited cases
in the Tasmanian criminal law corpus (n >= 5 citations).

Output : scripts/authority-chunks-staging/authority-{slug}.md
Run    : python scripts/build_authority_chunks.py  (from arcanthyr-console/)
Prereq : npx wrangler available and authenticated (wrangler commands run from Arc v 4/)
"""

import json
import random
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SCRIPT_DIR    = Path(__file__).resolve().parent
STAGING_DIR   = SCRIPT_DIR / 'authority-chunks-staging'
WRANGLER_DIR  = SCRIPT_DIR.parent / 'Arc v 4'
TODAY         = date.today().isoformat()

# Written to secondary_sources.source_type at ingest (Phase 2c).
# Poller's SYNTHESIS_TYPES set must match this value exactly.
SOURCE_TYPE   = 'authority_synthesis'

MIN_CITATIONS = 5
MAX_PROPS     = 15
MAX_CITING    = 25

POSITIVE_TREATMENTS   = {
    'followed', 'applied', 'approved', 'adopted', 'endorsed',
    'affirmed', 'followed and applied',
}
CONSIDERED_TREATMENTS = {
    'considered', 'discussed', 'reviewed', 'considered and distinguished',
}
NEGATIVE_TREATMENTS   = {
    'distinguished', 'not followed', 'disapproved',
}


# ---------------------------------------------------------------------------
# D1 helpers
# ---------------------------------------------------------------------------

def d1(sql: str) -> list[dict]:
    """Run a single D1 query via wrangler and return the results list."""
    sql_escaped = sql.replace('"', '\\"')
    cmd = f'npx wrangler d1 execute arcanthyr --remote --json --command "{sql_escaped}"'
    result = subprocess.run(
        cmd,
        capture_output=True, text=True, cwd=str(WRANGLER_DIR),
        shell=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f'wrangler non-zero exit:\nSTDOUT: {result.stdout[:400]}\n'
            f'STDERR: {result.stderr[:400]}'
        )
    data = json.loads(result.stdout)
    if not isinstance(data, list) or not data:
        raise RuntimeError(f'Unexpected wrangler JSON shape: {str(data)[:200]}')
    if not data[0].get('success', True):
        raise RuntimeError(f'D1 query error: {data[0]}')
    return data[0].get('results', [])


def d1_paginated(base_sql: str, page_size: int = 100) -> list[dict]:
    """Paginate a SELECT query using LIMIT/OFFSET appended to base_sql."""
    all_rows: list[dict] = []
    offset = 0
    while True:
        rows = d1(f'{base_sql} LIMIT {page_size} OFFSET {offset}')
        all_rows.extend(rows)
        print(f'      page offset={offset}: {len(rows)} rows', flush=True)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

def slugify(s: str, max_len: int = 80) -> str:
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = re.sub(r'-+', '-', s)
    s = s.strip('-')
    return s[:max_len].rstrip('-')


def extract_propositions(ae_json: str | None, authority_name: str) -> set[str]:
    """
    Parse authorities_extracted JSON for one case and return proposition
    strings attributed to authority_name (exact name match, strip-trimmed).
    """
    if not ae_json:
        return set()
    try:
        entries = json.loads(ae_json) if isinstance(ae_json, str) else ae_json
    except (json.JSONDecodeError, TypeError):
        return set()
    if not isinstance(entries, list):
        return set()

    props: dict[str, str] = {}
    target = authority_name.strip()

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if entry.get('name', '').strip() != target:
            continue
        for field in ('proposition', 'principle', 'description', 'holding', 'summary'):
            val = entry.get(field, '')
            if val and isinstance(val, str):
                val = val.strip().rstrip('.')
                if len(val) > 20:
                    key = re.sub(r'\s+', ' ', val.lower().strip())
                    props[key] = val
                    break   # take first non-empty field only
    return set(props.values())


# ---------------------------------------------------------------------------
# Chunk builder
# ---------------------------------------------------------------------------

def build_chunk(
    authority_name: str,
    slug: str,
    total_n: int,
    positive: int,
    considered: int,
    negative: int,
    neutral: int,
    props: list[str],
    citing: list[tuple[str, str]],
) -> str:
    citation_id = f'authority-{slug}'

    # === Phase 1 assertions — fail loudly if invariants broken ===
    assert SOURCE_TYPE == 'authority_synthesis', (
        f'SOURCE_TYPE constant was changed — abort. Got: {SOURCE_TYPE!r}'
    )
    assert citation_id.startswith('authority-'), (
        f'Citation ID does not start with "authority-": {citation_id!r}'
    )

    props_section = (
        '\n'.join(f'- {p}' for p in props)
        if props
        else 'No propositions recorded in enrichment data; citing cases listed below.'
    )

    citing_display = citing[:MAX_CITING]
    extra          = max(0, len(citing) - MAX_CITING)
    citing_lines   = '\n'.join(
        f'- {cc} — {t or "cited"}' for cc, t in citing_display
    )
    if extra:
        citing_lines += f'\n- ... and {extra} earlier citations.'

    return (
        f'[CITATION: {citation_id}]\n'
        f'[DOMAIN: authority-synthesis]\n'
        f'[CATEGORY: citation-graph]\n'
        f'[TITLE: {authority_name} — Tasmanian citation profile]\n'
        f'\n'
        f'Concepts: {authority_name}, {authority_name} citation, '
        f'Tasmanian authority, citation profile, '
        f'{authority_name} treatment, authority synthesis\n'
        f'\n'
        f'## Citation profile\n'
        f'Cited {total_n} times across the Tasmanian criminal law corpus '
        f'indexed by Arcanthyr.\n'
        f'\n'
        f'## Treatment\n'
        f'- Followed / applied / approved / adopted: {positive}\n'
        f'- Considered / discussed: {considered}\n'
        f'- Distinguished / not followed / disapproved: {negative}\n'
        f'- Cited (neutral) / referred to: {neutral}\n'
        f'\n'
        f'## Propositions for which cited\n'
        f'{props_section}\n'
        f'\n'
        f'## Citing cases\n'
        f'{citing_lines}\n'
        f'\n'
        f'---\n'
        f'Generated {TODAY}. Derived from Tasmanian corpus citation graph. '
        f'Regenerate after scrape batches to refresh counts.\n'
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    print('=== Phase 1: Authority chunk generation ===\n')

    # --- Query 1: authority list ---
    print(f'[1/3] Fetching authorities with n >= {MIN_CITATIONS}...')
    authorities = d1(
        f'SELECT cited_case, COUNT(*) AS n FROM case_citations '
        f'GROUP BY cited_case HAVING n >= {MIN_CITATIONS} ORDER BY n DESC'
    )
    print(f'      → {len(authorities)} authorities\n')

    # --- Query 2: full case_citations (6,959 rows — fits single query) ---
    print('[2/3] Loading all case citations...')
    all_cit_rows = d1(
        'SELECT cited_case, citing_case, treatment '
        'FROM case_citations ORDER BY cited_case, citing_case DESC'
    )
    print(f'      → {len(all_cit_rows)} citation rows\n')

    citations_by_auth: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for row in all_cit_rows:
        citations_by_auth[row['cited_case']].append(
            (row['citing_case'], row.get('treatment') or 'cited')
        )

    # --- Query 3: authorities_extracted (paginated) ---
    print('[3/3] Loading authorities_extracted from cases (paginated)...')
    ae_rows = d1_paginated(
        'SELECT citation, authorities_extracted FROM cases '
        'WHERE authorities_extracted IS NOT NULL ORDER BY citation',
        page_size=100,
    )
    ae_by_citation = {
        row['citation']: row['authorities_extracted'] for row in ae_rows
    }
    print(f'      → {len(ae_by_citation)} cases with authorities_extracted\n')

    # --- Generate chunks ---
    generated: list[dict] = []
    zero_prop_count = 0
    slug_seen: dict[str, int] = {}
    assertion_errors: list[str] = []

    for auth_row in authorities:
        authority_name = auth_row['cited_case']
        total_n        = int(auth_row['n'])

        # Slug with collision suffix
        base_slug = slugify(authority_name)
        slug_seen[base_slug] = slug_seen.get(base_slug, 0) + 1
        count = slug_seen[base_slug]
        slug  = f'{base_slug}-{count}' if count > 1 else base_slug

        # Treatment buckets
        citing_list = citations_by_auth[authority_name]
        positive   = sum(1 for _, t in citing_list if t.lower() in POSITIVE_TREATMENTS)
        considered = sum(1 for _, t in citing_list if t.lower() in CONSIDERED_TREATMENTS)
        negative   = sum(1 for _, t in citing_list if t.lower() in NEGATIVE_TREATMENTS)
        neutral    = total_n - positive - considered - negative

        # Propositions — aggregate across all citing cases
        raw_props: set[str] = set()
        for citing_case, _ in citing_list:
            raw_props |= extract_propositions(
                ae_by_citation.get(citing_case), authority_name
            )
        props = sorted(raw_props, key=len, reverse=True)[:MAX_PROPS]
        if not props:
            zero_prop_count += 1

        # Citing cases sorted most-recent-first
        citing_sorted = sorted(citing_list, key=lambda x: x[0], reverse=True)

        try:
            chunk = build_chunk(
                authority_name, slug, total_n,
                positive, considered, negative, neutral,
                props, citing_sorted,
            )
        except AssertionError as exc:
            msg = f'{authority_name!r}: {exc}'
            assertion_errors.append(msg)
            print(f'  ✗ ASSERTION FAILED — {msg}', file=sys.stderr)
            continue

        outfile = STAGING_DIR / f'authority-{slug}.md'
        outfile.write_text(chunk, encoding='utf-8')
        generated.append({
            'id':   f'authority-{slug}',
            'name': authority_name,
            'len':  len(chunk),
            'n':    total_n,
        })

    # --- Report ---
    char_counts = sorted(g['len'] for g in generated)
    collisions  = [(k, v) for k, v in slug_seen.items() if v > 1]

    print('\n' + '=' * 60)
    print('PHASE 1 REPORT')
    print('=' * 60)
    print(f'Total chunks generated   : {len(generated)}')
    if char_counts:
        print(
            f'Char count (min/med/max) : '
            f'{char_counts[0]} / {char_counts[len(char_counts)//2]} / {char_counts[-1]}'
        )
    print(f'Zero-proposition count   : {zero_prop_count}')
    print(f'Slug collisions          : {len(collisions)}')
    for base, cnt in collisions:
        print(f'  {base}: {cnt} variants')
    print(f'Assertion errors         : {len(assertion_errors)}')
    for e in assertion_errors:
        print(f'  ✗ {e}')

    # 3 random full sample chunks
    samples = random.sample(generated, min(3, len(generated)))
    for s in samples:
        print(f'\n{"=" * 60}')
        print(f'SAMPLE: {s["id"]}  (n={s["n"]}, {s["len"]} chars)')
        print('=' * 60)
        print((STAGING_DIR / f'{s["id"]}.md').read_text(encoding='utf-8'))

    print(f'\nOutput: {STAGING_DIR}')
    print(f'Files written: {len(generated)}')

    if assertion_errors:
        print(f'\n⚠  {len(assertion_errors)} chunk(s) failed assertions — '
              f'staging output is incomplete. Fix before proceeding.')
        sys.exit(1)


if __name__ == '__main__':
    main()
