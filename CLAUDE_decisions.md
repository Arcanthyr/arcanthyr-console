# CLAUDE_decisions.md

Architectural decisions, rationale, dead ends, and lessons learned
extracted from Claude.ai conversation export (Feb–Mar 2026).
Supplement to CLAUDE.md and CLAUDE_arch.md — focuses on *why*, not *what*.

---

## Vector Search & Embeddings

**[2026-03-11]** *RAG workflow plan issues* — score 5, human

> explain this more "For the web console to work reliably from anywhere, the embed step needs to be decoupled from the upload entirely. The cleanest version is what's in your CLAUDE.md future roadmap — an `embedded` flag on each D1 row. The upload just writes to D1 and sets `embedded = 0`. A separate background process on the VPS polls D1 for rows where `embedded = 0`, embeds them in manageable batches, and updates the flag when done." so the worker collects the file uplaode from the console. takes it to CF and houses it in the DB. once it's done it then sends the data via the CF tunnel to the vps for embedding with pplx-embed (which is hosted on my VPS?) and then the vector data from the embe…

## VPS / server.py

**[2026-03-11]** *RAG workflow plan issues* — score 5, assistant

> **The fix is already written in your CLAUDE.md** — SSH tunnel Option A, redirect the embed call to `localhost:18789`, bypass Cloudflare entirely for the bulk embed run. D1 write stays via Worker as normal. That's the right call.

---

*2 passages from 135 conversations.*
