import os, json, uuid, base64, io, requests
from http.server import HTTPServer, BaseHTTPRequestHandler
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance, ScoredPoint
from qdrant_client.models import Filter, FieldCondition, MatchValue

OLLAMA_HOST   = os.environ.get("OLLAMA_HOST", "http://ollama:11434")
QDRANT_HOST   = os.environ.get("QDRANT_HOST", "http://qdrant-general:6333")
EMBED_MODEL   = "nomic-embed-text"
COLLECTION    = "general-docs"
CHUNK_SIZE    = 500
CHUNK_OVERLAP = 50
PORT          = 18789

# Court hierarchy for re-ranking (higher = more authoritative)
COURT_HIERARCHY = {
    "cca":         3,
    "fullcourt":   3,
    "supreme":     2,
    "magistrates": 1,
}

def chunk_text(text):
    words = text.split()
    chunks, i = [], 0
    while i < len(words):
        chunks.append(" ".join(words[i:i+CHUNK_SIZE]))
        i += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks

def embed(text):
    r = requests.post(
        f"{OLLAMA_HOST}/api/embed",
        json={"model": EMBED_MODEL, "input": text}
    )
    r.raise_for_status()
    return r.json()["embeddings"][0]

def ingest_text(body):
    text     = body.get("text", "").strip()
    citation = body.get("citation", "unknown")
    source   = body.get("source", citation)
    metadata = {
        "summary":      body.get("summary"),
        "category":     body.get("category"),
        "jurisdiction": body.get("jurisdiction"),
        "court":        body.get("court"),
        "year":         body.get("year"),
        "outcome":      body.get("outcome"),
        "principles":   body.get("principles", []),
        "legislation":  body.get("legislation", []),
        "offences":     body.get("offences", []),
    }
    has_metadata = any(v for v in metadata.values() if v)
    print(f"[*] Ingesting: {citation} | metadata: {'yes' if has_metadata else 'no'}")
    chunks = chunk_text(text)
    if not chunks:
        return 0
    client = QdrantClient(url=QDRANT_HOST)
    existing = [c.name for c in client.get_collections().collections]

    # Build context prefix from available metadata
    context_parts = [f"Citation: {citation}."]
    if metadata.get("court"):
        context_parts.append(f"Court: {metadata['court']}.")
    if metadata.get("year"):
        context_parts.append(f"Year: {metadata['year']}.")
    if metadata.get("category"):
        context_parts.append(f"Category: {metadata['category']}.")
    if metadata.get("summary"):
        context_parts.append(f"Summary: {metadata['summary'][:200]}.")
    if metadata.get("outcome"):
        context_parts.append(f"Outcome: {metadata['outcome'][:150]}.")
    context_prefix = " ".join(context_parts)

    points = []
    for i, chunk in enumerate(chunks):
        contextual_chunk = f"{context_prefix}\n\n{chunk}"
        vector = embed(contextual_chunk)
        points.append(PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={
                "text": chunk,
                "source": source,
                "citation": citation,
                "chunk": i,
                "total_chunks": len(chunks),
                **metadata,
            }
        ))

    if COLLECTION not in existing:
        sample = embed(chunks[0])
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=len(sample), distance=Distance.COSINE)
        )
        print(f"[*] Created collection: {COLLECTION}")

    client.upsert(collection_name=COLLECTION, points=points)
    print(f"[+] Stored {len(points)} chunks for: {citation}")
    return len(points)


def search_text(body):
    """
    Semantic search against Qdrant.

    Params:
        query_text      – natural language query string (required)
        top_k           – max chunks to return (default 6, max 8)
        score_threshold – minimum cosine similarity (default 0.72)

    Returns list of chunk dicts, re-ranked by court hierarchy where
    scores are within 0.05 of each other.
    """
    query_text      = body.get("query_text", "").strip()
    top_k           = min(int(body.get("top_k", 6)), 8)
    score_threshold = float(body.get("score_threshold", 0.72))

    if not query_text:
        raise ValueError("query_text is required")

    # Embed the query using the same model as ingest
    query_vector = embed(query_text)

    client = QdrantClient(url=QDRANT_HOST)

    # Search with score threshold — only returns chunks above minimum similarity
    results = client.search(
        collection_name=COLLECTION,
        query_vector=query_vector,
        limit=top_k,
        score_threshold=score_threshold,
        with_payload=True,
    )

    if not results:
        print(f"[*] Search: no results above threshold {score_threshold} for query: {query_text[:80]}")
        return []

    print(f"[*] Search: {len(results)} chunks above threshold {score_threshold}")

    # Build result dicts with full metadata
    chunks = []
    for hit in results:
        payload = hit.payload or {}
        chunks.append({
            "score":      round(hit.score, 4),
            "citation":   payload.get("citation", "unknown"),
            "court":      payload.get("court", ""),
            "year":       payload.get("year", ""),
            "text":       payload.get("text", ""),
            "summary":    payload.get("summary", ""),
            "outcome":    payload.get("outcome", ""),
            "principles": payload.get("principles", []),
            "legislation":payload.get("legislation", []),
            "chunk":      payload.get("chunk", 0),
            "total_chunks": payload.get("total_chunks", 1),
        })

    # Re-rank by court hierarchy where scores are within 0.05 of each other.
    # Stable sort: primary key is -(hierarchy_tier * 100 + score*100) so that
    # within a close score band, higher-authority courts float up.
    # We define "close" as within 0.05 of the top score.
    if len(chunks) > 1:
        top_score = chunks[0]["score"]
        def sort_key(c):
            tier = COURT_HIERARCHY.get(c["court"], 1)
            score = c["score"]
            # If within 0.05 of top score, allow hierarchy to break the tie
            if (top_score - score) <= 0.05:
                return -(tier * 100 + score * 100)
            # Otherwise pure score ordering
            return -score * 100
        chunks.sort(key=sort_key)

    print(f"[+] Returning {len(chunks)} chunks after re-ranking")
    return chunks


def extract_pdf_text(pdf_bytes):
    """Extract clean text from PDF bytes using pdfminer."""
    try:
        from pdfminer.high_level import extract_text as pdfminer_extract
        pdf_file = io.BytesIO(pdf_bytes)
        return pdfminer_extract(pdf_file)
    except ImportError:
        raise Exception("pdfminer.six not installed. Run: pip install pdfminer.six")

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print("[HTTP]", format % args)

    def send_json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def check_auth(self):
        expected_key = os.environ.get("NEXUS_SECRET_KEY", "")
        provided_key = self.headers.get("X-Nexus-Key", "")
        if not expected_key or provided_key != expected_key:
            self.send_json(401, {"error": "unauthorized"})
            return False
        return True

    def read_body(self):
        return json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"status": "ok"})
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/ingest":
            if not self.check_auth(): return
            body = self.read_body()
            if not body.get("text", "").strip():
                self.send_json(400, {"error": "text field required"})
                return
            try:
                count = ingest_text(body)
                self.send_json(200, {"ok": True, "citation": body.get("citation", "unknown"), "chunks_stored": count})
            except Exception as e:
                print(f"[!] Ingest error: {e}")
                self.send_json(500, {"error": str(e)})

        elif self.path == "/search":
            if not self.check_auth(): return
            body = self.read_body()
            try:
                chunks = search_text(body)
                self.send_json(200, {"ok": True, "chunks": chunks, "count": len(chunks)})
            except ValueError as e:
                self.send_json(400, {"error": str(e)})
            except Exception as e:
                print(f"[!] Search error: {e}")
                self.send_json(500, {"error": str(e)})

        elif self.path == "/extract-pdf":
            # Accepts base64-encoded PDF, returns extracted plain text.
            # Used by the browser legislation uploader to get clean server-side
            # text extraction via pdfminer instead of browser PDF.js.
            if not self.check_auth(): return
            body = self.read_body()
            pdf_b64 = body.get("pdf_base64", "")
            if not pdf_b64:
                self.send_json(400, {"error": "pdf_base64 field required"})
                return
            try:
                pdf_bytes = base64.b64decode(pdf_b64)
                text = extract_pdf_text(pdf_bytes)
                print(f"[+] PDF extracted: {len(text)} chars")
                self.send_json(200, {"ok": True, "text": text, "chars": len(text)})
            except Exception as e:
                print(f"[!] PDF extraction error: {e}")
                self.send_json(500, {"error": str(e)})

        else:
            self.send_json(404, {"error": "not found"})

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Nexus ingest server running on port {PORT}")
    server.serve_forever()
