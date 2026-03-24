"""
Extract architectural decisions, rationale, dead ends, and lessons learned
from Claude.ai conversations_export for the Arcanthyr project.
Writes output to CLAUDE_decisions.md.
"""

import json
import re
from collections import defaultdict

EXPORT_PATH = 'C:/Users/Hogan/AppData/Local/Temp/arcanthyr_export/conversations.json'
OUTPUT_PATH = 'C:/Users/Hogan/OneDrive/Arcanthyr/arcanthyr-console/Arc v 4/CLAUDE_decisions.md'

# Conversations to skip (confirmed non-Arcanthyr)
SKIP_NAMES = {
    'Planning the next gaming session',
    'Article review for project consideration',
    'Reading comprehension task',
}

# ── Architectural signal patterns (weight, regex) ──────────────────────────────
DECISION_PATTERNS = [
    # Explicit decisions
    (6, r'\bdecided? to\b'),
    (6, r'\bwe decided\b'),
    (6, r'\broot cause\b'),
    (6, r'\bdead end\b'),
    (6, r'\babandoned\b'),
    (6, r'\bwon.t work\b'),
    (6, r'\bkey (insight|discovery|finding)\b'),
    (6, r'\blesson(s)? learned\b'),
    (5, r'\bthe (reason|problem|issue) (is|was)\b'),
    (5, r'\bswitched (from|to)\b'),
    (5, r'\breplaced .{0,40} with\b'),
    (5, r'\bturns? out\b'),
    (5, r'\broot issue\b'),
    (5, r'\bfixed by\b'),
    (5, r'\bthe fix (is|was)\b'),
    (5, r'\bbecause .{5,80}(slow|fail|broken|wrong|issue|problem|block|timeout|limit)\b'),
    (5, r'\b(chose|choosing) .{0,60} (over|instead of)\b'),
    (4, r'\binstead of\b.{0,60}(embed|chunk|ingest|vector|queue|worker|llm|model)\b'),
    (4, r'\brather than\b.{0,60}(embed|chunk|ingest|vector|queue|worker|llm|model)\b'),
    (4, r'\btrade.?off\b'),
    (4, r'\blimitation\b.{0,60}(d1|qdrant|workers ai|cloudflare|ollama|sqlite)\b'),
    (4, r'\bconstraint\b.{0,60}(d1|qdrant|workers ai|cloudflare|ollama|sqlite)\b'),
    (4, r'\bwhy .{0,40}(we|i) (use|chose|switched|moved|avoid)\b'),
    (4, r'\b(approach|architecture|design) (is|was|changed|decision)\b'),
    (4, r'\bpitfall\b'),
    (4, r'\bgotcha\b'),
    (4, r'\bwarning\b.{0,60}(ingest|embed|chunk|vector|d1|queue)\b'),
    (4, r'\bdo not\b.{0,40}(use|run|call|send|set|put)\b'),
    (4, r'\bnever\b.{0,40}(use|run|call|send|set|put)\b.{0,60}(d1|queue|embed|ingest|poller)\b'),
]

# Topic keywords — passage must match at least one
TOPIC_KEYWORDS = [
    r'\bqdrant\b', r'\bembedd?ing\b', r'\bvector\b', r'\bsemantic\b', r'\bretrieval\b',
    r'\bworker(s)?\b', r'\bcloudflare\b', r'\bd1\b', r'\bwrangler\b',
    r'\benrichment\b', r'\bpoller\b', r'\bchunk\b', r'\bcorpus\b',
    r'\bqwen\b', r'\bgpt.4o\b', r'\bworkers ai\b', r'\bollama\b',
    r'\bserver\.py\b', r'\bscraper\b', r'\baustlii\b',
    r'\bfts5\b', r'\bbm25\b', r'\brrf\b',
    r'\bcase law\b', r'\bprinciple\b', r'\blegislation\b',
    r'\bingest\b', r'\bpipeline\b', r'\bqueue\b',
    r'\bnexus\b', r'\bdocker\b',
    r'\bthreshold\b', r'\bscore\b.{0,20}\b(0\.\d+|retriev|semantic)\b',
    r'\bpass (1|2|one|two|first|second)\b',
    r'\bcase.chunk\b',
]

TERMINAL_NOISE = [
    r'^\s*\$\s+',           # shell prompts
    r'^\s*tom@',            # ssh prompts
    r'^\s*PS C:\\',         # PowerShell prompts
    r'remote: ',            # git output
    r'Compressing objects',
    r'Writing objects:',
    r'Delta compression',
    r'"result":\s*\{',      # JSON API responses
    r'"points":\s*\[',
    r'"payload":\s*\{',
    r'127\.0\.0\.1|localhost:\d{4,5}',  # raw connection strings in code blocks
]

compiled_decisions = [(w, re.compile(p, re.IGNORECASE)) for w, p in DECISION_PATTERNS]
compiled_topics = [re.compile(p, re.IGNORECASE) for p in TOPIC_KEYWORDS]
compiled_noise = [re.compile(p, re.IGNORECASE | re.MULTILINE) for p in TERMINAL_NOISE]


def is_terminal_output(text):
    """Return True if the paragraph looks like raw shell/JSON output."""
    noise_hits = sum(1 for p in compiled_noise if p.search(text))
    if noise_hits >= 2:
        return True
    # Very high ratio of non-alpha chars (code/JSON/shell)
    alpha = len(re.findall(r'[a-zA-Z]', text))
    total = len(text)
    if total > 0 and alpha / total < 0.35:
        return True
    return False


def score_paragraph(text):
    """Return (decision_score, is_on_topic)."""
    score = sum(w for w, pat in compiled_decisions if pat.search(text))
    on_topic = any(p.search(text) for p in compiled_topics)
    return score, on_topic


def get_message_text(msg):
    text = msg.get('text', '') or ''
    if text:
        return text
    content = msg.get('content', [])
    if isinstance(content, list):
        parts = [b.get('text', '') for b in content
                 if isinstance(b, dict) and b.get('type') == 'text']
        return '\n'.join(parts)
    return ''


def split_paragraphs(text):
    paras = re.split(r'\n{2,}', text)
    result = []
    for p in paras:
        p = p.strip()
        if len(p) < 100:
            continue
        # Skip code blocks
        if p.startswith('```') or p.startswith('    ') or p.startswith('\t'):
            continue
        # Skip pure markdown table rows
        if p.count('|') > 4:
            continue
        result.append(p)
    return result


def is_arcanthyr_conversation(conv):
    name = conv.get('name', '')
    if name in SKIP_NAMES:
        return False
    return True  # Include all; topic filter handles relevance


def extract_findings(conv):
    """Return list of (score, sender, created_at, excerpt) from one conversation."""
    findings = []
    msgs = conv.get('chat_messages', [])
    for msg in msgs:
        sender = msg.get('sender', 'unknown')
        created_at = msg.get('created_at', '')[:10]
        text = get_message_text(msg)
        if not text:
            continue
        for para in split_paragraphs(text):
            if is_terminal_output(para):
                continue
            score, on_topic = score_paragraph(para)
            if score >= 4 and on_topic:
                excerpt = para[:700].rstrip()
                if len(para) > 700:
                    excerpt += '…'
                findings.append((score, sender, created_at, excerpt))
    return findings


def categorise(text):
    t = text.lower()
    if any(k in t for k in ['fts5', 'bm25', 'rrf', 'full-text', 'fulltext']):
        return 'fts_retrieval'
    if any(k in t for k in ['qdrant', 'vector', 'embedd', 'ollama', 'threshold', 'cosine']):
        return 'vector_search'
    if any(k in t for k in ['retrieval', 'semantic search', 'query pass', 'triple pass', 'hybrid']):
        return 'retrieval'
    if any(k in t for k in ['enrichment', 'poller', 'gpt-4o', 'workers ai', 'qwen', 'chunk', 'llm']):
        return 'enrichment_pipeline'
    if any(k in t for k in ['corpus', 'ingest', 'scraper', 'austlii', 'parse', 'block', 'upload-corpus']):
        return 'corpus_ingest'
    if any(k in t for k in ['server.py', 'vps', 'docker', 'ssh', 'nexus']):
        return 'vps_server'
    if any(k in t for k in ['worker', 'cloudflare', 'd1', 'wrangler', 'queue']):
        return 'cloudflare_worker'
    return 'general'


CATEGORY_TITLES = {
    'enrichment_pipeline': 'Enrichment Pipeline (Poller / Chunking / LLM Models)',
    'vector_search':       'Vector Search & Embeddings',
    'retrieval':           'Retrieval Architecture',
    'fts_retrieval':       'FTS5 / BM25 / RRF',
    'cloudflare_worker':   'Cloudflare Worker & D1',
    'corpus_ingest':       'Corpus & Case Ingestion',
    'vps_server':          'VPS / server.py',
    'general':             'General Architecture & Process',
}

STOPWORDS = {
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'by','from','is','are','was','were','be','been','have','has','had','do',
    'does','did','will','would','could','should','may','might','can','that',
    'this','these','those','it','its','we','our','you','your','i','my','he',
    'she','they','their','if','as','so','not','no','also','into','just',
    'which','what','when','where','how','there','then','than','more','all',
    'up','out','about','now','need','use','used','using','get','set','new',
}


def content_words(text):
    return {w for w in re.findall(r'[a-z]{4,}', text.lower()) if w not in STOPWORDS}


def deduplicate(findings):
    """Remove near-duplicate excerpts.
    Tuple layout: (score, conv_name, conv_date, sender, created_at, excerpt)
    excerpt is at index 5."""
    seen_starts = set()
    unique = []
    for item in findings:
        excerpt = item[5]
        # Hard dedup on normalised first 150 chars
        start = re.sub(r'\s+', ' ', excerpt[:150]).strip()
        if start in seen_starts:
            continue
        seen_starts.add(start)
        unique.append(item)
    return unique


def main():
    print(f"Loading {EXPORT_PATH}...")
    with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"Total conversations: {len(data)}")
    all_findings = []  # (score, conv_name, conv_date, sender, created_at, excerpt)

    for conv in data:
        name = conv.get('name', '(unnamed)')
        updated = conv.get('updated_at', '')[:10]
        if not is_arcanthyr_conversation(conv):
            print(f"  SKIP: {name}")
            continue
        if not conv.get('chat_messages'):
            continue
        findings = extract_findings(conv)
        for score, sender, created_at, excerpt in findings:
            all_findings.append((score, name, updated, sender, created_at, excerpt))
        if findings:
            print(f"  [{updated}] {name[:60]}: {len(findings)} passages")

    print(f"\nRaw findings: {len(all_findings)}")
    all_findings = deduplicate(all_findings)
    print(f"After dedup:  {len(all_findings)}")

    # Group by category, sort by date within each
    by_category = defaultdict(list)
    for item in all_findings:
        score, conv_name, conv_date, sender, created_at, excerpt = item
        cat = categorise(excerpt)
        by_category[cat].append(item)

    cat_order = [
        'enrichment_pipeline', 'vector_search', 'retrieval', 'fts_retrieval',
        'cloudflare_worker', 'corpus_ingest', 'vps_server', 'general'
    ]

    print(f"\nWriting {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write("# CLAUDE_decisions.md\n\n")
        f.write("Architectural decisions, rationale, dead ends, and lessons learned\n")
        f.write("extracted from Claude.ai conversation export (Feb–Mar 2026).\n")
        f.write("Supplement to CLAUDE.md and CLAUDE_arch.md — focuses on *why*, not *what*.\n\n")
        f.write("---\n\n")

        total_written = 0
        for cat_key in cat_order:
            items = by_category.get(cat_key, [])
            if not items:
                continue
            # Sort: high score first, then chronologically
            items.sort(key=lambda x: (-x[0], x[4]))
            f.write(f"## {CATEGORY_TITLES[cat_key]}\n\n")
            for score, conv_name, conv_date, sender, created_at, excerpt in items:
                label = conv_name if conv_name != '(unnamed)' else f'session ~{conv_date}'
                clean = re.sub(r'\s+', ' ', excerpt).strip()
                f.write(f"**[{created_at}]** *{label[:55]}* — score {score}, {sender}\n\n")
                f.write(f"> {clean}\n\n")
                total_written += 1

        f.write("---\n\n")
        f.write(f"*{total_written} passages from {len(data)} conversations.*\n")

    print(f"Done. {total_written} passages written.")


if __name__ == '__main__':
    main()
