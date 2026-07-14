# scripts/ingest_authority_chunks.py
import os, re, requests, time, sys, argparse
from pathlib import Path

STAGING_DIR = Path(__file__).parent / "authority-chunks-staging"
ENDPOINT = "https://arcanthyr.com/api/legal/upload-corpus"
USER_AGENT = "Mozilla/5.0 (compatible; Arcanthyr/1.0)"
DELAY_SEC = 1.0

CITATION_RE = re.compile(r'^\[CITATION:\s*(.+?)\]\s*$', re.MULTILINE)
TITLE_RE    = re.compile(r'^\[TITLE:\s*(.+?)\]\s*$',    re.MULTILINE)
CATEGORY_RE = re.compile(r'^\[CATEGORY:\s*(.+?)\]\s*$', re.MULTILINE)

def parse_file(path):
    text = path.read_text(encoding="utf-8")
    cm = CITATION_RE.search(text); tm = TITLE_RE.search(text); gm = CATEGORY_RE.search(text)
    if not (cm and tm and gm):
        return None
    return {
        "citation": cm.group(1).strip(),
        "source":   tm.group(1).strip(),
        "category": gm.group(1).strip(),
        "doc_type": "authority_synthesis",   # hardcoded — [TYPE:] absent in staged files
        "text":     text,
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Process only the first N files (for dry-run testing)")
    args = parser.parse_args()

    files = sorted(STAGING_DIR.glob("*.md"))
    if args.limit:
        files = files[:args.limit]
        print(f"LIMIT MODE: processing {len(files)} of {len(sorted(STAGING_DIR.glob('*.md')))} files")
    else:
        print(f"Found {len(files)} files in {STAGING_DIR}")
    if not args.limit:
        if len(files) != 233:
            print(f"WARNING: expected 233, got {len(files)}. Abort? (Ctrl+C to stop, Enter to proceed)")
            input()

    ok, fail, skipped = 0, 0, []
    for i, path in enumerate(files, 1):
        payload = parse_file(path)
        if payload is None:
            skipped.append(path.name); continue
        try:
            r = requests.post(ENDPOINT, json=payload,
                              headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
                              timeout=30)
            if r.status_code == 200:
                ok += 1
                print(f"[{i}/{len(files)}] OK   {payload['citation']}")
            else:
                fail += 1
                print(f"[{i}/{len(files)}] FAIL {payload['citation']} {r.status_code} {r.text[:120]}")
        except Exception as e:
            fail += 1
            print(f"[{i}/{len(files)}] ERR  {payload['citation']} {e}")
        time.sleep(DELAY_SEC)

    print("\n--- SUMMARY ---")
    print(f"ok: {ok}  fail: {fail}  skipped (parse failed): {len(skipped)}")
    if skipped: print("skipped:", skipped)
    print("\nNext step — flip enriched flag to bypass Pass 2 synthesis:")
    print("  UPDATE secondary_sources SET enriched=1 WHERE source_type='authority_synthesis' AND embedded=0;")

if __name__ == "__main__":
    sys.exit(main())
