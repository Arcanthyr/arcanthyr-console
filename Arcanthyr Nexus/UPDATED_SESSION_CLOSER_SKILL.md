---
name: arcanthyr-session-closer
description: "Arcanthyr end-of-session documentation updater. Use this skill when Tom says \"close session\", \"end of session\", \"update the MDs\", \"generate update prompts\", \"session wrap\", or anything indicating the session is finishing and the four CLAUDE*.md files need updating. Reads the full conversation history, infers what changed, and outputs a single combined Claude Code prompt that appends correct updates to all four MD files in one shot. Always use this skill — do not attempt to generate MD update prompts from memory or freehand."
---

# Arcanthyr Session Closer

Generates the Claude Code prompt for closing an Arcanthyr session — updating CLAUDE.md, CLAUDE_arch.md, CLAUDE_decisions.md, CLAUDE_changelog.md, and CLAUDE_init.md with this session's changes.

---

## When to use

When Tom says "close the session", "session close", or asks to update the session files at the end of a working session.

---

## Critical behaviour rules

- **Do NOT show a preview, summary, or proposed changes list before acting.** No confirmation step, no "shall I proceed?", no "Here's what I plan to include — let me know if this looks right" — go straight to output.
- **Do NOT ask for approval before generating the CC prompt.** This skill has one job: analyse and output. Execute Steps 1–3 in sequence without pausing, without any intermediate output between Step 1 and Step 2.
- **Step 1 is silent.** Do not output anything while gathering context. The first thing output to the user must be the CC prompt itself (Step 2).

---

## CLAUDE.md structure (session 70+)

CLAUDE.md is structured with operational content first, history at the tail:

```
HEADER + DATESTAMP
SYSTEM STATE                    ← update counts here
OUTSTANDING PRIORITIES          ← reconcile: remove completed, update partial, add new
KNOWN ISSUES / WATCH LIST       ← prune resolved, update partial
SESSION RULES                   ← rarely changes
CHANGES THIS SESSION (3 blocks) ← INSERT NEW BLOCK HERE (before END-OF-SESSION heading)
                                  then MOVE the oldest block to CLAUDE_changelog.md
END-OF-SESSION UPDATE PROCEDURE
POLLER DEPLOY VALIDATION PROCEDURE
RETRIEVAL BASELINE
```

**Changelog retention rule:** CLAUDE.md keeps exactly 3 session changelog blocks. When adding a new session block, the oldest of the existing 3 must be moved (appended) to `CLAUDE_changelog.md`. The new block is inserted BEFORE the `## END-OF-SESSION UPDATE PROCEDURE` heading, AFTER the existing changelog blocks.

**Insertion point:** Find `## END-OF-SESSION UPDATE PROCEDURE` — the new changelog block goes immediately before this heading. Do NOT append to the end of the file.

---

## Step 1 — Gather session context

Read the conversation and identify:
- What changed this session (files edited, bugs fixed, features built, decisions made)
- Any architectural changes for CLAUDE_arch.md
- Any decisions with rationale for CLAUDE_decisions.md
- Any new operational rules or component quirks for CLAUDE_init.md
- Updated system state counts (cases, chunks, secondary sources)
- Any Outstanding Priorities to add, remove, or update
- Any Known Issues to add, remove, or update
- Any CLAUDE_arch.md FUTURE ROADMAP items completed this session (for reconciliation)

---

## Step 2 — Output the CC prompt

Output a single, self-contained prompt for Claude Code to paste and run. The prompt must:

1. Instruct CC to read each target file before editing
2. **Update SYSTEM STATE** — refresh all numeric values to reflect current actuals
3. **Reconcile OUTSTANDING PRIORITIES** — remove completed items (delete the line, do not leave a check), update partial items, add new items
4. **Reconcile KNOWN ISSUES** — remove resolved entries, update partially changed entries
5. **Update datestamp** — change the "Updated:" line at the top of CLAUDE.md to today's date and current session number
6. **Insert new changelog block** — place the `## CHANGES THIS SESSION (session N)` block immediately BEFORE `## END-OF-SESSION UPDATE PROCEDURE`. NOT at the end of the file, NOT after the last existing changelog block.
7. **Archive oldest changelog** — identify the oldest of the (now 4) changelog blocks in CLAUDE.md. **Include the full verbatim content of the block being archived in the CC prompt** — do NOT use a placeholder like "[full content...]". CC needs the exact text to insert into CLAUDE_changelog.md. Move it by: (a) inserting it into CLAUDE_changelog.md after the header/load-condition paragraph, before existing archived sessions; (b) deleting it from CLAUDE.md. This maintains the 3-block retention window.
8. **Reconcile CLAUDE_arch.md FUTURE ROADMAP** — check each item completed this session and remove it from the roadmap. Add any new roadmap items that emerged this session.
9. Update CLAUDE_arch.md if there are architectural changes — otherwise skip it explicitly
10. Append new decision log entries to CLAUDE_decisions.md under a `## Session N decisions — D Month YYYY` heading
11. Append any new operational rules or component quirks to CLAUDE_init.md
12. Use `Edit` (str_replace) for all edits — never rewrite whole files
13. **Verify after edits** — after all edits, instruct CC to: (a) grep CLAUDE.md for `^## CHANGES THIS SESSION` and confirm exactly 3 blocks remain; (b) confirm the new session block appears before `## END-OF-SESSION UPDATE PROCEDURE`; (c) confirm no completed item remains in OUTSTANDING PRIORITIES; (d) confirm no resolved entry remains in KNOWN ISSUES
14. Run git commands separately from `arcanthyr-console/` root (no &&): `git add -A`, then `git commit -m "Session N close — D Mon YYYY"`, then `git push origin master`

The CC prompt must be copy-pasteable with no further editing required.

---

## Format for the CC prompt

~~~
Please do the following — read each file before editing, use str_replace (append only where appending, targeted replacement where updating), follow the existing format exactly.

**1. CLAUDE.md** — the following edits (in order):
  a. Update datestamp in header to "Updated: D Month YYYY (end of session N)"
  b. Update SYSTEM STATE table values: [list specific count changes]
  c. OUTSTANDING PRIORITIES: [remove/update/add specific items]
  d. KNOWN ISSUES: [remove/update specific items]
  e. Insert new session changelog block BEFORE `## END-OF-SESSION UPDATE PROCEDURE`:
     [session entry content]
  f. Delete the oldest changelog block (session X) from CLAUDE.md:
     [exact str_replace old_string to match and remove]

**2. CLAUDE_changelog.md** — insert the removed session X block after the header paragraph, before existing archived sessions. Here is the full block to insert:

[FULL VERBATIM CONTENT OF THE ARCHIVED BLOCK]

Also update the header session range if needed.

**3. CLAUDE_arch.md** — [architecture changes + roadmap reconciliation, or "No changes this session — skip this file."]

**4. CLAUDE_decisions.md** — append to end:
[decisions content under ## Session N decisions heading]

**5. CLAUDE_init.md** — [changes or "No changes needed this session."]

**6. Verify:**
  - Run: grep "^## CHANGES THIS SESSION" "Arc v 4/CLAUDE.md" — confirm exactly 3 lines
  - Run: grep -n "END-OF-SESSION UPDATE PROCEDURE" "Arc v 4/CLAUDE.md" — confirm the new session block appears on a lower line number than this heading
  - Read back OUTSTANDING PRIORITIES and confirm no completed item remains
  - Read back KNOWN ISSUES and confirm no resolved entry remains

Then run these git commands separately from `arcanthyr-console/` root (no &&):
git add -A
git commit -m "Session N close — D Mon YYYY"
git push origin master
~~~

---

## Step 3 — Recommended next session prompt

After the CC prompt, output a short section headed **"To start next session:"** containing a ready-to-paste initiating prompt for the next Claude.ai session. The prompt should:

1. State the most important outstanding priority or unfinished thread from this session (what to pick up first)
2. Include any critical system state the next session needs to know immediately (e.g. re-embed in progress, scraper running, counts)
3. Be specific enough to act on without re-reading the whole conversation — one focused directive, not a list

Format:

~~~
**To start next session:**

> [Ready-to-paste prompt — one paragraph, specific, actionable]
~~~
