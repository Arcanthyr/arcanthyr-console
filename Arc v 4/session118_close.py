import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

CLAUDE_PATH = r"c:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\CLAUDE.md"
CHANGELOG_PATH = r"c:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4\CLAUDE_changelog.md"

# --- Read CLAUDE.md ---
with open(CLAUDE_PATH, 'rb') as f:
    raw = f.read()
text = raw.decode('utf-8', errors='surrogateescape')
lines = text.split('\n')
print(f"Total lines in CLAUDE.md: {len(lines)}")

changes = []

# 1. Update header datestamp
for i, line in enumerate(lines):
    if 'Updated: 10 May 2026 (end of session 117)' in line:
        lines[i] = lines[i].replace('end of session 117)', 'end of session 118)')
        changes.append(f"L{i+1}: header datestamp updated")
        break

# 2. Update changelog pointer (en-dash U+2013)
for i, line in enumerate(lines):
    if 'Changelog archive' in line and '114' in line:
        lines[i] = lines[i].replace('21–114', '21–115')
        changes.append(f"L{i+1}: changelog pointer updated 114->115")
        break

# 3. Update SYSTEM STATE heading
for i, line in enumerate(lines):
    if 'SYSTEM STATE' in line and 'end of session 117' in line:
        lines[i] = lines[i].replace('end of session 117', 'end of session 118')
        changes.append(f"L{i+1}: SYSTEM STATE heading updated")
        break

# 4. Update query_log count 152 -> 158
for i, line in enumerate(lines):
    if '152 rows total' in line and 'sufficient=0' in line:
        lines[i] = lines[i].replace('152 rows total', '158 rows total')
        changes.append(f"L{i+1}: query_log count 152->158")
        break

# 5. Remove SSE streaming (deferred) bullet line
for i, line in enumerate(lines):
    if 'SSE streaming (deferred)' in line and 'stream Claude API response token-by-token' in line:
        del lines[i]
        changes.append(f"L{i+1}: SSE streaming deferred bullet removed")
        break

# 6. Insert session 118 changelog block before ## END-OF-SESSION UPDATE PROCEDURE
session118_block = (
    "## CHANGES THIS SESSION (session 118) — 10 May 2026\n"
    "\n"
    "- **SSE streaming LIVE for Sol synthesis** — `handleLegalQuery` rewritten as ReadableStream-based proxy; pre-stream D1 INSERT with empty `answer_text`, post-stream UPDATE in `start()` finally with accumulated text, `ctx.waitUntil` 130s belt-and-braces idempotent UPDATE (`AND answer_text = ''` guard); `arcanthyr_meta` first event carries `query_id`/`model`; Anthropic SSE passes through unchanged after meta. Worker fetch handler signature now `async fetch(request, env, ctx)`. Synthetic SSE for zero-result case.\n"
    "- **Frontend streaming consumer** — `streamQuery()` added to `arcanthyr-ui/src/api.js`; Intel.jsx branches on model, Sol uses streaming with 30s idle / 120s wall-clock `AbortController`, V'ger unchanged on JSON. Spinner hides on first delta; abort reasons distinguish idle / wall-clock / unmount / new-query silently. `instanceof Response` check in dispatcher bypasses `json({ result })` wrapping for streamed responses.\n"
    "- **`answer_text` truncation removed** — `.slice(0, 2000)` cap removed from both write paths in `handleLegalQuery`; verified post-fix at 5,255 chars with clean sentence tail. Cap had been silently truncating the query history side panel and `sufficient=0` admin review on every long synthesis since SSE shipped — telemetry-quality bug masquerading as defensive code.\n"
    "- **Abort path verified end-to-end** — tab-close mid-stream produced row 9d72253d with 2,000 chars accumulated and mid-sentence tail; confirms closure capture of `accumulatedText` across async `reader.read()` boundaries, `enqueue` throw on browser disconnect as the loop-exit mechanism, and `AND answer_text = ''` idempotency on the 130s belt-and-braces UPDATE. All three independently-failing components confirmed.\n"
    "- **TransformStream pattern abandoned** — TransformStream + `pipeThrough` produced 0-byte SSE responses in CF Workers; replaced with explicit `new ReadableStream({ async start(controller) { reader.read() loop } })`. Logged in CLAUDE_init.md.\n"
    "- **SSE line buffer mandatory** — naive `decode(value).split(\"\\n\")` loses ~50% of text deltas at chunk boundaries; rolling `sseLineBuffer` accumulator across `read()` calls is required, not optional. Logged in CLAUDE_init.md.\n"
    "- **V'ger streaming non-viable by platform constraint** — Workers AI (Qwen3) has no SSE API surface; V'ger path is JSON-only structurally, not deferral. Captured in CLAUDE_arch.md. Idle / wall-clock timeouts shipped untested (low blast radius — known-untested rather than verified).\n"
    "\n"
)

for i, line in enumerate(lines):
    if '## END-OF-SESSION UPDATE PROCEDURE' in line:
        lines.insert(i, session118_block)
        changes.append(f"L{i+1}: session 118 block inserted before END-OF-SESSION")
        break

# 7. Extract and remove session 115 block
s115_start = None
for i, line in enumerate(lines):
    if '## CHANGES THIS SESSION (session 115)' in line:
        s115_start = i
        break

s115_end = None
if s115_start is not None:
    for i in range(s115_start + 1, len(lines)):
        if '## CHANGES THIS SESSION (session 116)' in lines[i]:
            s115_end = i
            break

s115_content = None
if s115_start is not None and s115_end is not None:
    s115_content = '\n'.join(lines[s115_start:s115_end])
    del lines[s115_start:s115_end]
    changes.append(f"Session 115 block (original L{s115_start+1} to L{s115_end}) removed from CLAUDE.md")
else:
    print(f"ERROR: session 115 boundaries: start={s115_start}, end={s115_end}")

# Write CLAUDE.md
result = '\n'.join(lines)
with open(CLAUDE_PATH, 'wb') as f:
    f.write(result.encode('utf-8', errors='surrogateescape'))
print("CLAUDE.md written")
for c in changes:
    print(c)

# Verify block counts
count_3 = sum(1 for l in lines if l.startswith('## CHANGES THIS SESSION'))
print(f"CHANGES THIS SESSION blocks remaining in CLAUDE.md: {count_3} (expect 3)")

# --- Update CLAUDE_changelog.md ---
if s115_content:
    print(f"\nSession 115 block captured ({len(s115_content.splitlines())} lines)")
    print("First line:", s115_content.splitlines()[0])

    with open(CHANGELOG_PATH, 'rb') as f:
        cl_raw = f.read()
    cl_text = cl_raw.decode('utf-8', errors='surrogateescape')
    cl_lines = cl_text.split('\n')

    # Update header title (line 0): # CLAUDE Changelog — Sessions 21–114
    for i, line in enumerate(cl_lines):
        if '# CLAUDE Changelog' in line and '114' in line:
            cl_lines[i] = cl_lines[i].replace('21–114', '21–115')
            print(f"Changelog title updated at L{i+1}")
            break

    # Update the *Sessions 21-N* description line
    for i, line in enumerate(cl_lines):
        if '*Sessions 21' in line and '114' in line:
            cl_lines[i] = cl_lines[i].replace('21–114', '21–115').replace('Sessions 21-114', 'Sessions 21–115')
            print(f"Changelog header range updated at L{i+1}")
            break

    # Find insertion point: before first ## CHANGES THIS SESSION
    insert_pos = None
    for i, line in enumerate(cl_lines):
        if line.startswith('## CHANGES THIS SESSION'):
            insert_pos = i
            break

    if insert_pos is not None:
        insert_lines = s115_content.split('\n') + ['']
        for j, il in enumerate(insert_lines):
            cl_lines.insert(insert_pos + j, il)
        print(f"Session 115 block prepended at L{insert_pos+1} ({len(insert_lines)} lines)")

        cl_result = '\n'.join(cl_lines)
        with open(CHANGELOG_PATH, 'wb') as f:
            f.write(cl_result.encode('utf-8', errors='surrogateescape'))
        print("CLAUDE_changelog.md written")
    else:
        print("ERROR: Could not find insertion point in CLAUDE_changelog.md")
else:
    print("ERROR: s115_content is None, skipping changelog update")

print("\nAll done.")
