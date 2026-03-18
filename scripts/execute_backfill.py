"""
execute_backfill.py — batch-executes backfill_enriched_text.sql via wrangler
Run from arcanthyr-console\ directory after backfill_enriched_text.py has generated the SQL file.
"""

import subprocess
import sys
import os
import tempfile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SQL_FILE = "backfill_enriched_text.sql"
BATCH_SIZE = 10
DB_NAME = "arcanthyr"
WRANGLER_CWD = r"C:\Users\Hogan\OneDrive\Arcanthyr\arcanthyr-console\Arc v 4"

def main():
    with open(SQL_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    statements = [s.strip() for s in content.split(";") if s.strip()]
    total = len(statements)
    print(f"Total UPDATE statements: {total}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Batches: {(total + BATCH_SIZE - 1) // BATCH_SIZE}\n")

    success = 0
    failed = 0

    for i in range(0, total, BATCH_SIZE):
        batch = statements[i:i + BATCH_SIZE]
        batch_sql = ";\n".join(batch) + ";"
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE

        # Write batch to a temp file — avoids Windows 32K command line limit
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8") as tmp:
            tmp.write(batch_sql)
            tmp_path = tmp.name

        try:
            result = subprocess.run(
                ["npx.cmd", "wrangler", "d1", "execute", DB_NAME, "--remote", "--file", tmp_path],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                cwd=WRANGLER_CWD
            )

            if result.returncode == 0:
                success += len(batch)
                print(f"Batch {batch_num}/{total_batches} OK ({len(batch)} rows)")
            else:
                failed += len(batch)
                print(f"Batch {batch_num}/{total_batches} FAILED:")
                print((result.stderr or result.stdout or "no output")[:300])
        finally:
            os.unlink(tmp_path)

    print(f"\nDone — {success} OK | {failed} FAILED")

if __name__ == "__main__":
    main()
