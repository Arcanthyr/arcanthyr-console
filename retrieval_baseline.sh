#!/bin/bash
# retrieval_baseline.sh — run all 31 baseline questions against /search
# Usage: bash retrieval_baseline.sh
# KEY is auto-read from ~/ai-stack/.env.secrets if not already exported

ENDPOINT="http://localhost:18789/search"
KEY="${KEY:-$(grep NEXUS_SECRET_KEY ~/ai-stack/.env.secrets | cut -d= -f2-)}"
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
    print(f'  [{i+1}] score={c[\"score\"]:.4f} type={c[\"type\"]} citation={c.get(\"citation\",\"\")[:60]} | {c[\"text\"][:120].strip()}')
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
run_query 8  "tendency evidence propensity similar fact evidence criminal proceedings"
run_query 9  "sentencing principles Tasmania guilty plea discount"
run_query 10 "corroboration warning jury direction"
run_query 11 "s138 improperly obtained evidence exclusion voir dire admissibility"
run_query 12 "hostile witness procedure cross examination"
run_query 13 "tendency evidence notice requirements s97 objection admissibility"
run_query 14 "leading questions examination in chief"
run_query 15 "family violence evidence complainant credibility"
run_query 16 "neill fraser dna secondary transfer"
run_query 17 "self-defence honest belief mistake of fact"
run_query 18 "what happens if an accused person refuses to give evidence"
run_query 19 "sentencing range aggravated assault Tasmania"
run_query 20 "manifestly excessive sentence appeal grounds"
run_query 21 "suspended sentence breach consequences"
run_query 22 "non-parole period setting principles"
run_query 23 "search warrant execution requirements Tasmania"
run_query 24 "committal hearing procedure indictable offence"
run_query 25 "bail application principles Tasmania"
run_query 26 "appeal against conviction unreasonable verdict"
run_query 27 "provocation defence manslaughter Tasmania"
run_query 28 "family violence order variation grounds"
run_query 29 "contravention family violence order sentencing"
run_query 30 "expert evidence opinion admissibility"
run_query 31 "right to silence direction jury"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Done."
