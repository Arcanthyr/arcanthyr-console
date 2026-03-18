import os, json, uuid, base64, io, re, requests, threading, time
from http.server import HTTPServer, BaseHTTPRequestHandler
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance
from qdrant_client.models import Filter, FieldCondition, MatchValue

OLLAMA_HOST   = os.environ.get("OLLAMA_HOST", "http://ollama:11434")
QDRANT_HOST   = os.environ.get("QDRANT_HOST", "http://qdrant-general:6333")
WORKER_URL    = os.environ.get("WORKER_URL", "https://arcanthyr.com")
NEXUS_KEY     = os.environ.get("NEXUS_SECRET_KEY", "")
EMBED_MODEL   = "argus-ai/pplx-embed-context-v1-0.6b:fp32"
COLLECTION    = "general-docs-v2"
CHUNK_SIZE    = 500
CHUNK_OVERLAP = 50
PORT          = 18789

INGEST_JOBS = {}  # job_id -> { status, total_blocks, block_current, chunks_parsed, chunks_inserted, chunks_skipped, errors }

# Court hierarchy for re-ranking (higher = more authoritative)
COURT_HIERARCHY = {
    "cca":         3,
    "fullcourt":   3,
    "supreme":     2,
    "magistrates": 1,
}

def extract_section_references(chunks):
    """Extract section number references from chunk text."""
    refs = set()
    for chunk in chunks:
        text = chunk.get('text', '')
        matches = re.findall(r'\bs\s*(\d+[A-Z]?)(?!\d)\b|\bsection\s+(\d+[A-Z]?)(?!\d)\b', text, re.IGNORECASE)
        for m in matches:
            ref = m[0] or m[1]
            if ref:
                refs.add(ref.upper())
    return [{"section_number": r} for r in refs]


def extract_legal_concepts(query_text):
    """
    Extract key legal concepts from a natural language query for second-pass search.
    Strips question words and common filler to leave searchable legal terms.
    """
    import re
    # Remove common question/filler words
    filler = r'\b(what|is|the|are|how|do|i|when|can|a|an|for|of|in|to|under|make|steps|test|definition|elements|does|my|do|handling|amounting|amounts|object|objecting)\b'
    cleaned = re.sub(filler, '', query_text.lower(), flags=re.IGNORECASE).strip()
    # Collapse whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    # Only use if meaningfully shorter than original
    if len(cleaned) > 5 and cleaned != query_text.lower():
        return cleaned
    return None


def fetch_sections_by_reference(references):
    """Fetch legislation sections from D1 via Worker route."""
    if not references:
        return []
    try:
        resp = requests.post(
            f"{WORKER_URL}/api/pipeline/fetch-sections-by-reference",
            json={"references": references},
            headers={"X-Nexus-Key": NEXUS_KEY},
            timeout=10
        )
        resp.raise_for_status()
        return resp.json().get("sections", [])
    except Exception as e:
        print(f"[!] BM25 fetch error: {e}")
        return []


def fetch_cases_by_legislation_ref(references):
    """Fetch cases from D1 that cite the same legislation sections as the query."""
    if not references:
        return []
    try:
        resp = requests.post(
            f"{WORKER_URL}/api/pipeline/fetch-cases-by-legislation-ref",
            json={"references": references},
            headers={"X-Nexus-Key": NEXUS_KEY},
            timeout=10
        )
        resp.raise_for_status()
        return resp.json().get("cases", [])
    except Exception as e:
        print(f"[!] BM25 case-ref fetch error: {e}")
        return []


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
        "case_name":    body.get("case_name"),
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

def delete_citation(citation):
    """
    Delete all Qdrant vectors for a given citation.
    Used when re-ingesting or fully removing a document.
    """
    if not citation:
        raise ValueError("citation is required")
    client = QdrantClient(url=QDRANT_HOST)
    result = client.delete(
        collection_name=COLLECTION,
        points_selector=Filter(
            must=[FieldCondition(key="citation", match=MatchValue(value=citation))]
        ),
    )
    print(f"[+] Deleted all vectors for citation: {citation} | result: {result}")
    return {"ok": True, "citation": citation}

def delete_type(type_value):
    """
    Delete all Qdrant vectors for a given payload type.
    """
    if not type_value:
        raise ValueError("type is required")
    client = QdrantClient(url=QDRANT_HOST)
    result = client.delete(
        collection_name=COLLECTION,
        points_selector=Filter(
            must=[FieldCondition(key="type", match=MatchValue(value=type_value))]
        ),
    )
    print(f"[+] Deleted all vectors for type: {type_value} | result: {result}")
    return {"ok": True, "type": type_value}

def search_text(body):
    """
    Semantic search against Qdrant.

    Params:
        query_text      - natural language query string (required)
        top_k           - max chunks to return (default 6, max 8)
        score_threshold - minimum cosine similarity (default 0.65)

    Returns list of chunk dicts, re-ranked by court hierarchy where
    scores are within 0.05 of each other.
    """
    query_text      = body.get("query_text", "").strip()
    top_k           = min(int(body.get("top_k", 6)), 8)
    score_threshold = float(body.get("score_threshold", 0.45))

    if not query_text:
        raise ValueError("query_text is required")

    query_vector = embed(query_text)

    client = QdrantClient(url=QDRANT_HOST)

    response = client.query_points(
        collection_name=COLLECTION,
        query=query_vector,
        limit=top_k,
        score_threshold=score_threshold,
        with_payload=True,
    )
    results = response.points

    if not results:
        print(f"[*] Search: no results above threshold {score_threshold} for query: {query_text[:80]}")
        return []

    print(f"[*] Search: {len(results)} chunks above threshold {score_threshold}")

    # Second-pass concept search — extract key legal terms and re-query
    concept_query = extract_legal_concepts(query_text)
    if concept_query and concept_query != query_text:
        concept_vector = embed(concept_query)
        concept_response = client.query_points(
            collection_name=COLLECTION,
            query=concept_vector,
            limit=top_k * 2,
            score_threshold=score_threshold,
            with_payload=True,
        )
        existing_ids = {hit.id for hit in results}
        for hit in concept_response.points:
            if hit.id not in existing_ids:
                results.append(hit)
                existing_ids.add(hit.id)
        print(f"[+] Concept search '{concept_query}': added {len(concept_response.points)} candidates")

    chunks = []
    for hit in results:
        payload = hit.payload or {}
        chunks.append({
            "score":        round(hit.score, 4),
            "citation":     payload.get("citation", "unknown"),
            "court":        payload.get("court", ""),
            "year":         payload.get("year", ""),
            "text":         payload.get("text", ""),
            "summary":      payload.get("summary", ""),
            "outcome":      payload.get("outcome", ""),
            "principles":   payload.get("principles", []),
            "legislation":  payload.get("legislation", []),
            "chunk":        payload.get("chunk", 0),
            "total_chunks": payload.get("total_chunks", 1),
            "type":         payload.get("type", ""),
        })

    # Filter out legislation schedule entries — short legislation sections with no legal reasoning
    chunks = [c for c in chunks if not (c.get("type") == "legislation" and len(c.get("text", "")) < 200)]

    if len(chunks) > 1:
        top_score = chunks[0]["score"]
        def sort_key(c):
            tier  = COURT_HIERARCHY.get(c["court"], 1)
            score = c["score"]
            if (top_score - score) <= 0.05:
                return -(tier * 100 + score * 100)
            return -score * 100
        chunks.sort(key=sort_key)
        # Cap final results — allow more when concept search has added candidates
        chunks = chunks[:top_k]

    print(f"[+] Returning {len(chunks)} chunks after re-ranking")

    # BM25 — fetch sections referenced in query text only (not chunks, to avoid cascade noise)
    query_refs = extract_section_references([{"text": query_text}])
    refs = [{"section_number": r["section_number"]} for r in query_refs]
    if refs:
        extra_sections = fetch_sections_by_reference(refs)
        existing_ids = {c.get('section_id') or c.get('citation') for c in chunks}
        added = 0
        for s in extra_sections:
            if s['id'] not in existing_ids:
                chunks.append({
                    "score":          0.0,
                    "citation":       s.get('leg_title') and f"{s['leg_title']} s {s['section_number']}" or s.get('chunk_id') or s.get('id', 'unknown'),
                    "court":          "",
                    "year":           "",
                    "text":           s['text'] or '',
                    "summary":        "",
                    "outcome":        "",
                    "principles":     [],
                    "legislation":    [],
                    "chunk":          0,
                    "total_chunks":   1,
                    "section_number": s['section_number'],
                    "heading":        s['heading'] or '',
                    "leg_title":      s['leg_title'] or '',
                    "bm25":           True
                })
                added += 1
        print(f"[+] BM25: added {added} referenced sections")

    # BM25 case-law layer — fetch cases citing same legislation sections
    if refs:
        extra_cases = fetch_cases_by_legislation_ref(refs)
        added_cases = 0
        for c in extra_cases:
            citation = c.get('citation', '')
            if citation and citation not in existing_ids:
                existing_ids.add(citation)
                chunks.append({
                    "score":          0.0,
                    "citation":       citation,
                    "case_name":      c.get('case_name', ''),
                    "court":          c.get('court', ''),
                    "year":           (c.get('case_date') or '')[:4],
                    "text":           c.get('holding') or '',
                    "summary":        "",
                    "outcome":        "",
                    "principles":     [],
                    "legislation":    [],
                    "chunk":          0,
                    "total_chunks":   1,
                    "section_number": "",
                    "heading":        "",
                    "leg_title":      "",
                    "bm25":           True,
                    "bm25_source":    "case_legislation_ref"
                })
                added_cases += 1
        print(f"[+] BM25 cases: added {added_cases} cases citing referenced legislation")

    # ── Case chunk second-pass retrieval ────────────────────────────────────
    # Only runs when query references a specific case — prevents false positives
    # at scale as case corpus grows.
    import re as _re
    _citation_pattern = _re.compile(
        r'\[\d{4}\]\s*(TASSC|TASCCA|TASFC|TASMC|HCA|FCAFC|FCA|VSC|NSWSC)\s*\d+',
        _re.IGNORECASE
    )
    _case_keywords = ['v ', ' v. ']
    _query_lower = query_text.lower()
    _case_query_detected = (
        bool(_citation_pattern.search(query_text)) or
        any(kw in _query_lower for kw in _case_keywords)
    )
    if not _case_query_detected:
        print(f"[*] Case chunk pass skipped — no case reference detected in query")
    else:
        try:
            case_chunk_response = client.query_points(
                collection_name=COLLECTION,
                query=query_vector,
                query_filter=Filter(
                    must=[FieldCondition(key="type", match=MatchValue(value="case_chunk"))]
                ),
                limit=4,
                score_threshold=0.15,
                with_payload=True,
            )
            existing_ids = {c.get("_id") for c in chunks if "_id" in c}
            added_case_chunks = 0
            for hit in case_chunk_response.points:
                payload = hit.payload or {}
                chunk_id = payload.get("chunk_id", "")
                if chunk_id and chunk_id in existing_ids:
                    continue
                chunks.append({
                    "score":        round(hit.score, 4),
                    "citation":     payload.get("citation", "unknown"),
                    "case_name":    payload.get("case_name", ""),
                    "court":        payload.get("court", ""),
                    "year":         payload.get("year", ""),
                    "text":         payload.get("text", ""),
                    "summary":      payload.get("summary", ""),
                    "outcome":      payload.get("outcome", ""),
                    "principles":   payload.get("principles", []),
                    "legislation":  payload.get("legislation", []),
                    "chunk":        payload.get("chunk_index", 0),
                    "total_chunks": payload.get("total_chunks", 1),
                    "type":         "case_chunk",
                    "_id":          chunk_id,
                })
                existing_ids.add(chunk_id)
                added_case_chunks += 1
            if added_case_chunks:
                print(f"[+] Case chunk pass: added {added_case_chunks} case chunks (threshold 0.15)")
        except Exception as e:
            print(f"[!] Case chunk pass error: {e}")
    # ── End case chunk pass ─────────────────────────────────────────────────

    return chunks

def query_qwen(body):
    """
    Semantic search + Qwen3 inference in a single call.

    Params:
        query_text      - natural language query string (required)
        top_k           - max chunks to return (default 6, max 8)
        score_threshold - minimum cosine similarity (default 0.65)

    Returns: { answer, chunks, count }
    """
    query_text      = body.get("query_text", "").strip()
    top_k           = min(int(body.get("top_k", 6)), 8)
    score_threshold = float(body.get("score_threshold", 0.45))

    if not query_text:
        raise ValueError("query_text is required")

    chunks = search_text({
        "query_text":      query_text,
        "top_k":           top_k,
        "score_threshold": score_threshold,
    })

    if not chunks:
        return {
            "answer": "No sufficiently relevant cases were found in the database for that query. Try rephrasing, or the relevant cases may not yet be ingested.",
            "chunks": [],
            "count":  0,
        }

    # Build context blocks — same format as Worker handleLegalQuery
    context_blocks = []
    for i, c in enumerate(chunks):
        principles = c.get("principles", [])
        principle_line = ""
        if isinstance(principles, list) and principles:
            principle_line = f"\nKey principles: {'; '.join(str(p) for p in principles[:3])}"
        court = (c.get("court") or "Unknown court").upper()
        year  = c.get("year") or "?"
        context_blocks.append(
            f"[{i+1}] {c['citation']} ({court}, {year})\n{c['text']}{principle_line}"
        )
    context = "\n\n---\n\n".join(context_blocks)

    system_prompt = (
        "You are a Tasmanian criminal law research assistant. "
        "Answer questions using the provided excerpts, which may include raw judgment text, synthesised doctrine, or legislation. "
        "Be precise and cite specific cases. "
        "When excerpts contain raw judgment text, reason from and synthesise what is there — do not refuse to answer simply because the text lacks a clean doctrinal statement. "
        "Only say the material is insufficient if the excerpts are genuinely silent on the topic. "
        "Format your answer in plain prose — no markdown headers, no bullet points unless listing cases."
    )

    user_prompt = (
        f"Question: {query_text}\n\n"
        f"Relevant case excerpts:\n\n{context}\n\n"
        f"Answer the question based on these excerpts. "
        f"Cite the case citation (e.g. [2024] TASSC 42) when you rely on a specific case."
    )

    # Use Qwen3 native chat template via /api/generate
    # think:false not reliably honoured, so we strip <think> blocks from output
    prompt = (
        f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
        f"<|im_start|>user\n{user_prompt}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )

    r = requests.post(
        f"{OLLAMA_HOST}/api/generate",
        json={
            "model":  "qwen3:4b",
            "stream": False,
            "prompt": prompt,
        },
        timeout=120,
    )
    r.raise_for_status()
    raw_answer = r.json().get("response", "No response from model.").strip()

    # Strip thinking block if present
    answer = re.sub(r'<think>.*?</think>', '', raw_answer, flags=re.DOTALL).strip()
    if not answer:
        answer = raw_answer

    print(f"[+] Qwen3 query answered: {len(answer)} chars")
    return {"answer": answer, "chunks": chunks, "count": len(chunks)}

def extract_pdf_text(pdf_bytes):
    """
    Extract text from PDF using pdfminer layout analysis.
    Handles multi-column legislation PDFs by sorting text elements
    top-to-bottom within detected columns rather than reading across.
    """
    try:
        from pdfminer.high_level import extract_pages
        from pdfminer.layout import LTTextContainer, LAParams

        laparams = LAParams(
            line_overlap=0.5,
            char_margin=2.0,
            line_margin=0.5,
            word_margin=0.1,
            boxes_flow=None,   # None = disable multi-column detection, sort purely top→bottom
            detect_vertical=False,
        )

        pages_text = []
        for page_layout in extract_pages(io.BytesIO(pdf_bytes), laparams=laparams):
            # Collect all text boxes with their vertical position
            boxes = []
            for element in page_layout:
                if isinstance(element, LTTextContainer):
                    text = element.get_text().strip()
                    if text:
                        boxes.append((element.y1, element.x0, text))

            # Sort top-to-bottom (y1 descending), then left-to-right within same row
            boxes.sort(key=lambda b: (-b[0], b[1]))
            pages_text.append("\n".join(t for _, _, t in boxes))

        raw = "\n\n".join(pages_text)

        # Clean up hyphenated line breaks from column layout
        raw = re.sub(r'-\s*\n\s*', '', raw)
        # Collapse excessive whitespace
        raw = re.sub(r'\n{3,}', '\n\n', raw)
        raw = re.sub(r'[ \t]+', ' ', raw)

        return raw

    except ImportError:
        raise Exception("pdfminer.six not installed. Run: pip install pdfminer.six")
    except Exception as e:
        print(f"[!] PDF extraction error: {type(e).__name__}: {e}")
        raise

def extract_pdf_text_ocr(pdf_bytes):
    """
    Extract text from PDF with automatic OCR fallback.
    First tries pdfminer. If yield is too low (scanned PDF),
    falls back to pdf2image + pytesseract OCR.
    Returns dict: { text, chars, ocr_used }
    """
    # Try pdfminer first
    try:
        text = extract_pdf_text(pdf_bytes)
    except Exception as e:
        print(f"[!] pdfminer failed, falling back to OCR: {e}")
        text = ""

    # Estimate pages to judge yield
    try:
        from pdfminer.high_level import extract_pages
        from pdfminer.layout import LAParams
        page_count = sum(1 for _ in extract_pages(io.BytesIO(pdf_bytes), laparams=LAParams()))
    except Exception:
        page_count = max(1, len(pdf_bytes) // 50000)  # rough estimate

    chars_per_page = len(text) / max(page_count, 1)
    print(f"[*] PDF: {page_count} pages, {len(text)} chars, {chars_per_page:.0f} chars/page")

    if chars_per_page >= 300:
        print(f"[+] pdfminer sufficient, skipping OCR")
        return {"text": text, "chars": len(text), "ocr_used": False}

    # Fall back to OCR
    print(f"[*] Low text yield ({chars_per_page:.0f} chars/page), running OCR...")
    try:
        import pytesseract
        from pdf2image import convert_from_bytes
        from PIL import Image

        images = convert_from_bytes(pdf_bytes, dpi=300)
        ocr_pages = []
        for i, img in enumerate(images):
            page_text = pytesseract.image_to_string(img, lang='eng')
            ocr_pages.append(page_text)
            print(f"[*] OCR page {i+1}/{len(images)}: {len(page_text)} chars")

        ocr_text = "\n\n".join(ocr_pages)
        # Clean up common OCR artifacts
        ocr_text = re.sub(r'\n{3,}', '\n\n', ocr_text)
        ocr_text = re.sub(r'[ \t]+', ' ', ocr_text)
        print(f"[+] OCR complete: {len(ocr_text)} chars from {len(images)} pages")
        return {"text": ocr_text, "chars": len(ocr_text), "ocr_used": True}

    except Exception as e:
        print(f"[!] OCR failed: {e}")
        raise Exception(f"Both pdfminer and OCR failed. pdfminer yielded {len(text)} chars. OCR error: {e}")

def extract_text_from_file(file_bytes, filename):
    """Extract plain text from PDF, DOCX, or RTF. Returns (text, error)."""
    fname = filename.lower()

    if fname.endswith(".pdf"):
        from pdfminer.high_level import extract_text as pdf_extract
        import io
        try:
            text = pdf_extract(io.BytesIO(file_bytes))
            return text, None
        except Exception as e:
            return None, f"PDF extraction failed: {e}"

    elif fname.endswith(".docx"):
        try:
            import docx as python_docx
        except ImportError:
            return None, "python-docx not installed. Run: pip install python-docx --break-system-packages"
        try:
            import io
            doc = python_docx.Document(io.BytesIO(file_bytes))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            return text, None
        except Exception as e:
            return None, f"DOCX extraction failed: {e}"

    elif fname.endswith(".rtf"):
        try:
            from striprtf.striprtf import rtf_to_text
        except ImportError:
            return None, "striprtf not installed. Run: pip install striprtf --break-system-packages"
        try:
            text = rtf_to_text(file_bytes.decode("utf-8", errors="ignore"))
            return text, None
        except Exception as e:
            return None, f"RTF extraction failed: {e}"

    elif fname.endswith(".md") or fname.endswith(".txt"):
        try:
            return file_bytes.decode("utf-8", errors="ignore"), None
        except Exception as e:
            return None, f"Text decode failed: {e}"

    else:
        return None, f"Unsupported file type: {filename}. Supported: PDF, DOCX, RTF, MD, TXT"


def split_into_blocks(text, target_words=3000, min_words=2000, max_words=3500):
    """Split text into blocks at heading boundaries, respecting word limits."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    sections = re.split(r'(?=\n#{1,3} )', text)
    sections = [s.strip() for s in sections if s.strip()]

    def word_count(s):
        return len(s.split())

    blocks = []
    current_block = []
    current_count = 0

    for section in sections:
        wc = word_count(section)

        if wc > max_words:
            if current_block:
                blocks.append("\n\n".join(current_block))
                current_block = []
                current_count = 0
            blocks.append(section)
            continue

        if current_count + wc > max_words:
            if current_count >= min_words:
                blocks.append("\n\n".join(current_block))
                current_block = [section]
                current_count = wc
            else:
                current_block.append(section)
                current_count += wc
        else:
            current_block.append(section)
            current_count += wc

    if current_block:
        blocks.append("\n\n".join(current_block))

    merged = []
    for block in blocks:
        if merged and word_count(block) < min_words:
            merged[-1] = merged[-1] + "\n\n" + block
        else:
            merged.append(block)

    return merged


MASTER_PROMPT = """You are processing ONE PART of a large legal research document for ingestion into a vector search and AI retrieval system.

The source material contains mixed personal notes and commentary on Tasmanian criminal law, including legislation, legal concepts, doctrinal analysis, evidentiary principles, sentencing principles, and case references.

If output budget becomes constrained, prioritise in this order:
1. Complete formatted chunks
2. Coverage report
3. Validation report
4. Deduplication report

Never truncate the formatted chunk set.

Your task is to perform ALL of the following in a single pass on the uploaded part only:
1. FORMAT the source into semantically clean, self-contained retrieval chunks.
2. VERIFY COVERAGE by checking whether any substantive legal content in the source part was omitted.
3. VALIDATE STRUCTURE by checking the formatted output against the structural and metadata rules below.

Do not summarise or omit substantive legal analysis. Work only on the uploaded part. Do not rely on prior or later parts. Do not ask for confirmation. Output in Markdown only.

SOURCE INDEX PASS

Before producing any formatted chunks, perform a SOURCE INDEX PASS. Scan the uploaded source block and identify every distinct doctrinal unit present (statutory provisions, offence definitions, elements of offences, defences, evidentiary rules, sentencing principles, procedural rules, interpretive doctrines, case authorities).

Case Authority Detection: detect all case citations ([YYYY] TASSC, [YYYY] TASCCA, [YYYY] HCA, R v, DPP v). Each detected authority must become a case authority chunk.

Create a list titled: ## SOURCE DOCTRINAL UNITS

PRIMARY OBJECTIVE

Convert the uploaded source part into semantically clean, self-contained chunks optimised for vector retrieval. Each chunk must be fully understandable in isolation.

FORMATTING RULES

HEADING STRUCTURE: Use three heading levels only.
Level 1 — Major Act or major doctrinal topic.
Level 2 — Specific statutory provision or major legal concept.
Level 3 — Sub-rule or analytical component.

RULE ISOLATION: Each chunk must describe only one legal rule, definition, doctrinal test, evidentiary rule, sentencing principle, procedural rule, interpretive principle, or analytical principle.

METADATA MARKERS: Immediately below every Level 2 or Level 3 heading include:
[DOMAIN: Tasmanian Criminal Law]
[ACT: full Act name]
[SECTION: section number]
[CITATION: full legislative citation]
[TYPE: offence / element of offence / defence / statutory definition / legal doctrine / evidentiary rule / sentencing principle / procedural rule / interpretive principle / case authority]
[CASE: full case citation]
[TOPIC: concise legal topic]
[CONCEPTS: 5-10 supported keywords or search phrases]

Minimum required for every chunk: [DOMAIN:] [TYPE:] [TOPIC:] [CONCEPTS:]
If legislation is analysed also require: [ACT:] [CITATION:]
If case authority is analysed also require: [CASE:]

CHUNK STRUCTURE: Heading / Metadata markers / Prose explanation. Each chunk must stand alone. Remove all cross-references (see above / see below / as discussed / refer to) — rewrite as complete standalone explanations.

CONCEPT ANCHOR RULE: The first sentence of each chunk must clearly state the rule or legal concept being explained.

CHUNK LENGTH: Target 150-350 words. Hard maximum 450 words. Split oversized chunks with semantic headings — never use (cont.) or continued.

LISTS AND ELEMENTS: Use numbered lists for elements of offences, statutory tests, multi-factor standards. Use prose for commentary.

CITATIONS: Normalise — Legislation: Criminal Code Act 1924 (Tas) s 156. Cases: [2024] TASSC 24. Never abbreviate Act names.

CASE AUTHORITY BLOCKS: When a case is cited, create a separate authority chunk: ### Authority — [short description of rule]. Include [TYPE: case authority] [CASE: full citation].

TABLES: Convert to prose unless comparing multiple legal rules across 3+ attributes.

CLEANING RULES: Remove page numbers, headers, footers, redundant whitespace, duplicate content, cross-references.

COVERAGE VERIFICATION: After formatting, identify any substantive legal material in the source not appearing in the formatted output. List under [UNPROCESSED].

STRUCTURAL VALIDATION: Check all 12 rules. Only report checks where an issue exists.

MANDATORY OUTPUT FORMAT:
# PART OUTPUT
## SOURCE DOCTRINAL UNITS
[List of all doctrinal units identified.]
## FORMATTED CHUNKS
[Full formatted Markdown chunk set.]
## SOURCE TOPICS IDENTIFIED
[List all major headings, topics, doctrines, statutory provisions, and authorities.]
## COVERAGE REPORT
Either: "No substantive omissions detected in this part."
Or: [UNPROCESSED] list.
## VALIDATION REPORT
For each issue: Check number / Heading / Quoted text (first 50 words) / Explanation
## DEDUPLICATION REPORT
Either: "No substantive duplicates detected."
Or: list duplicates.
## FINAL STATUS
State one of: READY FOR APPEND TO MASTER FILE / READY FOR APPEND WITH MINOR REVIEW / NEEDS REVISION BEFORE APPEND"""


PROCEDURE_PROMPT = """You are processing ONE PART of a legal practitioner's working document for ingestion into a vector search and AI retrieval system.

The source material contains practitioner-authored content including tactical workflows, scripted examination questions, in-court procedural sequences, annotated submissions, and practitioner commentary on Tasmanian criminal law.

Your task is to perform ALL of the following in a single pass on the uploaded part only:
1. FORMAT the source into structured, self-contained retrieval chunks.
2. VERIFY COVERAGE by checking whether any substantive content was omitted.
3. VALIDATE STRUCTURE against the rules below.

Do not summarise or sanitise informal language. Do not convert procedural content to formal prose. Preserve all content exactly as written, including informal asides, personal annotations, and colloquial expressions. Work only on the uploaded part. Do not ask for confirmation. Output in Markdown only.

SOURCE INDEX PASS

Scan the source and identify every distinct procedural unit (tactical workflows, step-by-step sequences, scripted examination questions, scripted submissions, in-court notes, annotated legislation, practitioner commentary, case authority). Every identified unit must produce at least one chunk.

Create a list titled: ## SOURCE PROCEDURAL UNITS

PRIMARY OBJECTIVE

Convert the uploaded source into structured, self-contained retrieval chunks that preserve the practitioner voice, tactical detail, and exact scripted language of the original. Formal rewriting is prohibited.

CHUNK TYPES: procedure / checklist / script / annotation / case authority / legal doctrine

METADATA MARKERS:
[DOMAIN: Tasmanian Criminal Law]
[ACT: full Act name]
[SECTION: section number]
[CITATION: descriptive identifier — e.g. "Evidence Act 2001 (Tas) s 38 — Tactical Workflow"]
[CATEGORY: procedure]
[TYPE: procedure / checklist / script / annotation / case authority / legal doctrine]
[TOPIC: concise description]
[CONCEPTS: 5-10 keywords including plain-language practitioner search terms]

Minimum required: [DOMAIN:] [CATEGORY:] [TYPE:] [TOPIC:] [CONCEPTS:]

CHUNK STRUCTURE: Heading / Metadata markers / Content. Preserve step sequences as numbered lists. Preserve scripted questions exactly. Preserve informal language and first-person voice. Each chunk must stand alone.

CONCEPT ANCHOR RULE: First line of content must state what the chunk covers.

CHUNK LENGTH: Target 150-500 words. Do not split a scripted question sequence mid-sequence. Split at logical phase boundaries only.

CITATION FIELD: Must be unique per chunk. Use descriptive format.

COVERAGE VERIFICATION: Flag any content in the source absent from the output under [UNPROCESSED].

STRUCTURAL VALIDATION:
CHECK 1 — CONTENT PRESERVATION: flag any chunk where informal language or scripted content appears rewritten into formal prose.
CHECK 2 — CITATION UNIQUENESS: flag duplicate [CITATION:] values.
CHECK 3 — COVERAGE: flag any procedural unit from the SOURCE INDEX PASS absent from output.
CHECK 4 — METADATA COMPLETENESS: flag chunks missing required fields.
CHECK 5 — CONCEPTS QUALITY: flag [CONCEPTS:] with fewer than 5 terms.

MANDATORY OUTPUT FORMAT:
# PART OUTPUT
## SOURCE PROCEDURAL UNITS
[List of all procedural units identified.]
## FORMATTED CHUNKS
[Full formatted chunk set.]
## COVERAGE REPORT
Either: "No substantive omissions detected."
Or: [UNPROCESSED] list.
## VALIDATION REPORT
For each issue: Check number / Heading / Explanation.
## FINAL STATUS
State one of: READY FOR APPEND TO MASTER FILE / READY FOR APPEND WITH MINOR REVIEW / NEEDS REVISION BEFORE APPEND"""


def call_gpt_mini(block_text, prompt_mode="master"):
    """Send a block to GPT-4o-mini and return the raw response text."""
    import urllib.request

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")

    system_prompt = MASTER_PROMPT if prompt_mode == "master" else PROCEDURE_PROMPT

    payload = json.dumps({
        "model": "gpt-4o-mini",
        "max_completion_tokens": 8000,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": block_text}
        ]
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        },
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    return data["choices"][0]["message"]["content"]


def parse_formatted_chunks(gpt_output):
    """Extract the ## FORMATTED CHUNKS section from GPT output."""
    match = re.search(
        r'## FORMATTED CHUNKS\s*\n(.*?)(?=\n## [A-Z]|\Z)',
        gpt_output,
        re.DOTALL
    )
    if not match:
        return None
    return match.group(1).strip()


def split_chunks_from_markdown(formatted_text, source_name):
    """Split the FORMATTED CHUNKS markdown into individual chunk dicts for D1 insert."""
    chunks = []
    parts = re.split(r'\n(?=#{2,3} )', formatted_text)

    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue

        heading_match = re.match(r'^(#{2,3})\s+(.+)', part)
        heading = heading_match.group(2).strip() if heading_match else f"Chunk {i+1}"

        citation_match = re.search(r'\[CITATION:\s*(.+?)\]', part)
        citation = citation_match.group(1).strip() if citation_match else None

        category_match = re.search(r'\[CATEGORY:\s*(.+?)\]', part)
        category = category_match.group(1).strip() if category_match else "doctrine"

        type_match = re.search(r'\[TYPE:\s*(.+?)\]', part)
        doc_type = type_match.group(1).strip() if type_match else "legal doctrine"

        if not citation:
            slug = re.sub(r'[^a-zA-Z0-9]+', '_', heading).strip('_')[:60]
            citation = f"{source_name}_chunk_{i+1:04d}_{slug}"
        else:
            slug = re.sub(r'[^a-zA-Z0-9]+', '_', citation).strip('_')[:80]
            citation = f"{source_name}_{slug}"

        chunks.append({
            "text":     part,
            "citation": citation,
            "source":   source_name,
            "category": category,
            "doc_type": doc_type,
        })

    return chunks


def post_chunk_to_worker(chunk, worker_url, nexus_key):
    """POST a single chunk to the Worker upload-corpus endpoint."""
    import urllib.request

    payload = json.dumps({
        "text":     base64.b64encode(chunk["text"].encode("utf-8")).decode("ascii"),
        "citation": chunk["citation"],
        "source":   chunk["source"],
        "category": chunk["category"],
        "doc_type": chunk["doc_type"],
        "encoding": "base64",
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{worker_url}/api/legal/upload-corpus",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; Arcanthyr/1.0)",
        },
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_ingest_job(job_id, file_bytes, filename, prompt_mode, worker_url, nexus_key):
    """Background thread: extract → split → enrich via GPT → insert into D1."""
    job = INGEST_JOBS[job_id]

    try:
        job["status"] = "extracting"
        text, err = extract_text_from_file(file_bytes, filename)
        if err:
            job["status"] = "failed"
            job["error"] = err
            return

        job["status"] = "splitting"
        blocks = split_into_blocks(text)
        job["total_blocks"] = len(blocks)
        print(f"[process-document] job={job_id} blocks={len(blocks)} file={filename}")

        job["status"] = "enriching"
        source_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', filename.rsplit('.', 1)[0])[:60]
        all_chunks = []

        for i, block in enumerate(blocks):
            job["block_current"] = i + 1
            try:
                gpt_output = call_gpt_mini(block, prompt_mode)
                formatted = parse_formatted_chunks(gpt_output)
                if formatted:
                    chunks = split_chunks_from_markdown(formatted, source_name)
                    all_chunks.extend(chunks)
                    job["chunks_parsed"] = len(all_chunks)
                else:
                    job["errors"].append(f"Block {i+1}: no FORMATTED CHUNKS section in GPT output")
            except Exception as e:
                job["errors"].append(f"Block {i+1}: GPT call failed — {e}")

            time.sleep(1.5)

        job["total_chunks"] = len(all_chunks)

        job["status"] = "inserting"
        inserted = 0
        skipped = 0

        for chunk in all_chunks:
            try:
                result = post_chunk_to_worker(chunk, worker_url, nexus_key)
                if result.get("ok") or result.get("success"):
                    inserted += 1
                else:
                    skipped += 1
                job["chunks_inserted"] = inserted
                job["chunks_skipped"] = skipped
            except Exception as e:
                job["errors"].append(f"Insert failed for {chunk['citation']}: {e}")

        job["status"] = "complete"
        job["chunks_inserted"] = inserted
        job["chunks_skipped"] = skipped
        print(f"[process-document] job={job_id} complete — inserted={inserted} skipped={skipped} errors={len(job['errors'])}")

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        print(f"[process-document] job={job_id} failed — {e}")


def process_document(body, worker_url, nexus_key):
    """
    POST /process-document
    Body fields:
      file_b64   : base64-encoded file bytes (required)
      filename   : original filename with extension (required)
      prompt_mode: "master" | "procedure" | "both" (default: "master")
    Returns: { job_id, status, filename, prompt_mode }
    """
    file_b64    = body.get("file_b64", "").strip()
    filename    = body.get("filename", "").strip()
    prompt_mode = body.get("prompt_mode", "master").strip().lower()

    if not file_b64:
        return 400, {"error": "file_b64 field required"}
    if not filename:
        return 400, {"error": "filename field required"}
    if prompt_mode not in ("master", "procedure", "both"):
        return 400, {"error": "prompt_mode must be master, procedure, or both"}

    try:
        file_bytes = base64.b64decode(file_b64)
    except Exception as e:
        return 400, {"error": f"Invalid base64 in file_b64: {e}"}

    job_id = str(uuid.uuid4())[:8]
    INGEST_JOBS[job_id] = {
        "status":          "queued",
        "filename":        filename,
        "prompt_mode":     prompt_mode,
        "total_blocks":    None,
        "block_current":   0,
        "chunks_parsed":   0,
        "chunks_inserted": 0,
        "chunks_skipped":  0,
        "errors":          [],
        "error":           None,
    }

    effective_mode = "master" if prompt_mode == "both" else prompt_mode
    if prompt_mode == "both":
        INGEST_JOBS[job_id]["note"] = "both mode: running master prompt only in v1. Procedure pass not yet implemented."

    t = threading.Thread(
        target=run_ingest_job,
        args=(job_id, file_bytes, filename, effective_mode, worker_url, nexus_key),
        daemon=True
    )
    t.start()

    return 200, {
        "ok":          True,
        "job_id":      job_id,
        "status":      "queued",
        "filename":    filename,
        "prompt_mode": prompt_mode,
    }


def get_ingest_status(job_id):
    """
    GET /ingest-status/<job_id>
    Returns current job state.
    """
    if not job_id:
        return 400, {"error": "job_id required"}
    job = INGEST_JOBS.get(job_id)
    if not job:
        return 404, {"error": f"Job {job_id} not found"}
    return 200, {"job_id": job_id, **job}


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
        elif self.path.startswith("/ingest-status/"):
            job_id = self.path.replace("/ingest-status/", "").strip("/")
            status, result = get_ingest_status(job_id)
            self.send_json(status, result)
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

        elif self.path == "/query":
            # Semantic search + Qwen3 inference — single call, returns grounded answer.
            if not self.check_auth(): return
            body = self.read_body()
            try:
                result = query_qwen(body)
                self.send_json(200, {"ok": True, **result})
            except ValueError as e:
                self.send_json(400, {"error": str(e)})
            except Exception as e:
                print(f"[!] Query error: {e}")
                self.send_json(500, {"error": str(e)})

        elif self.path == "/extract-pdf":
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

        elif self.path == "/extract-pdf-ocr":
            if not self.check_auth(): return
            body = self.read_body()
            pdf_b64 = body.get("pdf_base64", "")
            if not pdf_b64:
                self.send_json(400, {"error": "pdf_base64 field required"})
                return
            try:
                pdf_bytes = base64.b64decode(pdf_b64)
                result = extract_pdf_text_ocr(pdf_bytes)
                print(f"[+] PDF extracted: {result['chars']} chars (ocr_used={result['ocr_used']})")
                self.send_json(200, {"ok": True, "text": result["text"], "chars": result["chars"], "ocr_used": result["ocr_used"]})
            except Exception as e:
                print(f"[!] PDF OCR extraction error: {e}")
                self.send_json(500, {"error": str(e)})

        elif self.path == "/delete":
            if not self.check_auth(): return
            body = self.read_body()
            citation = body.get("citation", "").strip()
            if not citation:
                self.send_json(400, {"error": "citation field required"})
                return
            try:
                result = delete_citation(citation)
                self.send_json(200, result)
            except Exception as e:
                print(f"[!] Delete error: {e}")
                self.send_json(500, {"error": str(e)})

        elif self.path == "/delete-by-type":
            if not self.check_auth(): return
            body = self.read_body()
            type_value = body.get("type", "").strip()
            if not type_value:
                self.send_json(400, {"error": "type field required"})
                return
            try:
                result = delete_type(type_value)
                self.send_json(200, result)
            except Exception as e:
                print(f"[!] Delete-by-type error: {e}")
                self.send_json(500, {"error": str(e)})

        elif self.path == "/process-document":
            if not self.check_auth(): return
            body = self.read_body()
            WORKER_URL = os.environ.get("WORKER_URL", "https://arcanthyr.com")
            NEXUS_KEY  = os.environ.get("NEXUS_SECRET_KEY", "")
            status, result = process_document(body, WORKER_URL, NEXUS_KEY)
            self.send_json(status, result)

        else:
            self.send_json(404, {"error": "not found"})

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Nexus ingest server running on port {PORT}")
    server.serve_forever()
