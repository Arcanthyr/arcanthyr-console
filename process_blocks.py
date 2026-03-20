"""
process_blocks.py — Arcanthyr RAG Block Processor
Processes Hogan on Crime blocks through Master + Procedure prompts,
extracts FORMATTED CHUNKS, and assembles two master corpus files.

Usage:
    python process_blocks.py
    python process_blocks.py --start-from 5        # resume from block 5
    python process_blocks.py --blocks-dir ./blocks  # custom blocks folder
    python process_blocks.py --dry-run             # print config and exit

Requirements:
    pip install openai python-dotenv
    Add OPENAI_API_KEY=sk-... to your .env file in this directory.

Output:
    master_corpus_part1.md  — blocks 1-16
    master_corpus_part2.md  — blocks 17-32
    process_log.txt         — per-run status log
"""

from dotenv import load_dotenv
load_dotenv()

import os
import re
import sys
import time
import argparse
import textwrap
from datetime import datetime
from openai import OpenAI

# ---------------------------------------------
# CONFIGURATION
# ---------------------------------------------

BLOCKS_DIR    = "./blocks_3k"
OUTPUT_PART1  = "master_corpus_part1.md"
OUTPUT_PART2  = "master_corpus_part2.md"
LOG_FILE      = "process_log.txt"
TOTAL_BLOCKS  = 56
PART1_END     = 16        # blocks 1-16 -> part1, blocks 17-32 -> part2
MODEL         = "gpt-4o-mini-2024-07-18"
TEMPERATURE   = 1
MAX_TOKENS    = 32000      # enough for a full block output
SLEEP_BETWEEN = 5         # seconds between API calls
RUN_REPAIR_PASS = True   # set False to skip repair pass


# ---------------------------------------------
# MASTER PROMPT
# ---------------------------------------------

MASTER_PROMPT = textwrap.dedent("""\
You are a legal knowledge formatter for a Tasmanian criminal law research system.

Your task is NOT to summarise and NOT to rewrite in a sanitised style.
Your task is to PRESERVE substantive prose, doctrinal reasoning, and analytical commentary from the source block
verbatim or near-verbatim, and to add a small amount of structured metadata as retrieval handles.

NON-NEGOTIABLE RULES (DO NOT VIOLATE):
You MUST NOT:
- summarise (no "This chunk covers ..." one-liners)
- replace explanatory prose with headings + keywords
- sanitise informal language that carries legal meaning (keep practitioner shorthand, abbreviations, informal tone)
- invent doctrine, tests, holdings, or authorities not present in the source text
- add "clean" doctrine statements that are not grounded in the source
- duplicate procedure/script content (handled by a separate Procedure Prompt)

You MUST:
- produce multiple formatted chunks from this block
- keep the BODY of each chunk approximately 500-800 words (target range)
- preserve all doctrinal reasoning and analytical commentary in the BODY (verbatim or near-verbatim)
- add bracketed metadata on ONE LINE as retrieval handles (NOT a replacement for the body)
- include doctrine-signal language where present in the source ("the test is...", "requires...", "the court considers...")
  If the source states a test informally, you may add a short TOPIC line that uses doctrine-signal phrasing,
  but you MUST still keep the full original prose in the body.

INPUTS YOU WILL RECEIVE:
- BLOCK_NUMBER: integer NNN
- SOURCE_BLOCK_TEXT: ~3,000 words of mixed legal prose/notes

OUTPUT REQUIREMENTS (STRICT):
- Output must contain EXACTLY these two top-level sections, in this order:
  1) "## FORMATTED CHUNKS"
  2) "## FINAL STATUS"
- Do NOT output any other commentary, explanation, or headings outside those two sections.

INSIDE "## FORMATTED CHUNKS":
For each chunk, output EXACTLY this structure:

# <Heading text - descriptive and specific to the doctrinal unit; NOT a summary sentence>
[DOMAIN: Tasmanian Criminal Law] [CATEGORY: <one of: annotation | case authority | doctrine | checklist | practice note | legislation>] [TYPE: <same as CATEGORY>] [TOPIC: <one-line topic label using source-grounded language; may include "test is/requires/court considers" if supported>] [CONCEPTS: <comma-separated key terms present in the body; aim for ~5>] [CITATION: hoc-b{BLOCK_NUMBER}-m{CHUNK_INDEX}-{short-topic-kebab}] [ACT: <Act name(s) if substantively discussed, else None>] [CASE: <case citation(s) if substantively discussed, else None>]

<Blank line>

<BODY: 500-800 words target; verbatim or near-verbatim from the source; preserves reasoning and commentary>

METADATA FIELD RULES:
- DOMAIN: always exactly "Tasmanian Criminal Law"
- CATEGORY: choose the best fit from the canonical list (do NOT use procedure/script here)
- TYPE: set equal to CATEGORY
- TOPIC: one line; descriptive label only; MUST NOT replace the body; do not write "This chunk covers..."
- CONCEPTS: include concepts actually present in the body (no invention); aim for about 5
- CITATION slug: must be ASCII lower-case, digits and hyphens only, no spaces.
  Pattern: hoc-b{BLOCK_NUMBER}-m{CHUNK_INDEX}-{short-topic-kebab}
  Example: hoc-b012-m003-double-jeopardy-test
- ACT: include the Act name(s) if substantively discussed; otherwise write "None"
- CASE: include case citation(s) only where there is substantive commentary; otherwise write "None"
- Keep ALL metadata on ONE line exactly as bracket pairs shown above.

CHUNKING RULES:
- Target body length: 500-800 words per chunk.
- Split on natural boundaries: headings, topic transitions, or coherent doctrine units.
- Do NOT shorten content to hit a length target. If running long, create an additional chunk instead.
- Avoid duplication across chunks. If minimal overlap needed, repeat at most 1-2 sentences.

PROCEDURE/SCRIPT EXCLUSION RULE:
- If a passage is primarily scripted questioning, examination sequences, step-by-step courtroom workflow,
  or tactical sequences, EXCLUDE it from Master output.
- If a passage mixes doctrine with minor procedural notes, keep the doctrine and omit only the procedural lines.

CASE AUTHORITY CHUNK RULE:
- Create a chunk with CATEGORY = "case authority" ONLY if the source contains substantive commentary
  (what it held, the test applied, why it matters, distinguishing features).
- If a citation is merely listed or mentioned in passing, do NOT create a standalone case authority chunk.
  Keep the mention inside the relevant doctrine/annotation chunk instead.

FINAL STATUS RULE:
After all chunks, output:
## FINAL STATUS
<one of: READY FOR APPEND TO MASTER FILE / READY FOR APPEND WITH MINOR REVIEW / NEEDS REVISION BEFORE APPEND>

Choose:
- READY FOR APPEND TO MASTER FILE only if confident all rules followed and substance preserved.
- READY FOR APPEND WITH MINOR REVIEW if compliant but minor uncertainty exists.
- NEEDS REVISION BEFORE APPEND if any chunk is thin, overly summarised, or format rules were hard to follow.

NOW PROCESS THIS BLOCK:

BLOCK_NUMBER: {{BLOCK_NUMBER}}
SOURCE_BLOCK_TEXT:
\"\"\"
{{SOURCE_BLOCK_TEXT}}
\"\"\"
""")


# ---------------------------------------------
# PROCEDURE PROMPT
# ---------------------------------------------

PROCEDURE_PROMPT = textwrap.dedent("""\
You are processing ONE PART of a legal practitioner's working document for ingestion into a vector search and AI retrieval system.
The source material contains practitioner-authored content including tactical workflows, scripted examination questions, in-court procedural sequences, annotated submissions, and practitioner commentary on Tasmanian criminal law.
Your task is to perform ALL of the following in a single pass on the uploaded part only: 1. FORMAT the source into structured, self-contained retrieval chunks. 2. VERIFY COVERAGE by checking whether any substantive content was omitted. 3. VALIDATE STRUCTURE against the rules below.
Do not summarise or sanitise informal language. Do not convert procedural content to formal prose. Do not omit scripted questions, step sequences, practitioner annotations, or parenthetical commentary. Preserve all content exactly as written, including informal asides, personal annotations, and colloquial expressions. Work only on the uploaded part. Do not ask for confirmation. Output in Markdown only.

SOURCE INDEX PASS
Before producing any formatted chunks, scan the source and identify every distinct procedural unit present. Examples include: - tactical workflows - step-by-step procedural sequences - scripted examination questions - scripted submissions - in-court procedural notes and observations - annotated legislation - practitioner commentary - case authority
Be thorough - informal sections, observation notes, and in-court sequences must be captured here even if they appear incidental. Every identified unit must produce at least one chunk.
Create a list titled: ## SOURCE PROCEDURAL UNITS This list must represent the complete content coverage of the source block. Do not begin formatting until it is complete.

PRIMARY OBJECTIVE
Convert the uploaded source into structured, self-contained retrieval chunks that preserve the practitioner voice, tactical detail, and exact scripted language of the original.
Formal rewriting is prohibited. If the source uses informal language, scripted questions, parenthetical asides, or step sequences - preserve them exactly as written.

CHUNK TYPES
Use the following TYPE classifications: - procedure - a step-by-step tactical workflow or in-court procedural sequence - checklist - a set of items to be verified or completed - script - scripted examination questions or scripted submissions - annotation - practitioner commentary, tactical notes, or observations on a legal rule - case authority - a case cited for a legal principle - legal doctrine - a formal statement of a legal rule (use only where the source itself states a rule in doctrinal terms)

METADATA MARKERS
Immediately below every chunk heading include metadata markers in this order where supported:
[DOMAIN: Tasmanian Criminal Law] [ACT: full Act name] [SECTION: section number] [CITATION: descriptive identifier for this chunk] [CATEGORY: procedure] [TYPE: procedure / checklist / script / annotation / case authority / legal doctrine] [TOPIC: concise description of what this chunk covers] [CONCEPTS: 5-10 keywords including plain-language search terms a practitioner would use]
Minimum required for every chunk: [DOMAIN:] [CATEGORY:] [TYPE:] [TOPIC:] [CONCEPTS:] If legislation is referenced also include: [ACT:] [SECTION:] [CITATION:] If a case is cited also include: [CASE: full citation]

CHUNK STRUCTURE
Each chunk must follow this structure: Heading Metadata markers Content
Content rules: - Preserve step sequences as numbered lists - Preserve scripted questions and submissions exactly as written - Preserve practitioner annotations verbatim - Preserve parenthetical commentary and informal asides exactly as written, including personal annotations - Preserve informal language, colloquial expressions, and first-person voice - Each chunk must stand alone - include sufficient statutory context for a reader with no surrounding material - Remove cross-references such as "see above / see below / as noted" - replace with a brief inline explanation

CONCEPT ANCHOR RULE
The first line of content must state what the chunk covers. Example: "Tactical workflow for proceeding to s 38 cross-examination of a hostile witness."

CHUNK LENGTH
Target: 150-500 words. Do not split a scripted question sequence mid-sequence. Do not split a step workflow mid-workflow. If a complete workflow exceeds 500 words, split at a logical phase boundary with a semantic heading - never mid-step.

CITATION FIELD
The [CITATION:] field must be unique per chunk. Use a descriptive format: "Evidence Act 2001 (Tas) s 38 - Tactical Workflow" or "Evidence Act 2001 (Tas) s 38 - Scripted Examination: Hostile Witness"

COVERAGE VERIFICATION
After formatting, compare the output against the source. Flag any content present in the source that does not appear in the formatted output under [UNPROCESSED]. Pay particular attention to: scripted questions, step sequences, annotated notes, inline submissions, observation notes, and in-court sequences.

STRUCTURAL VALIDATION
CHECK 1 - CONTENT PRESERVATION: flag any chunk where informal language, scripted questions, parenthetical commentary, or step sequences appear to have been rewritten into formal prose or omitted.
CHECK 2 - CITATION UNIQUENESS: flag any duplicate [CITATION:] values.
CHECK 3 - COVERAGE: flag any procedural unit from the SOURCE INDEX PASS absent from the formatted output.
CHECK 4 - METADATA COMPLETENESS: flag chunks missing [DOMAIN:] [CATEGORY:] [TYPE:] [TOPIC:] [CONCEPTS:]
CHECK 5 - CONCEPTS QUALITY: flag [CONCEPTS:] with fewer than 5 terms or missing plain-language practitioner search phrases.

MANDATORY OUTPUT FORMAT
Output exactly in this order:
# PART OUTPUT
## SOURCE PROCEDURAL UNITS [List of all procedural units identified before formatting.]
## FORMATTED CHUNKS [Full formatted chunk set.]
## COVERAGE REPORT Either: "No substantive omissions detected." Or: [UNPROCESSED] list.
## VALIDATION REPORT For each issue: Check number / Heading / Explanation. If no issues, state "No issues detected."
## FINAL STATUS State one of: - READY FOR APPEND TO MASTER FILE - READY FOR APPEND WITH MINOR REVIEW - NEEDS REVISION BEFORE APPEND
""")


# ---------------------------------------------
# REPAIR PROMPT (post-master compliance pass)
# ---------------------------------------------

REPAIR_PROMPT = textwrap.dedent("""\
You are a compliance and repair formatter for a legal secondary-source corpus.

You will receive:
- BLOCK_NUMBER: integer NNN
- SOURCE_BLOCK_TEXT: the original block
- DRAFT_OUTPUT: the model's prior Master output

Your task is ONLY to repair structural compliance and substance-preservation failures.
You MUST NOT summarise, sanitise, or replace reasoning with one-line descriptions.

WHAT YOU MUST CHECK AND REPAIR:
You MUST repair the output if ANY of the following are true:
- Any chunk body is missing, extremely short, or looks like an index entry (headings + "This chunk covers...").
- Any chunk paraphrases heavily instead of preserving verbatim or near-verbatim source prose.
- Chunk bodies are far outside the target size range (target 500-800 words), unless the source truly lacks content.
- "case authority" chunks were created for passing mentions with no substantive commentary.
- Procedure/script content appears (scripted questions, workflows, step sequences); remove it.
- Formatting does not match ingest requirements (missing ## FORMATTED CHUNKS, wrong heading level,
  metadata not on one line, missing blank line before body, missing/invalid FINAL STATUS).

WHAT TO DO INSTEAD OF SUMMARISING:
- Expand thin chunks by COPYING relevant contiguous source prose from SOURCE_BLOCK_TEXT into the body.
- Split oversized chunks at natural boundaries (doctrine coherence first).
- Merge undersized fragments with adjacent related material if it improves coherence.
- Preserve informal language; do not clean up practitioner shorthand.
- Delete any invented doctrine/test/holding not supported by the source.

OUTPUT REQUIREMENTS (STRICT):
- Output must contain EXACTLY these two top-level sections, in this order:
  1) "## FORMATTED CHUNKS"
  2) "## FINAL STATUS"
- Do NOT output any other commentary outside those two sections.

INSIDE "## FORMATTED CHUNKS":
For each chunk, output EXACTLY this structure:

# <Heading text - descriptive and specific to the doctrinal unit>
[DOMAIN: Tasmanian Criminal Law] [CATEGORY: <annotation | case authority | doctrine | checklist | practice note | legislation>] [TYPE: <same as CATEGORY>] [TOPIC: <one-line label; must not replace the body>] [CONCEPTS: <key terms present in body; aim for ~5>] [CITATION: hoc-b{BLOCK_NUMBER}-m{CHUNK_INDEX}-{short-topic-kebab}] [ACT: <Act name(s) or None>] [CASE: <case citation(s) or None>]

<Blank line>

<BODY: 500-800 words target; verbatim or near-verbatim from source>

METADATA FIELD RULES:
- DOMAIN: always exactly "Tasmanian Criminal Law"
- CATEGORY/TYPE: canonical list only; no procedure/script
- TOPIC: one line; no "This chunk covers..."
- CONCEPTS: actually present in body; no invention; ~5
- CITATION slug: hoc-b{BLOCK_NUMBER}-m{CHUNK_INDEX}-{short-topic-kebab}
- ACT/CASE: substantively discussed only; otherwise "None"
- ALL metadata on ONE line
- Exactly one blank line between metadata and body

CASE AUTHORITY RULE:
- Keep CATEGORY = "case authority" only when body contains substantive commentary.
- Otherwise move passing mention into doctrine/annotation chunk and delete standalone chunk.

FINAL STATUS RULE:
## FINAL STATUS
<READY FOR APPEND TO MASTER FILE / READY FOR APPEND WITH MINOR REVIEW / NEEDS REVISION BEFORE APPEND>

NOW REPAIR THIS:

BLOCK_NUMBER: {{BLOCK_NUMBER}}
SOURCE_BLOCK_TEXT:
\"\"\"
{source_block}
\"\"\"

DRAFT_OUTPUT:
\"\"\"
{draft_output}
\"\"\"
""")


# ---------------------------------------------
# FOLLOW-UP PROMPT (appended to same session)
# ---------------------------------------------

FOLLOWUP_PROMPT = textwrap.dedent("""\
The coverage report identified unprocessed items. Please now format the following unprocessed doctrinal units as additional chunks following the same formatting rules and metadata schema. Do not repeat chunks already produced.

Format all items listed under [UNPROCESSED] in the coverage report above. Apply identical formatting rules, metadata structure, and chunk constraints as used in the initial pass. Output only the additional ## FORMATTED CHUNKS section - do not repeat the SOURCE INDEX, SOURCE TOPICS, or other report sections.
""")


# ---------------------------------------------
# HELPERS
# ---------------------------------------------

def log(message: str, also_print: bool = True):
    """Write a timestamped line to the log file and optionally print it."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {message}"
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    if also_print:
        print(line)


def extract_formatted_chunks(response_text: str) -> str:
    """
    Extract everything between ## FORMATTED CHUNKS and the next ## heading.
    Returns the raw chunk markdown without the section header itself.
    Returns empty string if the section is not found.
    """
    response_text = response_text.replace('\r\n', '\n').replace('\r', '\n')
    pattern = r"##\s+FORMATTED CHUNKS\s*\n(.*?)(?=\n##\s|\Z)"
    match = re.search(pattern, response_text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return ""


def extract_final_status(response_text: str) -> str:
    """
    Extract the FINAL STATUS line from the response.
    Returns the status string or 'UNKNOWN' if not found.
    """
    response_text = response_text.replace('\r\n', '\n').replace('\r', '\n')
    pattern = r"##\s+FINAL STATUS\s*\n(.*?)(?=\n##\s|\Z)"
    match = re.search(pattern, response_text, re.DOTALL | re.IGNORECASE)
    if match:
        status_block = match.group(1).strip()
        for line in status_block.splitlines():
            line = line.strip(" -*•")
            if line:
                return line
    return "UNKNOWN"


def needs_followup(status: str) -> bool:
    """Return True if the status indicates a follow-up pass is required."""
    status_upper = status.upper()
    return "NEEDS REVISION" in status_upper or "MINOR REVIEW" in status_upper


def call_api(client: OpenAI, messages: list, block_num: int = None, prompt_name: str = "") -> str:
    """Make an API call and return the response text. Retries on failure."""
    for attempt in range(4):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                max_completion_tokens=MAX_TOKENS,
                messages=messages,
            )
            finish_reason = response.choices[0].finish_reason
            with open("debug_response.txt", "w", encoding="utf-8") as dbg:
                dbg.write(f"FINISH REASON: {finish_reason}\n\n")
                dbg.write(response.choices[0].message.content or "EMPTY CONTENT")
            return response.choices[0].message.content
        except Exception as e:
            error_text = str(e)
            wait_seconds = 60 if ("429" in error_text or "rate_limit" in error_text.lower()) else 10
            if attempt < 3:
                log(f"  API error (attempt {attempt + 1}): {e} - retrying in {wait_seconds}s...")
                time.sleep(wait_seconds)
            else:
                log(f"  API error (attempt {attempt + 1}): {e} - skipping this call.")
                with open("failed_blocks.txt", "a", encoding="utf-8") as f:
                    f.write(f"block_{block_num:03d} | {prompt_name} | {error_text}\n")
                raise


def process_block_with_prompt(
    client: OpenAI,
    block_text: str,
    prompt: str,
    prompt_name: str,
    block_num: int,
) -> tuple:
    """
    Run a single block through a single prompt.
    Handles follow-up pass automatically if FINAL STATUS requires it.
    Returns (chunks, initial_status, followup_triggered).
    """
    log(f"  [{prompt_name}] Sending to API...")

    messages = [
        {"role": "system", "content": prompt},
        {"role": "user",   "content": block_text},
    ]

    response_text = call_api(client, messages, block_num, prompt_name)
    with open("debug_extract.txt", "w", encoding="utf-8") as dbg:
        dbg.write(repr(response_text[:500]))
        dbg.write("\n\n")
        dbg.write(repr(response_text[-200:]))
    status        = extract_final_status(response_text)
    chunks        = extract_formatted_chunks(response_text)

    log(f"  [{prompt_name}] FINAL STATUS: {status}")

    if not chunks:
        log(f"  [{prompt_name}] WARNING: No FORMATTED CHUNKS section found in response.")

    # Follow-up pass if needed — runs in the SAME session (messages array extended)
    if needs_followup(status):
        log(f"  [{prompt_name}] Status requires follow-up — running secondary pass...")
        time.sleep(SLEEP_BETWEEN)

        messages.append({"role": "assistant", "content": response_text})
        messages.append({"role": "user",      "content": FOLLOWUP_PROMPT})

        followup_response = call_api(client, messages, block_num, prompt_name)
        followup_chunks   = extract_formatted_chunks(followup_response)
        followup_status   = extract_final_status(followup_response)

        log(f"  [{prompt_name}] Follow-up FINAL STATUS: {followup_status}")

        if followup_chunks:
            chunks = (chunks + "\n\n" + followup_chunks) if chunks else followup_chunks
            log(f"  [{prompt_name}] Follow-up chunks appended.")
        else:
            log(f"  [{prompt_name}] WARNING: No FORMATTED CHUNKS in follow-up response.")

        return chunks, status, True

    return chunks, status, False


def append_chunks_to_file(filepath: str, block_num: int, prompt_name: str, chunks: str):
    """Append formatted chunks to the target corpus file with a block separator comment."""
    if not chunks:
        return
    separator = f"\n\n<!-- block_{block_num:03d} {prompt_name} -->\n\n"
    with open(filepath, "a", encoding="utf-8") as f:
        f.write(separator + chunks)


# ---------------------------------------------
# MAIN
# ---------------------------------------------

def main():
    print(f"Working dir: {os.getcwd()}")
    parser = argparse.ArgumentParser(
        description="Process Hogan on Crime blocks through Arcanthyr RAG pipeline."
    )
    parser.add_argument(
        "--start-from", type=int, default=1, metavar="N",
        help="Resume processing from block N (default: 1)"
    )
    parser.add_argument(
        "--blocks-dir", type=str, default=BLOCKS_DIR,
        help=f"Folder containing block_001.txt through block_032.txt (default: {BLOCKS_DIR})"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print configuration and exit without making any API calls"
    )
    parser.add_argument(
        "--test", action="store_true",
        help="Process only blocks 1 and 2, then stop"
    )
    parser.add_argument(
        "--single", type=int, metavar="N",
        help="Process only block N, then stop"
    )
    args = parser.parse_args()

    blocks_dir = args.blocks_dir
    start_from = args.single if args.single is not None else args.start_from
    end_block = args.single if args.single is not None else (2 if args.test else TOTAL_BLOCKS)

    # Validate environment
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not found.")
        print("  Add OPENAI_API_KEY=sk-... to your .env file in this directory.")
        sys.exit(1)

    if not os.path.isdir(blocks_dir):
        print(f"ERROR: Blocks directory not found: {blocks_dir}")
        print("  Create a 'blocks' folder and place block_001.txt ... block_032.txt inside.")
        sys.exit(1)

    # Dry run — validate setup without spending credits
    if args.dry_run:
        print("=== DRY RUN ===")
        print(f"Blocks dir  : {blocks_dir}")
        print(f"Start from  : block {start_from}")
        print(f"Model       : {MODEL}")
        print(f"Output part1: {OUTPUT_PART1}  (blocks 1-{PART1_END})")
        print(f"Output part2: {OUTPUT_PART2}  (blocks {PART1_END+1}-{TOTAL_BLOCKS})")
        print(f"Log file    : {LOG_FILE}")
        present = sorted([
            f for f in os.listdir(blocks_dir)
            if re.match(r"block_\d{3}\.txt", f)
        ])
        print(f"Block files found: {len(present)}")
        if present:
            print(f"  First: {present[0]}")
            print(f"  Last:  {present[-1]}")
        sys.exit(0)

    # Init client
    client = OpenAI(api_key=api_key)
    log("=" * 60)
    log(f"process_blocks.py started — blocks {start_from}-{TOTAL_BLOCKS}")
    log(f"Model: {MODEL} | Blocks dir: {blocks_dir}")

    prompts = [
        ("master",    MASTER_PROMPT),
        ("procedure", PROCEDURE_PROMPT),
    ]

    # Main loop
    for block_num in range(start_from, end_block + 1):
        block_filename = f"block_{block_num:03d}.txt"
        block_path     = os.path.join(blocks_dir, block_filename)

        if not os.path.isfile(block_path):
            log(f"Block {block_num:03d}: FILE NOT FOUND ({block_path}) — skipping.")
            continue

        with open(block_path, "r", encoding="utf-8") as f:
            block_text = f.read().strip()

        if not block_text:
            log(f"Block {block_num:03d}: EMPTY FILE — skipping.")
            continue

        output_file = OUTPUT_PART1 if block_num <= PART1_END else OUTPUT_PART2
        log(f"Block {block_num:03d}: starting — target: {output_file}")

        for prompt_name, prompt_text in prompts:
            try:
                chunks, status, followup = process_block_with_prompt(
                    client, block_text, prompt_text, prompt_name, block_num
                )
                # Repair pass — runs after master, uses source block + master output as input
                if prompt_name == "master" and RUN_REPAIR_PASS and chunks:
                    repair_input = REPAIR_PROMPT.format(
                        source_block=block_text,
                        draft_output=chunks
                    )
                    repair_messages = [
                        {"role": "system", "content": repair_input},
                        {"role": "user", "content": "Please review and repair the draft output above."}
                    ]
                    log(f"  [repair] Running repair pass on block {block_num}...")
                    try:
                        repair_response = call_api(client, repair_messages)
                        repair_chunks = extract_formatted_chunks(repair_response)
                        repair_status = extract_final_status(repair_response)
                        log(f"  [repair] FINAL STATUS: {repair_status}")
                        if repair_chunks:
                            chunks = repair_chunks
                            log(f"  [repair] Repair chunks accepted — replacing master output")
                        else:
                            log(f"  [repair] WARNING: No FORMATTED CHUNKS in repair response — keeping master output")
                    except Exception as e:
                        log(f"  [repair] ERROR: {e} — keeping master output")
                append_chunks_to_file(output_file, block_num, prompt_name, chunks)
                log(
                    f"  [{prompt_name}] appended to {output_file} | "
                    f"status={status} | followup={'yes' if followup else 'no'} | "
                    f"chunks={'yes' if chunks else 'EMPTY'}"
                )
            except Exception as e:
                log(f"  [{prompt_name}] FAILED: {e} — skipping block {block_num:03d} {prompt_name}.")

            time.sleep(SLEEP_BETWEEN)

        log(f"Block {block_num:03d}: complete.")
        print()

    log("=" * 60)
    log("All blocks processed.")
    log(f"  Part 1 corpus : {OUTPUT_PART1}")
    log(f"  Part 2 corpus : {OUTPUT_PART2}")
    log(f"  Log           : {LOG_FILE}")
    if os.path.isfile("failed_blocks.txt"):
        print("=== FAILED BLOCKS SUMMARY ===")
        with open("failed_blocks.txt", "r", encoding="utf-8") as f:
            print(f.read(), end="")


if __name__ == "__main__":
    main()
