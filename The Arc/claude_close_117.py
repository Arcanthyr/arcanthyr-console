CLAUDE_MD = r"c:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\CLAUDE.md"
TEMP_114 = r"c:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\session114_block_temp.txt"

with open(CLAUDE_MD, 'rb') as f:
    raw = f.read()

lines = raw.split(b'\n')

# ── Step g: assert, extract, delete session 114 block ──────────────────────
start_114 = 494  # 0-indexed (1-indexed line 495)
end_114_excl = 512  # 0-indexed (1-indexed line 513 is session 115 heading)

assert b'## CHANGES THIS SESSION (session 114)' in lines[start_114], \
    f'ASSERT FAIL start_114: {lines[start_114][:80]}'
assert b'## CHANGES THIS SESSION (session 115)' in lines[end_114_excl], \
    f'ASSERT FAIL end_114_excl: {lines[end_114_excl][:80]}'

# Confirm distinctive token is in the block
assert any(b'Pass 2+3 concurrent retrieval' in l for l in lines[start_114:end_114_excl]), \
    'ASSERT FAIL: distinctive token not in session 114 block'

session_114_bytes = b'\n'.join(lines[start_114:end_114_excl])
session_114_content = session_114_bytes.decode('utf-8', errors='surrogateescape').rstrip()

with open(TEMP_114, 'w', encoding='utf-8') as f:
    f.write(session_114_content)

print(f'Session 114 extracted: {len(session_114_content)} chars')
print(f'First: {lines[start_114][:70]}')
print(f'Last non-empty: {lines[end_114_excl-3][:70]}')

del lines[start_114:end_114_excl]

assert b'## CHANGES THIS SESSION (session 115)' in lines[494], \
    f'Post-delete assert fail: {lines[494][:80]}'
print('Session 114 deletion verified.')

content = b'\n'.join(lines).decode('utf-8', errors='surrogateescape')
changes = []

# ── Edit a: datestamp ───────────────────────────────────────────────────────
OLD = 'Updated: 10 May 2026 (end of session 116)'
NEW = 'Updated: 10 May 2026 (end of session 117)'
if OLD in content:
    content = content.replace(OLD, NEW, 1); changes.append('a OK: datestamp')
else:
    changes.append('a FAILED: datestamp')

# ── Edit b: SYSTEM STATE heading ────────────────────────────────────────────
OLD = '## SYSTEM STATE — 10 May 2026 (end of session 116)'
NEW = '## SYSTEM STATE — 10 May 2026 (end of session 117)'
if OLD in content:
    content = content.replace(OLD, NEW, 1); changes.append('b OK: SYSTEM STATE heading')
else:
    changes.append('b FAILED: SYSTEM STATE heading')

# ── Edit c: changelog pointer ────────────────────────────────────────────────
OLD = 'Changelog archive → CLAUDE_changelog.md (sessions 21–113)'
NEW = 'Changelog archive → CLAUDE_changelog.md (sessions 21–114)'
if OLD in content:
    content = content.replace(OLD, NEW, 1); changes.append('c OK: changelog pointer')
else:
    changes.append('c FAILED: changelog pointer')

# ── Edit: amend SESSION RULES Python row ────────────────────────────────────
OLD = ('CC cannot run Python | Windows Store stub blocks it — run Python in PowerShell terminal directly')
NEW = ('CC Python path | PowerShell `python` and `py` blocked by Windows Store stub — do not use '
       '\xb7 `python3` via the Bash tool works cleanly (Git Bash environment) — use for CC-side Python '
       'scripts \xb7 "run Python in PowerShell terminal directly" applies to interactive/long-running '
       'terminal scripts only')
if OLD in content:
    content = content.replace(OLD, NEW, 1); changes.append('PY-rule OK: SESSION RULES row amended')
else:
    changes.append('PY-rule FAILED: SESSION RULES row not found')

# ── Edit f: insert session 117 block before END-OF-SESSION PROCEDURE ─────────
SESSION_117 = (
    '## CHANGES THIS SESSION (session 117) — 10 May 2026\n'
    '\n'
    '- **Post-FTS-leg baseline + manual grading** — `~/retrieval_baseline.sh` re-run, output saved at '
    '`~/retrieval_baseline_post_fts_leg.txt`; chunk-by-chunk grading via Cloudflare D1 MCP inspection of '
    'disputed top-3 chunks; final 30P/1Pa/0M.\n'
    '- **Three prior partials closed** — Q9 ([2018] TASCCA 5 chunk 13 surfaces 20% discount + Butt v '
    'Tasmania reference), Q14 (`manual-b4135-chunk` at #1, documented semantic ceiling closed), Q26 '
    '([2020] TASCCA 5 with Pell/M v The Queen/MFA + [2021] TASCCA 15 with Anderson v Tasmania at top-2).\n'
    '- **One new partial — Q19 aggravated assault sentencing range** — top-3 cover adjacent violent '
    'offences (s 172 GBH per Barron, strangulation per Mayne) but no s 184 quantum chunk surfaces; '
    'content-side gap; benchmark phrasing artificial; parked for real-use signal per freeze policy, not '
    'pre-emptive authoring.\n'
    '- **Refreeze applied (mid-session edits)** — FROZEN block rewritten 24 April → 10 May, '
    'baseline 28P/3Pa/0M → 30P/1Pa/0M; SYSTEM STATE Baseline row + secondary_sources row updated; '
    'OUTSTANDING PRIORITIES baseline-rerun item removed; CLAUDE_decisions.md session 117 entry appended.\n'
    '- **Secondary_sources backlog clarified** — 6 embedded=0 rows are nexus-save entries gated by '
    '`approved=0` in poller SQL, not poller backlog. SYSTEM STATE row reworded from "clearing" to '
    '"pending Library approval".\n'
    '- **Null-byte handling refinement** — surrogateescape decode/encode roundtrip preserves the null '
    'byte but Python `.replace()` still fails when null byte is within the target region (surrogate vs '
    'literal mismatch); line-index deletion is canonical, not fallback. Captured in CLAUDE_init.md.\n'
    '- **Operational rules captured (CLAUDE_init.md)** — hex-ssh `remote-ssh` deduplicates/truncates '
    'output (use `ssh-read-lines plain=true` for verbatim file reads); baseline script output path vs '
    '`ALLOWED_DIRS` mismatch (cp into `~/ai-stack/` before reading); CC Python rule corrected (`python3` '
    'via Bash works; only PS `python`/`py` blocked by Windows Store stub); after multi-edit Python passes '
    'on CLAUDE.md, re-grep target line numbers (paragraph replacements shift subsequent line indices).\n'
    '\n'
)

END_PROC = '\n\n## END-OF-SESSION UPDATE PROCEDURE'
if content.count(END_PROC) == 1:
    content = content.replace(
        END_PROC,
        '\n\n' + SESSION_117 + '## END-OF-SESSION UPDATE PROCEDURE',
        1
    )
    changes.append('f OK: session 117 block inserted')
elif content.count(END_PROC) == 0:
    changes.append('f FAILED: END-OF-SESSION heading not found')
else:
    changes.append(f'f FAILED: END-OF-SESSION heading found {content.count(END_PROC)} times')

# ── Write back ──────────────────────────────────────────────────────────────
with open(CLAUDE_MD, 'wb') as f:
    f.write(content.encode('utf-8', errors='surrogateescape'))

print('\n'.join(changes))
print('DONE')
