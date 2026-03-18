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
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  // DEBUG — remove after first confirmed working upload
  console.log("WorkersAI raw result:", JSON.stringify(result, null, 2));

  const raw = (
    result?.choices?.[0]?.message?.content?.trim() ||
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
        // ── Route through fetch-page proxy (Cloudflare edge IPs) ──────────
        // Direct fetch risks IP-based blocks from AustLII. handleFetchPage
        // uses the same headers and routing as the VPS scraper proxy endpoint.
        const { html, status } = await handleFetchPage({ url });

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

async function fetchCaseContent(url, preloadedHtml = null) {
  // NOTE: case_name is NOT extracted here. Llama extracts it in summarizeCase().
  // This function only strips HTML and returns the plain text for AI processing.
  try {
    let html;
    if (preloadedHtml) {
      html = preloadedHtml;
    } else {
      // ── Route through fetch-page proxy (Cloudflare edge IPs) ────────────
      const { html: fetchedHtml, status } = await handleFetchPage({ url });
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

async function processCaseUpload(env, caseText, citation, caseName, court) {
  if (!caseText || !citation) throw new Error("Missing required fields: caseText and citation");

  const exists = await env.DB.prepare("SELECT id, enriched FROM cases WHERE citation = ?").bind(citation).first();
  if (exists && exists.enriched === 1) throw new Error(`Case ${citation} already exists and is fully processed`);

  const truncatedText = caseText.length > 100000 ? caseText.substring(0, 100000) : caseText;

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
PRINCIPLES — extract per issue: 1 primary + up to 2 supporting (only if genuinely distinct).
Maximum 8 principles total across the whole judgment.

A legal principle MUST be a complete proposition: IF/WHEN [conditions] THEN [legal consequence or rule].
It must be usable on future facts without knowing the parties' names.
It must NOT be a label, heading, sentencing factor name, procedural outcome, or fact restatement.

BAD: "General deterrence" — label only, not a principle.
BAD: "The appeal is dismissed" — outcome, not a principle.
GOOD: "IF an offender commits a violent offence in a domestic or trust relationship, THEN general deterrence is a primary sentencing consideration and may warrant actual imprisonment even for a first offender."
GOOD: "IF weed eradication works are necessary and intrinsic to a development AND render the land suitable for construction, THEN they constitute substantial commencement of a development permit under s 53(5) of the Land Use Planning and Approvals Act 1993."

Each principle object:
{
  "principle": "IF/WHEN ... THEN ... (complete proposition, 1-2 sentences)",
  "type": "ratio" | "obiter" | "procedural",
  "source_mode": "stated" | "adopted_from_authority" | "implicit_applied",
  "statute_refs": ["Act (Jurisdiction) s.X"],
  "keywords": ["topic1", "topic2", "topic3"]
}
Mark source_mode "implicit_applied" if the court applied but did not explicitly state the rule.`;

  // ── Single-pass prompt (short judgments) ─────────────────────────────────
  const singlePassPrompt = `You are extracting verified legal information from an Australian court judgment for a practitioner database.
Do not guess or invent rules. If something is not clearly present in the text, use null.
Output ONLY valid JSON. No markdown fences. No commentary.

Extract these fields:
- case_name: from the heading or opening lines. Patterns: "R v Smith", "DPP v Jones", "Tasmania v Brown". Fallback to citation.
- judge: the presiding judge(s). Extract the full name and title as it appears in the judgment heading or opening (e.g. "Blow CJ", "Brett J", "Wood J"). If multiple judges, return as a comma-separated string.
- parties: the party names as they appear in the case title (e.g. "R v Smith", "DPP v Jones"). Extract verbatim from the heading.
- facts: factual background (3-4 concrete sentences: parties, charges or dispute, key events and outcome at first instance if appeal).
- issues: array of 1-5 legal questions the court answered (each a short question string).
- holdings: array matching issues order — the court's direct answer to each issue (1 sentence each).
- legislation: all Acts and sections materially relied on. Array of strings e.g. ["Sentencing Act 1997 (Tas) s 11"].
- key_authorities: cases cited and how treated. Array of objects: { "name": "...", "treatment": "applied|followed|distinguished|mentioned", "why": "..." }
${PRINCIPLES_SPEC}

Output JSON with keys: case_name, judge, parties, facts, issues, holdings, principles, legislation, key_authorities`;

  // ── Pass 1 prompt (long judgments — metadata/facts/issues) ───────────────
  const pass1Prompt = `You are extracting metadata and facts from the opening section of an Australian court judgment.
Output ONLY valid JSON. No markdown fences. No commentary.

Extract:
- case_name: from heading or opening lines. Fallback to citation.
- judge: the presiding judge(s). Extract full name and title from the heading or opening (e.g. "Blow CJ", "Brett J"). If multiple judges, comma-separated string.
- parties: party names verbatim from the case title in the heading (e.g. "R v Smith").
- facts: factual background (3-4 concrete sentences).
- issues: array of 1-5 legal questions this judgment answers.

Output JSON with keys: case_name, judge, parties, facts, issues`;

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
      const mergedHolding = pass2Results.find(r => r.holding)?.holding || null;

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
        // ── Route through fetch-page proxy (Cloudflare edge IPs) ────────────
        const { html, status } = await handleFetchPage({ url });
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
        const content = caseData.html ? await fetchCaseContent(null, caseData.html) : await fetchCaseContent(caseData.url);
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
      const content = await fetchCaseContent(caseData.url, caseData.html || null);
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

async function handleUploadCase(body, env) {
  let { case_text, citation, case_name, court, court_hint, encoding } = body;
  const courtMap = { 'TASSC': 'supreme', 'TASCCA': 'cca', 'TASFC': 'fullcourt', 'TAMagC': 'magistrates' };
  court = court || courtMap[court_hint] || 'supreme';
  if (encoding === 'base64') case_text = atob(case_text);
  const caseId = crypto.randomUUID();
  const caseYear = (citation.match(/\[(\d{4})\]/) || [null, new Date().getFullYear()])[1];
  await env.DB.prepare(`INSERT OR REPLACE INTO cases (id, citation, court, case_date, raw_text, enriched, embedded) VALUES (?, ?, ?, ?, ?, 0, 0)`)
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

  const { html, status } = await handleFetchPage({ url });
  if (status !== 200) throw new Error(`Fetch failed with HTTP ${status}`);

  const contentMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = contentMatch ? contentMatch[1] : html;
  const plainText = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500000);

  if (!plainText) throw new Error("No text content extracted from URL");

  // Resolve citation — use provided value, else parse AustLII URL path
  let citation = citationIn;
  if (!citation) {
    const m = url.match(/\/([A-Za-z]+)\/(\d{4})\/(\d+)\.html/i);
    if (m) citation = `[${m[2]}] ${m[1].toUpperCase()} ${m[3]}`;
  }
  if (!citation) throw new Error("citation required — could not be auto-detected from URL");

  const courtMap = { 'TASSC': 'supreme', 'TASCCA': 'cca', 'TASFC': 'fullcourt', 'TAMagC': 'magistrates' };
  const abbrevMatch = citation.match(/\]\s+([A-Za-z]+)\s+\d/);
  const resolvedCourt = court || (abbrevMatch && courtMap[abbrevMatch[1]]) || 'supreme';

  const caseId = crypto.randomUUID();
  const caseYear = (citation.match(/\[(\d{4})\]/) || [null, new Date().getFullYear()])[1];
  await env.DB.prepare(`INSERT OR REPLACE INTO cases (id, citation, court, case_date, raw_text, enriched, embedded) VALUES (?, ?, ?, ?, ?, 0, 0)`)
    .bind(caseId, citation, resolvedCourt, `${caseYear}-01-01`, plainText)
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
  return { text: data.text, chars: data.chars };
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

  // Store sections
  for (const section of sections) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO legislation_sections (id, legislation_id, section_number, heading, text, part)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(section.id, section.legislation_id, section.section_number,
      section.heading, section.text, section.part).run();
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
  await env.DB.prepare(`
    INSERT INTO secondary_sources
    (id, title, source_type, author, date_published, tags, related_cases, related_acts, raw_text, chunk_count, date_added, enriched, embedded, category)
    VALUES (?, ?, ?, null, null, '[]', '[]', '[]', ?, 1, ?, 0, 0, ?)
    ON CONFLICT(id) DO UPDATE SET
      raw_text = excluded.raw_text,
      title = excluded.title,
      category = COALESCE(excluded.category, secondary_sources.category),
      enriched_text = excluded.enriched_text,
      enriched = excluded.enriched,
      embedded = 0
  `).bind(citation, source || citation, doc_type || null, text, new Date().toISOString(), category ?? 'doctrine').run();

  return { citation, chunks_stored: 0, message: "Corpus chunk recorded in D1." };
}

/* =============================================================
   LIBRARY — list and delete documents across all types
   ============================================================= */
async function handleLibraryList(env) {
  const [cases, legislation, sources] = await Promise.all([
    env.DB.prepare(`
      SELECT id, citation AS ref, case_name AS title, court, case_date AS date,
             processed_date, summary_quality_score, 'case' AS doc_type,
             LENGTH(raw_text) AS raw_size
      FROM cases ORDER BY processed_date DESC
    `).all(),
    env.DB.prepare(`
      SELECT id, id AS ref, title, jurisdiction AS court, current_as_at AS date,
             processed_date, NULL AS summary_quality_score, 'legislation' AS doc_type,
             LENGTH(raw_text) AS raw_size
      FROM legislation ORDER BY processed_date DESC
    `).all(),
    env.DB.prepare(`
      SELECT id, id AS ref, title, source_type AS court, date_added AS date,
             date_added AS processed_date, NULL AS summary_quality_score,
             'secondary' AS doc_type, LENGTH(raw_text) AS raw_size
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
  const { query, top_k, score_threshold } = body;
  if (!query || !query.trim()) throw new Error("query field required");

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
    return {
      answer: "No sufficiently relevant cases or legislation were found for that query. Try rephrasing, or the relevant material may not yet be ingested.",
      sources: [],
      chunk_count: 0,
    };
  }

  const caseBlocks = chunks.map((c) => {
    const caseName = c.case_name ? `${c.case_name} ` : '';
    const courtSuffix = c.court && c.court.toLowerCase() !== 'unknown' ? ` (${c.court})` : '';
    const principles = Array.isArray(c.principles) && c.principles.length > 0
      ? `\nKey principles: ${c.principles.slice(0, 3).join("; ")}`
      : "";
    return `${caseName}${c.citation}${courtSuffix}\n${c.text}${principles}`;
  }).join("\n\n---\n\n");

  const contextBlocks = sectionContext
    ? `${sectionContext.block}\n\n---\n\n${caseBlocks}`
    : caseBlocks;

  const systemPrompt = (sectionContext && hasCases)
    ? `You are a Tasmanian criminal law research assistant. The section text has been provided, followed by case excerpts. Quote and explain the section, then discuss how the cases have applied it. Be precise and cite specific cases. Format in plain prose - no markdown headers.`
    : (sectionContext && !hasCases)
      ? `You are a Tasmanian criminal law research assistant. The section text has been provided. Quote it and explain what it means. Do not speculate about how courts have applied it - no cases are in the database yet for this section. Format in plain prose - no markdown headers.`
      : `You are a Tasmanian criminal law research assistant. Answer using only the provided case excerpts. Be precise and cite specific cases. If the excerpts do not contain enough information, say so clearly. Format in plain prose - no markdown headers.`;

  const answерNote = sectionContext
    ? `The full text of ${sectionContext.label} is provided first. Quote it in your answer, then discuss any cases that have applied or interpreted it.`
    : `Cite the case citation (e.g. [2024] TASSC 42) when you rely on a specific case.`;

  const citationRules = `CRITICAL CITATION RULES:
- You may only cite cases, legislation, and authorities that appear explicitly in the source material provided above.
- Do NOT generate, recall, or infer case citations from your training knowledge.
- If a case name or citation does not appear in the retrieved sources, do not mention it.
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

${answерNote}`;

  // ── Step 3: Call Claude API ──────────────────────────────────
  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
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
    }));

  const sources = sectionContext
    ? [{ citation: sectionContext.label, court: 'legislation', year: null, score: 1.0, summary: sectionContext.heading }, ...caseSources]
    : caseSources;

  return { answer, sources, chunk_count: chunks.length, model: "claude" };
}

/* =============================================================
   LEGAL QUERY — Qwen3 via nexus /query
   Mirrors handleLegalQuery but routes to nexus for local inference.
   ============================================================= */
async function handleLegalQueryQwen(body, env) {
  const { query, top_k, score_threshold } = body;
  if (!query || !query.trim()) throw new Error("query field required");

  const nexusRes = await fetch("https://nexus.arcanthyr.com/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nexus-Key": env.NEXUS_SECRET_KEY,
    },
    body: JSON.stringify({
      query_text: query.trim(),
      top_k: top_k || 6,
      score_threshold: score_threshold || 0.45,
    }),
  });

  if (!nexusRes.ok) throw new Error(`Nexus query failed: ${nexusRes.status}`);
  const nexusData = await nexusRes.json();

  if (!nexusData.ok) throw new Error(nexusData.error || "Nexus query error");

  const chunks = nexusData.chunks || [];
  const hasCases = chunks.length > 0;
  const answer = nexusData.answer || "No response from model.";

  // Deduplicated source list — same shape as handleLegalQuery
  const seen = new Set();
  const sources = chunks
    .filter(c => { if (seen.has(c.citation)) return false; seen.add(c.citation); return true; })
    .map(c => ({
      citation: c.citation,
      court: c.court,
      year: c.year,
      score: c.score,
      summary: c.summary || "",
    }));

  return { answer, sources, chunk_count: chunks.length };
}

/* =============================================================
   FETCH-PAGE PROXY
   Routes AustLII requests through Cloudflare edge IPs.
   Used by VPS scraper when its IP is blocked by AustLII.
   Only allows requests to austlii.edu.au for safety.
   ============================================================= */
async function handleFetchPage(body) {
  const { url } = body;
  const allowed = url && (url.includes('austlii.edu.au') || url.includes('jade.io'));
  if (!allowed) {
    throw new Error('Invalid or disallowed URL — only austlii.edu.au and jade.io are permitted');
  }
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
  const { query, top_k, score_threshold } = body;
  if (!query || !query.trim()) throw new Error("query field required");

  // ── Step 1: Qdrant search via nexus ──────────────────────────
  const nexusRes = await fetch("https://nexus.arcanthyr.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Nexus-Key": env.NEXUS_SECRET_KEY },
    body: JSON.stringify({
      query_text: query.trim(),
      top_k: top_k || 6,
      score_threshold: score_threshold || 0.45,
    }),
  });
  if (!nexusRes.ok) throw new Error(`Nexus search failed: ${nexusRes.status}`);
  const nexusData = await nexusRes.json();
  const chunks = (nexusData.chunks || []).filter(c => !(c.court === null && c.year === null && typeof c.citation === 'string' && !c.citation.match(/^\[\d{4}\]/)));
  const hasCases = chunks.length > 0;

  // ── Step 1b: Section query detection ─────────────────────────
  let sectionContext = null;
  const parsed = parseSectionQuery(query.trim());
  if (parsed) {
    sectionContext = await fetchSectionContext(parsed.sectionNum, parsed.actName, env);
  }

  // ── Step 2: Build context ────────────────────────────────────
  if (chunks.length === 0 && !sectionContext) {
    return {
      answer: "No sufficiently relevant cases or legislation were found for that query. Try rephrasing, or the relevant material may not yet be ingested.",
      sources: [],
      chunk_count: 0,
      model: "workers-ai",
    };
  }

  const caseBlocks = chunks.map((c) => {
    const caseName = c.case_name ? `${c.case_name} ` : '';
    const courtSuffix = c.court && c.court.toLowerCase() !== 'unknown' ? ` (${c.court})` : '';
    return `${caseName}${c.citation}${courtSuffix}\n${c.text}`;
  }).join("\n\n---\n\n");

  const contextBlocks = sectionContext
    ? `${sectionContext.block}\n\n---\n\n${caseBlocks}`
    : caseBlocks;

  const systemPrompt = (sectionContext && hasCases)
    ? `You are a Tasmanian criminal law assistant. Quote and explain the section, then discuss only how the provided cases have applied it. Be precise. Plain prose only. Never invent citations.`
    : (sectionContext && !hasCases)
      ? `You are a Tasmanian criminal law assistant. Quote and explain the provided section. Do not speculate about case application — state clearly that no cases are yet available. Plain prose only. Never invent citations.`
      : `You are a Tasmanian criminal law assistant. Answer strictly from the provided case excerpts only. If excerpts are insufficient, say so explicitly. Plain prose only. Never invent citations.`;

  const answerNote = (sectionContext && hasCases)
    ? `Quote ${sectionContext.label} in your answer, then discuss how the cases have applied or interpreted it.`
    : (sectionContext && !hasCases)
      ? `Explain ${sectionContext.label} clearly. Do not invent case law - note that no cases interpreting this section have been ingested yet.`
      : `Cite the case citation when relying on a specific case.`;

  // ── Step 3: Workers AI inference ─────────────────────────────
  const response = await env.AI.run(WORKERS_AI_MODEL, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Question: ${query.trim()}\n\nRelevant material:\n\n${contextBlocks}\n\nRULES — follow strictly:\n1. Only cite cases and legislation that appear explicitly in the source material above.\n2. Do not recall, infer, or generate citations from training knowledge.\n3. If the sources lack authority on a point, say explicitly: "The retrieved sources do not contain sufficient information on this point."\n4. Do not pad answers with general principles unless directly supported by the retrieved sources.\n5. It is better to admit a gap than to fill it with uncertain information.\n\n${answerNote}` },
    ],
    max_tokens: 800,
    budget_tokens: 0,
  });

  const answer =
    response?.choices?.[0]?.message?.content?.trim() ||
    response?.choices?.[0]?.text?.trim() ||
    response?.response?.trim() ||
    "No response from model.";

  // ── Step 4: Return ───────────────────────────────────────────
  const seen = new Set();
  const caseSources = chunks
    .filter(c => { if (seen.has(c.citation)) return false; seen.add(c.citation); return true; })
    .map(c => ({ citation: c.citation, court: c.court, year: c.year, score: c.score, summary: c.summary || "" }));

  const sources = sectionContext
    ? [{ citation: sectionContext.label, court: 'legislation', year: null, score: 1.0, summary: sectionContext.heading }, ...caseSources]
    : caseSources;

  return { answer, sources, chunk_count: chunks.length, model: "workers-ai" };
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
      SELECT citation, authorities_extracted, legislation_extracted
      FROM cases
      WHERE authorities_extracted IS NOT NULL
        AND authorities_extracted != '[]'
        AND authorities_extracted != ''
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
    for (const row of rows) {
      const result = await env.DB.prepare(`
        INSERT OR IGNORE INTO case_citations (id, citing_case, cited_case, treatment, why, date_added)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(row.id, row.citing_case, row.cited_case, row.treatment || null, row.why || null, row.date_added).run();
      if (result.meta?.changes > 0) inserted++;
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
    for (const row of rows) {
      const result = await env.DB.prepare(`
        INSERT OR IGNORE INTO case_legislation_refs (id, citation, legislation_ref, date_added)
        VALUES (?, ?, ?, ?)
      `).bind(row.id, row.citation, row.legislation_ref, row.date_added).run();
      if (result.meta?.changes > 0) inserted++;
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
    const result = await env.DB.prepare(`SELECT id, title, raw_text, enriched_text, category FROM secondary_sources WHERE enriched = 1 AND embedded = 0 ORDER BY id LIMIT ?`).bind(batch).all();
    return new Response(JSON.stringify({ ok: true, chunks: result.results }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
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
      const corpusRows = await env.DB.prepare(`
        SELECT id, id as chunk_id, COALESCE(enriched_text, raw_text) as text, NULL as section_number, NULL as heading, NULL as leg_title
        FROM secondary_sources
        WHERE id LIKE '%' || ? || '%'
        LIMIT 10
      `).bind(ref.section_number).all();
      for (const row of corpusRows.results) {
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

    const corsHeaders = {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

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
        else if (action === "library" && request.method === "GET") result = await handleLibraryList(env);
        else if (action.startsWith("library/delete/") && request.method === "DELETE") {
          // URL pattern: /api/legal/library/delete/{docType}/{id}
          const parts = action.replace("library/delete/", "").split("/");
          const docType = parts[0];
          const docId = decodeURIComponent(parts.slice(1).join("/"));
          result = await handleLibraryDelete(docType, docId, env);
        }
        else if (action === "legislation-search" && request.method === "POST") result = await handleLegislationSearch(body, env);
        else if (action === "section-lookup" && request.method === "POST") result = await handleSectionLookup(body, env);
        else if (action === "legal-query" && request.method === "POST") result = await handleLegalQuery(body, env);
        else if (action === "legal-query-qwen" && request.method === "POST") result = await handleLegalQueryQwen(body, env);
        else if (action === "legal-query-workers-ai" && request.method === "POST") result = await handleLegalQueryWorkersAI(body, env);
        else if (action === "fetch-page" && request.method === "POST") result = await handleFetchPage(body);
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
      } catch (err) { return json({ error: err.message }, 500); }
    }

    /* ── PIPELINE ROUTES ─────────────────────────────────────── */
    if (url.pathname === '/api/pipeline/status' && request.method === 'GET') return handlePipelineStatus(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/write-enriched' && request.method === 'POST') return handleWriteEnriched(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/mark-embedded' && request.method === 'POST') return handleMarkEmbedded(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-unenriched' && request.method === 'GET') return handleFetchUnenriched(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-for-embedding' && request.method === 'GET') return handleFetchForEmbedding(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-embedded' && request.method === 'GET') return handleFetchEmbedded(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/reset-embedded' && request.method === 'POST') return handleResetEmbedded(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-legislation-for-embedding' && request.method === 'GET') return handleFetchLegislationForEmbedding(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-sections-by-reference' && request.method === 'POST') return handleFetchSectionsByReference(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/mark-legislation-embedded' && request.method === 'POST') return handleMarkLegislationEmbedded(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-cases-for-xref' && request.method === 'GET') return handleFetchCasesForXref(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/write-citations' && request.method === 'POST') return handleWriteCitations(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/write-legislation-refs' && request.method === 'POST') return handleWriteLegislationRefs(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-cases-by-legislation-ref' && request.method === 'POST') return handleFetchCasesByLegislationRef(request, env, corsHeaders);
    if (url.pathname === '/api/pipeline/fetch-case-chunks-for-embedding' && request.method === 'GET') {
      const batch = parseInt(url.searchParams.get('batch') || '10');
      const { results } = await env.DB.prepare(
        `SELECT id, citation, chunk_index, chunk_text FROM case_chunks WHERE done = 1 AND embedded = 0 LIMIT ?`
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

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runDailySync(env));
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
            `SELECT case_name, court, facts, issues FROM cases WHERE citation = ?`
          ).bind(citation).first();

          // Summary-augmented context — pass case metadata to each chunk extraction
          const context = caseRow ? `Case: ${citation}\nFacts: ${caseRow.facts || ''}\nIssues: ${caseRow.issues || ''}` : `Case: ${citation}`;

          const systemPrompt = `You are a legal research assistant analysing Australian criminal case law. Extract legal principles, holdings, legislation, and authorities from this excerpt. Output ONLY valid JSON: { "principles": [{"principle": "IF...THEN...", "type": "ratio|obiter", "statute_refs": [], "keywords": []}], "holdings": [], "legislation": [], "key_authorities": [{"name": "", "treatment": "", "why": ""}] }. If no legal content is present output { "principles": [], "holdings": [], "legislation": [], "key_authorities": [] }.`;

          const userContent = `${context}\n\nExcerpt:\n${row.chunk_text}`;
          const raw = await callWorkersAI(env, systemPrompt, userContent, 1000);
          const cleaned = (raw || '').replace(/```json|```/g, '').trim();

          let extracted = { principles: [], holdings: [], legislation: [], key_authorities: [] };
          try { extracted = JSON.parse(cleaned); } catch (e) { console.error(`[queue] JSON parse failed chunk ${citation}/${chunk_index}`); }

          await env.DB.prepare(
            `UPDATE case_chunks SET principles_json = ?, done = 1 WHERE citation = ? AND chunk_index = ?`
          ).bind(JSON.stringify(extracted), citation, chunk_index).run();

          // Check if all chunks done — if so, merge
          const pending = await env.DB.prepare(
            `SELECT COUNT(*) as cnt FROM case_chunks WHERE citation = ? AND done = 0`
          ).bind(citation).first();

          if (pending.cnt === 0) {
            // Merge all chunk results
            const chunks = await env.DB.prepare(
              `SELECT principles_json FROM case_chunks WHERE citation = ? ORDER BY chunk_index`
            ).bind(citation).all();

            const allPrinciples = [], allHoldings = [], allLegislation = new Set(), allAuthorities = [];
            for (const chunk of chunks.results) {
              try {
                const data = JSON.parse(chunk.principles_json || '{}');
                if (data.principles) allPrinciples.push(...data.principles);
                if (data.holdings) allHoldings.push(...data.holdings);
                if (data.legislation) data.legislation.forEach(l => allLegislation.add(l));
                if (data.key_authorities) allAuthorities.push(...data.key_authorities);
              } catch (e) {}
            }

            // Deduplicate authorities by name
            const seenAuth = new Set();
            const dedupedAuth = allAuthorities.filter(a => {
              if (seenAuth.has(a.name)) return false;
              seenAuth.add(a.name);
              return true;
            });

            await env.DB.prepare(`
              UPDATE cases SET
                principles_extracted = ?,
                holdings_extracted = ?,
                legislation_extracted = ?,
                authorities_extracted = ?,
                deep_enriched = 1
              WHERE citation = ?
            `).bind(
              JSON.stringify(allPrinciples),
              JSON.stringify(allHoldings),
              JSON.stringify([...allLegislation]),
              JSON.stringify(dedupedAuth),
              citation
            ).run();
            console.log(`[queue] merge complete for ${citation} — ${allPrinciples.length} principles`);
          }
          msg.ack();

        } else {
          // METADATA message — Pass 1 + split + enqueue chunks
          const row = await env.DB.prepare(
            `SELECT raw_text, case_name, court FROM cases WHERE citation = ?`
          ).bind(citation).first();
          if (!row || !row.raw_text) throw new Error(`No raw_text in D1 for ${citation}`);

          console.log(`[queue] METADATA pass for ${citation}, length: ${row.raw_text.length}`);

          // Pass 1 — metadata/facts/case_name from first 8k chars
          const pass1System = `You are a legal research assistant. Extract metadata from the opening of this Australian court judgment. Output ONLY valid JSON: { "case_name": "", "judge": "", "parties": "", "facts": "", "issues": [] }`;
          const pass1Raw = await callWorkersAI(env, pass1System, row.raw_text.slice(0, 8000), 800);
          const pass1Cleaned = (pass1Raw || '').replace(/```json|```/g, '').trim();
          let pass1 = { case_name: null, judge: null, parties: null, facts: null, issues: [] };
          try { pass1 = JSON.parse(pass1Cleaned); } catch (e) {}

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
            pass1.parties || null,
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
            await env.CASE_QUEUE.send({ type: 'CHUNK', citation, chunk_index: i });
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
