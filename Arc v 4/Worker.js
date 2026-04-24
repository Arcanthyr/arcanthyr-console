/* =============================================================
   ARCANTHYR — Cloudflare Worker  v7
   CHANGES FROM v6:
     - raw_text column: full scraped text now stored permanently in D1
       so summaries can be regenerated without re-scraping
     - fetch-page proxy endpoint: routes AustLII requests through
       Cloudflare edge IPs, allowing VPS scraper to bypass IP block
     - saveCaseToDb: saves raw_text alongside extracted fields
     - processCaseUpload: passes raw text through to DB
   ============================================================= */
console.log('Worker v7 loaded successfully');

const _ratemap = new Map();

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const record = _ratemap.get(key);
  if (!record || now - record.ts > windowMs) {
    _ratemap.set(key, { count: 1, ts: now });
    return true;
  }
  record.count += 1;
  if (record.count > max) return false;
  return true;
}

/* =============================================================
   JWT UTILITIES (Web Crypto — no npm required)
   ============================================================= */
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

async function signJWT(payload, secret) {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body   = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const data   = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

async function verifyJWT(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const sigBytes = Uint8Array.from(b64urlDecode(sig), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${header}.${payload}`));
  if (!valid) return null;
  const parsed = JSON.parse(b64urlDecode(payload));
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

function getTokenFromRequest(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/arc_token=([^;]+)/);
  return match ? match[1] : null;
}

/* =============================================================
   WORKERS AI HELPER
   ============================================================= */
const WORKERS_AI_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

const procedurePassPrompt = `You are reviewing a Tasmanian court judgment for in-court procedural content relevant to criminal law practitioners.

Extract any of the following if present:
- Voir dire proceedings (how conducted, what evidence taken, ruling made)
- Evidence admissibility rulings (the sequence of objection, argument, and determination)
- Hostile witness applications under s 38 Evidence Act 2001 (Tas)
- Tendency or coincidence evidence rulings (how the application was made and determined)
- Contested facts hearings at sentencing
- Any other in-court procedural sequence described in enough detail to be useful to a practitioner

For each item found, output a Markdown chunk with:
- A heading describing the procedure (e.g. ## Voir Dire — Admissibility of Record of Interview)
- The sequence of steps as they occurred, in plain language
- The outcome/ruling
- Any practical notes a practitioner would find useful (e.g. what arguments succeeded, what the judge required)

Metadata below each heading:
[CATEGORY: procedure]
[TYPE: voir dire / admissibility ruling / hostile witness / tendency evidence / contested facts / procedural sequence]
[TOPIC: one-line description]
[CONCEPTS: 5-8 plain-language search terms a practitioner would use]

If the judgment contains no such content, output exactly: NO PROCEDURE CONTENT

Output only the Markdown chunks or NO PROCEDURE CONTENT. No preamble, no commentary.`;

async function callWorkersAI(env, systemPrompt, userContent, maxTokens = 4000) {
  const result = await env.AI.run(WORKERS_AI_MODEL, {
    max_tokens: maxTokens,
    budget_tokens: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  // DEBUG — remove after first confirmed working upload
  console.log("WorkersAI raw result:", JSON.stringify(result, null, 2));

  if (result?.error) {
    throw new Error(`Workers AI error: ${result.error} (code: ${result.code ?? 'unknown'})`);
  }
  if (result?.code === 4006) {
    throw new Error(`Workers AI neuron cap exceeded (4006)`);
  }

  const raw = (
    result?.choices?.[0]?.message?.content?.trim() ||
    result?.choices?.[0]?.message?.reasoning_content?.trim() ||
    result?.choices?.[0]?.text?.trim() ||
    result?.response?.trim() ||
    ""
  );

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : raw;
}

/* =============================================================
   EMAIL FUNCTIONS (Resend API)
   ============================================================= */
async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || "arcanthyr@yourdomain.com",
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });

  if (!response.ok) throw new Error(`Resend API error: ${await response.text()}`);
  return await response.json();
}

async function handleShare(body, env) {
  const { to, subject, researchSummary, note } = body || {};
  if (!to || !subject) throw new Error("to and subject are required");
  const noteHtml = note ? `<p style="color:#555;font-style:italic">${note}</p>` : '';
  const html = `<h2>${subject}</h2>${noteHtml}<hr/><pre style="font-family:serif;white-space:pre-wrap">${researchSummary || ''}</pre><p style="color:#999;font-size:12px">Sent via Arcanthyr</p>`;
  await sendEmail(env, to, subject, html);
  return { ok: true };
}

/* =============================================================
   AUSTLII SCRAPER FUNCTIONS
   ============================================================= */
const AUSTLII_COURTS = {
  magistrates: "TAMagC",
  supreme: "TASSC",
  cca: "TASCCA",
  fullcourt: "TASFC",
};

async function fetchRecentAustLIICases(env, limit = 50) {
  const currentYear = new Date().getFullYear();
  const allNewCases = [];

  for (const [courtName, courtAbbrev] of Object.entries(AUSTLII_COURTS)) {
    let num = 1;
    let consecutiveMisses = 0;

    while (consecutiveMisses < 5 && allNewCases.length < limit) {
      const url = `https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/tas/${courtAbbrev}/${currentYear}/${num}.html`;
      try {
        const { html, status } = await handleFetchPage({ url }, env);

        if (status === 404 || status === 410) { consecutiveMisses++; num++; continue; }
        if (status !== 200) { num++; continue; }

        consecutiveMisses = 0;
        const citation = `[${currentYear}] ${courtAbbrev} ${num}`;

        const exists = await env.DB.prepare("SELECT id FROM cases WHERE citation = ?").bind(citation).first();
        if (!exists) {
          allNewCases.push({ citation, year: String(currentYear), court: courtName, court_abbrev: courtAbbrev, case_num: String(num), url, html });
        }
      } catch (error) {
        console.error(`Error fetching ${courtAbbrev}/${currentYear}/${num}:`, error);
      }
      num++;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return allNewCases.slice(0, limit);
}

async function fetchCaseContent(url, preloadedHtml = null, env = null) {
  // NOTE: case_name is NOT extracted here. Llama extracts it in summarizeCase().
  // This function only strips HTML and returns the plain text for AI processing.
  try {
    let html;
    if (preloadedHtml) {
      html = preloadedHtml;
    } else {
      // ── Route through VPS proxy to avoid Cloudflare edge IP blocks ────────
      const { html: fetchedHtml, status } = await handleFetchPage({ url }, env);
      if (status !== 200) return null;
      html = fetchedHtml;
    }

    const contentMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const content = contentMatch ? contentMatch[1] : html;

    const textContent = content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 500000);

    return { full_text: textContent };
  } catch (error) {
    console.error(`Error fetching case content from ${url}:`, error);
    return null;
  }
}

/* =============================================================
   CASE PROCESSING
   ============================================================= */
function splitIntoChunks(text, chunkSize = 3000) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize;
  }
  return chunks;
}

function isLikelyHeader(chunkIndex, chunkText) {
  if (chunkIndex !== 0) return false;
  const upperLabels = (chunkText.match(/^[A-Z ]{4,}[\s]*:/gm) || []).length;
  const hasMarkers = /COURT\s*:|CITATION\s*:|PARTIES\s*:|JUDGE\s*:|HEARD\s*:|DELIVERED\s*:/i.test(chunkText);
  return upperLabels >= 3 || hasMarkers;
}

async function processCaseUpload(env, caseText, citation, caseName, court) {
  if (!caseText || !citation) throw new Error("Missing required fields: caseText and citation");

  const exists = await env.DB.prepare("SELECT id, enriched FROM cases WHERE citation = ?").bind(citation).first();
  if (exists && exists.enriched === 1) throw new Error(`Case ${citation} already exists and is fully processed`);

  const truncatedText = caseText.length > 500000 ? caseText.substring(0, 500000) : caseText;

  const caseData = {
    citation,
    case_name: caseName || citation, // hint only — Llama will override
    court: court || "unknown",
    year: citation.match(/\[(\d{4})\]/)?.[1] || new Date().getFullYear().toString(),
    full_text: truncatedText,
    url: "",
  };

  const summary = await summarizeCase(env, caseData);

  // Llama-extracted name wins; fall back to form hint; then citation
  const finalCaseName = summary.case_name || caseData.case_name;
  const finalCaseData = { ...caseData, case_name: finalCaseName };

  // ── Write D1 immediately — before procedure pass or nexus ─────────
  const id = await saveCaseToDb(env, finalCaseData, summary);
  await env.DB.prepare(`UPDATE cases SET enriched = 1 WHERE citation = ?`).bind(citation).run();

  // ── Procedure pass ────────────────────────────────────────────────
  try {
    const procResponse = await callWorkersAI(env, procedurePassPrompt, caseText.slice(0, 80000));
    const procText = (procResponse || "").trim();
    if (procText && procText !== "NO PROCEDURE CONTENT") {
      await env.DB.prepare(
        `UPDATE cases SET procedure_notes = ? WHERE citation = ?`
      ).bind(procText, citation).run();
    }
  } catch (e) {
    console.error("[procedure pass] failed:", e.message);
  }

  // ── Nexus ingest (fire-and-forget) ───────────────────────────────
  try {
    fetch("https://nexus.arcanthyr.com/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nexus-Key": env.NEXUS_SECRET_KEY },
      body: JSON.stringify({
        citation: finalCaseData.citation,
        case_name: finalCaseData.case_name,
        source: "AustLII",
        text: finalCaseData.full_text,
        summary: summary.facts + " " + summary.holding,
        category: "criminal",
        jurisdiction: "Tasmania",
        court: finalCaseData.court,
        year: finalCaseData.year,
        outcome: summary.holding,
        principles: summary.principles.map(p => p.principle || p),
        legislation: summary.principles.flatMap(p => p.statute_refs || []),
        offences: [],
      })
    });
    console.log(`Nexus ingest ok for ${finalCaseData.citation}`);
  } catch (e) {
    console.error("Nexus ingest failed:", e.message);
  }

  return { id, citation, case_name: finalCaseName, summary };
}

async function summarizeCase(env, caseData) {
  // ─── ARCHITECTURE NOTE ────────────────────────────────────────────────────
  // Extraction uses a two-pass strategy for long judgments:
  //   Pass 1 (first 12,000 chars): metadata, facts, issues, case_name
  //   Pass 2 (chars 8,000–end): overlapping 20,000-char windows, 2,000-char overlap
  // For shorter judgments (<= 22,000 chars) a single pass covers everything.
  // The text sent to Llama has already been boilerplate-stripped and whitespace-
  // compressed by austlii_scraper.py before upload, maximising signal per char.
  // ─────────────────────────────────────────────────────────────────────────

  const CHUNK_THRESHOLD = 22000;  // single-pass up to this length
  const PASS1_CHARS     = 12000;  // metadata/facts window
  const PASS2_START     = 8000;   // reasoning window start
  const WINDOW_SIZE     = 20000;  // each reasoning window size
  const WINDOW_OVERLAP  = 2000;   // overlap between windows to avoid split mid-sentence

  // ── Shared prompt fragments ───────────────────────────────────────────────
  const PRINCIPLES_SPEC = `
PRINCIPLES — extract the court's key legal holdings as case-specific propositions.

Each principle must be a concrete statement of what THIS court decided on THIS set of facts — not a generic rule of law that could appear on any case. Include the court's reasoning where it adds value.

Maximum 8 principles total. 1 primary per issue + up to 2 supporting (only if genuinely distinct).

BAD (generic, could be any case):
- "General deterrence is a relevant sentencing consideration"
- "The court applied the relevant statutory test"

GOOD (case-specific, tells you why THIS case matters):
- "A 12-month suspended sentence was appropriate for a first-offender domestic assault involving a single punch causing bruising, where the offender had completed a behavioural change program and the victim did not support a custodial sentence"
- "The appellant's failure to disclose gambling debts totalling $180,000 was fatal to her Testators Family Maintenance claim because adequate provision cannot be assessed without full financial disclosure"
- "The tendency evidence was admissible because the accused's pattern of targeting intoxicated women at licensed venues had significant probative value that substantially outweighed any prejudicial effect, applying the framework in IMM v The Queen"

Each principle object must include:
- "principle": the case-specific propositional statement (1-2 sentences, in the court's own doctrinal language where possible)
- "statute_refs": array of relevant Act and section references (e.g. ["Sentencing Act 1997 (Tas) s 11"]) — empty array if none
- "keywords": 2-4 short topic keywords (e.g. ["sentencing", "domestic violence", "deterrence"])
`;

  // ── Single-pass prompt (short judgments) ─────────────────────────────────
  const singlePassPrompt = `You are extracting verified legal information from an Australian court judgment for a practitioner database.
Do not guess or invent. If something is not clearly present, use null.
Return ONLY a single valid JSON object. No explanation, no markdown, no text before or after the JSON.

Extract these fields:
- case_name: party names from the VERY FIRST LINE of the document (e.g. "R v Smith", "DPP v Jones", "Tasmania v Brown (No 2)"). Stop before the first "[" character — do not include the citation. If the first line is missing or unclear, extract from the CITATION field. NEVER use court division labels ("Criminal", "Civil", "Criminal Division", "Civil Division"). If PARTIES uses SURNAME, Given Names format, normalise to Given Names Surname in title case.
- judge: presiding judge(s) surname and title (e.g. "Blow CJ", "Brett J"). If multiple, comma-separated string.
- parties: party names from the case title, normalised from SURNAME, Given Names to natural order.
- facts: 3-4 concrete sentences: parties, charges or dispute, key events, outcome at first instance if appeal.
- issues: JSON array of 1-5 legal questions the court answered (each a short question string). Must be an array, never a single string.
- holdings: array matching issues order — the court's direct answer to each issue (1 sentence each).
- legislation: all Acts and sections materially relied on. Array of strings e.g. ["Sentencing Act 1997 (Tas) s 11"].
- key_authorities: cases cited and how treated. Array of objects: { "name": "...", "treatment": "applied|followed|distinguished|mentioned", "why": "..." }
${PRINCIPLES_SPEC}

Rules:
- case_name must be party names only — never a court division label, never a bare year, never just a citation.
- If a field cannot be determined, use null or [].
- The very first character of your response must be {

Output JSON with keys: case_name, judge, parties, facts, issues, holdings, principles, legislation, key_authorities`;

  // ── Pass 1 prompt (long judgments — metadata/facts/issues) ───────────────
  const pass1Prompt = `You are a legal metadata extraction assistant. Extract structured metadata from this Australian court judgment.

Return ONLY a single valid JSON object. No explanation, no markdown, no text before or after the JSON.

{
  "case_name": "Party names from the VERY FIRST LINE of the document (e.g. 'R v Smith', 'Tasmania v Brown (No 2)'). Stop before the first '[' character — do not include the citation. If the first line is missing or unclear, extract from the CITATION field. NEVER use court division labels ('Criminal', 'Civil', 'Criminal Division', 'Civil Division') as the case_name. If PARTIES uses SURNAME, Given Names format, normalise to Given Names Surname in title case.",
  "judge": "Presiding judge(s) surname and title (e.g. Blow CJ, Brett J). If multiple, comma-separated.",
  "parties": "Party names verbatim from the case title, normalised from SURNAME, Given Names to natural order (e.g. Tasmania v John Smith).",
  "facts": "3-4 concrete sentences: parties, charges or dispute, key events.",
  "issues": ["Legal question 1", "Legal question 2"]
}

Rules:
- Extract only what is explicitly stated. Do not infer or fabricate.
- issues must be a JSON array of strings, never a single string.
- If a field cannot be determined, use "" or [].
- case_name must be party names only — never a court division label, never a bare year, never just a citation.
- The very first character of your response must be {`;

  // ── Pass 2 prompt (long judgments — reasoning section) ───────────────────
  const pass2Prompt = `You are extracting legal principles, holdings, legislation and authorities from the reasoning section of an Australian court judgment.
Output ONLY valid JSON. No markdown fences. No commentary.

The issues already identified for this case are provided below. Extract holdings and principles keyed to those issues.

Extract:
- holdings: array matching the issues order — the court's direct answer to each issue (1 sentence each).
- legislation: all Acts and sections materially relied on. Array of strings e.g. ["Sentencing Act 1997 (Tas) s 11"].
- key_authorities: cases cited and how treated. Array of: { "name": "...", "treatment": "applied|followed|distinguished|mentioned", "why": "..." }
${PRINCIPLES_SPEC}

Output JSON with keys: holdings, principles, legislation, key_authorities`;

  const fullText = caseData.full_text || "";
  const isLong = fullText.length > CHUNK_THRESHOLD;

  let raw, raw2;
  try {
    if (!isLong) {
      // ── Single pass ────────────────────────────────────────────────────
      console.log(`Summarising ${caseData.citation} (single pass, ${fullText.length} chars)`);
      const userContent = `Citation: ${caseData.citation}\nCourt: ${caseData.court}\n\nCase text:\n${fullText.substring(0, CHUNK_THRESHOLD)}`;
      raw = await callWorkersAI(env, singlePassPrompt, userContent, 4000);
      console.log(`AI response: ${raw?.length || 0} chars`);

      const cleaned = raw.replace(/```json|```/g, "").trim();
      const summary = JSON.parse(cleaned);
      validateCaseName(summary, fullText);
      if (!summary.facts || (!summary.holding && !summary.holdings)) throw new Error("Incomplete AI response");

      return _buildSummary(summary, null, caseData.citation);

    } else {
      // ── Two-pass ───────────────────────────────────────────────────────
      console.log(`Summarising ${caseData.citation} (two-pass, ${fullText.length} chars)`);

      // Pass 1: opening section → facts, issues, case_name
      const p1Content = `Citation: ${caseData.citation}\nCourt: ${caseData.court}\n\nCase text (opening section):\n${fullText.substring(0, PASS1_CHARS)}`;
      raw = await callWorkersAI(env, pass1Prompt, p1Content, 2000);
      console.log(`Pass 1 response: ${raw?.length || 0} chars`);
      const pass1 = JSON.parse(raw.replace(/```json|```/g, "").trim());
      validateCaseName(pass1, fullText);

      // Pass 2: overlapping windows from PASS2_START to end of text
      const issuesList = Array.isArray(pass1.issues) ? pass1.issues.join("\n") : (pass1.issues || "");
      const pass2Results = [];
      let windowStart = PASS2_START;

      while (windowStart < fullText.length) {
        const windowEnd = Math.min(windowStart + WINDOW_SIZE, fullText.length);
        const windowText = fullText.substring(windowStart, windowEnd);
        const p2Content = `Citation: ${caseData.citation}\nCourt: ${caseData.court}\n\nIssues identified:\n${issuesList}\n\nReasoning section:\n${windowText}`;
        raw2 = await callWorkersAI(env, pass2Prompt, p2Content, 4000);
        console.log(`Pass 2 window [${windowStart}-${windowEnd}]: ${raw2?.length || 0} chars`);
        try {
          const parsed = JSON.parse(raw2.replace(/```json|```/g, "").trim());
          pass2Results.push(parsed);
        } catch (e) {
          console.error(`Pass 2 window [${windowStart}-${windowEnd}] parse failed:`, e.message);
        }
        if (windowEnd >= fullText.length) break;
        windowStart = windowEnd - WINDOW_OVERLAP;
      }

      // Merge pass2 results — concat principles and legislation, take first non-null holding
      const mergedPrinciples = pass2Results.flatMap(r => r.principles || []);
      const mergedLegislation = [...new Set(pass2Results.flatMap(r => r.legislation || []))];
      const mergedHolding = pass2Results
        .flatMap(r => r.holdings || [])
        .map(h => typeof h === 'string' ? h : h.holding)
        .filter(Boolean)
        .join(" ") || null;

      const syntheticPass2 = {
        holdings: pass2Results.flatMap(r => r.holdings || []),
        holding: mergedHolding,
        principles: mergedPrinciples,
        legislation: mergedLegislation,
        key_authorities: pass2Results.flatMap(r => r.key_authorities || []),
      };

      return _buildSummary(pass1, syntheticPass2, caseData.citation);
    }

  } catch (error) {
    console.error(`Case summarization failed for ${caseData.citation}:`, error);
    console.error(`Pass 1 raw:`, raw?.substring(0, 300));
    if (raw2) console.error(`Pass 2 raw:`, raw2?.substring(0, 300));
    return {
      case_name: null,
      facts: "AI extraction failed",
      issues: "AI extraction failed",
      holdings: "AI extraction failed",
      holding: "AI extraction failed",
      principles: [],
      legislation: [],
      key_authorities: [],
      summary_quality_score: 0.0,
    };
  }
}

function validateCaseName(parsed, rawText) {
  const bad = /^(criminal|civil|criminal division|civil division)$/i;
  const singleWord = /^\w+$/;

  if (!parsed.case_name || bad.test(parsed.case_name.trim()) || singleWord.test(parsed.case_name.trim())) {
    const firstLine = rawText.split('\n').find(l => l.trim().length > 0) || '';
    const match = firstLine.match(/^(.+?)\s*\[/);
    parsed.case_name = match ? match[1].trim() : firstLine.trim();
  }

  // Strip citation suffix if model left it in
  const citSuffix = parsed.case_name.match(/^(.+?)\s*\[\d{4}\].*/);
  if (citSuffix) {
    parsed.case_name = citSuffix[1].trim();
  }

  return parsed;
}

function _buildSummary(primary, secondary, citation) {
  // Merge single-pass or two-pass results into a normalised summary object.
  // primary = single-pass result OR pass1 result
  // secondary = null (single-pass) OR pass2 result

  const src = secondary
    ? { ...primary, ...secondary }   // two-pass: merge, pass2 wins on overlap
    : primary;                        // single-pass: use as-is

  // Helper: coerce any value to a plain string for D1 text columns.
  // Llama occasionally returns arrays instead of strings — this handles that gracefully.
  const asString = (val, fallback = "Not extracted") => {
    if (!val) return fallback;
    if (Array.isArray(val)) return val.join(" ");
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  const issues = Array.isArray(src.issues)
    ? src.issues
    : (src.issues ? [asString(src.issues)] : []);

  const holdings = Array.isArray(src.holdings)
    ? src.holdings
    : (src.holdings ? [asString(src.holdings)] : []);

  // Legacy single holding string for backward compat with existing DB column
  const holdingStr = holdings.length > 0 ? holdings.join(" ") : asString(src.holding, "Not extracted");

  const principles = Array.isArray(src.principles) ? src.principles : [];
  const legislation = Array.isArray(src.legislation) ? src.legislation : [];
  const keyAuthorities = Array.isArray(src.key_authorities) ? src.key_authorities : [];

  // Score: more fields populated = higher score
  const score = [src.facts, holdingStr, issues.length > 0, principles.length > 0, legislation.length > 0]
    .filter(Boolean).length / 5;

  return {
    case_name: (asString(src.case_name, "")).trim() || null,
    judge: (asString(src.judge, "")).trim() || null,
    parties: (asString(src.parties, "")).trim() || null,
    facts: asString(src.facts),
    issues: issues.map(i => asString(i)).join("; ") || "Not extracted",
    holdings: holdings.map(h => asString(h)),  // array — stored in new holdings column
    holding: holdingStr,                        // string — backward compat with existing holding column
    principles: principles,
    legislation: legislation,
    key_authorities: keyAuthorities,
    summary_quality_score: Math.round(score * 10) / 10,
  };
}

/* =============================================================
   DATABASE FUNCTIONS
   ============================================================= */
async function saveCaseToDb(env, caseData, summary) {
  const id = caseData.citation.replace(/\s+/g, '-');

  await env.DB.prepare(`
    INSERT OR REPLACE INTO cases
    (id, citation, court, case_date, case_name, judge, parties, url, raw_text, facts, issues, holding,
     holdings_extracted, principles_extracted, legislation_extracted, authorities_extracted,
     processed_date, summary_quality_score, enriched)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    caseData.citation,
    caseData.court ?? null,
    `${(caseData.citation.match(/\[(\d{4})\]/) || [null, caseData.year || new Date().getFullYear()])[1]}-01-01`,
    summary.case_name ?? null,
    summary.judge ?? null,
    summary.parties ?? null,
    caseData.url || "",
    caseData.full_text || "",
    summary.facts ?? null,
    summary.issues ?? null,
    summary.holding ?? null,
    JSON.stringify(summary.holdings || []),
    JSON.stringify(summary.principles || []),
    JSON.stringify(summary.legislation || []),
    JSON.stringify(summary.key_authorities || []),
    new Date().toISOString(),
    summary.summary_quality_score ?? 0,
    1
  ).run();

  for (const principle of summary.principles) {
    await savePrinciple(env, principle, caseData.citation);
  }

  return id;
}

async function savePrinciple(env, principle, citation) {
  const principleText = principle.principle || principle;
  const keywords = principle.keywords || [];
  const statuteRefs = principle.statute_refs || [];

  const existing = await env.DB.prepare("SELECT id FROM legal_principles WHERE principle_text = ?")
    .bind(principleText).first();

  if (existing) {
    const current = await env.DB.prepare("SELECT case_citations FROM legal_principles WHERE id = ?")
      .bind(existing.id).first();
    const citations = JSON.parse(current.case_citations || "[]");
    if (!citations.includes(citation)) {
      citations.push(citation);
      await env.DB.prepare("UPDATE legal_principles SET case_citations = ?, most_recent_citation = ? WHERE id = ?")
        .bind(JSON.stringify(citations), citation, existing.id).run();
    }
  } else {
    const id = `prin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await env.DB.prepare(`
      INSERT INTO legal_principles 
      (id, principle_text, keywords, statute_refs, case_citations, most_recent_citation, date_added)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, principleText, JSON.stringify(keywords), JSON.stringify(statuteRefs),
      JSON.stringify([citation]), citation, new Date().toISOString()).run();
  }
}

async function getSyncProgress(env) {
  const stats = await env.DB.prepare(`
    SELECT COUNT(*) as total_cases, MIN(case_date) as earliest_case,
           MAX(case_date) as latest_case, MAX(processed_date) as last_sync
    FROM cases
  `).first();
  const principleCount = await env.DB.prepare("SELECT COUNT(*) as count FROM legal_principles").first();

  return {
    total_cases: stats?.total_cases || 0,
    total_principles: principleCount?.count || 0,
    earliest_case: stats?.earliest_case || "None",
    latest_case: stats?.latest_case || "None",
    last_sync: stats?.last_sync || "Never",
  };
}

/* =============================================================
   SCHEDULED SYNC
   ============================================================= */
async function runYearBackfill(env, year) {
  // NOTE: This Worker-side backfill hits Cloudflare CPU time limits on large
  // years. Use the Python scraper (austlii_scraper.py) for bulk backfill.
  // This endpoint is kept for small/targeted use only.
  console.log(`Starting backfill for year ${year}...`);
  let casesProcessed = 0;
  let casesFailed = 0;
  const errors = [];

  for (const [court, courtAbbrev] of Object.entries(AUSTLII_COURTS)) {
    const cases = [];
    let num = 1;
    let consecutiveMisses = 0;

    while (consecutiveMisses < 5) {
      const url = `https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/tas/${courtAbbrev}/${year}/${num}.html`;
      try {
        const { html, status } = await handleFetchPage({ url }, env);
        if (status === 404 || status === 410) { consecutiveMisses++; }
        else if (status === 200) {
          consecutiveMisses = 0;
          cases.push({ citation: `[${year}] ${courtAbbrev} ${num}`, year: String(year), court, url, html });
        }
      } catch (e) { console.error(`Fetch error:`, e); }
      num++;
      await new Promise(r => setTimeout(r, 1000));
    }

    for (const caseData of cases) {
      const exists = await env.DB.prepare("SELECT id FROM cases WHERE citation = ?").bind(caseData.citation).first();
      if (exists) continue;
      try {
        const content = caseData.html ? await fetchCaseContent(null, caseData.html, env) : await fetchCaseContent(caseData.url, null, env);
        if (!content?.full_text || content.full_text.length < 100) { casesFailed++; continue; }
        const fullCaseData = { ...caseData, ...content };
        const summary = await summarizeCase(env, fullCaseData);
        const finalCaseData = { ...fullCaseData, case_name: summary.case_name || caseData.citation };
        await saveCaseToDb(env, finalCaseData, summary);
        casesProcessed++;
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        casesFailed++;
        errors.push(`${caseData.citation}: ${err.message}`);
      }
    }
  }

  return { year, casesProcessed, casesFailed, errors };
}

async function runDailySync(env) {
  console.log("Starting daily AustLII check...");
  let casesProcessed = 0, casesFailed = 0;
  const dailyLimit = 50;
  const errors = [];

  const newCases = await fetchRecentAustLIICases(env, dailyLimit);
  console.log(`Found ${newCases.length} new cases to process`);

  for (const caseData of newCases) {
    if (casesProcessed >= dailyLimit) break;
    try {
      const content = await fetchCaseContent(caseData.url, caseData.html || null, env);
      if (!content?.full_text || content.full_text.length < 100) {
        errors.push(`${caseData.citation}: Insufficient text`);
        casesFailed++;
        continue;
      }
      const fullCaseData = { ...caseData, ...content };
      const summary = await summarizeCase(env, fullCaseData);
      const finalCaseData = { ...fullCaseData, case_name: summary.case_name || caseData.citation };
      await saveCaseToDb(env, finalCaseData, summary);
      casesProcessed++;
      console.log(`✓ ${caseData.citation} — "${finalCaseData.case_name}"`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
      errors.push(`${caseData.citation}: ${error.message}`);
      casesFailed++;
    }
  }

  console.log(`Daily sync complete. Processed: ${casesProcessed}, Failed: ${casesFailed}`);

  if ((casesProcessed > 0 || casesFailed > 0) && env.RESEND_API_KEY) {
    try {
      let emailBody = `<p>Daily sync: ${newCases.length} new cases found</p>`;
      emailBody += `<p><strong>Saved: ${casesProcessed}</strong></p>`;
      if (casesFailed > 0) emailBody += `<p><strong>Failed: ${casesFailed}</strong></p><ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>`;
      await sendEmail(env, env.RESEND_FROM_EMAIL, `Arcanthyr: ${casesProcessed} new cases`, emailBody);
    } catch (err) { console.error("Failed to send sync email:", err); }
  }

  return { success: true, cases_processed: casesProcessed, cases_failed: casesFailed, errors };
}

async function runBatchedChunkCleanup(env) {
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM case_chunks WHERE done = 0`
  ).first();
  if (!countRow || countRow.cnt === 0) {
    console.log('[cron] no bad chunks remaining');
    return;
  }
  const { results } = await env.DB.prepare(
    `SELECT citation, chunk_index FROM case_chunks WHERE done = 0 LIMIT 250`
  ).all();
  for (const row of results) {
    await env.CASE_QUEUE.send({ type: 'CHUNK', citation: row.citation, chunk_index: row.chunk_index });
  }
  const remaining = countRow.cnt - results.length;
  console.log(`[cron] batched cleanup: enqueued ${results.length} chunks, ${remaining} remaining`);
}

/* =============================================================
   ORIGINAL AI ACTION HANDLERS
   ============================================================= */
async function handleDraft(body, env) {
  const { text, tag } = body;
  if (!text || !tag) throw new Error("Missing text or tag");
  const system = `You are a precise clarity engine inside a productivity console called Arcanthyr.
Rewrite the user's raw input as a clean, structured entry.
Rules:
- Keep the user's intent exactly — do NOT decide or advise
- Remove filler, noise, and vagueness
- Output 2-3 sentences max
- First sentence: core statement. Second: scope or constraint. Third (optional): success condition.
- No bullet lists. No markdown. Plain prose only.
- Entry type: ${tag}
- Output ONLY the rewritten entry. No preamble, no sign-off.`;
  return callWorkersAI(env, system, text, 300);
}

async function handleNextActions(body, env) {
  const { text, tag, next, clarify } = body;
  if (!text || !tag) throw new Error("Missing text or tag");
  const system = `You are a strategic action engine inside Arcanthyr, a personal clarity console.
Propose exactly 3 concrete next actions. Each must be:
- Physically doable (not vague like "think about it")
- Under 15 words each
- Ordered by urgency/leverage (highest first)
- Grounded in the entry's actual content
Respond EXACTLY like this with no other text:
1. [action]
2. [action]
3. [action]`;
  return callWorkersAI(env, system, `Entry type: ${tag}\nRaw text: ${text}\nGuidance: ${next || ""}\nClarify: ${clarify || ""}`, 300);
}

async function handleWeeklyReview(body, env) {
  const { entries } = body;
  if (!entries || !entries.length) return "No entries to review.";
  const system = `You are a pattern recognition engine inside Arcanthyr.
Analyse the entries and produce a concise weekly review.
Respond with EXACTLY these three sections and no other text:

RECURRING THEMES
[2-3 sentences on topics or concerns that appear repeatedly]

STUCK LOOPS
[2-3 sentences on anything recurring without resolution]

DECISIONS PENDING
[1-2 sentences on unresolved decisions in the data]

If a section has nothing to report, write: None identified.`;
  return callWorkersAI(env, system, `Entries:\n${entries.map(e => `[${(e.tag || "note").toUpperCase()}] ${e.text}`).join("\n")}`, 700);
}


async function handleClarifyAgent(body, env) {
  const { text, tag, history = [], userReply = null } = body;
  if (!text || !tag) throw new Error("Missing text or tag");

  const historyContext = history.length > 0
    ? `\nConversation so far:\n${history.map(h => `${h.role === "agent" ? "Agent" : "User"}: ${h.content}`).join("\n")}`
    : "";
  const userExchanges = history.filter(h => h.role === "user").length;

  if (userExchanges >= 2 && userReply) {
    const crystallised = await callWorkersAI(env,
      `You are a clarity synthesis engine inside Arcanthyr. Produce a final crystallised entry (2-3 sentences, plain prose). Output ONLY the crystallised entry.`,
      `Original entry (${tag}): ${text}${historyContext}\nUser final reply: ${userReply}`, 300);
    return { done: true, draft: crystallised, question: null };
  }

  const question = await callWorkersAI(env,
    `You are a conversational clarity agent inside Arcanthyr. Ask ONE precise question (under 20 words) specific to THEIR content. No preamble. Output ONLY the question.`,
    `Entry type: ${tag}\nEntry: ${text}${historyContext}${userReply ? `\nUser replied: ${userReply}` : ""}\n${userExchanges === 0 ? "First question." : "Go deeper."}`,
    120);
  return { done: false, question, draft: null };
}

async function handleAxiomRelay(body, env) {
  const { entries, focus } = body;
  if (!entries || !entries.length) return { report: "No entries to relay." };

  const entryLines = entries.map((e, i) => `[${i}] [${(e.tag || "note").toUpperCase()}] ${e.text}`).join("\n");
  const focusNote = focus ? `\nFocus area: ${focus}` : "";

  // Stage 1 — decompose entries into surface/intent/constraint
  const stage1System = `You are a strategic decomposition engine. For each numbered entry, extract:
- surface: what is literally stated (1 sentence)
- intent: the underlying goal or need (1 sentence)
- constraint: what is blocking, limiting, or creating tension (1 sentence)
Output ONLY a JSON array: [{"id":0,"surface":"...","intent":"...","constraint":"..."},...]
No preamble. No commentary. Valid JSON only.`;
  const stage1Raw = await callWorkersAI(env, stage1System, `Entries:${focusNote}\n${entryLines}`, 900);

  // Stage 2 — identify tensions and opportunities across the decomposed entries
  const stage2System = `You are a systems analyst. Given decomposed entries, identify exactly 3 tensions or leverage opportunities across them.
Format EXACTLY as:
TENSION_1
[1-2 sentences]
TENSION_2
[1-2 sentences]
TENSION_3
[1-2 sentences]
No other text.`;
  const stage2Raw = await callWorkersAI(env, stage2System, `Decomposed entries:${focusNote}\n${stage1Raw}`, 400);

  // Stage 3 — produce final relay report
  const stage3System = `You are the Axiom Relay — a strategic synthesis engine. Produce a final report using EXACTLY these four sections:

SIGNAL
[2-3 sentences: the dominant pattern or core theme across all entries]

LEVERAGE POINT
[2-3 sentences: the single highest-value intervention or decision point]

RELAY ACTIONS
[3 concrete numbered actions, each under 15 words]

DEAD WEIGHT
[1-2 sentences: what should be dropped, deprioritised, or stopped]

No other text. No preamble.`;
  const stage3Raw = await callWorkersAI(env, stage3System, `Tensions identified:${focusNote}\n${stage2Raw}\n\nOriginal entries:\n${entryLines}`, 1200);

  return { report: stage3Raw };
}

/* =============================================================
   API HANDLERS
   ============================================================= */
async function handleSendEmail(body, env) {
  const { to, subject, content } = body;
  if (!to || !subject || !content) throw new Error("Missing required fields");
  const html = `<div style="font-family:'DM Mono',monospace;max-width:600px;margin:0 auto;padding:20px;">
    <div style="border-bottom:1px solid #3a3b3f;padding-bottom:12px;margin-bottom:20px;">
      <h2 style="color:#a8b4c0;font-family:'Cormorant Garamond',serif;letter-spacing:0.12em;">ARCANTHYR</h2>
    </div>
    <div style="white-space:pre-wrap;line-height:1.7;color:#f0f1f2;">${content}</div>
    <div style="border-top:1px solid #3a3b3f;margin-top:20px;padding-top:12px;font-size:12px;color:#888c94;">Sent from Arcanthyr Console</div>
  </div>`;
  const result = await sendEmail(env, to, subject, html);
  return { success: true, message_id: result.id };
}

async function handleGetContacts(env) {
  const { results } = await env.DB.prepare("SELECT * FROM email_contacts ORDER BY name ASC").all();
  return results || [];
}

async function handleAddContact(body, env) {
  const { name, email } = body;
  if (!name || !email) throw new Error("Missing name or email");
  const id = `contact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await env.DB.prepare("INSERT INTO email_contacts (id, name, email, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, name, email, new Date().toISOString()).run();
  return { id, name, email };
}

async function handleDeleteContact(contactId, env) {
  await env.DB.prepare("DELETE FROM email_contacts WHERE id = ?").bind(contactId).run();
  return { success: true };
}

async function handleSearchCases(body, env) {
  // Params:
  //   query      – keyword search across case_name, facts, issues, holding, citation
  //   court      – "all" | "supreme" | "magistrates" | "cca" | "fullcourt"
  //   year       – exact year string "2024" (takes precedence over range)
  //   year_from  – start of range "2020"
  //   year_to    – end of range "2024"
  //   limit      – page size (default 100, max 500)
  //   offset     – pagination offset (default 0)
  //
  // Returns: { total, limit, offset, cases[] }
  const {
    query,
    court,
    year,
    year_from,
    year_to,
    limit: rawLimit = 100,
    offset: rawOffset = 0,
  } = body;

  const limit = Math.min(Number(rawLimit) || 100, 500);
  const offset = Number(rawOffset) || 0;

  const conditions = ["1=1"];
  const params = [];

  if (query && query.trim()) {
    conditions.push("(case_name LIKE ? OR facts LIKE ? OR issues LIKE ? OR holding LIKE ? OR citation LIKE ?)");
    const t = `%${query.trim()}%`;
    params.push(t, t, t, t, t);
  }

  if (court && court !== "all") {
    conditions.push("court = ?");
    params.push(court);
  }

  if (year && year !== "all") {
    conditions.push("strftime('%Y', case_date) = ?");
    params.push(String(year));
  } else {
    if (year_from) { conditions.push("strftime('%Y', case_date) >= ?"); params.push(String(year_from)); }
    if (year_to) { conditions.push("strftime('%Y', case_date) <= ?"); params.push(String(year_to)); }
  }

  const where = conditions.join(" AND ");

  const countRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM cases WHERE ${where}`)
    .bind(...params).first();
  const total = countRow?.total || 0;

  const { results } = await env.DB.prepare(`
    SELECT id, citation, court, case_date, case_name, url, facts, issues, holding,
           principles_extracted, summary_quality_score
    FROM cases WHERE ${where}
    ORDER BY case_date DESC, citation DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return { total, limit, offset, cases: results || [] };
}

async function handleSearchPrinciples(body, env) {
  const { query, limit = 50 } = body;
  let sql = "SELECT * FROM legal_principles WHERE 1=1";
  const params = [];
  if (query && query.trim()) {
    sql += " AND (principle_text LIKE ? OR keywords LIKE ? OR statute_refs LIKE ?)";
    const t = `%${query}%`;
    params.push(t, t, t);
  }
  sql += " ORDER BY date_added DESC LIMIT ?";
  params.push(limit);
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return (results || []).map(r => ({
    ...r,
    keywords: JSON.parse(r.keywords || "[]"),
    statute_refs: JSON.parse(r.statute_refs || "[]"),
    case_citations: JSON.parse(r.case_citations || "[]"),
  }));
}

function citationToId(citation) {
  return citation
    .trim()
    .replace(/[\[\]\s]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function courtFromCitation(citation) {
  if (!citation) return null;
  const c = citation.toUpperCase();
  if (c.includes('TASMC') || c.includes('TAMAGC')) return 'magistrates';
  if (c.includes('TASCCA')) return 'cca';
  if (c.includes('TASFC')) return 'fullcourt';
  if (c.includes('TASSC')) return 'supreme';
  return null;
}

async function handleUploadCase(body, env) {
  let { case_text, citation, case_name, court, court_hint, encoding } = body;
  const courtMap = { 'TASSC': 'supreme', 'TASCCA': 'cca', 'TASFC': 'fullcourt', 'TAMagC': 'magistrates' };
  court = court || courtMap[court_hint] || 'supreme';
  const citationCourtOverride = courtFromCitation(citation);
  if (citationCourtOverride) court = citationCourtOverride;
  if (encoding === 'base64') case_text = atob(case_text);
  if (case_text.length > 500000) {
    console.warn(`TRUNCATION: ${citation} — ${case_text.length} chars → 500,000`);
    try {
      await env.DB.prepare(`
        INSERT INTO truncation_log (id, citation, original_length, truncated_to, source, status, date_truncated)
        VALUES (?, ?, ?, 500000, ?, 'flagged', ?)
        ON CONFLICT(id) DO UPDATE SET
          original_length = excluded.original_length,
          source = excluded.source,
          status = 'flagged',
          date_truncated = excluded.date_truncated,
          date_resolved = NULL
      `).bind(citationToId(citation), citation, case_text.length, 'manual_upload', new Date().toISOString()).run();
    } catch (e) {
      console.error(`truncation_log write failed for ${citation}:`, e);
    }
    case_text = case_text.substring(0, 500000);
  }
  const caseId = citationToId(citation);
  const caseYear = (citation.match(/\[(\d{4})\]/) || [null, new Date().getFullYear()])[1];
  await env.DB.prepare(`INSERT OR IGNORE INTO cases (id, citation, court, case_date, raw_text, enriched, embedded) VALUES (?, ?, ?, ?, ?, 0, 0)`)
    .bind(caseId, citation, court, `${caseYear}-01-01`, case_text)
    .run();
  await env.CASE_QUEUE.send({ type: 'METADATA', citation });
  return { queued: true, citation };
}


async function handleFetchCaseUrl(body, env) {
  const { url, citation: citationIn, case_name, court } = body;
  if (!url) throw new Error("url is required");

  const allowed = url.includes('austlii.edu.au') || url.includes('jade.io');
  if (!allowed) throw new Error("Only austlii.edu.au and jade.io URLs are permitted");

  const { html, status } = await handleFetchPage({ url }, env);
  if (status !== 200) throw new Error(`Fetch failed with HTTP ${status}`);

  const contentMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = contentMatch ? contentMatch[1] : html;
  let plainText = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plainText) throw new Error("No text content extracted from URL");

  // Resolve citation — use provided value, else parse AustLII URL path
  let citation = citationIn;
  if (!citation) {
    const m = url.match(/\/([A-Za-z]+)\/(\d{4})\/(\d+)\.html/i);
    if (m) citation = `[${m[2]}] ${m[1].toUpperCase()} ${m[3]}`;
  }
  if (!citation) throw new Error("citation required — could not be auto-detected from URL");

  if (plainText.length > 500000) {
    console.warn(`TRUNCATION: ${citation} — ${plainText.length} chars → 500,000`);
    try {
      await env.DB.prepare(`
        INSERT INTO truncation_log (id, citation, original_length, truncated_to, source, status, date_truncated)
        VALUES (?, ?, ?, 500000, ?, 'flagged', ?)
        ON CONFLICT(id) DO UPDATE SET
          original_length = excluded.original_length,
          source = excluded.source,
          status = 'flagged',
          date_truncated = excluded.date_truncated,
          date_resolved = NULL
      `).bind(citationToId(citation), citation, plainText.length, 'scraper', new Date().toISOString()).run();
    } catch (e) {
      console.error(`truncation_log write failed for ${citation}:`, e);
    }
    plainText = plainText.substring(0, 500000);
  }

  const courtMap = { 'TASSC': 'supreme', 'TASCCA': 'cca', 'TASFC': 'fullcourt', 'TAMagC': 'magistrates' };
  const abbrevMatch = citation.match(/\]\s+([A-Za-z]+)\s+\d/);
  const resolvedCourt = court || (abbrevMatch && courtMap[abbrevMatch[1]]) || 'supreme';
  const finalCourt = courtFromCitation(citation) || resolvedCourt;

  const caseId = citationToId(citation);
  const caseYear = (citation.match(/\[(\d{4})\]/) || [null, new Date().getFullYear()])[1];
  await env.DB.prepare(`INSERT OR IGNORE INTO cases (id, citation, court, case_date, raw_text, enriched, embedded) VALUES (?, ?, ?, ?, ?, 0, 0)`)
    .bind(caseId, citation, finalCourt, `${caseYear}-01-01`, plainText)
    .run();
  await env.CASE_QUEUE.send({ type: 'METADATA', citation });
  return { queued: true, citation };
}

async function handleReprocessCase(body, env) {
  const { citation } = body;
  if (!citation) throw new Error("Missing required field: citation");

  const row = await env.DB.prepare("SELECT raw_text, court FROM cases WHERE citation = ?")
    .bind(citation).first();
  if (!row) throw new Error(`Case not found: ${citation}`);
  if (!row.raw_text) throw new Error(`No raw_text available for reprocessing: ${citation}`);

  const caseData = {
    citation,
    court: row.court || "unknown",
    year: citation.match(/\[(\d{4})\]/)?.[1] || new Date().getFullYear().toString(),
    full_text: row.raw_text,
  };

  const summary = await summarizeCase(env, caseData);
  console.log('Reprocess summary judge/parties:', JSON.stringify({ judge: summary.judge, parties: summary.parties, citation }));

  const judge = summary.judge ?? null;
  const parties = summary.parties ?? null;

  await env.DB.prepare(
    "UPDATE cases SET judge = ?, parties = ?, processed_date = ? WHERE citation = ?"
  ).bind(judge, parties, new Date().toISOString(), citation).run();

  return { success: true, citation, judge: summary.judge, parties: summary.parties };
}

/* =============================================================
   PDF EXTRACTION PROXY
   Proxies base64 PDF to nexus/extract-pdf endpoint for
   server-side pdfminer extraction. Keeps nexus key off browser.
   ============================================================= */
function extractCitationFromText(text) {
  const match = text.match(/\[(\d{4})\]\s+(TAS(?:SC|MC|CCA|FC))(?:\s+(\d+))?/);
  if (match) {
    return match[3] ? `[${match[1]}] ${match[2]} ${match[3]}` : `[${match[1]}] ${match[2]}`;
  }
  return null;
}

async function handleExtractPdf(body, env) {
  const { pdf_base64 } = body;
  if (!pdf_base64) throw new Error("Missing pdf_base64 field");
  const r = await fetch("https://nexus.arcanthyr.com/extract-pdf-ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nexus-Key": env.NEXUS_SECRET_KEY,
    },
    body: JSON.stringify({ pdf_base64 }),
  });
  if (!r.ok) throw new Error(`Nexus extraction failed: ${r.status}`);
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  const citation = extractCitationFromText(data.text);
  return { text: data.text, chars: data.chars, citation };
}

/* =============================================================
   LEGISLATION UPLOAD
   Parses sections deterministically, stores in legislation +
   legislation_sections tables. No Llama extraction on upload —
   AI analysis happens at query time.
   ============================================================= */
async function handleUploadLegislation(body, env) {
  let { doc_text, title, jurisdiction, source_url, encoding, part_number } = body;
  if (!doc_text || !title) throw new Error("Missing required fields: doc_text and title");
  if (encoding === 'base64') doc_text = atob(doc_text);

  // Normalise jurisdiction
  jurisdiction = (jurisdiction || "Tas").toUpperCase().replace(/[^A-Z]/g, '');
  const baseid = (title + '-' + jurisdiction).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const id = part_number ? `${baseid}-part-${part_number}` : baseid;
  const year = (title.match(/\b(\d{4})\b/g) || []).slice(-1)[0] || null;

  const existing = await env.DB.prepare("SELECT id FROM legislation WHERE id = ?").bind(id).first();
  if (existing) throw new Error(`Legislation '${title} (${jurisdiction})' already exists. Delete it first to re-upload.`);

  // ── Section parser ────────────────────────────────────────────────────────
  // Matches AustLII PDF format: "1.  Short title" or "2A.  Heading text"
  // Section number and heading are on the same line, separated by 2+ spaces.
  // Also handles plain format without dot: "1  Short title"
  // Strips page headers/footers (Act name + "Act No.") which appear mid-text.
  const sectionPattern = /^(\d+[A-Z]?)\.?\s+(.+)$/gm;
  const sections = [];
  let match;
  const seenSections = new Set();

  // Strip page noise from pdfminer output.
  // Pages contain headers like:
  //   "Evidence Act 2001 \nAct No. 76 of 2001 \nPart 1 – Witnesses \ns. 38 \n"
  // and footers with lone page numbers. Strip all of these.
  const cleanText = doc_text
    .replace(/\x0c/g, '\n')
    .replace(/^.{3,60}\n(Act\s+)?No\.\s+\d+\s+of\s+\d{4}\s*\n/gm, '')
    .replace(/^(Part|Division|Chapter)\s+\d+[A-Z]?\s*[–-].+$/gim, '')
    .replace(/^s\.?\s+\d+[A-Z]?\s*$/gm, '')
    .replace(/^\s*\d{1,4}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');

  // Skip the table of contents — find where actual section bodies start.
  // Try progressively looser anchors: subsection "(", capital prose, or blank line after heading.
  const bodyStartMatch =
    cleanText.match(/\n\d+[A-Z]?\.?\s+[A-Z][^\n]{3,}\n\(/) ||
    cleanText.match(/\n\d+[A-Z]?\.?\s+[A-Z][^\n]{3,}\n[A-Z]/) ||
    cleanText.match(/\n\d+[A-Z]?\.?\s+[A-Z][^\n]{3,}\n\n/);
  const contentStart = bodyStartMatch ? cleanText.indexOf(bodyStartMatch[0]) : -1;
  const searchText = contentStart > 0 ? cleanText.substring(contentStart) : cleanText;

  while ((match = sectionPattern.exec(searchText)) !== null) {
    const sectionNum = match[1].trim();
    const headingOrText = match[2].trim();

    // Skip Part/Division/Chapter/Schedule labels
    if (/^(Part|Division|Chapter|Schedule)\s/i.test(headingOrText)) continue;
    // Skip very short fragments
    if (headingOrText.length < 3) continue;
    // Skip headings that don't start with a capital — mid-section reference fragments
    if (!/^[A-Z"(]/.test(headingOrText)) continue;
    // Skip bare section number artifacts from TOC (e.g. "2A.")
    if (/^\d+[A-Z]?\.$/.test(headingOrText)) continue;

    if (seenSections.has(sectionNum)) continue;
    seenSections.add(sectionNum);

    // Grab text from this section to the next — no hard char limit,
    // but cap at 8000 chars to keep D1 rows reasonable
    const sectionStart = match.index;
    const nextMatchPos = sectionPattern.lastIndex;
    const remaining = searchText.substring(nextMatchPos);
    const nextSection = remaining.search(/^\d+[A-Z]?\.?\s+/m);
    const sectionEnd = nextMatchPos + (nextSection > 0 ? nextSection : Math.min(remaining.length, 8000));
    const sectionText = searchText.substring(sectionStart, sectionEnd)
      .replace(/\s+/g, ' ').trim();

    sections.push({
      id: `${baseid}-s${sectionNum.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
      legislation_id: baseid,
      section_number: sectionNum,
      heading: headingOrText.length < 120 ? headingOrText : headingOrText.substring(0, 120),
      text: sectionText.substring(0, 8000),
      part: null,
    });
  }

  // Store legislation record — use baseid so all parts share one parent row.
  // INSERT OR IGNORE so Parts 2-8 skip silently without error.
  await env.DB.prepare(`
    INSERT OR IGNORE INTO legislation (id, title, jurisdiction, year, current_as_at, summary,
      defined_terms, offence_elements, source_url, raw_text, processed_date, embedded)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).bind(
    baseid, title, jurisdiction, year ? parseInt(year) : null,
    new Date().toISOString().split('T')[0],
    null, '[]', '[]',
    source_url || '', '',
    new Date().toISOString()
  ).run();

  // Store sections — batch in chunks of 99 to stay under the D1 100-statement limit
  const BATCH_SIZE = 99;
  for (let i = 0; i < sections.length; i += BATCH_SIZE) {
    const stmts = sections.slice(i, i + BATCH_SIZE).map(section =>
      env.DB.prepare(`INSERT OR IGNORE INTO legislation_sections (id, legislation_id, section_number, heading, text, part) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(section.id, section.legislation_id, section.section_number, section.heading, section.text, section.part)
    );
    await env.DB.batch(stmts);
  }

  return {
    id,
    title,
    jurisdiction,
    year: year || null,
    sections_parsed: sections.length,
    message: `Legislation stored with ${sections.length} sections parsed.`,
  };
}

/* =============================================================
   SECONDARY SOURCE UPLOAD
   No AI extraction — store raw text, tag, chunk into Qdrant.
   The model uses these as reference context at query time.
   ============================================================= */
async function handleUploadSecondarySource(body, env) {
  let { doc_text, title, source_type, author, date_published, tags, encoding } = body;
  if (!doc_text || !title) throw new Error("Missing required fields: doc_text and title");
  if (encoding === 'base64') doc_text = atob(doc_text);

  const id = `src-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const tagsArr = Array.isArray(tags) ? tags : (tags ? [tags] : []);
  source_type = source_type || "other";

  // Lightweight: extract any case citations and Act references mentioned in the text
  const caseCitationPattern = /[(d{4})]s+[A-Z]{2,8}s+d+/g;
  const actPattern = /[A-Z][a-zA-Zs]+Acts+d{4}/g;
  const relatedCases = [...new Set([...doc_text.matchAll(caseCitationPattern)].map(m => m[0].trim()))].slice(0, 20);
  const relatedActs = [...new Set([...doc_text.matchAll(actPattern)].map(m => m[0].trim()))].slice(0, 20);

  await env.DB.prepare(`
    INSERT INTO secondary_sources
    (id, title, source_type, author, date_published, tags, related_cases, related_acts,
     raw_text, chunk_count, date_added)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, title, source_type, author || null, date_published || null,
    JSON.stringify(tagsArr),
    JSON.stringify(relatedCases),
    JSON.stringify(relatedActs),
    doc_text, 0,
    new Date().toISOString()
  ).run();

  // Ingest into Qdrant — this is where secondary sources become useful
  let chunksStored = 0;
  try {
    const r = await fetch("https://nexus.arcanthyr.com/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nexus-Key": env.NEXUS_SECRET_KEY },
      body: JSON.stringify({
        citation: id,
        case_name: title,
        source: "secondary",
        text: doc_text,
        summary: `${source_type}: ${title}${author ? ' by ' + author : ''}`,
        category: "secondary",
        tags: tagsArr,
      })
    });
    const result = await r.json();
    chunksStored = result.chunks_stored || 0;
    // Update chunk count in D1
    await env.DB.prepare("UPDATE secondary_sources SET chunk_count = ? WHERE id = ?")
      .bind(chunksStored, id).run();
  } catch (e) {
    console.error("Nexus ingest failed for secondary source:", e.message);
  }

  return {
    id,
    title,
    source_type,
    related_cases_found: relatedCases.length,
    related_acts_found: relatedActs.length,
    chunks_stored: chunksStored,
    message: `Secondary source stored and indexed (${chunksStored} chunks in Qdrant).`,
  };
}

/* =============================================================
   CORPUS CHUNK UPLOAD
   Accepts pre-chunked text with explicit citation and metadata.
   No re-chunking, no auto-generation — sends directly to nexus /ingest.
   Also records a row in secondary_sources for library visibility.
   ============================================================= */
async function handleUploadCorpus(body, env) {
  let { text, citation, source, category, doc_type } = body;
  if (!text || !citation) throw new Error("Missing required fields: text and citation");
  if (body.encoding === 'base64') {
    text = atob(text);
  }

  // Record in D1 secondary_sources — upsert on conflict so re-ingest overwrites stale rows
  try {
    await env.DB.prepare(`
      INSERT INTO secondary_sources
      (id, title, source_type, author, date_published, tags, related_cases, related_acts, raw_text, chunk_count, date_added, enriched, embedded, category)
      VALUES (?, ?, ?, null, null, '[]', '[]', '[]', ?, 1, ?, 1, 0, ?)
      ON CONFLICT(id) DO UPDATE SET
        raw_text = excluded.raw_text,
        title = excluded.title,
        category = COALESCE(excluded.category, secondary_sources.category),
        enriched_text = excluded.enriched_text,
        enriched = excluded.enriched,
        embedded = 0
    `).bind(citation, source || citation, doc_type || null, text, new Date().toISOString(), category ?? 'doctrine').run();

    await env.DB.prepare(
      `INSERT OR REPLACE INTO secondary_sources_fts (rowid, source_id, title, raw_text)
       SELECT rowid, id, title, raw_text FROM secondary_sources WHERE id = ?`
    ).bind(citation).run();
  } catch (err) {
    // FTS5 index writes can time out on D1 while the main row write succeeds.
    // Confirm the row landed before deciding whether to propagate.
    const check = await env.DB.prepare(
      `SELECT id FROM secondary_sources WHERE id = ?`
    ).bind(citation).first();
    if (check) {
      return { success: true, citation, chunks_stored: 0, warning: "FTS5 index timeout — row confirmed written" };
    }
    throw err;
  }

  return { citation, chunks_stored: 0, message: "Corpus chunk recorded in D1." };
}

/* =============================================================
   FORMAT AND UPLOAD
   Accepts raw source text OR pre-formatted corpus blocks.
   Raw text → GPT-4o-mini Master Prompt → parse → insert loop.
   Pre-formatted (starts with <!-- block_) → parse directly.
   Returns { result: { count: N } }.
   ============================================================= */
const MASTER_PROMPT = `You are a legal knowledge formatter for a Tasmanian criminal law research system.

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
[DOMAIN: Tasmanian Criminal Law] [CATEGORY: <one of: annotation | case authority | doctrine | checklist | practice note | legislation>] [TYPE: <same as CATEGORY>] [TOPIC: <one-line topic label; MUST include the specific statute section number (e.g. "s 138 Evidence Act 2001") or defined doctrine term (e.g. "tendency notice requirements") if one exists; may include "test is/requires/court considers" if supported by the source>] [CONCEPTS: <comma-separated key terms present in the body; aim for ~5>] [CITATION: hoc-b{BLOCK_NUMBER}-m{CHUNK_INDEX}-{short-topic-kebab}] [ACT: <Act name(s) if substantively discussed, else None>] [CASE: <case citation(s) if substantively discussed, else None>]

<Blank line>

<BODY: 500-800 words target; verbatim or near-verbatim from the source; preserves reasoning and commentary>

METADATA FIELD RULES:
- DOMAIN: always exactly "Tasmanian Criminal Law"
- CATEGORY: choose the best fit from the canonical list (do NOT use procedure/script here)
- TYPE: set equal to CATEGORY
- TOPIC: one line; MUST include the specific statute section number or defined doctrine term if one exists; descriptive label only; MUST NOT replace the body; do not write "This chunk covers..."
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
"""
{{SOURCE_BLOCK_TEXT}}
"""`;

function parseFormattedChunks(text) {
  // Extract ## FORMATTED CHUNKS section if present, else use full text
  const sectionMatch = text.match(/##\s+FORMATTED CHUNKS\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const chunksText = sectionMatch ? sectionMatch[1] : text;
  // Split on lines that start a new h1 or h3 heading
  return chunksText.split(/\n(?=#{1,3} )/).map(s => s.trim()).filter(Boolean);
}

async function handleFormatAndUpload(body, env) {
  let { text, category: defaultCategory, mode, slug, title, source_type, approved } = body;
  const approvedVal = approved === 0 ? 0 : 1;
  if (!text?.trim()) throw new Error('Missing required field: text');

  let chunkUnits;

  if (text.trimStart().startsWith('<!-- block_')) {
    // Pre-formatted corpus blocks — parse directly
    chunkUnits = parseFormattedChunks(text);
  } else if (mode === 'single') {
    // Single-chunk mode — bypass GPT, wrap in block format directly
    const resolvedSlug = slug || `manual-b${String(Date.now()).slice(-4)}-chunk`;
    const resolvedTitle = title || 'Untitled';
    const resolvedCategory = defaultCategory || 'doctrine';
    const blockText = `<!-- block_0001 master -->\n# ${resolvedTitle}\n[DOMAIN: Tasmanian Criminal Law] [CATEGORY: ${resolvedCategory}] [TYPE: ${resolvedCategory}] [TOPIC: ${resolvedTitle}] [CONCEPTS: ] [CITATION: ${resolvedSlug}] [ACT: None] [CASE: None]\n\n${text}`;
    chunkUnits = parseFormattedChunks(blockText);
  } else {
    // Raw text — call GPT-4o-mini with Master Prompt
    const blockNum = String(Date.now()).slice(-4);
    const systemPrompt = MASTER_PROMPT
      .replace('{{BLOCK_NUMBER}}', blockNum)
      .replace('{{SOURCE_BLOCK_TEXT}}', '');

    const wordCount = text.trim().split(/\s+/).length;
    const shortSourceNote = wordCount < 800
      ? '\n\nNOTE: This is a short source block. You MUST still create separate chunks for each distinct doctrinal unit and each case authority with substantive commentary. Do NOT collapse multiple units into a single chunk. Apply the CASE AUTHORITY CHUNK RULE strictly.'
      : '';
    const finalPrompt = systemPrompt + shortSourceNote;

    const gptResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini-2025-04-14',
        max_completion_tokens: 16000,
        messages: [
          { role: 'system', content: finalPrompt },
          { role: 'user',   content: text },
        ],
      }),
    });
    if (!gptResp.ok) {
      const errText = await gptResp.text();
      throw new Error(`GPT call failed (${gptResp.status}): ${errText.slice(0, 200)}`);
    }
    const gptJson = await gptResp.json();
    const gptOutput = gptJson.choices?.[0]?.message?.content
                   || gptJson.choices?.[0]?.message?.reasoning_content
                   || '';
    if (!gptOutput) throw new Error('GPT returned empty response');
    chunkUnits = parseFormattedChunks(gptOutput);
  }

  if (!chunkUnits.length) throw new Error('No chunks found in formatted output');

  const now = new Date().toISOString();
  let count = 0;

  for (const unit of chunkUnits) {
    const lines = unit.split('\n');
    const heading = lines[0].replace(/^#{1,3}\s+/, '').trim();
    const metaLine = lines.find(l => l.includes('[CITATION:')) || '';

    const citationMatch = metaLine.match(/\[CITATION:\s*([^\]]+)\]/);
    const categoryMatch = metaLine.match(/\[CATEGORY:\s*([^\]]+)\]/);

    const citation = citationMatch ? citationMatch[1].trim() : null;
    const category = (categoryMatch ? categoryMatch[1].trim() : null) || defaultCategory || 'doctrine';

    if (!citation) continue; // skip malformed chunks without a citation

    await env.DB.prepare(`
      INSERT INTO secondary_sources
      (id, title, source_type, author, date_published, tags, related_cases, related_acts, raw_text, chunk_count, date_added, enriched, embedded, category, approved)
      VALUES (?, ?, ?, null, ?, '[]', '[]', '[]', ?, 1, ?, 1, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        raw_text = excluded.raw_text,
        title = excluded.title,
        category = COALESCE(excluded.category, secondary_sources.category),
        enriched_text = excluded.enriched_text,
        enriched = excluded.enriched,
        embedded = 0
    `).bind(citation, heading, source_type || null, new Date().toISOString().split('T')[0], unit, now, category, approvedVal).run();

    await env.DB.prepare(
      `INSERT OR REPLACE INTO secondary_sources_fts (rowid, source_id, title, raw_text)
       SELECT rowid, id, title, raw_text FROM secondary_sources WHERE id = ?`
    ).bind(citation).run();

    count++;
  }

  return { result: { count }, message: `${count} chunk${count !== 1 ? 's' : ''} ingested.` };
}

/* =============================================================
   LIBRARY — list and delete documents across all types
   ============================================================= */
async function handleLibraryList(env) {
  const [cases, legislation, sources] = await Promise.all([
    env.DB.prepare(`
      SELECT id, citation AS ref, case_name AS title, court, case_date AS date,
             processed_date, summary_quality_score, 'case' AS doc_type,
             LENGTH(raw_text) AS raw_size, enriched, deep_enriched, subject_matter,
             facts, holding, holdings_extracted, principles_extracted, legislation_extracted,
             (SELECT COUNT(*) FROM case_chunks WHERE citation = cases.citation) AS chunk_count,
             (SELECT COUNT(*) FROM case_chunks WHERE citation = cases.citation AND embedded = 1) AS chunks_embedded
      FROM cases ORDER BY processed_date DESC
    `).all(),
    env.DB.prepare(`
      SELECT id, id AS ref, title, jurisdiction AS court, current_as_at AS date,
             processed_date, NULL AS summary_quality_score, 'legislation' AS doc_type,
             LENGTH(raw_text) AS raw_size, embedded, source_url
      FROM legislation ORDER BY processed_date DESC
    `).all(),
    env.DB.prepare(`
      SELECT id, id AS ref, title, source_type AS court, date_added AS date,
             date_added AS processed_date, NULL AS summary_quality_score,
             'secondary' AS doc_type, LENGTH(raw_text) AS raw_size,
             enriched, embedded, category
      FROM secondary_sources ORDER BY date_added DESC
    `).all(),
  ]);

  return {
    cases: cases.results || [],
    legislation: legislation.results || [],
    secondary: sources.results || [],
    totals: {
      cases: (cases.results || []).length,
      legislation: (legislation.results || []).length,
      secondary: (sources.results || []).length,
    }
  };
}

async function handleLibraryDelete(docType, id, env) {
  if (!id || !docType) throw new Error("Missing doc_type or id");
  const tableMap = { case: 'cases', legislation: 'legislation', secondary: 'secondary_sources' };
  const table = tableMap[docType];
  if (!table) throw new Error(`Unknown doc_type: ${docType}`);

  // ── Step 1: Delete child records first (FK constraint) ───────
  if (docType === 'legislation') {
    await env.DB.prepare("DELETE FROM legislation_sections WHERE legislation_id = ?").bind(id).run();
  }

  // ── Step 2: Delete from D1 ───────────────────────────────────
  await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  if (docType === 'secondary') {
    await env.DB.prepare(`DELETE FROM secondary_sources_fts WHERE source_id = ?`).bind(id).run();
  }

  // ── Step 3: Delete all Qdrant vectors for this citation ──────
  try {
    await fetch("https://nexus.arcanthyr.com/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nexus-Key": env.NEXUS_SECRET_KEY },
      body: JSON.stringify({ citation: id }),
    });
  } catch (e) {
    console.error("Nexus delete failed (non-fatal):", e.message);
  }

  return { ok: true, deleted: id };
}

async function handleCaseAuthority(citation, env) {
  // Resolve citation to case_name for cited_by lookup.
  // case_citations.cited_case stores authority NAMES (e.g. "House v The King"),
  // not bracket citations — so we must match on case_name, not citation.
  const nameRow = await env.DB.prepare(
    `SELECT case_name FROM cases WHERE citation = ? LIMIT 1`
  ).bind(citation).first();
  const caseName = nameRow?.case_name || '';
  // Strip "[YYYY] COURT N" suffix — some case_names include the full citation
  // but cited_case entries store the short party name (e.g. "Shaw v Tasmania")
  const shortName = caseName.replace(/\s*\[\d{4}\].*$/, '').trim();

  // cited_by: who in the corpus cites THIS case (by name match)
  // cites: what authorities does THIS case cite (by citation match — citing_case stores citations)
  const citedByQuery = caseName
    ? env.DB.prepare(`
        SELECT cc.citing_case, cc.treatment, cc.why,
               c.court, c.case_name
        FROM case_citations cc
        LEFT JOIN cases c ON c.citation = cc.citing_case
        WHERE LOWER(TRIM(cc.cited_case)) = LOWER(TRIM(?1))
           OR LOWER(TRIM(cc.cited_case)) = LOWER(TRIM(?2))
        ORDER BY cc.treatment ASC
      `).bind(caseName, shortName).all()
    : Promise.resolve({ results: [] });

  const [citedByRes, citesRes, legRes] = await Promise.all([
    citedByQuery,
    env.DB.prepare(`
      SELECT cc.cited_case, cc.treatment, cc.why,
             c.court, c.case_name
      FROM case_citations cc
      LEFT JOIN cases c ON c.citation = cc.cited_case
      WHERE cc.citing_case = ?
      ORDER BY cc.treatment ASC
    `).bind(citation).all(),
    env.DB.prepare(`
      SELECT legislation_ref
      FROM case_legislation_refs
      WHERE citation = ?
      ORDER BY legislation_ref ASC
    `).bind(citation).all()
  ]);

  const treatmentSummary = (citedByRes.results || []).reduce((acc, r) => {
    const t = r.treatment || 'mentioned';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  return {
    cited_by: citedByRes.results || [],
    cited_by_count: (citedByRes.results || []).length,
    treatment_summary: treatmentSummary,
    cites: citesRes.results || [],
    legislation: (legRes.results || []).map(r => r.legislation_ref)
  };
}

async function handleLegislationSearch(body, env) {
  const { query } = body;
  if (!query || !query.trim()) throw new Error("Missing query");
  const q = query.trim();
  const wild = `%${q}%`;

  // Extract section number if present (e.g. "s 125", "section 38A", "s.38")
  const secMatch = q.match(/\bs(?:ection)?\.?\s*(\d+[A-Z]?)/i);
  const secNum = secMatch ? secMatch[1] : null;

  // Act name fragment: strip section ref and 4-digit year
  const actFrag = q
    .replace(/\bs(?:ection)?\.?\s*\d+[A-Z]?/gi, '')
    .replace(/\b(1[89]\d{2}|20\d{2})\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  let rows;

  if (secNum && actFrag) {
    // Act name + section: exact section_number under matching act title
    const r = await env.DB.prepare(`
      SELECT s.section_number, s.heading, SUBSTR(s.text, 1, 600) AS text, s.part, l.title, l.jurisdiction, l.year
      FROM legislation_sections s JOIN legislation l ON s.legislation_id = l.id
      WHERE s.section_number = ? AND l.title LIKE ?
      ORDER BY l.title ASC LIMIT 10
    `).bind(secNum, `%${actFrag}%`).all();
    rows = r.results;

    // Fallback: section number across all acts
    if (!rows?.length) {
      const r2 = await env.DB.prepare(`
        SELECT s.section_number, s.heading, SUBSTR(s.text, 1, 600) AS text, s.part, l.title, l.jurisdiction, l.year
        FROM legislation_sections s JOIN legislation l ON s.legislation_id = l.id
        WHERE s.section_number = ?
        ORDER BY l.title ASC LIMIT 10
      `).bind(secNum).all();
      rows = r2.results;
    }
  } else if (secNum) {
    // Section number only — match across all acts
    const r = await env.DB.prepare(`
      SELECT s.section_number, s.heading, SUBSTR(s.text, 1, 600) AS text, s.part, l.title, l.jurisdiction, l.year
      FROM legislation_sections s JOIN legislation l ON s.legislation_id = l.id
      WHERE s.section_number = ?
      ORDER BY l.title ASC LIMIT 20
    `).bind(secNum).all();
    rows = r.results;
  } else {
    // Broad search: title, year, heading, section text
    const r = await env.DB.prepare(`
      SELECT s.section_number, s.heading, SUBSTR(s.text, 1, 600) AS text, s.part, l.title, l.jurisdiction, l.year
      FROM legislation_sections s JOIN legislation l ON s.legislation_id = l.id
      WHERE l.title LIKE ? OR l.year LIKE ? OR s.heading LIKE ? OR s.text LIKE ?
      ORDER BY l.title ASC LIMIT 20
    `).bind(wild, wild, wild, wild).all();
    rows = r.results;
  }

  if (!rows?.length) return { found: false, results: [], message: `No legislation found matching "${q}".` };
  return { found: true, results: rows };
}

async function handleSectionLookup(body, env) {
  // Look up a specific section from a legislation title + section number
  // Used for click-through from case legislation_extracted field
  const { title, jurisdiction, section } = body;
  if (!title || !section) throw new Error("Missing title or section");

  // Find the legislation record
  const jur = (jurisdiction || "Tas").toUpperCase().replace(/[^A-Z]/g, '');
  const legId = (title + '-' + jur).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

  const row = await env.DB.prepare(`
    SELECT s.section_number, s.heading, s.text, s.part, l.title, l.jurisdiction, l.year
    FROM legislation_sections s
    JOIN legislation l ON s.legislation_id = l.id
    WHERE s.legislation_id = ? AND s.section_number = ?
  `).bind(legId, String(section)).first();

  if (!row) return { found: false, message: `Section ${section} of ${title} (${jur}) not found. Has the Act been uploaded?` };
  return { found: true, ...row };
}

/* =============================================================
   SECTION QUERY DETECTION
   Detects patterns like "s 38 evidence act", "section 38(2) Evidence Act 2001",
   "Evidence Act s.38" and returns { sectionNum, actName } or null.
   ============================================================= */
function parseSectionQuery(query) {
  const q = query.trim();

  // Pattern A: "s[.] 38[A][(2)] <Act Name>" — section first
  const patA = /^s(?:ection)?\.?\s*(\d+[A-Z]?(?:\(\d+\))?)\s+(.{4,60}?)(?:\s+\d{4})?$/i;
  // Pattern B: "<Act Name> s[.] 38[A][(2)]" — act first
  const patB = /^(.{4,60}?)\s+s(?:ection)?\.?\s*(\d+[A-Z]?(?:\(\d+\))?)(?:\s+\d{4})?$/i;

  let m;
  if ((m = patA.exec(q))) {
    return { sectionNum: m[1].replace(/\(\d+\)/, '').trim(), actName: m[2].trim() };
  }
  if ((m = patB.exec(q))) {
    return { sectionNum: m[2].replace(/\(\d+\)/, '').trim(), actName: m[1].trim() };
  }
  return null;
}

/* Resolve act name to legislation id prefix — fuzzy match against known acts */
function resolveActTitle(actName) {
  const name = actName.toLowerCase();
  if (name.includes('evidence')) return 'Evidence Act 2001';
  if (name.includes('criminal code')) {
    // Criminal Code is uploaded in parts — try to match part from query
    if (name.includes('part i') || name.includes('part 1') || name.includes('introductory')) return 'Criminal Code Act 1924 - Part I';
    if (name.includes('part ii') || name.includes('part 2') || name.includes('public order')) return 'Criminal Code Act 1924 - Part II';
    if (name.includes('part iii') || name.includes('part 3') || name.includes('admin')) return 'Criminal Code Act 1924 - Part III';
    if (name.includes('part iv') || name.includes('part 4') || name.includes('public general')) return 'Criminal Code Act 1924 - Part IV';
    if (name.includes('part v') || name.includes('part 5') || name.includes('person')) return 'Criminal Code Act 1924 - Part V';
    if (name.includes('part vi') || name.includes('part 6') || name.includes('property')) return 'Criminal Code Act 1924 - Part VI';
    if (name.includes('part vii') || name.includes('part 7') || name.includes('fraud')) return 'Criminal Code Act 1924 - Part VII';
    if (name.includes('part viii') || name.includes('part 8') || name.includes('conspirac')) return 'Criminal Code Act 1924 - Part VIII';
    if (name.includes('part ix') || name.includes('part 9') || name.includes('procedure')) return 'Criminal Code Act 1924 - Part IX';
    // No part specified — try each part sequentially via D1 at query time
    return 'Criminal Code Act 1924 - Part V'; // default to Part V (crimes against person — most queried)
  }
  if (name.includes('sentencing')) return 'Sentencing Act 1997';
  if (name.includes('bail')) return 'Bail Act 1994';
  if (name.includes('justices')) return 'Justices Act 1959';
  if (name.includes('youth justice') || name.includes('youth')) return 'Youth Justice Act 1997';
  if (name.includes('corrections')) return 'Corrections Act 1997';
  if (name.includes('police')) return 'Police Offences Act 1935';
  // Fall back to title-cased input
  return actName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/* =============================================================
   LEGISLATION CASE SEARCH — normaliseSectionQuery
   Parses a free-form legislation query string into { sectionNum, actFrag }.
   Designed as a single-responsibility helper so the stare decisis panel can
   call /api/legal/search-by-legislation with the raw query string and all
   normalisation happens here in the Worker (single source of truth).

   sectionNum: alphanumeric section (e.g. "138", "16", "42AC") — or null.
   actFrag:    lowercased act name fragment (e.g. "evidence act") — or null.
   ============================================================= */
function normaliseSectionQuery(raw) {
  const q = (raw || '').trim();
  if (!q) return null;

  // Extract section number — handles: s 138, s.138, section 138, s138, ss 138, ss138
  // Captures the alphanumeric suffix (42AC, 16A, 138) but not sub-clause brackets
  const secMatch = q.match(/\bss?(?:ection)?\.?\s*(\d+[A-Za-z]{0,3})/i);
  const sectionNum = secMatch ? secMatch[1] : null;

  // Act fragment — strip section ref + sub-clauses, jurisdiction tag, year, "of the", then lowercase
  const actFrag = q
    .replace(/\bss?(?:ection)?\.?\s*\d+[A-Za-z]{0,3}(?:\s*\([^)]*\))*/gi, '')
    .replace(/\((?:Tas|NSW|Vic|Qld|SA|WA|NT|ACT|Cth)\)/gi, '')
    .replace(/\b(?:1[89]\d{2}|20\d{2})\b/g, '')
    .replace(/\bof\s+the\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return { sectionNum, actFrag: actFrag || null };
}

/* =============================================================
   GET /api/legal/search-by-legislation
   Returns cases that cite a specific legislation section, drawn directly
   from case_legislation_refs.  Pure SQL — no LLM, no VPS, no auth.
   Follows the same no-auth pattern as handleLibraryList.

   Query params:
     q      — raw search string, e.g. "s 138 Evidence Act"
     limit  — default 50, max 100
     offset — pagination offset, default 0

   Response shape (designed for stare decisis panel reuse):
     { ok, query: { raw, sectionNum, actFrag },
       results: [{ citation, case_name, court, case_date, holding,
                   subject_matter, matched_refs }],
       limit, offset, has_more, treatment_gap }

   treatment_gap: true — case_legislation_refs has no treatment/context column
   (applied / considered / interpreted). This is a gap in xref_agent.py;
   the flag surfaces it to callers rather than silently omitting the field.
   ============================================================= */
async function handleSearchByLegislation(url, env) {
  const q      = (url.searchParams.get('q') || '').trim();
  const limit  = Math.min(Math.max(parseInt(url.searchParams.get('limit')  || '50', 10), 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

  const parsed = normaliseSectionQuery(q);
  if (!parsed) return { ok: false, error: 'Missing query parameter q' };

  const { sectionNum, actFrag } = parsed;
  if (!sectionNum && !actFrag) {
    return { ok: false, error: 'Could not parse a section number or act name from query' };
  }

  // Court ordering uses the actual stored D1 values (lowercase abbreviations)
  const courtOrder = `CASE c.court WHEN 'cca' THEN 0 WHEN 'fullcourt' THEN 1 WHEN 'supreme' THEN 2 WHEN 'magistrates' THEN 3 ELSE 4 END`;

  let stmt, params;

  if (sectionNum && actFrag) {
    // Both section + act — most precise.
    // Six LIKE patterns cover the full format variation observed in case_legislation_refs:
    //   "s N " (space after)   "s N(" (sub-clause)   "sN " / "sN("  (no space before digit)
    //   "s N"  (end-of-string bare ref like "s 138")  "sN" (ditto, no space)
    const sl1 = `%s ${sectionNum} %`;
    const sl2 = `%s ${sectionNum}(%`;
    const sl3 = `%s${sectionNum} %`;
    const sl4 = `%s${sectionNum}(%`;
    const sl5 = `s ${sectionNum}`;
    const sl6 = `s${sectionNum}`;
    const al  = `%${actFrag}%`;
    stmt = env.DB.prepare(`
      SELECT DISTINCT c.citation, c.case_name, c.court, c.case_date,
             c.holding, c.subject_matter,
             GROUP_CONCAT(clr.legislation_ref, ' | ') AS matched_refs
      FROM case_legislation_refs clr
      JOIN cases c ON c.citation = clr.citation
      WHERE (
            clr.legislation_ref LIKE ?
         OR clr.legislation_ref LIKE ?
         OR clr.legislation_ref LIKE ?
         OR clr.legislation_ref LIKE ?
         OR clr.legislation_ref LIKE ?
         OR clr.legislation_ref LIKE ?
      )
        AND LOWER(clr.legislation_ref) LIKE LOWER(?)
      GROUP BY c.citation
      ORDER BY ${courtOrder}, c.case_date DESC
      LIMIT ? OFFSET ?`);
    params = [sl1, sl2, sl3, sl4, sl5, sl6, al, limit, offset];

  } else if (sectionNum) {
    // Section only — broader; may return many results across multiple acts
    const sl1 = `%s ${sectionNum} %`;
    const sl2 = `%s ${sectionNum}(%`;
    const sl3 = `%s${sectionNum} %`;
    const sl4 = `%s${sectionNum}(%`;
    const sl5 = `s ${sectionNum}`;
    const sl6 = `s${sectionNum}`;
    stmt = env.DB.prepare(`
      SELECT DISTINCT c.citation, c.case_name, c.court, c.case_date,
             c.holding, c.subject_matter,
             GROUP_CONCAT(clr.legislation_ref, ' | ') AS matched_refs
      FROM case_legislation_refs clr
      JOIN cases c ON c.citation = clr.citation
      WHERE (
            clr.legislation_ref LIKE ?
         OR clr.legislation_ref LIKE ?
         OR clr.legislation_ref LIKE ?
         OR clr.legislation_ref LIKE ?
         OR clr.legislation_ref LIKE ?
         OR clr.legislation_ref LIKE ?
      )
      GROUP BY c.citation
      ORDER BY ${courtOrder}, c.case_date DESC
      LIMIT ? OFFSET ?`);
    params = [sl1, sl2, sl3, sl4, sl5, sl6, limit, offset];

  } else {
    // Act name only — broad; useful for "Evidence Act" without a specific section
    const al = `%${actFrag}%`;
    stmt = env.DB.prepare(`
      SELECT DISTINCT c.citation, c.case_name, c.court, c.case_date,
             c.holding, c.subject_matter,
             GROUP_CONCAT(clr.legislation_ref, ' | ') AS matched_refs
      FROM case_legislation_refs clr
      JOIN cases c ON c.citation = clr.citation
      WHERE LOWER(clr.legislation_ref) LIKE LOWER(?)
      GROUP BY c.citation
      ORDER BY ${courtOrder}, c.case_date DESC
      LIMIT ? OFFSET ?`);
    params = [al, limit, offset];
  }

  const { results } = await stmt.bind(...params).all();
  return {
    ok: true,
    query: { raw: q, sectionNum, actFrag },
    results: results || [],
    limit,
    offset,
    has_more: (results || []).length === limit,
    // No treatment/context column in case_legislation_refs (applied/considered/interpreted).
    // xref_agent.py should be extended to extract treatment for legislation refs.
    treatment_gap: true,
  };
}

/* ── Word search (case_chunks_fts) ─────────────────────────────
   Free-text keyword search over case_chunks_fts. Single-word → word match;
   multi-word → phrase match; silent fallback to all-words-must-appear if
   phrase returns zero. User never types Boolean operators — input is
   sanitised and the Worker controls MATCH syntax internally.
   Auth: none (user-facing Library route, same pattern as search-by-legislation).
*/
function sanitiseFtsInput(raw) {
  // Strip FTS5 syntax characters and uppercase Boolean keywords. Users type
  // natural words; operators are injected by the Worker when needed.
  let s = (raw || '').toString();
  s = s.replace(/[\"\*\^\(\)\:]/g, ' ');      // strip special chars
  s = s.replace(/\bOR\b|\bAND\b|\bNOT\b/g, ' '); // strip uppercase Boolean keywords
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function parseAustLIIResults(html) {
  const COURT_MAP = { TASSC: 'supreme', TASCCA: 'cca', TASFC: 'fullcourt', TAMagC: 'magistrates' };
  const cases = [];
  const seen = new Set();
  const pattern = /href="\/cgi-bin\/viewdoc\/(au\/cases\/tas\/(TASSC|TASCCA|TASFC|TAMagC)\/(\d{4})\/(\d+)\.html)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const [, path, courtCode, year, num, rawName] = m;
    const citation = `[${year}] ${courtCode} ${num}`;
    if (seen.has(citation)) continue;
    seen.add(citation);
    const caseName = rawName
      .replace(/<[^>]+>/g, '')           // strip HTML tags
      .replace(/\s+/g, ' ')             // normalise whitespace
      .replace(/&amp;/g, '&')           // decode HTML entity
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s*\[\d{4}\].*$/, '')   // strip citation + date suffix
      .trim();
    cases.push({
      citation,
      case_name: caseName,
      url: `https://www.austlii.edu.au/cgi-bin/viewdoc/${path}`,
      court: COURT_MAP[courtCode] || courtCode,
      source: 'austlii'
    });
  }
  return cases;
}

async function handleAustLIIWordSearch(url, env) {
  const rawQ = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
  if (!rawQ || rawQ.length < 2) {
    return { ok: false, error: 'Query too short', cases: [], total: 0 };
  }
  const TAS_COURTS = [
    'au/cases/tas/TASSC',
    'au/cases/tas/TASCCA',
    'au/cases/tas/TASFC',
    'au/cases/tas/TAMagC'
  ];
  const baseParams = `query=${encodeURIComponent(rawQ)}&meta=%2Fau&method=auto&results=${limit}&rank=on`;
  const maskParams = TAS_COURTS.map(c => `mask_path=${encodeURIComponent(c)}`).join('&');
  const austliiUrl = `https://www.austlii.edu.au/cgi-bin/sinosrch.cgi?${baseParams}&${maskParams}`;
  try {
    const resp = await fetch(austliiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.austlii.edu.au/forms/search1.html',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9'
      }
    });
    if (!resp.ok) {
      return { ok: false, error: `AustLII returned HTTP ${resp.status}`, cases: [], total: 0 };
    }
    const html = await resp.text();
    const cases = parseAustLIIResults(html).slice(0, limit);
    if (cases.length === 0) {
      console.log('[austlii-word-search] 0 cases parsed. First tas href:', html.match(/href="[^"]*\/au\/cases\/tas[^"]*"/i)?.[0] || 'none found');
    }
    try {
      await env.DB.prepare(
        `INSERT INTO query_log (id, query_text, timestamp, refs_extracted, bm25_fired, result_ids, result_scores, result_sources, total_candidates, client_version, answer_text, model, search_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`
      ).bind(
        crypto.randomUUID(), rawQ, new Date().toISOString(),
        '[]', 0, '[]', '[]', '[]',
        cases.length, 'v68-history', null, null, 'austlii_word_search'
      ).run();
    } catch (_le) { console.error('query_log insert failed (austlii_word_search):', _le); }
    return { ok: true, query: rawQ, cases, total: cases.length, source: 'austlii' };
  } catch (err) {
    console.error('handleAustLIIWordSearch error:', err.message);
    return { ok: false, error: 'AustLII search failed — try again or check connection.', cases: [], total: 0 };
  }
}

async function handleFetchJudgment(url, env) {
  const rawUrl = url.searchParams.get('url');
  const citation = url.searchParams.get('citation') || null;

  if (!rawUrl || !rawUrl.includes('austlii.edu.au')) {
    return { ok: false, error: 'url required and must be an austlii.edu.au URL' };
  }

  const cached = await env.DB.prepare(
    `SELECT html, fetched_at FROM austlii_cache WHERE url = ?`
  ).bind(rawUrl).first();

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < 30 * 24 * 60 * 60 * 1000) {
      return { ok: true, html: cached.html, source: 'cache' };
    }
  }

  try {
    const resp = await fetch(rawUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.austlii.edu.au/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9'
      }
    });

    if (!resp.ok) {
      return { ok: false, error: `AustLII returned HTTP ${resp.status}` };
    }

    let html = await resp.text();
    if (html.length > 800000) html = html.substring(0, 800000);

    await env.DB.prepare(
      `INSERT INTO austlii_cache (url, citation, html, fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET html = excluded.html, fetched_at = excluded.fetched_at`
    ).bind(rawUrl, citation, html, new Date().toISOString()).run();

    return { ok: true, html, source: 'fetch' };
  } catch (err) {
    console.error('handleFetchJudgment error:', err.message);
    return { ok: false, error: 'Failed to fetch judgment from AustLII.' };
  }
}

async function handleAmendments(url, env) {
  const act = (url.searchParams.get('act') || '').trim().toLowerCase();

  if (!/^(act|sr)-\d{4}-\d{3}$/.test(act)) {
    return { ok: false, error: 'Invalid act parameter. Expected format: act-YYYY-NNN or sr-YYYY-NNN' };
  }

  // Cache check (30 days)
  const cached = await env.DB.prepare(
    `SELECT act_title, amendments_json, cached_at FROM tbl_amendment_cache WHERE act_id = ?`
  ).bind(act).first();

  if (cached) {
    const age = Math.floor(Date.now() / 1000) - cached.cached_at;
    if (age < 2592000) {
      return { ok: true, actId: act, actTitle: cached.act_title, amendments: JSON.parse(cached.amendments_json), source: 'cache' };
    }
  }

  // Build IntStr expression value: act-1997-059 → ZA59/ZY1997
  const [type, year, num] = act.split('-');
  const prefix = type === 'act' ? 'ZA' : 'ZS';
  const expressionValue = `${prefix}${parseInt(num)}/ZY${year}`;
  const expression = `"Commencement.IntStr"=?"${expressionValue}"? AND "Commencement.Commence Date" < "99990101000000" AND "Commencement.Source Title" = ?`;
  const apiUrl = `https://www.legislation.tas.gov.au/projectdata?ds=EnAct-AmendmentTableDataSource&expression=${encodeURIComponent(expression)}&iDisplayStart=0&iDisplayLength=200`;

  try {
    const resp = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.legislation.tas.gov.au/',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-AU,en;q=0.9',
      }
    });

    if (!resp.ok) return { ok: false, error: `Legislation API returned ${resp.status}` };

    const data = await resp.json();

    if (!data.data || !data.data.length) {
      return { ok: true, actId: act, actTitle: null, amendments: [] };
    }

    function uniVal(field) {
      if (!field) return null;
      if (typeof field === 'string') return field;
      if (field.__value__ !== undefined) return field.__value__;
      return null;
    }

    const actTitle = uniVal(data.data[0]['Commencement.Target Title']);

    const seen = new Set();
    const amendments = [];

    for (const row of data.data) {
      const commenceType = uniVal(row['Commencement.Commence Type']);
      if (commenceType === 'OTHER') continue;

      const sourceActNo = uniVal(row['Commencement.Source Act No']);
      const sourceYear  = uniVal(row['Commencement.Source Year']);
      const dedupKey = `${sourceActNo}/${sourceYear}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const sourceTitle = uniVal(row['Commencement.Source Title']);
      const targetTitle = uniVal(row['Commencement.Target Title']);
      const rawDate     = row['Commencement.Commence Date'];
      const dateStr     = rawDate ? (typeof rawDate === 'string' ? rawDate.slice(0, 10) : null) : null;
      const isOriginal  = sourceTitle === targetTitle;

      const yearInt = parseInt(sourceYear);
      const numInt  = parseInt(sourceActNo);
      const billPageUrl = yearInt >= 2002
        ? `https://www.google.com/search?q=site:parliament.tas.gov.au+"${numInt}+of+${sourceYear}"`
        : null;

      amendments.push({
        name: sourceTitle,
        actNo: sourceActNo,
        year: sourceYear,
        commenceDate: dateStr,
        isOriginal,
        billPageUrl,
        hansardSearchUrl: 'https://search.parliament.tas.gov.au/adv/hahansard',
        hasBillPage: yearInt >= 2002,
        hasSecondReading: yearInt >= 2005 ? true : yearInt >= 2002 ? 'maybe' : false,
      });
    }

    // Principal Act pinned first, then chronological
    amendments.sort((a, b) => {
      if (a.isOriginal && !b.isOriginal) return -1;
      if (!a.isOriginal && b.isOriginal) return 1;
      if (a.commenceDate && b.commenceDate) return a.commenceDate.localeCompare(b.commenceDate);
      return 0;
    });

    await env.DB.prepare(
      `INSERT OR REPLACE INTO tbl_amendment_cache (act_id, act_title, amendments_json, cached_at) VALUES (?, ?, ?, ?)`
    ).bind(act, actTitle, JSON.stringify(amendments), Math.floor(Date.now() / 1000)).run();

    return { ok: true, actId: act, actTitle, amendments, source: 'fetch' };
  } catch (err) {
    console.error('handleAmendments error:', err.message);
    return { ok: false, error: 'Failed to fetch amendment data.' };
  }
}

async function handleResolveAct(url, env) {
  const rawName = (url.searchParams.get('name') || '').trim();
  if (!rawName) return { ok: false, error: 'name parameter required' };

  // Normalise: strip section prefix, (Tas)/(TAS) suffix
  const normalized = rawName
    .replace(/^s\s+[\d\w.()\-]+\s+/i, '')
    .replace(/\s*\(Tas\)/gi, '')
    .replace(/\s*\(TAS\)/g, '')
    .trim();

  if (!normalized) return { ok: false, error: 'Could not normalise act name' };

  // Check D1 legislation table for cached source_url
  try {
    const row = await env.DB.prepare(
      `SELECT id, title, source_url FROM legislation WHERE LOWER(title) LIKE LOWER('%' || ? || '%') LIMIT 1`
    ).bind(normalized).first();

    if (row && row.source_url) {
      const m = /\/((?:act|sr)-\d{4}-\d{3})$/.exec(row.source_url);
      if (m) return { ok: true, actId: m[1], actTitle: row.title, source: 'cache' };
    }
  } catch (_) { /* column may not exist in older schema — fall through */ }

  // Resolve via amendment datasource: query by Target Title to get IntStr
  const expression = `"Commencement.Target Title"="${normalized}"`;
  const apiUrl = `https://www.legislation.tas.gov.au/projectdata?ds=EnAct-AmendmentTableDataSource&expression=${encodeURIComponent(expression)}&iDisplayStart=0&iDisplayLength=1`;

  try {
    const resp = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.legislation.tas.gov.au/',
        'Accept': 'application/json, text/plain, */*',
      }
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();

    if (!data.data || !data.data.length) {
      return { ok: true, actId: null, actTitle: normalized, source: 'not_found' };
    }

    const row = data.data[0];
    const actTitle = row['Commencement.Target Title']?.__value__ || normalized;

    // IntStr can be a single UniString or an array of UniStrings
    const intStrField = row['Commencement.IntStr'];
    let intStrValue = null;
    if (Array.isArray(intStrField)) {
      intStrValue = intStrField[0]?.__value__ || null;
    } else if (intStrField?.__value__) {
      intStrValue = intStrField.__value__;
    }

    if (!intStrValue) return { ok: true, actId: null, actTitle, source: 'not_found' };

    // ZA76/ZY2001/... → act-2001-076
    const m = intStrValue.match(/^Z([AS])(\d+)\/ZY(\d{4})/);
    if (!m) return { ok: true, actId: null, actTitle, source: 'not_found' };

    const actType = m[1] === 'A' ? 'act' : 'sr';
    const actNum  = String(parseInt(m[2])).padStart(3, '0');
    const actYear = m[3];
    const actId   = `${actType}-${actYear}-${actNum}`;

    // Write back source_url to legislation table if row exists
    try {
      await env.DB.prepare(
        `UPDATE legislation SET source_url = ? WHERE LOWER(title) LIKE LOWER('%' || ? || '%') AND source_url IS NULL`
      ).bind(`https://www.legislation.tas.gov.au/view/whole/html/inforce/current/${actId}`, normalized).run();
    } catch (_) { /* non-fatal */ }

    return { ok: true, actId, actTitle, source: 'resolved' };
  } catch (err) {
    console.error('handleResolveAct error:', err.message);
    return { ok: false, error: 'Failed to resolve act.' };
  }
}

async function handleWordSearch(url, env) {
  const rawQ  = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10), 1), 100);
  const court = (url.searchParams.get('court') || '').trim().toLowerCase();

  const cleaned = sanitiseFtsInput(rawQ);
  if (cleaned.length < 2) {
    return { ok: false, error: 'Query too short — please enter at least 2 characters.', cases: [], total: 0 };
  }

  const terms = cleaned.split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return { ok: false, error: 'Query contained no searchable words.', cases: [], total: 0 };
  }

  // Primary pattern: phrase match (works for single word too — FTS5 treats
  // "word" as a one-token phrase).
  const phraseMatch = `"${terms.join(' ')}"`;
  // Fallback pattern: all-terms-must-appear (implicit AND via space-joined
  // tokens is actually implicit OR in FTS5 — we use explicit AND between terms).
  const andMatch = terms.join(' AND ');

  async function runQuery(ftsExpr) {
    // Step 1: FTS-only query — bm25() only works without JOIN/GROUP BY.
    // Alias as bm25_score (not rank) to avoid conflict with FTS5 built-in rank column.
    const ftsRes = await env.DB.prepare(
      `SELECT citation, bm25(case_chunks_fts) AS bm25_score
       FROM case_chunks_fts
       WHERE case_chunks_fts MATCH ?
       ORDER BY bm25_score LIMIT 200`
    ).bind(ftsExpr).all();
    const ftsRows = ftsRes.results || [];
    if (ftsRows.length === 0) return [];

    // Step 2: Dedupe — keep best (lowest) rank per citation
    const rankMap = new Map();
    const countMap = new Map();
    for (const row of ftsRows) {
      const prev = rankMap.get(row.citation);
      if (prev === undefined || row.bm25_score < prev) rankMap.set(row.citation, row.bm25_score);
      countMap.set(row.citation, (countMap.get(row.citation) || 0) + 1);
    }

    // Step 3: Sort by rank, trim to limit before the metadata query.
    // D1 caps bound variables at 100 — passing all deduplicated citations
    // (up to 200) would exceed that limit. Slice here so the IN clause
    // never has more than `limit` placeholders.
    const sortedCitations = [...rankMap.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([cit]) => cit)
      .slice(0, limit);

    if (sortedCitations.length === 0) return [];

    // Step 4: Fetch case metadata. Court filter is applied in JS (step 5)
    // to keep the number of bound variables equal to sortedCitations.length only.
    const placeholders = sortedCitations.map(() => '?').join(',');
    const casesSql = `SELECT citation, case_name, court, case_date, subject_matter, holding
                      FROM cases WHERE citation IN (${placeholders})`;
    const casesRes = await env.DB.prepare(casesSql).bind(...sortedCitations).all();
    const caseMap = new Map((casesRes.results || []).map(r => [r.citation, r]));

    // Step 5: Merge rank data back; apply optional court filter in JS.
    return sortedCitations
      .filter(cit => {
        if (!caseMap.has(cit)) return false;
        if (court && caseMap.get(cit).court?.toLowerCase() !== court) return false;
        return true;
      })
      .map(cit => ({
        ...caseMap.get(cit),
        best_rank: rankMap.get(cit),
        match_count: countMap.get(cit)
      }));
  }

  let results = [];
  let matchMode = 'phrase';
  try {
    results = await runQuery(phraseMatch);
    if (results.length === 0 && terms.length > 1) {
      // Silent fallback to all-terms-must-appear
      const andResults = await runQuery(andMatch);
      if (andResults.length > 0) {
        results = andResults;
        matchMode = 'all_words';
      }
    }
  } catch (err) {
    // Malformed FTS expression — fall back to a single-term query on the
    // longest token to avoid returning a hard error for the user.
    console.error('word-search primary query failed:', err);
    try {
      const longest = terms.sort((a, b) => b.length - a.length)[0];
      results = await runQuery(`"${longest}"`);
      matchMode = 'fallback_single';
    } catch (err2) {
      console.error('word-search fallback also failed:', err2);
      return { ok: false, error: 'Search failed — please simplify your query.', cases: [], total: 0 };
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO query_log (id, query_text, timestamp, refs_extracted, bm25_fired, result_ids, result_scores, result_sources, total_candidates, client_version, answer_text, model, search_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`
    ).bind(
      crypto.randomUUID(), rawQ, new Date().toISOString(),
      '[]', 0, '[]', '[]', '[]',
      results.length, 'v68-history', null, null, 'word_search'
    ).run();
  } catch (_le) { console.error('query_log insert failed (word_search):', _le); }

  return {
    ok: true,
    query: { raw: rawQ, cleaned, terms },
    match_mode: matchMode,                   // 'phrase' | 'all_words' | 'fallback_single'
    cases: results,
    total: results.length,
    has_more: results.length === limit,
    limit,
  };
}

/* Fetch a section from D1 and format as context block. Returns null if not found.
   For Criminal Code queries without a part specified, tries all parts sequentially. */
async function fetchSectionContext(sectionNum, actName, env) {
  const resolvedTitle = resolveActTitle(actName);

  // If Criminal Code with no specific part, search all parts
  const crimCodeParts = [
    'Criminal Code Act 1924 - Part I',
    'Criminal Code Act 1924 - Part II',
    'Criminal Code Act 1924 - Part III',
    'Criminal Code Act 1924 - Part IV',
    'Criminal Code Act 1924 - Part V',
    'Criminal Code Act 1924 - Part VI',
    'Criminal Code Act 1924 - Part VII',
    'Criminal Code Act 1924 - Part VIII',
    'Criminal Code Act 1924 - Part IX',
  ];
  const isCrimCodeGeneric = actName.toLowerCase().includes('criminal code') &&
    !actName.toLowerCase().match(/part (i|v|x|\d)/i);

  const titlesToTry = isCrimCodeGeneric ? crimCodeParts : [resolvedTitle];

  for (const title of titlesToTry) {
    const row = await handleSectionLookup({ title, jurisdiction: 'Tas', section: sectionNum }, env).catch(() => null);
    if (row && row.found) {
      return {
        block: `[LEGISLATION] ${row.title} s ${row.section_number} — ${row.heading}\n${row.text}`,
        label: `${row.title} s ${row.section_number}`,
        title: row.title,
        section: row.section_number,
        heading: row.heading,
      };
    }
  }
  return null;
}

/* =============================================================
   LEGAL QUERY — Phase 5 conversational interface
   Flow: embed query → Qdrant semantic search (nexus /search)
         → re-ranked chunks → Claude API with context
         → grounded answer with source citations
   ============================================================= */
async function handleLegalQuery(body, env) {
  const { query, top_k, score_threshold, subject_matter_filter } = body;
  if (!query || !query.trim()) throw new Error("query field required");
  const queryId = crypto.randomUUID();

  // ── Step 1: Retrieve relevant chunks from Qdrant via nexus ──
  const nexusRes = await fetch("https://nexus.arcanthyr.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nexus-Key": env.NEXUS_SECRET_KEY,
    },
    body: JSON.stringify({
      query_text: query.trim(),
      top_k: top_k || 6,
      score_threshold: score_threshold || 0.45,
      subject_matter_filter: subject_matter_filter || null,
    }),
  });

  if (!nexusRes.ok) throw new Error(`Nexus search failed: ${nexusRes.status}`);
  const nexusData = await nexusRes.json();
  const chunks = (nexusData.chunks || []).filter(c => !(c.court === null && c.year === null && typeof c.citation === 'string' && !c.citation.match(/^\[\d{4}\]/)));
  const hasCases = chunks.length > 0;

  // ── Step 1b: Section query detection — prepend legislation text ─
  let sectionContext = null;
  const parsed = parseSectionQuery(query.trim());
  if (parsed) {
    sectionContext = await fetchSectionContext(parsed.sectionNum, parsed.actName, env);
  }

  // ── Step 2: Build context ────────────────────────────────────
  if (chunks.length === 0 && !sectionContext) {
    // Log zero-result queries too
    try {
      await env.DB.prepare(
        `INSERT INTO query_log (id, query_text, timestamp, refs_extracted, bm25_fired, result_ids, result_scores, result_sources, total_candidates, client_version, answer_text, model, search_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`
      ).bind(queryId, query.trim(), new Date().toISOString(), '[]', 0, '[]', '[]', '[]', 0, 'v68-history', 'No sufficiently relevant cases or legislation were found for that query. Try rephrasing, or the relevant material may not yet be ingested.', 'claude', 'semantic').run();
    } catch (_le) { console.error('query_log insert failed (zero-result):', _le); }
    return {
      answer: "No sufficiently relevant cases or legislation were found for that query. Try rephrasing, or the relevant material may not yet be ingested.",
      sources: [],
      chunk_count: 0,
      query_id: queryId,
    };
  }

  const caseBlocks = chunks.map((c) => {
    const caseName = c.case_name ? `${c.case_name} ` : '';
    const courtSuffix = c.court && c.court.toLowerCase() !== 'unknown' ? ` (${c.court})` : '';
    const principles = Array.isArray(c.principles) && c.principles.length > 0
      ? `\nKey principles: ${c.principles.slice(0, 3).join("; ")}`
      : "";
    const label = c.type === 'case_chunk' ? '[CASE EXCERPT]'
                : c.type === 'legislation' ? '[LEGISLATION]'
                : c.type === 'authority_synthesis' ? '[AUTHORITY ANALYSIS]'
                : '[ANNOTATION]';
    return `${label} ${caseName}${c.citation}${courtSuffix}\n${c.text}${principles}`;
  }).join("\n\n---\n\n");

  const contextBlocks = sectionContext
    ? `${sectionContext.block}\n\n---\n\n${caseBlocks}`
    : caseBlocks;

  const systemPrompt = (sectionContext && hasCases)
    ? `You are a Tasmanian criminal law research assistant. The section text has been provided, followed by case excerpts. Quote and explain the section, then discuss how the cases have applied it. Be precise and cite specific cases. Format in plain prose - no markdown headers.`
    : (sectionContext && !hasCases)
      ? `You are a Tasmanian criminal law research assistant. The section text has been provided. Quote it and explain what it means. Do not speculate about how courts have applied it - no cases are in the database yet for this section. Format in plain prose - no markdown headers.`
      : `You are a Tasmanian criminal law research assistant. Answer using the provided excerpts, which may include raw judgment text, synthesised doctrine, or legislation. Be precise and cite specific cases. When excerpts contain raw judgment text, reason from and synthesise what is there — do not refuse to answer simply because the text lacks a clean doctrinal statement. Only say the material is insufficient if the excerpts are genuinely silent on the topic. AUTHORITY ANALYSIS blocks summarise how Tasmanian courts have cited and treated a specific case — use them to describe subsequent treatment, citation frequency, and how the case has been applied or distinguished. Format in plain prose - no markdown headers.`;

  const answerNote = sectionContext
    ? `The full text of ${sectionContext.label} is provided first. Quote it in your answer, then discuss any cases that have applied or interpreted it.`
    : `Cite the case citation (e.g. [2024] TASSC 42) when you rely on a specific case.`;

  const citationRules = `CRITICAL CITATION RULES:
- You may only cite cases, legislation, and authorities that appear explicitly in the source material provided above.
- Do NOT generate, recall, or infer case citations from your training knowledge.
- If a case name or citation does not appear in the retrieved sources, do not mention it.
- Party names must match those in the source material. If a source contains a citation (e.g. [2020] TASMC 9) without party names, cite by citation alone — do not complete or infer party names from training knowledge.
- If the retrieved sources do not contain sufficient case authority on a point, say so explicitly — do not fabricate citations to fill the gap.
- Legislation references must match exactly what appears in the source material — do not correct, complete, or substitute legislation names from your training knowledge.
- It is better to say "the retrieved sources do not contain specific case authority on this point" than to cite a case that may not exist or may not stand for the proposition stated.

ANSWER STRUCTURE:
- Answer based only on the retrieved source material provided.
- Where the sources are insufficient to fully answer the question, say so clearly.
- Do not pad answers with general legal principles from your training knowledge unless they are directly supported by the retrieved sources.`;

  const userPrompt = `Question: ${query.trim()}

Relevant material:

${contextBlocks}

${citationRules}

${answerNote}`;

  // ── Step 3: Call Claude API ──────────────────────────────────
  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    throw new Error(`Claude API error: ${claudeRes.status} — ${errText}`);
  }

  const claudeData = await claudeRes.json();
  const answer = claudeData.content?.[0]?.text || "No response from model.";

  // ── Query logging ─────────────────────────────────────────────
  try {
    const _refPat = /\bs\s*(\d+[A-Za-z]*)/gi;
    const _refs = []; let _m;
    const _qs = query.trim();
    while ((_m = _refPat.exec(_qs)) !== null) _refs.push(_m[0].trim());
    await env.DB.prepare(
      `INSERT INTO query_log (id, query_text, timestamp, refs_extracted, bm25_fired, result_ids, result_scores, result_sources, total_candidates, client_version, answer_text, model, search_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`
    ).bind(
      queryId, _qs, new Date().toISOString(),
      JSON.stringify(_refs), _refs.length > 0 ? 1 : 0,
      JSON.stringify(chunks.slice(0,5).map(c => c._id || c._qdrant_id || c.citation || 'unknown')),
      JSON.stringify(chunks.slice(0,5).map(c => typeof c.score==='number' ? Math.round(c.score*10000)/10000 : null)),
      JSON.stringify(chunks.slice(0,5).map(c => c.type || c.source_type || 'unknown')),
      chunks.length, 'v68-history', answer.slice(0, 2000), 'claude', 'semantic'
    ).run();
  } catch (_le) { console.error('query_log insert failed:', _le); }

  // ── Step 4: Return answer + deduplicated source list ─────────
  const seen = new Set();
  const caseSources = chunks
    .filter(c => { if (seen.has(c.citation)) return false; seen.add(c.citation); return true; })
    .map(c => ({
      citation: c.citation,
      court: c.court,
      year: c.year,
      score: c.score,
      summary: c.summary || "",
      type: c.type,
      source_type: c.source_type,
    }));

  const sources = sectionContext
    ? [{ citation: sectionContext.label, court: 'legislation', year: null, score: 1.0, summary: sectionContext.heading }, ...caseSources]
    : caseSources;

  return { answer, sources, chunk_count: chunks.length, model: "claude", query_id: queryId };
}


/* =============================================================
   QUERY HISTORY
   ============================================================= */
async function handleGetQueryHistory(request, env, corsHeaders) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, query_text, answer_text, model, timestamp
       FROM query_log
       WHERE deleted IS NULL OR deleted != 1
       ORDER BY timestamp DESC
       LIMIT 50`
    ).all();
    return new Response(JSON.stringify({ ok: true, history: results || [] }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('handleGetQueryHistory error:', err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

async function handleDeleteQueryHistory(request, env, corsHeaders) {
  try {
    const { id } = await request.json();
    if (!id) return new Response(JSON.stringify({ ok: false, error: 'id required' }), { status: 400, headers: corsHeaders });
    await env.DB.prepare(`UPDATE query_log SET deleted = 1 WHERE id = ?`).bind(id).run();
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    console.error('handleDeleteQueryHistory error:', err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: corsHeaders,
    });
  }
}

/* =============================================================
   FETCH-PAGE PROXY
   Routes AustLII requests through Cloudflare edge IPs.
   Used by VPS scraper when its IP is blocked by AustLII.
   Only allows requests to austlii.edu.au for safety.
   ============================================================= */
async function handleFetchPage(body, env = null) {
  const { url } = body;
  const allowed = url && (url.includes('austlii.edu.au') || url.includes('jade.io'));
  if (!allowed) {
    throw new Error('Invalid or disallowed URL — only austlii.edu.au and jade.io are permitted');
  }
  // Route AustLII fetches through VPS to avoid Cloudflare edge IP blocks
  if (env && url.includes('austlii.edu.au')) {
    const vpsRes = await fetch('https://nexus.arcanthyr.com/fetch-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Key': env.NEXUS_SECRET_KEY },
      body: JSON.stringify({ url }),
    });
    const data = await vpsRes.json();
    if (data.error && !data.html) throw new Error(data.error);
    return { html: data.html || '', status: data.status };
  }
  // jade.io or no env — direct fetch
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-AU,en;q=0.9',
    }
  });
  const html = await response.text();
  return { html, status: response.status };
}

/* =============================================================
   LEGAL QUERY — Workers AI (Llama 3.1 8b via Cloudflare GPU)
   Fast, free tier ~1000 queries/day. Section detection included.
   ============================================================= */
async function handleLegalQueryWorkersAI(body, env) {
  const { query, top_k, score_threshold, subject_matter_filter } = body;
  if (!query || !query.trim()) throw new Error("query field required");
  const queryId = crypto.randomUUID();

  // ── Step 1: Qdrant search via nexus ──────────────────────────
  const nexusRes = await fetch("https://nexus.arcanthyr.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Nexus-Key": env.NEXUS_SECRET_KEY },
    body: JSON.stringify({
      query_text: query.trim(),
      top_k: top_k || 6,
      score_threshold: score_threshold || 0.45,
      subject_matter_filter: subject_matter_filter || null,
    }),
  });
  if (!nexusRes.ok) throw new Error(`Nexus search failed: ${nexusRes.status}`);
  const nexusData = await nexusRes.json();
  const chunks = (nexusData.chunks || []).filter(c => !(c.court === null && c.year === null && typeof c.citation === 'string' && !c.citation.match(/^\[\d{4}\]/)));
  const citationQuery = /\[\d{4}\]/.test(query);
  const hasCaseChunks = chunks.some(c => c.type === 'case_chunk');
  let orderedChunks = (citationQuery && hasCaseChunks)
    ? [...chunks].sort((a, b) => {
        if (a.type === 'case_chunk' && b.type !== 'case_chunk') return -1;
        if (a.type !== 'case_chunk' && b.type === 'case_chunk') return 1;
        return 0;
      })
    : chunks;
  if (citationQuery && hasCaseChunks) {
    let annotationCount = 0;
    orderedChunks = orderedChunks.filter(c => {
      if (c.type !== 'case_chunk') { annotationCount++; return annotationCount <= 2; }
      return true;
    });
  }
  const hasCases = orderedChunks.length > 0;

  // ── Step 1b: Section query detection ─────────────────────────
  let sectionContext = null;
  const parsed = parseSectionQuery(query.trim());
  if (parsed) {
    sectionContext = await fetchSectionContext(parsed.sectionNum, parsed.actName, env);
  }

  // ── Step 2: Build context ────────────────────────────────────
  if (orderedChunks.length === 0 && !sectionContext) {
    return {
      answer: "No sufficiently relevant cases or legislation were found for that query. Try rephrasing, or the relevant material may not yet be ingested.",
      sources: [],
      chunk_count: 0,
      model: "workers-ai",
    };
  }

  const caseBlocks = orderedChunks.map((c) => {
    const caseName = c.case_name ? `${c.case_name} ` : '';
    const courtSuffix = c.court && c.court.toLowerCase() !== 'unknown' ? ` (${c.court})` : '';
    const label = c.type === 'case_chunk' ? '[CASE EXCERPT]' : c.type === 'authority_synthesis' ? '[AUTHORITY ANALYSIS]' : '[ANNOTATION]';
    return `${label} ${caseName}${c.citation}${courtSuffix}\n${c.text}`;
  }).join("\n\n---\n\n");

  const contextBlocks = sectionContext
    ? `${sectionContext.block}\n\n---\n\n${caseBlocks}`
    : caseBlocks;

  const systemPrompt = (sectionContext && hasCases)
    ? `You are a Tasmanian criminal law assistant. Quote and explain the section, then discuss only how the provided cases have applied it. Be precise. Plain prose only. Never invent citations.`
    : (sectionContext && !hasCases)
      ? `You are a Tasmanian criminal law assistant. Quote and explain the provided section. Do not speculate about case application — state clearly that no cases are yet available. Plain prose only. Never invent citations.`
      : `You are a Tasmanian criminal law assistant. Answer from the provided case excerpts. When excerpts contain raw judgment text, summarise and reason from the court's reasoning and findings directly — do not refuse if no clean doctrinal statement is present. CASE EXCERPT blocks contain primary source judgment text — draw your answer primarily from these. AUTHORITY ANALYSIS blocks summarise how Tasmanian courts have cited and treated a specific case — use them to describe subsequent treatment and how the case has been applied or distinguished. ANNOTATION blocks provide supplementary practitioner context. Plain prose only. Never invent citations.`;

  const answerNote = (sectionContext && hasCases)
    ? `Quote ${sectionContext.label} in your answer, then discuss how the cases have applied or interpreted it.`
    : (sectionContext && !hasCases)
      ? `Explain ${sectionContext.label} clearly. Do not invent case law - note that no cases interpreting this section have been ingested yet.`
      : `Cite the case citation when relying on a specific case.`;

  // ── Step 3: Workers AI inference ─────────────────────────────
  const response = await env.AI.run(WORKERS_AI_MODEL, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Question: ${query.trim()}\n\nRelevant material:\n\n${contextBlocks}\n\nRULES — follow strictly:\n1. Only cite cases and legislation that appear explicitly in the source material above.\n2. Do not recall, infer, or generate citations from training knowledge.\n3. Party names must match the source material. If a source shows only a citation without party names, cite by citation alone — do not complete party names.\n4. If a source contains raw judgment text, extract and summarise the court's reasoning and findings directly from that text. Only note a gap if no relevant material is present at all.\n5. Do not pad answers with general principles unless directly supported by the retrieved sources.\n6. It is better to admit a gap than to fill it with uncertain information.\n\n${answerNote}` },
    ],
    max_tokens: 2000,
    budget_tokens: 0,
  });

  const answer =
    response?.choices?.[0]?.message?.content?.trim() ||
    response?.choices?.[0]?.text?.trim() ||
    response?.response?.trim() ||
    "No response from model.";

  // ── Query logging ─────────────────────────────────────────────
  try {
    const _refPat = /\bs\s*(\d+[A-Za-z]*)/gi;
    const _refs = []; let _m;
    const _qs = query.trim();
    while ((_m = _refPat.exec(_qs)) !== null) _refs.push(_m[0].trim());
    await env.DB.prepare(
      `INSERT INTO query_log (id, query_text, timestamp, refs_extracted, bm25_fired, result_ids, result_scores, result_sources, total_candidates, client_version, answer_text, model, search_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`
    ).bind(
      queryId, _qs, new Date().toISOString(),
      JSON.stringify(_refs), _refs.length > 0 ? 1 : 0,
      JSON.stringify(orderedChunks.slice(0,5).map(c => c._id || c._qdrant_id || c.citation || 'unknown')),
      JSON.stringify(orderedChunks.slice(0,5).map(c => typeof c.score==='number' ? Math.round(c.score*10000)/10000 : null)),
      JSON.stringify(orderedChunks.slice(0,5).map(c => c.type || c.source_type || 'unknown')),
      orderedChunks.length, 'v68-history', answer.slice(0, 2000), 'workers-ai', 'semantic'
    ).run();
  } catch (_le) { console.error('query_log insert failed:', _le); }

  // ── Step 4: Return ───────────────────────────────────────────
  const seen = new Set();
  const caseSources = orderedChunks
    .filter(c => { if (seen.has(c.citation)) return false; seen.add(c.citation); return true; })
    .map(c => ({ citation: c.citation, court: c.court, year: c.year, score: c.score, summary: c.summary || "", type: c.type, source_type: c.source_type }));

  const sources = sectionContext
    ? [{ citation: sectionContext.label, court: 'legislation', year: null, score: 1.0, summary: sectionContext.heading }, ...caseSources]
    : caseSources;

  return { answer, sources, chunk_count: orderedChunks.length, model: "workers-ai", query_id: queryId };
}

/* =============================================================
   CROSS-REFERENCE AGENT ROUTES
   ============================================================= */
async function handleFetchCasesForXref(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const url = new URL(request.url);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const { results } = await env.DB.prepare(`
      SELECT citation, authorities_extracted, legislation_extracted, subject_matter
      FROM cases
      WHERE authorities_extracted IS NOT NULL
        AND authorities_extracted != '[]'
        AND authorities_extracted != ''
        AND subject_matter IN ('criminal', 'mixed')
      ORDER BY citation
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();
    return new Response(JSON.stringify({ ok: true, cases: results || [], count: results?.length || 0 }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function handleWriteCitations(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const { rows } = await request.json();
    if (!rows || rows.length === 0) return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
    let inserted = 0;
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const stmts = rows.slice(i, i + CHUNK).map(row =>
        env.DB.prepare(`INSERT OR IGNORE INTO case_citations (id, citing_case, cited_case, treatment, why, date_added) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(row.id, row.citing_case, row.cited_case, row.treatment || null, row.why || null, row.date_added)
      );
      const results = await env.DB.batch(stmts);
      inserted += results.reduce((sum, r) => sum + (r.meta?.changes || 0), 0);
    }
    return new Response(JSON.stringify({ ok: true, inserted }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function handleWriteLegislationRefs(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const { rows } = await request.json();
    if (!rows || rows.length === 0) return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
    let inserted = 0;
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const stmts = rows.slice(i, i + CHUNK).map(row =>
        env.DB.prepare(`INSERT OR IGNORE INTO case_legislation_refs (id, citation, legislation_ref, date_added) VALUES (?, ?, ?, ?)`)
          .bind(row.id, row.citation, row.legislation_ref, row.date_added)
      );
      const results = await env.DB.batch(stmts);
      inserted += results.reduce((sum, r) => sum + (r.meta?.changes || 0), 0);
    }
    return new Response(JSON.stringify({ ok: true, inserted }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

const SENTENCING_SYNTHESIS_PROMPT = `You are a legal research assistant extracting sentencing information from an Australian court judgment for a practitioner research database used by criminal prosecutors.

You will receive case metadata and the FULL TEXT of the judgment (all sections — header, facts, evidence, reasoning, and orders).

STEP 1 — CLASSIFICATION

Determine whether this judgment contains sentencing content. Apply these rules in order:

SENTENCING CASE (sentencing_found: true):
- First-instance sentencing remarks or comments on passing sentence
- Sentence appeals where the court confirms, varies, or substitutes a sentence
- Sentence reviews (e.g. Magistrates Court sentence reviewed by Supreme Court)
- Re-sentencing after a successful appeal
- Any judgment that imposes, confirms, varies, or reviews a specific sentence (custodial term, fine, CCO, probation, suspended sentence, CSO, drug treatment order)

NOT A SENTENCING CASE (sentencing_found: false):
- Trial judgments on guilt/liability only (verdict without sentence)
- Fact-finding hearings or special hearings
- Dangerous criminal applications (even though they discuss prior sentences)
- Bail applications
- Evidentiary rulings, interlocutory decisions, procedural orders
- Acquittals
- Appeal judgments that address conviction only and remit for re-sentencing without imposing a sentence
- Costs, compensation-only, or civil proceedings
- Fitness to stand trial determinations

If the judgment discusses sentencing principles in the abstract but does not impose or review a specific sentence for this offender, return sentencing_found: false.

STEP 2 — EXTRACTION (only if sentencing_found: true)

For FIRST-INSTANCE sentencing (trial court imposing sentence):
Extract from the judgment text: the offence(s) and statutory provisions, plea, sentence imposed for each count, aggravating factors identified by the court, mitigating factors identified by the court, personal circumstances of the offender (age, employment, family, health, substance use, mental health), criminal history/prior convictions as described by the court, any victim impact evidence, comparable cases CITED BY THE COURT (do not add any the court did not cite), discount methodology if discussed (early plea, cooperation, totality), concurrent/cumulative structure, non-parole period, suspended sentence conditions, time served or backdating, ancillary orders (compensation, forfeiture, licence disqualification, sex offender registration, restraining orders).

For APPEAL/REVIEW cases (appellate court reviewing sentence):
Also extract: what the original sentence was, what the appeal court varied it to (if varied), the grounds of appeal, whether the appeal was allowed or dismissed, the appellate standard applied (e.g. manifest excess/inadequacy, House v The Queen, error of principle, De Simoni), and the court's key reasons for the appellate outcome.

STEP 3 — FORMAT

Respond with a JSON object:

{
  "sentencing_found": true,
  "case_type": "first_instance" | "sentence_appeal" | "sentence_review",
  "procedure_notes": "Structured prose summary (250-500 words). For first-instance cases: lead with the offence(s) and sentence imposed, then cover personal circumstances, criminal history, aggravating/mitigating factors, comparable cases cited, and the court's reasoning. For appeal/review cases: lead with the original sentence and the appellate outcome (allowed/dismissed/varied), then cover the grounds, the appellate standard applied, and the court's reasons. Always state specific sentence quantum (e.g. '3 years imprisonment with 18-month non-parole period', not 'a term of imprisonment'). Always state the offender's age and any prior convictions mentioned. Never invent comparable cases — only include cases explicitly cited in the judgment text.",
  "sentencing_principles": [
    {
      "principle": "Case-specific sentencing proposition (1-2 sentences). Must state the offence type, offender characteristics, and sentence imposed — not a generic sentencing rule.",
      "statute_refs": ["Sentencing Act 1997 (Tas) s 11"],
      "keywords": ["sentencing", "topic1", "topic2"]
    }
  ]
}

If sentencing_found is false, respond ONLY with: {"sentencing_found": false}

PRINCIPLES RULES:
- 2-4 sentencing principles maximum
- Each must be a concrete statement of what THIS court decided for THIS offender — not a restatement of statutory requirements
- BAD: "The court considered general and specific deterrence" (generic, could be any case)
- GOOD: "A 3-year imprisonment with 18-month non-parole period was appropriate for a single count of aggravated assault (s 172 Criminal Code) where the offender used a weapon, the victim suffered permanent scarring, and the offender had no prior convictions but showed limited remorse"
- BAD: "Section 11 of the Sentencing Act requires the court to consider the nature of the offence" (statute restatement)
- GOOD: "The sentencing discount for an early guilty plea was limited to 10% (rather than the usual 20-25%) because the plea was entered only after the committal hearing and the Crown case was overwhelming"
- For appeal cases, principles should capture what the appellate court found about the original sentence, not just restate the original sentencing

CRITICAL: Only reference comparable cases that appear in the judgment text. Do not invent or suggest cases from your own knowledge.

Output ONLY valid JSON. No markdown fences. No commentary. The first character must be {`;

// ── Sentencing detection helper ───────────────────────────────────────────────
function isSentencingCase(caseRow, allChunks) {
  // Check 1: subject_matter from chunk classification
  if (caseRow.subject_matter === 'criminal') return true;

  // Check 2: keyword scan across chunk principles_json
  const sentencingKeywords = /\b(sentenc|penalty|custodial|suspended|imprison|fine\b|community service|probation|non-parole|remand|gaol|jail|detention)\b/i;

  for (const chunk of allChunks) {
    try {
      const pj = chunk.principles_json || '';
      if (sentencingKeywords.test(pj)) return true;
    } catch (e) {}
  }

  // Check 3: issues contain sentencing terms
  const issuesStr = typeof caseRow.issues === 'string' ? caseRow.issues : JSON.stringify(caseRow.issues || []);
  if (sentencingKeywords.test(issuesStr)) return true;

  return false;
}

// ── Merge helper — called from CHUNK handler and MERGE queue handler ─────────
async function performMerge(citation, caseRow, env) {
  const allChunks = await env.DB.prepare(
    `SELECT principles_json, chunk_text, enriched_text FROM case_chunks WHERE citation = ? ORDER BY chunk_index`
  ).bind(citation).all();

  const allPrinciples = [], allHoldings = [], allLegislation = new Set(), allAuthorities = [], enrichedTexts = [];
  for (const chunk of allChunks.results) {
    try {
      const data = JSON.parse(chunk.principles_json || '{}');
      if (data.principles) allPrinciples.push(...data.principles);
      if (data.holdings) allHoldings.push(...data.holdings);
      if (data.legislation) data.legislation.forEach(l => allLegislation.add(l));
      if (data.key_authorities) allAuthorities.push(...data.key_authorities);
      if (['reasoning', 'mixed'].includes(data.chunk_type)) {
        // Prefer enriched_text from column, fall back to principles_json field
        const et = chunk.enriched_text || data.enriched_text;
        if (et) enrichedTexts.push(et);
      }
    } catch (e) {}
  }

  const seenAuth = new Set();
  const dedupedAuth = allAuthorities.filter(a => {
    if (seenAuth.has(a.name)) return false;
    seenAuth.add(a.name);
    return true;
  });

  const chunkSubjects = allChunks.results
    .map(c => { try { return JSON.parse(c.principles_json)?.subject_matter; } catch(e) { return null; } })
    .filter(s => s && s !== 'unknown');
  const subjectCounts = {};
  chunkSubjects.forEach(s => { subjectCounts[s] = (subjectCounts[s] || 0) + 1; });
  const subject_matter = Object.keys(subjectCounts).sort((a,b) => subjectCounts[b] - subjectCounts[a])[0] || 'unknown';

  const chunkHoldingStr = allHoldings
    .map(h => typeof h === 'string' ? h : h.holding)
    .filter(Boolean)
    .join(" ") || null;

  // Synthesis call — produce case-level principles from reasoning enriched_text summaries
  let synthesisedPrinciples = allPrinciples;
  if (enrichedTexts.length > 0) {
    try {
      const synthSystem = `You are a legal research assistant producing a case summary for a research database. You will receive enriched summaries of each reasoning section of an Australian court judgment, plus the case's facts and issues.

Produce 3-5 case-level legal principles that tell a researcher why THIS case matters and what it decided.

Each principle must be a concrete statement of what THIS court decided on THIS set of facts — not a generic rule of law that could appear on any case. Include the court's reasoning where it adds value.

BAD (generic, could be any case):
- "General deterrence is a relevant sentencing consideration"
- "The court applied the relevant statutory test"

GOOD (case-specific, tells you why THIS case matters):
- "A 12-month suspended sentence was appropriate for a first-offender domestic assault involving a single punch causing bruising, where the offender had completed a behavioural change program and the victim did not support a custodial sentence"
- "The appellant's failure to disclose gambling debts totalling $180,000 was fatal to her Testators Family Maintenance claim because adequate provision cannot be assessed without full financial disclosure"

DEDUPLICATION RULES — strictly enforce before writing output:
- Before writing, mentally group all input principles by legal concept. Treat two principles as duplicates only if they state the same legal rule, applying to the same legal test, under the same provision or doctrine. Shared vocabulary alone is not sufficient — tendency and coincidence evidence both require "significant probative value" but are distinct doctrines and must not be merged.
- When merging duplicates, prefer the formulation that carries the most specific detail. Statutory references, named authorities, and Tasmanian-specific qualifications take precedence over general statements of the same rule.
- Output one principle per distinct legal concept only. 3 tight, distinct principles are better than 5 that contain redundancy.
- If genuine distinct legal rules number fewer than 3, output fewer rather than padding.

Output ONLY a valid JSON object with two keys: "principles" and "holdings". No markdown fences. No commentary. The first character must be {

"principles": array of principle objects, each: { "principle": "case-specific statement (1-2 sentences)", "statute_refs": ["Act (Jurisdiction) s X"], "keywords": ["topic1", "topic2"] }

"holdings": array of 1-4 holdings — the court's direct answer to each issue decided. Each holding must be a concrete one-sentence statement of what the court ruled. For interlocutory rulings and pre-trial applications, state the specific outcome (e.g. "The court admitted the complainant's representations made on 21 March about 21 March events under s 65(2)(b) but excluded those made on 21 March about 19 March events as not satisfying the 'shortly after' requirement"). For final judgments, state verdict and outcome. Empty array if no clear holdings can be extracted.`;

      const synthUser = [
        `Case: ${caseRow.case_name} (${citation}, ${caseRow.court})`,
        ``,
        `Facts: ${caseRow.facts || ''}`,
        ``,
        `Issues: ${JSON.stringify(caseRow.issues)}`,
        ``,
        `Holdings from chunks: ${JSON.stringify(allHoldings)}`,
        ``,
        `Reasoning summaries:`,
        enrichedTexts.join('\n\n---\n\n')
      ].join('\n');

      const ctrl = new AbortController();
      const synthTimeout = setTimeout(() => ctrl.abort(), 25000);
      const synthResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini-2025-04-14",
          max_completion_tokens: 2000,
          messages: [
            { role: "system", content: synthSystem },
            { role: "user", content: synthUser }
          ]
        }),
        signal: ctrl.signal
      });
      clearTimeout(synthTimeout);
      const synthData = await synthResponse.json();
      const synthContent = synthData.choices?.[0]?.message?.content
        || synthData.choices?.[0]?.message?.reasoning_content
        || "";
      const synthRaw = synthContent.trim();
      const jsonStart = synthRaw.indexOf('{');
      const jsonEnd = synthRaw.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error(`No JSON object in synthesis response: ${synthRaw.slice(0, 200)}`);
      const synthParsed = JSON.parse(synthRaw.slice(jsonStart, jsonEnd + 1));
      synthesisedPrinciples = Array.isArray(synthParsed.principles) ? synthParsed.principles : Array.isArray(synthParsed) ? synthParsed : [];
      const synthesisedHoldings = Array.isArray(synthParsed.holdings) ? synthParsed.holdings : [];
      if (synthesisedHoldings.length > 0) {
        allHoldings.push(...synthesisedHoldings);
      }
      console.log(`[queue] synthesis complete for ${citation} — ${synthesisedPrinciples.length} principles, ${synthesisedHoldings.length} holdings`);
    } catch (e) {
      console.error(`[queue] synthesis failed for ${citation}, falling back to raw concat:`, e.message);
      synthesisedPrinciples = allPrinciples;
    }
  }

  // ── Sentencing second pass (conditional) ────────────────────────────────────
  let procedureNotes = null;
  let sentencingStatus = null;

  if (isSentencingCase(caseRow, allChunks.results)) {
    try {
      // Collect raw chunk_text from reasoning/mixed/procedural chunks for sentencing analysis
      const sentencingTexts = [];
      for (const chunk of allChunks.results) {
        try {
          if (chunk.chunk_text) {
            sentencingTexts.push(chunk.chunk_text);
          }
        } catch (e) {}
      }

      if (sentencingTexts.length > 0) {
        const sentUser = [
          `Case: ${caseRow.case_name} (${citation}, ${caseRow.court})`,
          ``,
          `Facts: ${caseRow.facts || ''}`,
          ``,
          `Issues: ${JSON.stringify(caseRow.issues)}`,
          ``,
          `Outcome (Pass 1 summary): ${caseRow.holding || 'Not extracted'}`,
          ``,
          `Holdings (chunk-level): ${JSON.stringify(allHoldings)}`,
          ``,
          `Full judgment text (${sentencingTexts.length} sections):`,
          sentencingTexts.join('\n\n---\n\n')
        ].join('\n');

        // Cap input — gpt-4o-mini supports 128K token context; 120k chars ≈ 30k tokens, well within limit
        const cappedSentUser = sentUser.length > 120000
          ? sentUser.substring(0, 120000) + '\n\n[TRUNCATED — remaining sections omitted]'
          : sentUser;

        const sentCtrl = new AbortController();
        const sentTimeout = setTimeout(() => sentCtrl.abort(), 45000);
        const sentResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini-2025-04-14",
            max_completion_tokens: 4000,
            messages: [
              { role: "system", content: SENTENCING_SYNTHESIS_PROMPT },
              { role: "user", content: cappedSentUser }
            ]
          }),
          signal: sentCtrl.signal
        });
        clearTimeout(sentTimeout);
        const sentData = await sentResponse.json();
        const sentContent = sentData.choices?.[0]?.message?.content
          || sentData.choices?.[0]?.message?.reasoning_content
          || "";
        const sentRaw = sentContent.trim();

        // Parse JSON response
        const jsonStart = sentRaw.indexOf('{');
        const jsonEnd = sentRaw.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const sentResult = JSON.parse(sentRaw.slice(jsonStart, jsonEnd + 1));

          if (sentResult.sentencing_found) {
            procedureNotes = sentResult.procedure_notes || null;
            const caseType = sentResult.case_type || 'unknown';
            sentencingStatus = procedureNotes ? 'success' : 'failed';

            // Append sentencing principles to main principles array
            if (Array.isArray(sentResult.sentencing_principles) && sentResult.sentencing_principles.length > 0) {
              synthesisedPrinciples = [
                ...synthesisedPrinciples,
                ...sentResult.sentencing_principles
              ];
              console.log(`[queue] sentencing pass for ${citation} [${caseType}] — ${sentResult.sentencing_principles.length} sentencing principles added`);
            }
          } else {
            sentencingStatus = 'not_sentencing';
            console.log(`[queue] sentencing pass for ${citation} — no sentencing content found`);
          }
        } else {
          throw new Error(`No JSON object in sentencing response: ${sentRaw.slice(0, 200)}`);
        }
      }
    } catch (e) {
      sentencingStatus = 'failed';
      console.error(`[queue] sentencing pass failed for ${citation}:`, e.message);
      // Non-fatal — case still gets doctrine principles from main synthesis
    }
  } else {
    sentencingStatus = 'not_sentencing';
  }

  await env.DB.prepare(`
    UPDATE cases SET
      principles_extracted = ?,
      holdings_extracted = ?,
      legislation_extracted = ?,
      authorities_extracted = ?,
      subject_matter = ?,
      holding = ?,
      procedure_notes = ?,
      sentencing_status = ?
    WHERE citation = ?
  `).bind(
    JSON.stringify(synthesisedPrinciples),
    JSON.stringify(allHoldings),
    JSON.stringify([...allLegislation]),
    JSON.stringify(dedupedAuth),
    subject_matter,
    chunkHoldingStr,
    procedureNotes,
    sentencingStatus,
    citation
  ).run();
  console.log(`[queue] merge complete for ${citation} — ${synthesisedPrinciples.length} principles${procedureNotes ? ' + sentencing notes' : ''}`);
}

async function handleRequeueMetadata(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const { results } = await env.DB.prepare(
      `SELECT citation FROM cases WHERE enriched = 0`
    ).all();
    for (const row of results) {
      await env.CASE_QUEUE.send({ type: 'METADATA', citation: row.citation });
    }
    return new Response(JSON.stringify({ ok: true, enqueued: results.length }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleRequeueChunks(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const body = await request.json().catch(() => ({}));
    const limit = body.limit ? parseInt(body.limit) : null;
    const query = limit
      ? `SELECT citation, chunk_index FROM case_chunks WHERE done = 0 LIMIT ?`
      : `SELECT citation, chunk_index FROM case_chunks WHERE done = 0`;
    const { results } = limit
      ? await env.DB.prepare(query).bind(limit).all()
      : await env.DB.prepare(query).all();
    for (const row of results) {
      await env.CASE_QUEUE.send({ type: 'CHUNK', citation: row.citation, chunk_index: row.chunk_index });
    }
    return new Response(JSON.stringify({ ok: true, enqueued: results.length }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleRequeueMerge(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const body = await request.json().catch(() => ({}));
    const limit = body.limit ? parseInt(body.limit) : 250;
    let requeued = 0;
    if (body.target === 'remerge') {
      // Re-merge cases — reset deep_enriched then enqueue MERGE message.
      // Scoping: body.citations (array) > body.citation (string) > full corpus.
      // When citations are explicitly provided, skip deep_enriched constraint
      // (force remerge regardless of current state).
      let query, bindings;
      if (Array.isArray(body.citations) && body.citations.length > 0) {
        const placeholders = body.citations.map(() => '?').join(',');
        query = `SELECT citation FROM cases WHERE citation IN (${placeholders}) LIMIT ?`;
        bindings = [...body.citations, limit];
      } else if (body.citation) {
        query = `SELECT citation FROM cases WHERE deep_enriched = 1 AND citation = ? LIMIT ?`;
        bindings = [body.citation, limit];
      } else {
        query = `SELECT citation FROM cases WHERE deep_enriched = 1 LIMIT ?`;
        bindings = [limit];
      }
      const { results: candidates } = await env.DB.prepare(query).bind(...bindings).all();
      for (const row of candidates) {
        await env.DB.prepare(`UPDATE cases SET deep_enriched = 0 WHERE citation = ?`).bind(row.citation).run();
        await env.CASE_QUEUE.send({ type: 'MERGE', citation: row.citation });
        requeued++;
      }
    } else {
      // Default: enqueue pending cases (deep_enriched=0) where all chunks are done
      const { results: candidates } = await env.DB.prepare(
        `SELECT citation FROM cases WHERE deep_enriched = 0 LIMIT ?`
      ).bind(limit).all();
      for (const row of candidates) {
        const pending = await env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM case_chunks WHERE citation = ? AND done = 0`
        ).bind(row.citation).first();
        if (pending.cnt === 0) {
          await env.CASE_QUEUE.send({ type: 'MERGE', citation: row.citation });
          requeued++;
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, requeued }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

// ── Sentencing backfill — direct-write sentencing pass for cases that missed it ──
// Targets cases where deep_enriched=1 but sentencing_status IS NULL or 'failed'.
// Bypasses the queue and the atomic gate on deep_enriched, writing only
// procedure_notes, principles_extracted, and sentencing_status. sentencing_status
// is the retry flag: NULL = not yet attempted, 'failed' = retryable error,
// 'not_sentencing' = stable skip. Mirrors the sentencing block of performMerge()
// exactly so output parity is guaranteed.
async function runSentencingBackfill(env, limit = 15, citations = null) {
  let cases;
  if (citations && citations.length > 0) {
    // Citation-targeted mode: process only the specified cases, regardless of procedure_notes state
    const placeholders = citations.map(() => '?').join(', ');
    const { results } = await env.DB.prepare(`
      SELECT citation, case_name, court, subject_matter, facts, issues, holding, principles_extracted
      FROM cases
      WHERE citation IN (${placeholders})
        AND deep_enriched = 1
    `).bind(...citations).all();
    cases = results;
  } else {
    // Sweep mode: next N unprocessed or failed criminal cases
    const { results } = await env.DB.prepare(`
      SELECT citation, case_name, court, subject_matter, facts, issues, holding, principles_extracted
      FROM cases
      WHERE subject_matter = 'criminal'
        AND (sentencing_status IS NULL OR sentencing_status = 'failed')
        AND deep_enriched = 1
      LIMIT ?
    `).bind(limit).all();
    cases = results;
  }

  let processed = 0;
  let skippedNotSentencing = 0;
  let failed = 0;
  const errors = [];

  for (const caseRow of cases) {
    const citation = caseRow.citation;
    try {
      // Fetch chunks — done=1 guard since we are bypassing the normal merge gate
      const allChunks = await env.DB.prepare(`
        SELECT principles_json, chunk_text, enriched_text
        FROM case_chunks
        WHERE citation = ? AND done = 1
        ORDER BY chunk_index
      `).bind(citation).all();

      if (!allChunks.results || allChunks.results.length === 0) {
        console.log(`[backfill] no done chunks for ${citation}, skipping`);
        skippedNotSentencing++;
        continue;
      }

      // Build allHoldings from chunk principles_json (mirrors performMerge line 2306-2314)
      const allHoldings = [];
      for (const chunk of allChunks.results) {
        try {
          const data = JSON.parse(chunk.principles_json || '{}');
          if (data.holdings) allHoldings.push(...data.holdings);
        } catch (e) {}
      }

      // Sentencing detection — three-check OR (subject_matter, principles_json keywords, issues keywords)
      if (!isSentencingCase(caseRow, allChunks.results)) {
        console.log(`[backfill] ${citation} not a sentencing case, skipping`);
        await env.DB.prepare('UPDATE cases SET sentencing_status = ? WHERE citation = ?').bind('not_sentencing', citation).run();
        skippedNotSentencing++;
        continue;
      }

      // Collect chunk_text from ALL chunks (no type filter — mirrors session 47 fix)
      const sentencingTexts = [];
      for (const chunk of allChunks.results) {
        try {
          if (chunk.chunk_text) sentencingTexts.push(chunk.chunk_text);
        } catch (e) {}
      }

      if (sentencingTexts.length === 0) {
        console.log(`[backfill] ${citation} has no chunk_text, skipping`);
        skippedNotSentencing++;
        continue;
      }

      // Build sentUser — exact replica of performMerge lines 2434-2447
      const sentUser = [
        `Case: ${caseRow.case_name} (${citation}, ${caseRow.court})`,
        ``,
        `Facts: ${caseRow.facts || ''}`,
        ``,
        `Issues: ${JSON.stringify(caseRow.issues)}`,
        ``,
        `Outcome (Pass 1 summary): ${caseRow.holding || 'Not extracted'}`,
        ``,
        `Holdings (chunk-level): ${JSON.stringify(allHoldings)}`,
        ``,
        `Full judgment text (${sentencingTexts.length} sections):`,
        sentencingTexts.join('\n\n---\n\n')
      ].join('\n');

      // 120K cap — same as performMerge line 2450
      const cappedSentUser = sentUser.length > 120000
        ? sentUser.substring(0, 120000) + '\n\n[TRUNCATED — remaining sections omitted]'
        : sentUser;

      // OpenAI call — same params as performMerge sentencing pass (gpt-4.1-mini, 4000 tokens, 45s)
      const sentCtrl = new AbortController();
      const sentTimeout = setTimeout(() => sentCtrl.abort(), 45000);
      let sentResponse;
      try {
        sentResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini-2025-04-14",
            max_completion_tokens: 4000,
            messages: [
              { role: "system", content: SENTENCING_SYNTHESIS_PROMPT },
              { role: "user", content: cappedSentUser }
            ]
          }),
          signal: sentCtrl.signal
        });
      } finally {
        clearTimeout(sentTimeout);
      }

      if (!sentResponse.ok) {
        // 429 rate limit, 500, etc — leave NULL for next run
        throw new Error(`OpenAI ${sentResponse.status}: ${(await sentResponse.text()).slice(0, 200)}`);
      }

      const sentData = await sentResponse.json();
      const sentContent = sentData.choices?.[0]?.message?.content
        || sentData.choices?.[0]?.message?.reasoning_content
        || "";
      const sentRaw = sentContent.trim();

      const jsonStart = sentRaw.indexOf('{');
      const jsonEnd = sentRaw.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error(`No JSON object in response: ${sentRaw.slice(0, 200)}`);
      }

      const sentResult = JSON.parse(sentRaw.slice(jsonStart, jsonEnd + 1));

      if (!sentResult.sentencing_found) {
        console.log(`[backfill] ${citation} — model returned sentencing_found:false`);
        await env.DB.prepare('UPDATE cases SET sentencing_status = ? WHERE citation = ?').bind('not_sentencing', citation).run();
        skippedNotSentencing++;
        continue;
      }

      const procedureNotes = sentResult.procedure_notes || null;
      const caseType = sentResult.case_type || 'unknown';
      if (!procedureNotes) {
        console.log(`[backfill] ${citation} — sentencing_found=true but no procedure_notes in response`);
        await env.DB.prepare('UPDATE cases SET sentencing_status = ? WHERE citation = ?').bind('failed', citation).run();
        skippedNotSentencing++;
        continue;
      }
      console.log(`[backfill] ${citation} [${caseType}] — procedure_notes extracted`);

      // Append sentencing principles to existing principles_extracted (read-modify-write)
      let updatedPrinciples = null;
      if (Array.isArray(sentResult.sentencing_principles) && sentResult.sentencing_principles.length > 0) {
        try {
          const existing = JSON.parse(caseRow.principles_extracted || '[]');
          const existingArr = Array.isArray(existing) ? existing : [];
          updatedPrinciples = JSON.stringify([...existingArr, ...sentResult.sentencing_principles]);
        } catch (e) {
          console.error(`[backfill] failed to parse existing principles for ${citation}: ${e.message}`);
          // Don't fail the whole case — write procedure_notes without appending principles
        }
      }

      // Write to D1 — only the fields the backfill is responsible for
      if (updatedPrinciples) {
        await env.DB.prepare(`
          UPDATE cases SET procedure_notes = ?, principles_extracted = ?, sentencing_status = ? WHERE citation = ?
        `).bind(procedureNotes, updatedPrinciples, 'success', citation).run();
      } else {
        await env.DB.prepare(`
          UPDATE cases SET procedure_notes = ?, sentencing_status = ? WHERE citation = ?
        `).bind(procedureNotes, 'success', citation).run();
      }

      console.log(`[backfill] ${citation} — procedure_notes written (${procedureNotes.length} chars)`);
      processed++;

    } catch (e) {
      console.error(`[backfill] failed for ${citation}: ${e.message}`);
      try {
        await env.DB.prepare('UPDATE cases SET sentencing_status = ? WHERE citation = ?').bind('failed', citation).run();
      } catch (_) {}
      failed++;
      errors.push({ citation, error: e.message.slice(0, 200) });
    }
  }

  // Remaining count for visibility
  const remaining = await env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM cases
    WHERE subject_matter = 'criminal'
      AND (sentencing_status IS NULL OR sentencing_status = 'failed')
      AND deep_enriched = 1
  `).first();

  return {
    processed,
    skippedNotSentencing,
    failed,
    candidatesInBatch: cases.length,
    remaining: remaining.cnt,
    errors: errors.slice(0, 10)
  };
}

async function handleSentencingBackfill(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const requested = parseInt(body.limit) || 15;
    const limit = Math.min(Math.max(requested, 1), 30); // hard cap [1, 30]
    const citations = Array.isArray(body.citations) && body.citations.length > 0 ? body.citations : null;

    const result = await runSentencingBackfill(env, limit, citations);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/* ── HEALTH CHECK REPORT ROUTES ──────────────────────────── */

async function handleGetHealthReports(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const rows = await env.DB.prepare(`
      SELECT id, created_at, summary_text, cluster_count, contradiction_count, gap_count
      FROM health_check_reports
      ORDER BY created_at DESC
      LIMIT 24
    `).all();
    return new Response(JSON.stringify(rows.results), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleGetHealthReport(request, env, corsHeaders, reportId) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const row = await env.DB.prepare(`SELECT * FROM health_check_reports WHERE id=?`).bind(reportId).first();
    if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    // Parse report_json back to object for the client
    const result = { ...row, report_json: JSON.parse(row.report_json) };
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handlePostHealthReport(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const body = await request.json();
    const { id, summary_text, report_json, cluster_count, contradiction_count, gap_count } = body;
    if (!id || !report_json) return new Response(JSON.stringify({ error: 'id and report_json required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    await env.DB.prepare(`
      INSERT INTO health_check_reports (id, created_at, summary_text, report_json, cluster_count, contradiction_count, gap_count)
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?)
    `).bind(id, summary_text || null, JSON.stringify(report_json), cluster_count || 0, contradiction_count || 0, gap_count || 0).run();
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handlePostHealthClusters(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const { run_id, run_date, assignments } = await request.json();
    if (!run_id || !Array.isArray(assignments)) return new Response(JSON.stringify({ error: 'run_id and assignments required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    const stmt = env.DB.prepare(`INSERT OR REPLACE INTO health_check_clusters (run_id, chunk_id, cluster_label, run_date) VALUES (?, ?, ?, ?)`);
    const batch = assignments.map(a => stmt.bind(run_id, a.chunk_id, a.cluster_label, run_date));
    await env.DB.batch(batch);
    return new Response(JSON.stringify({ success: true, count: assignments.length }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleTruncationStatus(request, env) {
  const { results } = await env.DB.prepare(`
    SELECT id, citation, original_length, truncated_to, source, status, date_truncated, date_resolved
    FROM truncation_log
    ORDER BY date_truncated DESC
  `).all();
  return new Response(JSON.stringify({ truncations: results }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

async function handleTruncationResolve(request, env) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { id, action } = await request.json();
  if (!id || !['confirm', 'delete'].includes(action)) {
    return new Response(JSON.stringify({ error: 'id and action (confirm|delete) required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  if (action === 'confirm') {
    await env.DB.prepare(
      `UPDATE truncation_log SET status = 'confirmed', date_resolved = ? WHERE id = ?`
    ).bind(new Date().toISOString(), id).run();
    return new Response(JSON.stringify({ ok: true, status: 'confirmed' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  if (action === 'delete') {
    const caseRow = await env.DB.prepare('SELECT citation FROM cases WHERE id = ?').bind(id).first();
    if (caseRow) {
      await env.DB.prepare('DELETE FROM case_chunks WHERE citation = ?').bind(caseRow.citation).run();
      await env.DB.prepare('DELETE FROM cases WHERE id = ?').bind(id).run();
    }
    await env.DB.prepare('DELETE FROM truncation_log WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ ok: true, status: 'deleted' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

async function handleFetchCasesByLegislationRef(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const { references } = await request.json();
    if (!references || references.length === 0) {
      return new Response(JSON.stringify({ ok: true, cases: [] }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    const results = [];
    for (const ref of references) {
      const sectionNum = ref.section_number || ref;
      const pattern = `% s ${sectionNum}%`;
      const { results: rows } = await env.DB.prepare(`
        SELECT DISTINCT c.citation, c.case_name, c.court, c.case_date,
                        c.holding, c.principles_extracted, c.summary_quality_score,
                        clr.legislation_ref
        FROM case_legislation_refs clr
        JOIN cases c ON c.citation = clr.citation
        WHERE clr.legislation_ref LIKE ?
        ORDER BY c.case_date DESC
        LIMIT 5
      `).bind(pattern).all();
      for (const row of (rows || [])) {
        if (!results.find(r => r.citation === row.citation)) {
          results.push(row);
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, cases: results }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

/* =============================================================
   PIPELINE STATUS / ENRICHMENT / EMBEDDING ROUTES
   ============================================================= */
async function handlePipelineStatus(_request, env, corsHeaders) {
  try {
    const result = await env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN enriched=1 THEN 1 ELSE 0 END) as enriched, SUM(CASE WHEN embedded=1 THEN 1 ELSE 0 END) as embedded, SUM(CASE WHEN enrichment_error IS NOT NULL THEN 1 ELSE 0 END) as errored FROM secondary_sources`).first();
    return new Response(JSON.stringify({ ok: true, ...result }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleWriteEnriched(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const body = await request.json();
    const { chunk_id } = body;
    if (!chunk_id) return new Response(JSON.stringify({ ok: false, error: 'chunk_id required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    if (body.error) {
      await env.DB.prepare(`UPDATE secondary_sources SET enrichment_error = ? WHERE id = ?`).bind(body.error, chunk_id).run();
    } else {
      await env.DB.prepare(`UPDATE secondary_sources SET enriched_text = ?, enriched = 1, enrichment_error = NULL WHERE id = ?`).bind(body.enriched_text, chunk_id).run();
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleMarkEmbedded(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const { chunk_ids } = await request.json();
    if (!Array.isArray(chunk_ids) || chunk_ids.length === 0) return new Response(JSON.stringify({ ok: false, error: 'chunk_ids required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    const BATCH = 99;
    let total = 0;
    for (let i = 0; i < chunk_ids.length; i += BATCH) {
      const slice = chunk_ids.slice(i, i + BATCH);
      const placeholders = slice.map(() => '?').join(',');
      await env.DB.prepare(`UPDATE secondary_sources SET embedded = 1 WHERE id IN (${placeholders})`).bind(...slice).run();
      total += slice.length;
    }
    return new Response(JSON.stringify({ ok: true, updated: total }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleFetchUnenriched(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const urlObj = new URL(request.url);
    const batch = Math.min(parseInt(urlObj.searchParams.get('batch') || '10'), 50);
    const result = await env.DB.prepare(`SELECT id, title, raw_text FROM secondary_sources WHERE enriched = 0 AND (enrichment_error IS NULL OR enrichment_error = '') ORDER BY id LIMIT ?`).bind(batch).all();
    return new Response(JSON.stringify({ ok: true, chunks: result.results }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleFetchForEmbedding(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const urlObj = new URL(request.url);
    const batch = Math.min(parseInt(urlObj.searchParams.get('batch') || '10'), 50);
    const result = await env.DB.prepare(`SELECT id, title, raw_text, enriched_text, category, source_type FROM secondary_sources WHERE enriched = 1 AND embedded = 0 AND approved = 1 ORDER BY id LIMIT ?`).bind(batch).all();
    return new Response(JSON.stringify({ ok: true, chunks: result.results }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handlePendingNexus(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const result = await env.DB.prepare(
      `SELECT id, title, category, raw_text, date_added FROM secondary_sources WHERE approved = 0 ORDER BY date_added DESC`
    ).all();
    return new Response(JSON.stringify({ ok: true, items: result.results }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleApproveSecondary(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const { id, action } = await request.json();
    if (!id || !action) return new Response(JSON.stringify({ ok: false, error: 'id and action required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    if (action === 'approve') {
      await env.DB.prepare(`UPDATE secondary_sources SET approved = 1 WHERE id = ?`).bind(id).run();
    } else if (action === 'reject') {
      await env.DB.prepare(`DELETE FROM secondary_sources WHERE id = ? AND approved = 0`).bind(id).run();
    } else if (action === 'delete') {
      // Delete regardless of approved status — for removing mistakenly approved items
      await env.DB.prepare(`DELETE FROM secondary_sources_fts WHERE source_id = ?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM secondary_sources WHERE id = ?`).bind(id).run();
      try {
        await fetch('https://nexus.arcanthyr.com/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Nexus-Key': env.NEXUS_SECRET_KEY },
          body: JSON.stringify({ citation: id }),
        });
      } catch (e) {
        console.error('Nexus delete failed (non-fatal):', e.message);
      }
    } else {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid action — must be approve, reject, or delete' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    return new Response(JSON.stringify({ ok: true, action }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleFtsSearchChunks(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const urlObj = new URL(request.url);
    const q = urlObj.searchParams.get('q');
    const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '10'), 50);
    if (!q) return new Response(JSON.stringify({ error: 'q required' }), { status: 400, headers: corsHeaders });
    const result = await env.DB.prepare(
      `SELECT chunk_id, citation, SUBSTR(enriched_text, 1, 500) as enriched_text FROM case_chunks_fts WHERE case_chunks_fts MATCH ?1 LIMIT ?2`
    ).bind(q, limit).all();
    return new Response(JSON.stringify({ results: result.results }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleFetchEmbedded(_request, env, corsHeaders) {
  const key = _request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const result = await env.DB.prepare(`SELECT id FROM secondary_sources WHERE embedded = 1`).all();
    return new Response(JSON.stringify({ ok: true, chunks: result.results }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleResetEmbedded(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const { chunk_ids } = await request.json();
    if (!Array.isArray(chunk_ids) || chunk_ids.length === 0) return new Response(JSON.stringify({ ok: false, error: 'chunk_ids required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    const BATCH = 99;
    let total = 0;
    for (let i = 0; i < chunk_ids.length; i += BATCH) {
      const slice = chunk_ids.slice(i, i + BATCH);
      const placeholders = slice.map(() => '?').join(',');
      await env.DB.prepare(`UPDATE secondary_sources SET embedded = 0 WHERE id IN (${placeholders})`).bind(...slice).run();
      total += slice.length;
    }
    return new Response(JSON.stringify({ ok: true, reset: total }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleUpdateSecondaryRaw(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const { id, raw_text } = await request.json();
    if (!id || !raw_text) return new Response(JSON.stringify({ ok: false, error: 'id and raw_text required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    const result = await env.DB.prepare(`UPDATE secondary_sources SET raw_text = ?, embedded = 0 WHERE id = ?`).bind(raw_text, id).run();
    if (result.meta.changes === 0) return new Response(JSON.stringify({ ok: false, error: 'not found', id }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    return new Response(JSON.stringify({ ok: true, updated: result.meta.changes }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleFetchSecondaryRaw(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const urlObj = new URL(request.url);
    const offset = parseInt(urlObj.searchParams.get('offset') || '0');
    const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '50'), 100);
    const [countResult, dataResult] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) as total FROM secondary_sources`).first(),
      env.DB.prepare(`SELECT id, title, category, raw_text FROM secondary_sources ORDER BY id LIMIT ? OFFSET ?`).bind(limit, offset).all(),
    ]);
    return new Response(JSON.stringify({ ok: true, chunks: dataResult.results, total: countResult.total, offset }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleFetchSectionsByReference(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const { references } = await request.json();
    if (!Array.isArray(references) || !references.length) return new Response(JSON.stringify({ sections: [] }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    const results = [];
    const seen = new Set();
    for (const ref of references.slice(0, 20)) {
      const rows = await env.DB.prepare(`
        SELECT ls.id, ls.section_number, ls.heading, ls.text, l.title as leg_title
        FROM legislation_sections ls
        JOIN legislation l ON ls.legislation_id = l.id
        WHERE ls.section_number = ?
        LIMIT 10
      `).bind(ref.section_number).all();
      for (const row of rows.results) {
        if (!seen.has(row.id)) { seen.add(row.id); results.push(row); }
      }
      // LIKE pass — catches structured IDs e.g. "Evidence Act s 38 - ..."
      const ssLikeRows = await env.DB.prepare(`
        SELECT id, id as chunk_id, COALESCE(enriched_text, raw_text) as text,
               NULL as section_number, NULL as heading, NULL as leg_title
        FROM secondary_sources
        WHERE id LIKE '%s ' || ? || ' %'
           OR id LIKE '%s ' || ? || '-%'
           OR id LIKE '%s ' || ? || ','
           OR id LIKE '%s ' || ?
        LIMIT 10
      `).bind(ref.section_number, ref.section_number, ref.section_number, ref.section_number).all();

      // FTS5 pass — catches content-based references in raw_text and title
      const ssFtsRows = await env.DB.prepare(`
        SELECT ss.id, ss.id as chunk_id, COALESCE(ss.enriched_text, ss.raw_text) as text,
               NULL as section_number, NULL as heading, NULL as leg_title
        FROM secondary_sources_fts fts
        JOIN secondary_sources ss ON ss.id = fts.source_id
        WHERE secondary_sources_fts MATCH '"s ' || ? || '"'
           OR secondary_sources_fts MATCH '"section ' || ? || '"'
        LIMIT 10
      `).bind(ref.section_number, ref.section_number).all();

      // Union both result sets — existing seen Set dedup handles overlaps
      const ssRows = { results: [...(ssLikeRows.results || []), ...(ssFtsRows.results || [])] };
      for (const row of ssRows.results) {
        if (!seen.has(row.id)) { seen.add(row.id); results.push(row); }
      }
    }
    return new Response(JSON.stringify({ sections: results }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleFetchLegislationForEmbedding(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  const url = new URL(request.url);
  const batch = parseInt(url.searchParams.get('batch') || '5');
  const acts = await env.DB.prepare(`SELECT id, title FROM legislation WHERE embedded=0 LIMIT ?`).bind(batch).all();
  if (!acts.results.length) return new Response(JSON.stringify({ sections: [] }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  const result = [];
  for (const act of acts.results) {
    const sections = await env.DB.prepare(`
      SELECT id, legislation_id, section_number, heading, text
      FROM legislation_sections WHERE legislation_id=?
    `).bind(act.id).all();
    for (const s of sections.results) {
      result.push({
        leg_id:         act.id,
        leg_title:      act.title,
        section_id:     s.id,
        section_number: s.section_number,
        heading:        s.heading || '',
        text:           s.text || ''
      });
    }
  }
  return new Response(JSON.stringify({ sections: result }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

async function handleMarkLegislationEmbedded(request, env, corsHeaders) {
  const key = request.headers.get('X-Nexus-Key');
  if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ ok: false, error: 'Unauthorised' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  try {
    const { leg_ids } = await request.json();
    if (!leg_ids?.length) return new Response(JSON.stringify({ updated: 0 }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    const BATCH = 99;
    let total = 0;
    for (let i = 0; i < leg_ids.length; i += BATCH) {
      const slice = leg_ids.slice(i, i + BATCH);
      const placeholders = slice.map(() => '?').join(',');
      await env.DB.prepare(`UPDATE legislation SET embedded=1 WHERE id IN (${placeholders})`).bind(...slice).run();
      total += slice.length;
    }
    return new Response(JSON.stringify({ ok: true, updated: total }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

/* =============================================================
   MAIN FETCH HANDLER
   ============================================================= */
export default {
  async fetch(request, env) {
    console.log('Request received:', request.url);
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    const ALLOWED_ORIGINS = [
      'https://arcanthyr-ui.pages.dev',
      'http://localhost:5173',
      'http://localhost:4173',
    ];
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (origin || "*");

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET,POST,DELETE,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Nexus-Key",
      "Access-Control-Allow-Credentials": "true",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

    /* ── AUTH ROUTES ─────────────────────────────────────────── */
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
      const { password } = body || {};
      if (!password || password !== env.NEXUS_SECRET_KEY) return json({ error: 'Unauthorized' }, 401);
      const jwtSecret = env.JWT_SECRET || env.NEXUS_SECRET_KEY;
      const token = await signJWT({ sub: 'arcanthyr', exp: Math.floor(Date.now() / 1000) + 86400 }, jwtSecret);
      const res = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json',
          'Set-Cookie': `arc_token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400` }
      });
      return res;
    }

    if (url.pathname === '/api/auth/verify' && request.method === 'GET') {
      const token = getTokenFromRequest(request);
      const jwtSecret = env.JWT_SECRET || env.NEXUS_SECRET_KEY;
      const payload = await verifyJWT(token, jwtSecret);
      if (!payload) return json({ ok: false }, 401);
      return json({ ok: true });
    }

    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json',
          'Set-Cookie': 'arc_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }
      });
    }

    /* ── AI PROXY ROUTES ─────────────────────────────────────── */
    if (url.pathname.startsWith("/api/ai/")) {
      if (!rateLimit(`${ip}:ai`, 15, 60_000)) return json({ error: "Rate limit exceeded. Wait a moment." }, 429);
      if (!env.AI) return json({ error: "AI binding not configured." }, 503);
      if (request.method !== "POST") return json({ error: "AI routes accept POST only." }, 405);

      const action = url.pathname.replace("/api/ai/", "");
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }

      try {
        let result;
        if (action === "draft") result = await handleDraft(body, env);
        else if (action === "next-actions") result = await handleNextActions(body, env);
        else if (action === "weekly-review") result = await handleWeeklyReview(body, env);
        else if (action === "clarify-agent") result = await handleClarifyAgent(body, env);
        else if (action === "axiom-relay") result = await handleAxiomRelay(body, env);
        else return json({ error: `Unknown AI action: ${action}` }, 404);
        return json({ result });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    /* ── EMAIL ROUTES ────────────────────────────────────────── */
    if (url.pathname.startsWith("/api/email/")) {
      if (!rateLimit(`${ip}:email`, 10, 60_000)) return json({ error: "Email rate limit exceeded." }, 429);
      const action = url.pathname.replace("/api/email/", "");
      const body = request.method === "POST" ? await request.json() : null;
      try {
        let result;
        if (action === "send" && request.method === "POST") result = await handleSendEmail(body, env);
        else if (action === "contacts" && request.method === "GET") result = await handleGetContacts(env);
        else if (action === "contacts" && request.method === "POST") result = await handleAddContact(body, env);
        else if (action.startsWith("contacts/") && request.method === "DELETE") result = await handleDeleteContact(action.replace("contacts/", ""), env);
        else return json({ error: "Invalid email endpoint" }, 404);
        return json({ result });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    /* ── LEGAL RESEARCH ROUTES ───────────────────────────────── */
    if (url.pathname.startsWith("/api/legal/")) {
      if (!rateLimit(`${ip}:legal`, 30, 60_000)) return json({ error: "Legal API rate limit exceeded." }, 429);
      const action = url.pathname.replace("/api/legal/", "");
      const body = request.method === "POST" ? await request.json() : null;
      try {
        let result;
        if (action === "sync-progress") result = await getSyncProgress(env);
        else if (action === "search-cases" && request.method === "POST") result = await handleSearchCases(body, env);
        else if (action === "search-principles" && request.method === "POST") result = await handleSearchPrinciples(body, env);
        else if (action === "trigger-sync" && request.method === "POST") result = await runDailySync(env);
        else if (action === "backfill-year" && request.method === "POST") result = await runYearBackfill(env, body.year || new Date().getFullYear() - 1);
        else if (action === "upload-case" && request.method === "POST") result = await handleUploadCase(body, env);
        else if (action === "reprocess-case" && request.method === "POST") result = await handleReprocessCase(body, env);
        else if (action === "extract-pdf" && request.method === "POST") result = await handleExtractPdf(body, env);
        else if (action === "upload-legislation" && request.method === "POST") result = await handleUploadLegislation(body, env);
        else if (action === "upload-secondary" && request.method === "POST") result = await handleUploadSecondarySource(body, env);
        else if (action === "upload-corpus" && request.method === "POST") result = await handleUploadCorpus(body, env);
        else if (action === "format-and-upload" && request.method === "POST") result = await handleFormatAndUpload(body, env);
        else if (action === "library" && request.method === "GET") result = await handleLibraryList(env);
        else if (action === "case-authority" && request.method === "GET") {
          const citation = url.searchParams.get('citation');
          if (!citation) return json({ error: 'citation required' }, 400);
          result = await handleCaseAuthority(decodeURIComponent(citation), env);
        }
        else if (action === "cases" && request.method === "GET") { const lib = await handleLibraryList(env); result = lib.cases; }
        else if (action === "corpus" && request.method === "GET") { const lib = await handleLibraryList(env); result = lib.secondary; }
        else if (action === "legislation" && request.method === "GET") { const lib = await handleLibraryList(env); result = lib.legislation; }
        else if (action === "share" && request.method === "POST") result = await handleShare(body, env);
        else if (action.startsWith("library/delete/") && request.method === "DELETE") {
          // URL pattern: /api/legal/library/delete/{docType}/{id}
          const parts = action.replace("library/delete/", "").split("/");
          const docType = parts[0];
          const docId = decodeURIComponent(parts.slice(1).join("/"));
          result = await handleLibraryDelete(docType, docId, env);
        }
        else if (action === "legislation-search" && request.method === "POST") result = await handleLegislationSearch(body, env);
        else if (action === "search-by-legislation" && request.method === "GET") result = await handleSearchByLegislation(url, env);
        else if (action === "word-search" && request.method === "GET") result = await handleWordSearch(url, env);
        else if (action === "austlii-word-search" && request.method === "GET") result = await handleAustLIIWordSearch(url, env);
        else if (action === "fetch-judgment" && request.method === "GET") result = await handleFetchJudgment(url, env);
        else if (action === "amendments" && request.method === "GET") result = await handleAmendments(url, env);
        else if (action === "resolve-act" && request.method === "GET") result = await handleResolveAct(url, env);
        else if (action === "section-lookup" && request.method === "POST") result = await handleSectionLookup(body, env);
        else if (action === "mark-insufficient" && request.method === "POST") {
          if (!body?.query_id) return json({ result: { ok: false, error: 'query_id required' } }, 400);
          if (body.missing_note !== undefined && body.missing_note !== null && typeof body.missing_note !== 'string') {
            return json({ result: { ok: false, error: 'missing_note must be a string' } }, 400);
          }
          if (body.flagged_by !== undefined && body.flagged_by !== null && typeof body.flagged_by !== 'string') {
            return json({ result: { ok: false, error: 'flagged_by must be a string' } }, 400);
          }
          const note = (body.missing_note && typeof body.missing_note === 'string') ? body.missing_note.slice(0, 500) : null;
          const flaggedBy = (body.flagged_by && typeof body.flagged_by === 'string') ? body.flagged_by.slice(0, 200) : 'admin';
          const dbResult = await env.DB.prepare(
            `UPDATE query_log SET sufficient = 0, missing_note = ?, flagged_by = ? WHERE id = ?`
          ).bind(note, flaggedBy, body.query_id).run();
          if (dbResult.meta.changes === 0) return json({ result: { ok: false, error: 'not found' } }, 404);
          result = { ok: true, updated: dbResult.meta.changes };
        }
        else if (action === "legal-query" && request.method === "POST") result = await handleLegalQuery(body, env);
        else if (action === "legal-query-workers-ai" && request.method === "POST") result = await handleLegalQueryWorkersAI(body, env);
        else if (action === "fetch-page" && request.method === "POST") result = await handleFetchPage(body, env);
        else if (action === "fetch-case-url" && request.method === "POST") result = await handleFetchCaseUrl(body, env);
        else if (action === "case-status" && request.method === "GET") {
          const citation = url.searchParams.get('citation');
          if (!citation) return new Response(JSON.stringify({ error: 'citation required' }), { status: 400, headers: corsHeaders });
          const row = await env.DB.prepare(`SELECT enriched, embedded, enrichment_error FROM cases WHERE citation = ?`).bind(citation).first();
          if (!row) return new Response(JSON.stringify({ status: 'not_found' }), { headers: corsHeaders });
          const status = row.enrichment_error ? 'error' : row.enriched ? 'done' : 'processing';
          return new Response(JSON.stringify({ status, enriched: row.enriched, embedded: row.embedded, error: row.enrichment_error }), { headers: corsHeaders });
        }
        else return json({ error: "Invalid legal endpoint" }, 404);
        return json({ result });
      } catch (err) { console.error('legal-query error:', err); return json({ error: err.message }, 500); }
    }

    /* ── PIPELINE ROUTES ─────────────────────────────────────── */
    if (url.pathname === '/api/pipeline/status' && request.method === 'GET') return handlePipelineStatus(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/write-enriched' && request.method === 'POST') return handleWriteEnriched(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/mark-embedded' && request.method === 'POST') return handleMarkEmbedded(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-unenriched' && request.method === 'GET') return handleFetchUnenriched(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-for-embedding' && request.method === 'GET') return handleFetchForEmbedding(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-embedded' && request.method === 'GET') return handleFetchEmbedded(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/reset-embedded' && request.method === 'POST') return handleResetEmbedded(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/update-secondary-raw' && request.method === 'POST') return handleUpdateSecondaryRaw(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-secondary-raw' && request.method === 'GET') return handleFetchSecondaryRaw(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-legislation-for-embedding' && request.method === 'GET') return handleFetchLegislationForEmbedding(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-sections-by-reference' && request.method === 'POST') return handleFetchSectionsByReference(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/mark-legislation-embedded' && request.method === 'POST') return handleMarkLegislationEmbedded(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-cases-for-xref' && request.method === 'GET') return handleFetchCasesForXref(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/write-citations' && request.method === 'POST') return handleWriteCitations(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/write-legislation-refs' && request.method === 'POST') return handleWriteLegislationRefs(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-cases-by-legislation-ref' && request.method === 'POST') return handleFetchCasesByLegislationRef(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fts-search-chunks' && request.method === 'GET') return handleFtsSearchChunks(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-case-chunks-for-embedding' && request.method === 'GET') {
      const batch = parseInt(url.searchParams.get('batch') || '10');
      const { results } = await env.DB.prepare(
        `SELECT cc.id, cc.citation, cc.chunk_index, cc.chunk_text, cc.enriched_text, cc.principles_json, c.case_name, c.subject_matter, c.court
 FROM case_chunks cc
 LEFT JOIN cases c ON c.citation = cc.citation
 WHERE cc.done = 1 AND cc.embedded = 0 AND cc.enriched_text IS NOT NULL LIMIT ?`
      ).bind(batch).all();
      return new Response(JSON.stringify({ chunks: results }), { headers: corsHeaders });
    }
    if (url.pathname === '/api/pipeline/mark-case-chunks-embedded' && request.method === 'POST') {
      const { chunk_ids } = await request.json();
      for (const id of chunk_ids) {
        await env.DB.prepare(`UPDATE case_chunks SET embedded = 1 WHERE id = ?`).bind(id).run();
      }
      return new Response(JSON.stringify({ ok: true, count: chunk_ids.length }), { headers: corsHeaders });
    }

    if (url.pathname === '/api/admin/requeue-metadata' && request.method === 'POST') return handleRequeueMetadata(request, env, corsHeaders);
    if (url.pathname === '/api/admin/requeue-chunks' && request.method === 'POST') return handleRequeueChunks(request, env, corsHeaders);
    if (url.pathname === '/api/admin/requeue-merge' && request.method === 'POST') return handleRequeueMerge(request, env, corsHeaders);
    if (url.pathname === '/api/admin/backfill-sentencing' && request.method === 'POST') return handleSentencingBackfill(request, env, corsHeaders);
    if (url.pathname === '/api/admin/pending-nexus' && request.method === 'GET') return handlePendingNexus(request, env, corsHeaders);
    if (url.pathname === '/api/admin/approve-secondary' && request.method === 'POST') return handleApproveSecondary(request, env, corsHeaders);

    /* ── HEALTH CHECK ROUTES ─────────────────────────────────── */
    if (url.pathname === '/api/admin/health-reports' && request.method === 'GET') return handleGetHealthReports(request, env, corsHeaders);
    if (url.pathname.startsWith('/api/admin/health-reports/') && request.method === 'GET') {
      const reportId = url.pathname.slice('/api/admin/health-reports/'.length);
      return handleGetHealthReport(request, env, corsHeaders, reportId);
    }
    if (url.pathname === '/api/admin/health-reports' && request.method === 'POST') return handlePostHealthReport(request, env, corsHeaders);
    if (url.pathname === '/api/admin/health-clusters' && request.method === 'POST') return handlePostHealthClusters(request, env, corsHeaders);

    /* ── FEEDBACK ROUTE ─────────────────────────────────────── */
    if (url.pathname === '/api/pipeline/feedback' && request.method === 'POST') {
      const key = request.headers.get('X-Nexus-Key');
      if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: corsHeaders });
      try {
        const body = await request.json();
        const { query_id, chunk_id, feedback_type, comment } = body;
        const allowed = ['helpful', 'unhelpful', 'irrelevant', 'hallucinated'];
        if (!feedback_type || !allowed.includes(feedback_type)) {
          return new Response(JSON.stringify({ error: `feedback_type must be one of: ${allowed.join(', ')}` }), { status: 400, headers: corsHeaders });
        }
        if (!query_id) return new Response(JSON.stringify({ error: 'query_id required' }), { status: 400, headers: corsHeaders });
        await env.DB.prepare(
          `INSERT INTO synthesis_feedback (id, query_id, chunk_id, feedback_type, comment, created_at) VALUES (?1,?2,?3,?4,?5,?6)`
        ).bind(crypto.randomUUID(), query_id, chunk_id || null, feedback_type, comment || null, new Date().toISOString()).run();
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      } catch (err) {
        console.error('feedback insert error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    /* ── QUERY HISTORY ROUTES ───────────────────────────────── */
    if (url.pathname === '/api/query/history' && request.method === 'GET') return handleGetQueryHistory(request, env, corsHeaders);
    if (url.pathname === '/api/query/history/delete' && request.method === 'POST') return handleDeleteQueryHistory(request, env, corsHeaders);

    /* ── CASE CHUNKS FTS SEARCH (for server.py BM25 pass) ──── */
    if (url.pathname === '/api/pipeline/case-chunks-fts-search' && request.method === 'GET') {
      const key = request.headers.get('X-Nexus-Key');
      if (key !== env.NEXUS_SECRET_KEY) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: corsHeaders });
      try {
        const q = url.searchParams.get('q');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '8'), 20);
        if (!q) return new Response(JSON.stringify({ error: 'q required' }), { status: 400, headers: corsHeaders });
        const result = await env.DB.prepare(
          `SELECT fts.chunk_id, fts.citation, SUBSTR(fts.enriched_text, 1, 800) as enriched_text,
                  c.case_name, c.court, c.subject_matter
           FROM case_chunks_fts fts
           LEFT JOIN cases c ON c.citation = fts.citation
           WHERE case_chunks_fts MATCH ?1
           ORDER BY rank
           LIMIT ?2`
        ).bind(q, limit).all();
        return new Response(JSON.stringify({ chunks: result.results }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (err) {
        console.error('case-chunks-fts-search error:', err);
        return new Response(JSON.stringify({ error: err.message, chunks: [] }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    /* ── INGEST ROUTES (proxy to nexus) ─────────────────────── */
    if (url.pathname === '/api/ingest/process-document' && request.method === 'POST') {
      try {
        const body = await request.json();
        const r = await fetch('https://nexus.arcanthyr.com/process-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Nexus-Key': env.NEXUS_SECRET_KEY },
          body: JSON.stringify(body),
        });
        const data = await r.json();
        return new Response(JSON.stringify(data), { status: r.status, headers: corsHeaders });
      } catch (err) { return json({ error: err.message }, 500); }
    }
    if (url.pathname.startsWith('/api/ingest/status/') && request.method === 'GET') {
      try {
        const jobId = url.pathname.slice('/api/ingest/status/'.length);
        const r = await fetch(`https://nexus.arcanthyr.com/ingest-status/${jobId}`, {
          headers: { 'X-Nexus-Key': env.NEXUS_SECRET_KEY },
        });
        const data = await r.json();
        return new Response(JSON.stringify(data), { status: r.status, headers: corsHeaders });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    if (url.pathname === '/api/pipeline/fts-search' && request.method === 'POST') {
      const { query, limit = 10 } = await request.json();
      if (!query) return new Response(JSON.stringify({ error: 'query required' }), { status: 400, headers: corsHeaders });
      const sanitised = query.replace(/['"*()]/g, ' ').trim();
      const { results } = await env.DB.prepare(
        `SELECT source_id, title, bm25(secondary_sources_fts) AS bm25_score
         FROM secondary_sources_fts
         WHERE secondary_sources_fts MATCH ?
         ORDER BY bm25_score
         LIMIT ?`
      ).bind(sanitised, limit).all();
      return new Response(JSON.stringify({ results }), { headers: corsHeaders });
    }

    if (url.pathname === '/api/pipeline/bm25-corpus' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT id, title, raw_text, category FROM secondary_sources WHERE embedded = 1`
      ).all();
      return new Response(JSON.stringify({ rows: results }), { headers: corsHeaders });
    }

    if (url.pathname === '/api/pipeline/case-subjects' && request.method === 'GET') {
      // Returns full citation→subject_matter map for server.py subject_matter filter cache.
      const { results } = await env.DB.prepare(
        `SELECT citation, subject_matter FROM cases`
      ).all();
      const subjects = Object.fromEntries(results.map(r => [r.citation, r.subject_matter || 'unknown']));
      return new Response(JSON.stringify({ subjects }), { headers: corsHeaders });
    }

    if (url.pathname === '/api/pipeline/truncation-status' && request.method === 'GET') {
      return handleTruncationStatus(request, env);
    }

    if (url.pathname === '/api/pipeline/truncation-resolve' && request.method === 'POST') {
      return handleTruncationResolve(request, env);
    }

    /* ── TTS ROUTE ───────────────────────────────────────────── */
    if (url.pathname === '/api/tts' && request.method === 'POST') {
      try {
        const body = await request.json();
        const vpsRes = await fetch('https://nexus.arcanthyr.com/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Nexus-Key': env.NEXUS_SECRET_KEY },
          body: JSON.stringify(body),
        });
        if (!vpsRes.ok) {
          const errData = await vpsRes.json().catch(() => ({ error: 'TTS service error' }));
          return new Response(JSON.stringify(errData), {
            status: vpsRes.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const wavBytes = await vpsRes.arrayBuffer();
        return new Response(wavBytes, {
          status: 200,
          headers: { 'Content-Type': 'audio/wav', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (err) { return json({ error: err.message }, 502); }
    }

    /* ── INGEST ROUTES ────────────────────────────────────────── */
    if (url.pathname.startsWith("/api/ingest/")) {
      if (!rateLimit(`${ip}:ingest`, 10, 60_000)) return json({ error: "Ingest rate limit exceeded." }, 429);
      const segment = url.pathname.replace("/api/ingest/", "");

      if (segment === "upload-document" && request.method === "POST") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
        try {
          const nexusRes = await fetch("https://nexus.arcanthyr.com/process-document", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Nexus-Key": env.NEXUS_SECRET_KEY },
            body: JSON.stringify(body),
          });
          const data = await nexusRes.json();
          return json(data, nexusRes.status);
        } catch (err) { return json({ error: err.message }, 502); }
      }

      if (segment.startsWith("status/") && request.method === "GET") {
        const jobId = segment.replace("status/", "");
        if (!jobId) return json({ error: "jobId required" }, 400);
        try {
          const nexusRes = await fetch(`https://nexus.arcanthyr.com/ingest-status/${jobId}`, {
            method: "GET",
            headers: { "X-Nexus-Key": env.NEXUS_SECRET_KEY },
          });
          const data = await nexusRes.json();
          return json(data, nexusRes.status);
        } catch (err) { return json({ error: err.message }, 502); }
      }

      return json({ error: "Invalid ingest endpoint" }, 404);
    }

    /* ── ENTRIES ROUTES ───────────────────────────────────────── */
    if (url.pathname.startsWith("/api/entries")) {
      const limits = {
        GET: { max: 60, windowMs: 60_000 },
        POST: { max: 20, windowMs: 60_000 },
        DELETE: { max: 10, windowMs: 60_000 },
        PATCH: { max: 10, windowMs: 60_000 },
      };
      const lim = limits[request.method];
      if (lim && !rateLimit(`${ip}:${request.method}`, lim.max, lim.windowMs))
        return json({ error: "Rate limit exceeded." }, 429);

      if (request.method === "GET") {
        const { results } = await env.DB
          .prepare("SELECT * FROM entries WHERE deleted = 0 ORDER BY created_at DESC LIMIT 200").all();
        return json({ entries: results });
      }
      if (request.method === "POST") {
        const body = await request.json();
        for (const k of ["id", "created_at", "text", "tag", "next", "clarify"]) {
          if (body?.[k] === undefined || body?.[k] === null) return json({ error: `Missing required field: ${k}` }, 400);
        }
        await env.DB.prepare(`INSERT INTO entries (id, created_at, text, tag, next, clarify, draft, _v, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`)
          .bind(body.id, body.created_at, body.text, body.tag, body.next, body.clarify, body.draft ?? null, body._v ?? 0).run();
        return json({ ok: true });
      }
      if (request.method === "DELETE") {
        const id = url.pathname.replace("/api/entries", "").replace(/^\//, "");
        if (id) await env.DB.prepare("UPDATE entries SET deleted = 1 WHERE id = ?").bind(id).run();
        else await env.DB.prepare("UPDATE entries SET deleted = 1 WHERE deleted = 0").run();
        return json({ ok: true });
      }
      if (request.method === "PATCH") {
        await env.DB.prepare("UPDATE entries SET deleted = 0 WHERE deleted = 1").run();
        return json({ ok: true });
      }
    }

    /* ── EMAIL DIGEST ROUTES ──────────────────────────────────── */
    if (url.pathname === '/digest') {
      if (request.method === 'GET') {
        const html = await env.EMAIL_DIGEST.get('email-digest:latest');
        if (!html) {
          return new Response(
            `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arcanthyr Digest</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0d0d0f;color:#b0b0b8;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{border:1px solid #2a2a32;border-radius:6px;padding:2rem 2.5rem;max-width:420px;text-align:center}h1{color:#e8e8f0;font-size:1rem;font-weight:600;letter-spacing:.04em;margin-bottom:.75rem}.sub{font-size:.8rem;color:#55555f}</style></head><body><div class="card"><h1>ARCANTHYR DIGEST</h1><p class="sub">No digest available yet.</p></div></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      if (request.method === 'POST') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        if (!env.DIGEST_API_KEY || token !== env.DIGEST_API_KEY) {
          return json({ error: 'Unauthorized' }, 401);
        }
        const contentType = request.headers.get('Content-Type') || '';
        let digestHtml;
        if (contentType.includes('application/json')) {
          let body;
          try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
          digestHtml = body.html || body.content || '';
        } else {
          digestHtml = await request.text();
        }
        if (!digestHtml) return json({ error: 'Empty body' }, 400);
        await env.EMAIL_DIGEST.put('email-digest:latest', digestHtml);
        return json({ ok: true });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runDailySync(env));
    ctx.waitUntil(runBatchedChunkCleanup(env));
  },

  async queue(batch, env) {
    console.log(`[queue] batch received, ${batch.messages.length} messages`);
    for (const msg of batch.messages) {
      const { type, citation, chunk_index } = msg.body;
      try {
        if (type === 'CHUNK') {
          // Process one chunk — one Workers AI call
          const row = await env.DB.prepare(
            `SELECT chunk_text FROM case_chunks WHERE citation = ? AND chunk_index = ?`
          ).bind(citation, chunk_index).first();
          if (!row) throw new Error(`No chunk found for ${citation} index ${chunk_index}`);

          const caseRow = await env.DB.prepare(
            `SELECT case_name, court, facts, issues, judge, case_date, subject_matter, holding FROM cases WHERE citation = ?`
          ).bind(citation).first();

          const totalChunks = msg.body.total_chunks || 0;
          const roleHint = isLikelyHeader(chunk_index, row.chunk_text) ? 'header' : 'unknown';
          const userContent = [
            `Case: ${citation}`,
            `Court: ${caseRow?.court || 'Not stated'}`,
            `Judge: ${caseRow?.judge || 'Not stated'}`,
            `Date: ${caseRow?.case_date || 'Not stated'}`,
            `Chunk: ${chunk_index + 1} of ${totalChunks}`,
            `Hint: ${roleHint}`,
            `Subject matter (from metadata): ${caseRow?.subject_matter || 'Not yet classified'}`,
            `Case context — Facts: ${caseRow?.facts || ''}`,
            `Case context — Issues: ${caseRow?.issues || ''}`,
            ``,
            `--- EXCERPT START ---`,
            row.chunk_text,
            `--- EXCERPT END ---`
          ].join('\n');

          const systemPrompt = `You are an Australian legal judgment enrichment engine. You analyse a single excerpt from a court judgment and output ONLY valid JSON.

Your goal is retrieval-quality enrichment for a legal research system. Extract only what is genuinely supported by THIS excerpt. Do not infer a legal principle unless the excerpt itself contains judicial reasoning, an applied legal test, or a clearly expressed legal conclusion by the judge.

STEP 1 — CLASSIFY the chunk. You must assign one of these types:
- "reasoning" — judicial analysis, statement or application of a legal test, ratio decidendi, obiter dicta, the judge's reasoning on a legal issue
- "evidence" — witness testimony, cross-examination transcript, factual narrative, exhibit descriptions
- "submissions" — arguments advanced by counsel or parties, not the judge's own conclusions
- "procedural" — grounds of appeal, charge history, pleadings, orders, procedural background
- "header" — court/citation/parties/judge/dates/catchwords metadata with no substantive reasoning
- "mixed" — genuinely contains both judicial reasoning and one or more other types

STEP 2 — EXTRACT based on type. These rules are absolute:
1. Do NOT extract legal principles from evidence, submissions, procedural, or header chunks. Cross-examination about a firearm does not establish an assault principle. Only the judge's reasoning does.
2. Do NOT restate generic criminal law doctrine unless the judge explicitly states or applies it in THIS excerpt.
3. Do NOT attempt to state the overall case holding unless this specific chunk contains it.
4. Principles must be stated in the judge's own doctrinal language — NOT as simplified IF/THEN abstractions. Preserve the specific conditions, qualifications, and statutory anchors as the judge expressed them.
5. Quality over quantity. One precisely stated principle is better than three generic ones. Maximum 2 principles per chunk; usually 0 or 1. If no clear principle exists, return [].
6. Only include authorities actually named in the excerpt text — not your background knowledge.
7. Only include legislation actually cited in the excerpt text.
8. Use facts_summary and issues only as case context. Extract only from the EXCERPT.

OUTPUT — respond with ONLY valid JSON, no markdown fences, no commentary:

{
  "chunk_type": "reasoning|evidence|submissions|procedural|header|mixed",
  "subject_matter": "criminal|civil|administrative|family|mixed|unknown",
  "enriched_text": "string",
  "principles": [
    {
      "principle": "string — the court's doctrinal statement with its specific conditions as expressed by the judge",
      "type": "ratio|obiter",
      "confidence": "high|medium",
      "statute_refs": ["s 46 Criminal Code (Tas)"],
      "authorities_applied": ["case name"],
      "keywords": ["specific legal terms — 3 to 6, not generic words like criminal or law"]
    }
  ],
  "holdings": [
    {
      "holding": "string",
      "topic": "string",
      "basis": "factual|legal|procedural"
    }
  ],
  "legislation": ["s 46 Criminal Code (Tas)"],
  "key_authorities": [
    {
      "name": "string",
      "treatment": "applied|followed|distinguished|cited|referred to|not followed",
      "proposition": "string"
    }
  ],
  "reasoning_quotes": [
    {
      "quote": "string — verbatim sentence max 200 chars",
      "why_selected": "string"
    }
  ],
  "confidence": "high|medium|low"
}

FIELD SPECIFICATIONS:

enriched_text is REQUIRED and is the primary field for semantic embedding.

For reasoning chunks (200-350 words): Open with one sentence that explicitly names the statute section (e.g. "s 138 of the Evidence Act 2001 (Tas)"), defined doctrine (e.g. "the totality principle"), or authoritative case (e.g. "Mill v The Queen") that this chunk applies. Do not use generic descriptions like "the provision" or "the legal issue" — name the specific legal object. Then state the principle or test in the judge's own doctrinal terms. For each authority cited, state what specific principle it stands for in this case. Include 1-2 verbatim sentences from the judicial reasoning in quotation marks. Note any statutory provisions interpreted. Close with the specific conclusion reached.

For evidence chunks (80-150 words): Open with "This chunk contains [witness testimony / cross-examination / factual narrative] regarding [specific topic]." Summarise factual content. Note what legal issue it is relevant to. Do NOT state legal principles.

For submissions chunks (80-150 words): Open with "This chunk contains [appellant/respondent/Crown] submissions regarding [specific topic]." Summarise the argument. Note which legal issue it addresses.

For procedural chunks (50-100 words): Describe the procedural content.

For header chunks (50-80 words): Open with "This chunk contains the judgment header for [case name]." List metadata present.

principles — only for reasoning or mixed chunks; empty array otherwise; max 2
holdings — only for reasoning or mixed chunks; empty array otherwise; max 3
legislation — string array; only what appears in the excerpt; max 5; empty array otherwise
key_authorities — only cases named in the excerpt; max 5; empty array otherwise
reasoning_quotes — only for reasoning or mixed chunks; max 2; each quote max 200 chars; empty array otherwise
confidence — high if clearly reasoning with explicit principles; medium if reasoning present but implicit; low if ambiguous or thin`;

          const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini-2025-04-14",
              max_completion_tokens: 1600,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent }
              ]
            })
          });
          const aiData = await aiResponse.json();
          const raw = aiData.choices?.[0]?.message?.content?.trim() || "";
          const cleaned = (raw || '').replace(/```json|```/g, '').trim();
          const chunkId = `${citation}__chunk__${chunk_index}`;

          if (!cleaned) {
            console.error("CHUNK parse failed for chunk:", chunkId, raw?.slice(0, 200));
            throw new Error("CHUNK parse failed: empty or malformed response");
          }

          let extracted = { principles: [], holdings: [], legislation: [], key_authorities: [] };
          console.log(`[queue] raw response chunk ${citation}/${chunk_index}:`, raw);
          try { extracted = JSON.parse(cleaned); } catch (e) { console.error("CHUNK parse failed for chunk:", chunkId, raw?.slice(0, 200)); throw new Error("CHUNK parse failed: empty or malformed response"); }

          const enrichedText = extracted.enriched_text || null;

          // Code-side validator — strip authorities not actually named in excerpt
          if (extracted.key_authorities) {
            extracted.key_authorities = extracted.key_authorities.filter(a =>
              row.chunk_text.includes((a.name || '').split(' ')[0])
            );
          }
          // Enforce type-based extraction gates
          if (!['reasoning', 'mixed'].includes(extracted.chunk_type)) {
            extracted.principles = [];
            extracted.holdings = [];
            extracted.reasoning_quotes = [];
          }
          // Cap arrays
          if ((extracted.principles || []).length > 2) extracted.principles = extracted.principles.slice(0, 2);
          if ((extracted.holdings || []).length > 3) extracted.holdings = extracted.holdings.slice(0, 3);
          if ((extracted.reasoning_quotes || []).length > 2) extracted.reasoning_quotes = extracted.reasoning_quotes.slice(0, 2);
          if ((extracted.legislation || []).length > 5) extracted.legislation = extracted.legislation.slice(0, 5);
          if ((extracted.key_authorities || []).length > 5) extracted.key_authorities = extracted.key_authorities.slice(0, 5);

          if (!extracted.chunk_type) {
            throw new Error('CHUNK enrichment produced no chunk_type — likely empty or malformed GPT response');
          }

          await env.DB.prepare(
            `UPDATE case_chunks SET principles_json = ?, enriched_text = ?, done = 1 WHERE citation = ? AND chunk_index = ?`
          ).bind(JSON.stringify(extracted), enrichedText, citation, chunk_index).run();

          // Sync to case_chunks_fts for BM25 keyword search
          // FTS5 UNINDEXED columns don't trigger REPLACE on rowid collision — DELETE+INSERT is the correct upsert idiom
          if (enrichedText) {
            try {
              await env.DB.batch([
                env.DB.prepare(`DELETE FROM case_chunks_fts WHERE chunk_id = ?`).bind(chunkId),
                env.DB.prepare(`INSERT INTO case_chunks_fts (chunk_id, citation, enriched_text) VALUES (?, ?, ?)`).bind(chunkId, citation, enrichedText),
              ]);
            } catch (ftsErr) {
              console.error('case_chunks_fts sync failed:', ftsErr);
            }
          }

          // Check if all chunks done — if so, attempt atomic merge claim
          const pending = await env.DB.prepare(
            `SELECT COUNT(*) as cnt FROM case_chunks WHERE citation = ? AND done = 0`
          ).bind(citation).first();

          if (pending.cnt === 0) {
            // Atomic claim — only one concurrent worker proceeds per citation
            const claimResult = await env.DB.prepare(
              `UPDATE cases SET deep_enriched = 1 WHERE citation = ? AND deep_enriched = 0`
            ).bind(citation).run();

            if (claimResult.meta.changes === 0) {
              console.log(`[queue] merge already claimed for ${citation}, skipping`);
              msg.ack();
              return;
            }

            // Merge all chunk results via synthesis
            await performMerge(citation, { case_name: caseRow?.case_name, court: caseRow?.court, facts: caseRow?.facts, issues: caseRow?.issues, subject_matter: caseRow?.subject_matter, holding: caseRow?.holding }, env);
          }
          msg.ack();

        } else if (type === 'MERGE') {
          // MERGE message — re-run merge step for a case with all chunks already done
          const mergeCaseRow = await env.DB.prepare(
            `SELECT case_name, court, facts, issues, subject_matter, holding FROM cases WHERE citation = ?`
          ).bind(citation).first();
          if (!mergeCaseRow) throw new Error(`No case row for ${citation}`);

          const claimResult = await env.DB.prepare(
            `UPDATE cases SET deep_enriched = 1 WHERE citation = ? AND deep_enriched = 0`
          ).bind(citation).run();
          if (claimResult.meta.changes === 0) {
            console.log(`[queue] merge already claimed for ${citation}, skipping`);
            msg.ack();
            return;
          }

          await performMerge(citation, mergeCaseRow, env);
          msg.ack();

        } else {
          // METADATA message — Pass 1 + split + enqueue chunks
          const row = await env.DB.prepare(
            `SELECT raw_text, case_name, court FROM cases WHERE citation = ?`
          ).bind(citation).first();
          if (!row || !row.raw_text) throw new Error(`No raw_text in D1 for ${citation}`);

          console.log(`[queue] METADATA pass for ${citation}, length: ${row.raw_text.length}`);

          // Pass 1 — metadata/facts/case_name from first 8k chars
          const pass1System = `You are a legal metadata extraction assistant. Extract structured metadata from this Australian court judgment.

Return ONLY a single valid JSON object. No explanation, no markdown, no text before or after the JSON.

{
  "case_name": "Party names from the VERY FIRST LINE of the document (e.g. 'R v Smith', 'Tasmania v Brown (No 2)'). Stop before the first '[' character — do not include the citation. If the first line is missing or unclear, extract from the CITATION field. NEVER use court division labels ('Criminal', 'Civil', 'Criminal Division', 'Civil Division') as the case_name. If PARTIES uses SURNAME, Given Names format, normalise to Given Names Surname in title case.",
  "judge": "Presiding judge(s) surname and title only (e.g. Wood J, or Pearce and Brett JJ)",
  "parties": "Applicant/Appellant and Respondent as named (e.g. Tasmania v Jones). Normalise SURNAME, Given Names to natural order.",
  "facts": "2-4 sentences summarising the core factual background giving rise to the proceeding. Extract from the judgment text — do not infer.",
  "issues": ["Legal issue 1 as a short phrase", "Legal issue 2 as a short phrase"]
}

Rules:
- Extract only what is explicitly stated. Do not infer or fabricate.
- issues must be a JSON array of strings, never a single string.
- If a field cannot be determined, use "" or [].
- case_name must be party names only — never a court division label, never a bare year, never just a citation.
- The very first character of your response must be {`;
          const pass1Raw = await callWorkersAI(env, pass1System, row.raw_text.slice(0, 8000), 1500);
          const pass1Cleaned = (pass1Raw || '').replace(/```json|```/g, '').trim();
          let pass1 = { case_name: null, judge: null, parties: null, facts: null, issues: [] };
          try { pass1 = JSON.parse(pass1Cleaned); } catch (e) {}
          validateCaseName(pass1, row.raw_text.slice(0, 8000));

          // Write Pass 1 results + set enriched=1
          await env.DB.prepare(`
            UPDATE cases SET
              case_name = ?,
              judge = ?,
              parties = ?,
              facts = ?,
              issues = ?,
              enriched = 1
            WHERE citation = ?
          `).bind(
            pass1.case_name || null,
            pass1.judge || null,
            Array.isArray(pass1.parties) ? pass1.parties.join(', ') : (pass1.parties || null),
            pass1.facts || null,
            Array.isArray(pass1.issues) ? pass1.issues.join('; ') : (pass1.issues || null),
            citation
          ).run();

          // Split full raw_text into chunks and write to case_chunks
          const chunks = splitIntoChunks(row.raw_text);
          console.log(`[queue] splitting ${citation} into ${chunks.length} chunks`);

          for (let i = 0; i < chunks.length; i++) {
            const chunkId = `${citation}__chunk__${i}`;
            await env.DB.prepare(`
              INSERT OR IGNORE INTO case_chunks (id, citation, chunk_index, chunk_text, done, embedded)
              VALUES (?, ?, ?, ?, 0, 0)
            `).bind(chunkId, citation, i, chunks[i]).run();
            await env.CASE_QUEUE.send({ type: 'CHUNK', citation, chunk_index: i, total_chunks: chunks.length });
          }
          console.log(`[queue] enqueued ${chunks.length} CHUNK messages for ${citation}`);
          msg.ack();
        }
      } catch (e) {
        console.error(`[queue] failed type=${type} ${citation}: ${e.message}`);
        msg.retry();
      }
    }
  },
};
