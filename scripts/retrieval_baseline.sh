#!/bin/bash
# retrieval_baseline.sh — run all 15 baseline questions against /search
# Usage: bash retrieval_baseline.sh
# Requires: KEY env var set

ENDPOINT="http://localhost:18789/search"
PASS=0
FAIL=0
PARTIAL=0

run_query() {
    local qnum="$1"
    local query="$2"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Q${qnum}: ${query}"
    echo ""
    result=$(curl -s -X POST "$ENDPOINT" \
        -H "Content-Type: application/json" \
        -H "X-Nexus-Key: $KEY" \
        -d "{\"query_text\": \"${query}\"}")
    count=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count',0))")
    echo "Chunks returned: $count"
    echo "$result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for i, c in enumerate(d.get('chunks', [])[:3]):
    print(f'  [{i+1}] score={c[\"score\"]:.4f} type={c[\"type\"]} | {c[\"text\"][:120].strip()}')
"
    echo ""
}

run_query 1  "elements of common assault Tasmania"
run_query 2  "what is the beyond reasonable doubt standard"
run_query 3  "admissibility of tendency evidence sexual offences"
run_query 4  "what is the test for tendency evidence"
run_query 5  "hearsay exceptions first hand hearsay"
run_query 6  "self defence elements Tasmania criminal code"
run_query 7  "tendency evidence significant probative value test"
run_query 8  "propensity evidence criminal proceedings"
run_query 9  "sentencing principles Tasmania guilty plea discount"
run_query 10 "corroboration warning jury direction"
run_query 11 "voir dire admissibility Evidence Act s138"
run_query 12 "hostile witness procedure cross examination"
run_query 13 "tendency notice objection voir dire"
run_query 14 "leading questions examination in chief"
run_query 15 "family violence evidence complainant credibility"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Done."
