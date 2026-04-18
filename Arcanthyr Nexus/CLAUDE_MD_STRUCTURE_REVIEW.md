# CLAUDE.md Structure Review — 18 April 2026

Review-only. No files moved or deleted. Recommendations require Tom's sign-off before implementation.

---

## The Core Problem

CLAUDE.md is 1,598 lines. CLAUDE_arch.md is 908 lines. Both are uploaded every session. Your own wiki article on context engineering (sourced from Dharmesh Shah) says context files should average **150–200 lines** of dense, actionable rules, and that adding more context degrades performance through "context dilution." Your skill-file-authoring article (Phil Schmid) says keep files under 500 lines and use layered loading.

Right now, CLAUDE.md is 8× the recommended ceiling. The session changelog alone — sessions 21 through 69 — consumes **~1,316 lines** (82% of the file). The operationally critical content (rules, system state, priorities, known issues) fits in ~280 lines. Every session, Claude reads ~1,300 lines of historical changelog to find the ~280 lines that actually govern behaviour.

CLAUDE_arch.md has the inverse problem: it's a reference document that IS correctly structured, but it duplicates topics that have migrated into CLAUDE.md as operational rules. The subject_matter filter appears 22 times in CLAUDE.md changelog and 8 times in CLAUDE_arch.md architecture docs — a reader seeing both gets 30 mentions of the same feature at various stages of completion.

---

## Question 1: What can be removed or archived from CLAUDE.md?

### The cutoff

**Keep the last 3 sessions of changelog in CLAUDE.md. Archive everything older.**

Rationale: changelogs serve two functions — (a) telling the current session what just changed, and (b) recording why a past decision was made. Function (a) only needs the last 2–3 sessions. Function (b) is what CLAUDE_decisions.md already exists for. The problem is that changelogs have been doing double duty as decision records because they're easier to write in-flow than decision entries.

Sessions 21–64 are pure history. Nothing in them governs current-session behaviour that isn't already captured in either the SESSION RULES table, the KNOWN ISSUES list, or CLAUDE_arch.md's component documentation. When a changelog entry has lasting operational value (like "never add cross-domain disambiguation to enriched_text"), it should be promoted to a rule or a CLAUDE_arch.md note — not preserved as a changelog entry.

### What this saves

| Section | Current lines | After trim |
|---|---|---|
| Session rules + procedures | ~160 | ~160 (unchanged) |
| System state + baseline + priorities + known issues | ~120 | ~120 (unchanged) |
| Changelog (sessions 65–69 only) | ~170 | ~170 |
| Changelog (sessions 21–64) | ~1,148 | 0 (archived) |
| **Total CLAUDE.md** | **~1,598** | **~450** |

450 lines is close to the 500-line ceiling recommended by the skill-authoring pattern. Still above the 200-line ideal, but CLAUDE.md carries legitimate operational density.

### Risk: Medium-low

The main risk is losing a "why did we do X?" reference during a session where X becomes relevant again. Mitigation: the archived changelogs go somewhere accessible (see Question 3), and the session-closer skill already extracts lasting rules into the rules table and CLAUDE_arch.md. The safety net is that CLAUDE_decisions.md already captures architectural decisions.

**Risk of NOT doing this is higher**: context dilution is measurably degrading Claude's attention to the rules that matter. The session-closer's known failure mode (logging "created" for files never written) is a symptom of attention degradation in long-context sessions.

### Decision needed: Yes

You need to confirm the 3-session retention window and the archive destination before anything moves.

---

## Question 2: Is the four-file split still right?

### Assessment: The split is correct in principle but the boundaries have drifted.

The intended design is clean:

| File | Role | Load condition |
|---|---|---|
| CLAUDE.md | Operational rules + current state + recent changes | Always |
| CLAUDE_arch.md | Architecture reference | Always |
| CLAUDE_init.md | CLI commands, deploy procedures | When doing CLI/deploy work |
| CLAUDE_decisions.md | Architectural decision log | When making design tradeoffs |

The drift:

**1. CLAUDE.md changelog entries duplicate CLAUDE_arch.md component docs.**

Every feature that evolved across multiple sessions (subject_matter filter, sentencing synthesis, BM25/FTS5, TTS) has its full development history in the changelog AND its current-state documentation in CLAUDE_arch.md. Claude reads both, gets 30 mentions of SM_PENALTY at different stages of completeness, and has to figure out which one is current.

After the changelog trim (Q1), this problem largely resolves itself — the remaining 3 sessions of changelog won't significantly overlap with CLAUDE_arch.md's settled documentation.

**2. CLAUDE_arch.md's FUTURE ROADMAP section (~65 lines) duplicates OUTSTANDING PRIORITIES in CLAUDE.md.**

The roadmap in CLAUDE_arch.md is a long-term aspirational list. The priorities in CLAUDE.md are the current sprint. But items appear in both, sometimes with different status. The session-closer updates CLAUDE.md priorities but doesn't always reconcile the CLAUDE_arch.md roadmap.

**Recommendation:** CLAUDE_arch.md keeps the long-term roadmap. CLAUDE.md keeps only the immediate priorities (next 1–3 items). The session-closer procedure should include a reconciliation step: when an outstanding priority is completed, check if it appears in CLAUDE_arch.md roadmap and update/remove it there too. This is a process fix, not a structural one.

**3. CLAUDE_init.md is underused.**

At 244 lines, it's well-sized and correctly scoped. The conditional loading rule ("load only when CLI/deploy work") is good. No changes needed.

**4. CLAUDE_decisions.md is 3,687 lines — larger than everything else combined.**

This is fine as long as it stays conditionally loaded. Decision logs are append-only by nature and rarely read front-to-back. The conditional loading rule protects against context dilution. One improvement: add a 20-line "Recent Decisions (last 5 sessions)" summary at the top, so when it IS loaded, Claude gets the current decisions immediately without scanning 3,687 lines.

### Risk: Low

The four-file split is sound. The drift is operational (session-closer not reconciling across files), not structural. Fixing Q1 (changelog trim) resolves 80% of the duplication problem.

### Decision needed: No (for structure). Yes (for adding reconciliation step to session-closer procedure).

---

## Question 3: What's the right home for the conversation archive?

### Recommendation: Separate file — `CLAUDE_changelog.md` — living in Arc v 4/ alongside the other four.

**Not** folded into CLAUDE_decisions.md, and **not** called CLAUDE_archive.md. Here's why:

**Against folding into CLAUDE_decisions.md:**
- Decisions and changelogs serve different retrieval patterns. Decisions answer "why did we choose X over Y?" Changelogs answer "what changed in session N?" Mixing them makes both harder to scan.
- CLAUDE_decisions.md is already 3,687 lines. Adding ~1,200 lines of changelog would push it past 4,800 — and it's the one file that gets conditionally loaded for focused decision review.

**Against "CLAUDE_archive.md" naming:**
- "Archive" implies dead content. These changelogs are still queryable reference material — they just don't need to be in the always-loaded operational file.

**For `CLAUDE_changelog.md`:**
- Naming is self-explanatory and follows the existing CLAUDE_*.md convention
- Load condition: "Load when investigating a past session's changes, debugging a regression to a specific date, or when the current session references work from sessions older than the retention window"
- The session-closer can append the outgoing changelog block to this file as part of the trim process — no manual maintenance

**Format:** Reverse chronological (newest first), same format as current changelog blocks. No summarisation — the raw entries are the value. A 10-line header at the top listing the session range covered and the date range.

**What about the conversation archive (key decision flows from deleted conversations)?** That's a different thing. Conversation flows that capture reasoning chains and Opus consultations should go into CLAUDE_decisions.md as structured decision entries — they're decisions, not changelogs. Extract the decision and rationale, discard the conversational wrapper. If a conversation flow is too rich to reduce to a decision entry, it belongs in The Vault as a wiki article (you already have the wiki-processor skill for this).

### Risk: Low

The only risk is a naming/location confusion if someone expects "the archive" to be a single file. Mitigate by documenting the load condition in CLAUDE.md's conditional file loading table.

### Decision needed: Yes

Confirm the name (`CLAUDE_changelog.md` vs alternative), and confirm the load condition wording for the session rules table.

---

## Question 4: Is there a structural fix for the truncation problem?

### Yes. Invert the file structure so operational content is at the top and history is at the tail.

CLAUDE.md's current layout is roughly:

```
Lines 1–8:      Header + datestamp
Lines 9–122:    SESSION RULES table
Lines 123–191:  End-of-session + Poller deploy procedures
Lines 192–281:  SYSTEM STATE + BASELINE + PRIORITIES + KNOWN ISSUES
Lines 282–661:  Changelog (sessions 21–69, non-chronological)
Lines 662–683:  FUTURE ROADMAP (misplaced — between changelog blocks)
Lines 684–1598: More changelog (sessions 44–69)
```

Problems with this layout:

1. **The most volatile, highest-value sections (SYSTEM STATE, PRIORITIES, KNOWN ISSUES) are at lines 192–281** — below 160 lines of procedures that rarely change. If truncation hits at 800 lines, these survive, but they're competing for attention with the changelog that follows immediately.

2. **FUTURE ROADMAP is buried between changelog blocks at line 662.** It should be adjacent to OUTSTANDING PRIORITIES.

3. **Changelogs are not in chronological order.** Sessions 40, 42, 41, 38, 37, 39, 36, 35, 29, 34, 33... — the session-closer appends wherever it lands. This makes scanning harder and wastes attention on parsing order.

### Recommended layout (after Q1 trim):

```
## HEADER + DATESTAMP                          (~8 lines)
## SYSTEM STATE                                (~30 lines)
## OUTSTANDING PRIORITIES                      (~20 lines)
## KNOWN ISSUES / WATCH LIST                   (~30 lines)
## SESSION RULES                               (~115 lines)
## CHANGES THIS SESSION (last 3 sessions)      (~170 lines)
## END-OF-SESSION UPDATE PROCEDURE             (~40 lines)
## POLLER DEPLOY VALIDATION PROCEDURE          (~35 lines)
## RETRIEVAL BASELINE                          (~30 lines)
```

**Total: ~478 lines.** Everything an AI session needs is in the first 200 lines. Rules are in the first 315. Procedures (which are reference material, not session-start-critical) are at the tail where truncation is acceptable — they're only read when you're actually doing a deploy or session close.

This layout means that even if a model truncates at 500 lines, it still has: system state, priorities, known issues, all rules, and recent changelog. The procedures at the tail are stable reference text that changes rarely — losing them to truncation is low-cost because the session-closer skill and deploy checklists are documented elsewhere (CLAUDE_init.md covers deploy procedures).

### The FUTURE ROADMAP question

Move it to CLAUDE_arch.md permanently. The roadmap is architectural — it describes what might be built, not what must be done now. OUTSTANDING PRIORITIES in CLAUDE.md is the "what to do next" list. Having both in the same file creates the reconciliation problem identified in Q2.

### Risk: Medium

Reordering sections changes what Claude "sees first" in every session. The current order (rules first, state second) means Claude internalises rules before reading state. The proposed order (state first, rules second) means Claude understands the current situation before reading the rules that govern it. This is arguably better — rules make more sense in context — but it's a change worth monitoring for one or two sessions.

The bigger risk is the session-closer skill. It currently writes changelog blocks by appending to CLAUDE.md. After restructuring, it needs to insert changelog blocks at a specific location (after the rules, before the procedures). The skill's SKILL.md needs to be updated with the new insertion point. **If the skill isn't updated, it will append changelogs at the end of the file, after the procedures, breaking the layout.**

### Decision needed: Yes

Confirm the section order. Confirm moving FUTURE ROADMAP to CLAUDE_arch.md. The session-closer skill update is a dependency — it must happen in the same session as the restructure.

---

## Summary of Recommendations

| # | Action | Lines saved | Risk | Decision needed |
|---|---|---|---|---|
| 1 | Archive changelogs older than 3 sessions to `CLAUDE_changelog.md` | ~1,148 | Medium-low | Yes — confirm retention window and archive name |
| 2 | Add CLAUDE_arch.md roadmap reconciliation to session-closer procedure | 0 | Low | Yes — confirm process change |
| 3 | Add "Recent Decisions" 20-line summary to top of CLAUDE_decisions.md | 0 | Low | No |
| 4 | Move FUTURE ROADMAP from CLAUDE.md to CLAUDE_arch.md | ~22 | Low | Yes — confirm |
| 5 | Reorder CLAUDE.md: state → priorities → issues → rules → changelog → procedures | 0 | Medium | Yes — confirm section order |
| 6 | Update session-closer skill with new insertion point | 0 | Medium | Dependency of #5 |
| 7 | Conversation archive decision flows → CLAUDE_decisions.md as entries; rich flows → Vault wiki articles | 0 | Low | Yes — confirm approach |

**Implementation order:** #1 and #5 should happen in the same session (the restructure). #6 is a hard dependency of #5. #2 and #4 are independent and can happen anytime. #3 and #7 are low-priority refinements.

**Net effect:** CLAUDE.md drops from 1,598 lines to ~478 lines. Operationally critical content moves to the first 200 lines. The four-file structure remains, with a fifth file (`CLAUDE_changelog.md`) added as a conditionally-loaded history reference.
