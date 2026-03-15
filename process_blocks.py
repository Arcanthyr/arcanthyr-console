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
MODEL         = "gpt-5-mini-2025-08-07"
TEMPERATURE   = 1
MAX_TOKENS    = 32000      # enough for a full block output
SLEEP_BETWEEN = 5         # seconds between API calls


# ---------------------------------------------
# MASTER PROMPT
# ---------------------------------------------

MASTER_PROMPT = textwrap.dedent("""\
You are processing ONE PART of a large legal research document for ingestion into a vector search and AI retrieval system.
The source material contains mixed personal notes and commentary on Tasmanian criminal law, including legislation, legal concepts, doctrinal analysis, evidentiary principles, sentencing principles, and case references.
If output budget becomes constrained, prioritise in this order: 1. Complete formatted chunks 2. Coverage report 3. Validation report 4. Deduplication report
Never truncate the formatted chunk set.
Your task is to perform ALL of the following in a single pass on the uploaded part only:
1. FORMAT the source into semantically clean, self-contained retrieval chunks. 2. VERIFY COVERAGE by checking whether any substantive legal content in the source part was omitted from the formatted output. 3. VALIDATE STRUCTURE by checking the formatted output against the structural and metadata rules below.
Do not summarise or omit substantive legal analysis. Work only on the uploaded part. Do not rely on prior or later parts. Do not ask for confirmation. Output in Markdown only.

SOURCE INDEX PASS
Before producing any formatted chunks, perform a SOURCE INDEX PASS.
Scan the uploaded source block and identify every distinct doctrinal unit present. Examples include:
- statutory provisions - offence definitions - elements of offences - defences - evidentiary rules - sentencing principles - procedural rules - interpretive doctrines - case authorities
Case Authority Detection: during this scan, detect all case citations embedded in the text. Look for patterns such as: - [YYYY] TASSC - [YYYY] TASCCA - [YYYY] HCA - R v - DPP v
Each detected authority must be recorded as a doctrinal unit and converted into a case authority chunk.
Create a list titled:
## SOURCE DOCTRINAL UNITS
Each item must be a concise description of one doctrinal unit. This list must represent the complete conceptual coverage of the source block. Do not begin formatting chunks until this list is complete. Each doctrinal unit listed must produce at least one formatted chunk unless the material is clearly duplicative.

PRIMARY OBJECTIVE
Convert the uploaded source part into semantically clean, self-contained chunks optimised for vector retrieval.
Each chunk must be fully understandable in isolation with no reliance on surrounding sections.
If the source already complies, preserve the substance and structure unless changes are required for compliance.

FORMATTING RULES
HEADING STRUCTURE
Use three heading levels only.
Level 1 - Major Act or major doctrinal topic. Example: # Criminal Code Act 1924 (Tas)
Level 2 - Specific statutory provision or major legal concept. Example: ## Criminal Code Act 1924 (Tas) s 156 - Culpable Homicide
Level 3 - Sub-rule or analytical component. Example: ### Elements of the Offence

RULE ISOLATION
Each chunk must describe only one legal rule, definition, doctrinal test, evidentiary rule, sentencing principle, procedural rule, interpretive principle, or analytical principle.
If a section discusses multiple rules or tests, split it into separate chunks with distinct headings.
Examples of separate rule chunks: - offence definition - elements of offence - statutory definition - defence requirements - evidentiary admissibility test - sentencing principle - procedural rule - interpretive principle - case authority

METADATA MARKERS
Immediately below every Level 2 or Level 3 heading include metadata markers in this exact order when supported by the source text:
[DOMAIN: Tasmanian Criminal Law] [ACT: full Act name] [SECTION: section number] [CITATION: full legislative citation] [TYPE: offence / element of offence / defence / statutory definition / legal doctrine / evidentiary rule / sentencing principle / procedural rule / interpretive principle / case authority] [CASE: full case citation] [TOPIC: concise legal topic] [CONCEPTS: 5-10 supported keywords or search phrases]
Rules: - Only include metadata supported by the source text. - Never invent statutes, sections, cases, or doctrines. - Omit [SECTION:] if not tied to a specific section. - Omit [ACT:] and [CITATION:] if the chunk is not statutory. - Omit [CASE:] unless the chunk is about or materially relies on a cited case.
Minimum required for every chunk: [DOMAIN:] [TYPE:] [TOPIC:] [CONCEPTS:]
If legislation is analysed also require: [ACT:] [CITATION:]
If case authority is analysed also require: [CASE:]

TYPE FIELD
Select the most accurate classification from the approved categories above.

CONCEPTS FIELD
Provide 5-10 concepts supported by the source text.
Include: - doctrinal terminology - synonyms - related legal ideas - plain-language search phrases a non-lawyer might use
Prefer mixed legal and natural-language phrasing. Do not include unrelated concepts. Do not use fewer than 5 concepts unless the source genuinely does not support more.
Example: [CONCEPTS: recklessness, mental element, criminal fault, awareness of risk, subjective foresight, state of mind, did they know the risk, foresight of harm]

CHUNK STRUCTURE
Each chunk must follow this structure:
Heading Metadata markers Prose explanation
Rules: - The chunk must stand alone. - Include full statutory references in the text. - Do not rely on surrounding headings. - Remove cross-references such as: see above / see below / as discussed earlier / refer to / noted earlier - Rewrite cross-references as complete standalone explanations.

CONCEPT ANCHOR RULE
The first sentence of each chunk must clearly state the rule or legal concept being explained.
Example: "Culpable homicide under Criminal Code Act 1924 (Tas) s 156 refers to an unlawful killing that does not satisfy the elements required for murder."

CHUNK LENGTH
Target length: 150-350 words. Hard maximum: 450 words.
If a discussion exceeds 450 words, split into logically distinct sub-topics with new headings.
Never use continuation headings such as: (cont.) / continued / part 2
Instead use semantic headings such as: - Admissibility Test - Elements - Exception - Mental Element - Evidentiary Threshold - Sentencing Considerations

LISTS AND ELEMENTS
Use numbered lists when describing: - elements of offences - statutory tests - multi-factor standards
Use prose for commentary.

CITATIONS
Normalise citations.
Legislation: Criminal Code Act 1924 (Tas) s 156 Cases: [2024] TASSC 24
Rules: - Never abbreviate Act names within a chunk. - Ensure the full statute name appears within the chunk text when legislation is discussed.

CASE AUTHORITY BLOCKS
When a case is cited as authority for a legal rule, create a separate authority chunk.
Structure: ### Authority - [short description of rule]
Metadata must include: [DOMAIN: Tasmanian Criminal Law] [TYPE: case authority] [CASE: full case citation] [TOPIC: legal principle supported] [CONCEPTS: doctrinal terms and plain-language phrases related to the authority]
Content: explain the legal principle confirmed by the case. Do not include procedural history or detailed facts unless essential to the rule.

TABLES
Convert tables to prose unless the table compares multiple legal rules across three or more attributes.

CLEANING RULES
Remove: page numbers / headers and footers / redundant whitespace / duplicate content / cross-references
If duplicate content appears, retain the fuller explanation and remove the weaker duplicate.

REVIEW FLAG
If heading level, metadata classification, rule separation, or source interpretation is uncertain, mark the affected chunk: [REVIEW]

COVERAGE VERIFICATION RULES
After formatting, compare the formatted output against the uploaded source part only.
Identify any substantive legal material present in the source that does not appear in the formatted output.
Check specifically for: - missing doctrines - missing statutory provisions - missing section-specific analysis - missing defences - missing evidentiary rules - missing sentencing principles - missing procedural rules - missing interpretive principles - missing case authorities - missing major headings or doctrinal topics
If material is missing, list it under [UNPROCESSED].
At the end of the formatted output, list all major headings or topics identified in the source part. If any identified topic was not converted into a chunk, flag it as [UNPROCESSED].

STRUCTURAL VALIDATION RULES
Before finalising, validate the formatted output against the following checks.
CHECK 1 - CHUNK LENGTH: flag any chunk exceeding 450 words. Report heading and approximate word count.
CHECK 2 - CONTINUATION HEADINGS: flag headings containing (cont.) / continued / part 2. Suggest a semantic replacement.
CHECK 3 - CROSS REFERENCES: flag phrases such as see above / see below / as discussed / refer to / noted earlier. Quote the sentence.
CHECK 4 - STATUTE CONTEXT: flag any chunk referencing a section number without the full Act name in that chunk text.
CHECK 5 - HEADING CONTEXT: flag any Level 2 heading that does not include the Act name or legal topic.
CHECK 6 - METADATA COMPLETENESS: flag Level 2 or Level 3 chunks missing required metadata.
CHECK 7 - CONCEPTS FIELD QUALITY: flag [CONCEPTS:] entries containing fewer than 5 concepts, containing only formal legal terms, or including unrelated concepts.
CHECK 8 - TYPE FIELD VALIDITY: flag [TYPE:] entries inconsistent with the chunk content.
CHECK 9 - CASE METADATA: flag any chunk referencing a case citation that does not include a [CASE:] metadata marker where required.
CHECK 10 - DUPLICATE CONTENT: flag chunks that repeat substantive content elsewhere. Retain the most complete chunk. Identify the weaker duplicate.
CHECK 11 - DOMAIN MARKER: flag any chunk missing [DOMAIN: Tasmanian Criminal Law].
CHECK 12 - SOURCE COVERAGE: flag major headings, doctrines, statutes, or authorities from the uploaded source part absent from the formatted output.
Only report checks where an issue exists.

MANDATORY OUTPUT FORMAT
Output exactly in this order:
# PART OUTPUT
## SOURCE DOCTRINAL UNITS [List of all doctrinal units identified in the source block before formatting begins.]
## FORMATTED CHUNKS [Full formatted Markdown chunk set for this uploaded part.]
## SOURCE TOPICS IDENTIFIED [List all major headings, topics, doctrines, statutory provisions, and authorities identified in the source part.]
## COVERAGE REPORT Either: "No substantive omissions detected in this part." Or: a list headed [UNPROCESSED] containing each suspected omission.
## VALIDATION REPORT For each issue found, report: Check number / Heading / Quoted text (first 50 words) / Explanation If no issue exists for a check, do not report it.
## DEDUPLICATION REPORT Either: "No substantive duplicates detected in this part." Or: list duplicate chunks and specify which version should be retained.
## FINAL STATUS State one of: - READY FOR APPEND TO MASTER FILE - READY FOR APPEND WITH MINOR REVIEW - NEEDS REVISION BEFORE APPEND

PROCESS DISCIPLINE
- Do not analyse any material outside the uploaded part. - Do not summarise the source instead of formatting it. - Do not omit substantive legal content. - Do not produce Word formatting. - Do not begin until the source part is present.
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
