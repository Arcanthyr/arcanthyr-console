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
async function callWorkersAI(env, systemPrompt, userContent, maxTokens = 600) {
  const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });
  return (response.response || "").trim();
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
      .substring(0, 50000);

    return { full_text: textContent };
  } catch (error) {
    console.error(`Error fetching case content from ${url}:`, error);
    return null;
  }
}

/* =============================================================
   CASE PROCESSING
   ============================================================= */
async function processCaseUpload(env, caseText, citation, caseName, court) {
  if (!caseText || !citation) throw new Error("Missing required fields: caseText and citation");

  const exists = await env.DB.prepare("SELECT id FROM cases WHERE citation = ?").bind(citation).first();
  if (exists) throw new Error(`Case ${citation} already exists in database`);

  const caseData = {
    citation,
    case_name: caseName || citation, // hint only — Llama will override
    court: court || "unknown",
    year: citation.match(/\[(\d{4})\]/)?.[1] || new Date().getFullYear().toString(),
    full_text: caseText,
    url: "",
  };

  const summary = await summarizeCase(env, caseData);

  // Llama-extracted name wins; fall back to form hint; then citation
  const finalCaseName = summary.case_name || caseData.case_name;
  const finalCaseData = { ...caseData, case_name: finalCaseName };

  const id = await saveCaseToDb(env, finalCaseData, summary);

  try {
    await fetch("https://nexus.arcanthyr.com/ingest", {
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
  //   Pass 2 (chars 8,000–22,000): principles, holdings, legislation, authorities
  // For shorter judgments (<= 22,000 chars) a single pass covers everything.
  // The text sent to Llama has already been boilerplate-stripped and whitespace-
  // compressed by austlii_scraper.py before upload, maximising signal per char.
  // ─────────────────────────────────────────────────────────────────────────

  const CHUNK_THRESHOLD = 22000; // single-pass up to this length
  const PASS1_CHARS = 12000;     // metadata/facts window
  const PASS2_START = 8000;      // reasoning section start (overlap intentional)
  const PASS2_END = 28000;       // reasoning section end

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
- facts: factual background (3-4 concrete sentences: parties, charges or dispute, key events and outcome at first instance if appeal).
- issues: array of 1-5 legal questions the court answered (each a short question string).
- holdings: array matching issues order — the court's direct answer to each issue (1 sentence each).
- legislation: all Acts and sections materially relied on. Array of strings e.g. ["Sentencing Act 1997 (Tas) s 11"].
- key_authorities: cases cited and how treated. Array of objects: { "name": "...", "treatment": "applied|followed|distinguished|mentioned", "why": "..." }
${PRINCIPLES_SPEC}

Output JSON with keys: case_name, facts, issues, holdings, principles, legislation, key_authorities`;

  // ── Pass 1 prompt (long judgments — metadata/facts/issues) ───────────────
  const pass1Prompt = `You are extracting metadata and facts from the opening section of an Australian court judgment.
Output ONLY valid JSON. No markdown fences. No commentary.

Extract:
- case_name: from heading or opening lines. Fallback to citation.
- facts: factual background (3-4 concrete sentences).
- issues: array of 1-5 legal questions this judgment answers.

Output JSON with keys: case_name, facts, issues`;

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
      raw = await callWorkersAI(env, singlePassPrompt, userContent, 2000);
      console.log(`AI response: ${raw?.length || 0} chars`);

      const cleaned = raw.replace(/```json|```/g, "").trim();
      const summary = JSON.parse(cleaned);
      if (!summary.facts || !summary.holdings) throw new Error("Incomplete AI response");

      return _buildSummary(summary, null, caseData.citation);

    } else {
      // ── Two-pass ───────────────────────────────────────────────────────
      console.log(`Summarising ${caseData.citation} (two-pass, ${fullText.length} chars)`);

      // Pass 1: opening section → facts, issues, case_name
      const p1Content = `Citation: ${caseData.citation}\nCourt: ${caseData.court}\n\nCase text (opening section):\n${fullText.substring(0, PASS1_CHARS)}`;
      raw = await callWorkersAI(env, pass1Prompt, p1Content, 800);
      console.log(`Pass 1 response: ${raw?.length || 0} chars`);
      const pass1 = JSON.parse(raw.replace(/```json|```/g, "").trim());

      // Pass 2: reasoning section → principles, holdings, legislation, authorities
      const issuesList = Array.isArray(pass1.issues) ? pass1.issues.join("\n") : (pass1.issues || "");
      const p2Content = `Citation: ${caseData.citation}\nCourt: ${caseData.court}\n\nIssues identified:\n${issuesList}\n\nReasoning section:\n${fullText.substring(PASS2_START, PASS2_END)}`;
      raw2 = await callWorkersAI(env, pass2Prompt, p2Content, 2000);
      console.log(`Pass 2 response: ${raw2?.length || 0} chars`);
      const pass2 = JSON.parse(raw2.replace(/```json|```/g, "").trim());

      return _buildSummary(pass1, pass2, caseData.citation);
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
    (id, citation, court, case_date, case_name, url, raw_text, facts, issues, holding,
     holdings_extracted, principles_extracted, legislation_extracted, authorities_extracted,
     processed_date, summary_quality_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    caseData.citation,
    caseData.court,
    `${(caseData.citation.match(/\[(\d{4})\]/) || [null, caseData.year || new Date().getFullYear()])[1]}-01-01`,
    caseData.case_name,
    caseData.url || "",
    caseData.full_text || "",
    summary.facts,
    summary.issues,
    summary.holding,
    JSON.stringify(summary.holdings || []),
    JSON.stringify(summary.principles),
    JSON.stringify(summary.legislation || []),
    JSON.stringify(summary.key_authorities || []),
    new Date().toISOString(),
    summary.summary_quality_score
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

async function handleAxiomRelay(body, env) {
  const { entries, focus } = body;
  if (!entries || !entries.length) throw new Error("No entries to relay.");

  const stage1System = `You are Stage 1 of a multi-step reasoning agent called Axiom Relay inside Arcanthyr.
Decompose each entry into its components.
For each entry identify surface (what they said), intent (what they need), constraint (hidden blocker).
Respond as a JSON array: [{ "id": number, "surface": "...", "intent": "...", "constraint": "..." }]
Output ONLY valid JSON. No markdown fences.`;

  let decomposed;
  try {
    const raw1 = await callWorkersAI(env, stage1System, entries.slice(-20).map((e, i) => `${i}: [${e.tag}] ${e.text}`).join("\n"), 800);
    decomposed = JSON.parse(raw1.replace(/```json|```/g, "").trim());
  } catch {
    decomposed = entries.map((e, i) => ({ id: i, surface: e.text, intent: e.text, constraint: "" }));
  }

  const stage2Raw = await callWorkersAI(env,
    `You are Stage 2 of Axiom Relay. Identify the 3 most important tensions ACROSS the entries. Each under 20 words, referencing specific content.
Output EXACTLY:
TENSION_1: [text]
TENSION_2: [text]
TENSION_3: [text]
No other text.`,
    `Focus: ${focus || "none"}\n${decomposed.map(d => `[${d.id}] ${d.surface} | ${d.intent} | ${d.constraint}`).join("\n")}`,
    400);

  const finalReport = await callWorkersAI(env,
    `You are Stage 3 of Axiom Relay — final synthesis. Produce an actionable report:

SIGNAL
[1-2 sentences: single most important insight]

LEVERAGE POINT
[1 sentence: one action that unlocks the most]

RELAY ACTIONS
1. [specific action, under 12 words]
2. [specific action, under 12 words]
3. [specific action, under 12 words]

DEAD WEIGHT
[1 sentence: what to stop or deprioritise]

Output only these sections.`,
    `${stage2Raw}\n\nFocus: ${focus || "none"}`,
    500);

  return { stages: { decomposed, tensions: stage2Raw }, report: finalReport };
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
  return processCaseUpload(env, case_text, citation, case_name, court);
}


/* =============================================================
   LEGISLATION UPLOAD
   Parses sections deterministically, stores in legislation +
   legislation_sections tables. No Llama extraction on upload —
   AI analysis happens at query time.
   ============================================================= */
async function handleUploadLegislation(body, env) {
  let { doc_text, title, jurisdiction, year, source_url, encoding } = body;
  if (!doc_text || !title) throw new Error("Missing required fields: doc_text and title");
  if (encoding === 'base64') doc_text = atob(doc_text);

  // Normalise jurisdiction
  jurisdiction = (jurisdiction || "Tas").toUpperCase().replace(/[^A-Z]/g, '');
  const id = (title + '-' + jurisdiction).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

  const existing = await env.DB.prepare("SELECT id FROM legislation WHERE id = ?").bind(id).first();
  if (existing) throw new Error(`Legislation '${title} (${jurisdiction})' already exists. Delete it first to re-upload.`);

  // ── Section parser ────────────────────────────────────────────────────────
  // Matches AustLII PDF format: "1.  Short title" or "2A.  Heading text"
  // Section number and heading are on the same line, separated by 2+ spaces.
  // Also handles plain format without dot: "1  Short title"
  // Strips page headers/footers (Act name + "Act No.") which appear mid-text.
  const sectionPattern = /^(\d+[A-Z]?)\.?\s{2,}(.+)$/gm;
  const sections = [];
  let match;
  const seenSections = new Set();

  // Strip page noise: form feeds, page numbers, repeated Act title headers
  // These appear as "\x0cEvidence Act 2001 \nAct No. 76 of 2001" between sections
  const cleanText = doc_text
    .replace(/\x0c/g, '\n')
    .replace(/^[A-Z][^\n]{5,50}\nAct No\. \d+ of \d{4}\n/gm, '')
    .replace(/^\s*\d+\s*$/gm, '');  // lone page numbers

  // Skip the table of contents — find the first real section body text
  // by looking for "1.  " followed by content (not just a TOC entry)
  const contentStart = cleanText.search(/\n1\.\s{2,}[A-Z]/);
  const searchText = contentStart > 0 ? cleanText.substring(contentStart) : cleanText;

  while ((match = sectionPattern.exec(searchText)) !== null) {
    const sectionNum = match[1].trim();
    const headingOrText = match[2].trim();

    // Skip if heading looks like a page artifact or Part/Division label
    if (/^(Part|Division|Chapter|Schedule)\s/i.test(headingOrText)) continue;
    // Skip very short "headings" that are likely mid-section references
    if (headingOrText.length < 3) continue;
    // Skip headings that don't start with a capital — likely cross-reference fragments
    if (!/^[A-Z"(]/.test(headingOrText)) continue;
    // Skip if heading looks like just a section number (TOC artifact: "2A.")
    if (/^\d+[A-Z]?\.$/.test(headingOrText)) continue;

    if (seenSections.has(sectionNum)) continue;
    seenSections.add(sectionNum);

    // Grab text from this section to the next (up to 3000 chars)
    const sectionStart = match.index;
    const nextMatchPos = sectionPattern.lastIndex;
    const remaining = cleanText.substring(nextMatchPos);
    const nextSection = remaining.search(/^\d+[A-Z]?\.?\s{2,}/m);
    const sectionEnd = nextMatchPos + (nextSection > 0 ? nextSection : Math.min(remaining.length, 3000));
    const sectionText = searchText.substring(sectionStart, sectionEnd)
      .replace(/\s+/g, ' ').trim();

    sections.push({
      id: `${id}-s${sectionNum.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
      legislation_id: id,
      section_number: sectionNum,
      heading: headingOrText.length < 100 ? headingOrText : headingOrText.substring(0, 100),
      text: sectionText.substring(0, 3000),
      part: null,
    });
  }

  // Store legislation record
  await env.DB.prepare(`
    INSERT INTO legislation (id, title, jurisdiction, year, current_as_at, summary,
      defined_terms, offence_elements, source_url, raw_text, processed_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, title, jurisdiction, year ? parseInt(year) : null,
    new Date().toISOString().split('T')[0],
    null, '[]', '[]',
    source_url || '', doc_text,
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

  // Ingest into Qdrant for semantic search (full text chunked)
  try {
    await fetch("https://nexus.arcanthyr.com/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nexus-Key": env.NEXUS_SECRET_KEY },
      body: JSON.stringify({
        citation: id,
        case_name: `${title} (${jurisdiction})`,
        source: "legislation",
        text: doc_text,
        summary: `${title} (${jurisdiction})${year ? ' ' + year : ''}`,
        category: "legislation",
        jurisdiction,
      })
    });
  } catch (e) {
    console.error("Nexus ingest failed for legislation:", e.message);
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
  await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  // If it's a legislation delete, also remove its sections
  if (docType === 'legislation') {
    await env.DB.prepare("DELETE FROM legislation_sections WHERE legislation_id = ?").bind(id).run();
  }
  return { ok: true, deleted: id };
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
   FETCH-PAGE PROXY
   Routes AustLII requests through Cloudflare edge IPs.
   Used by VPS scraper when its IP is blocked by AustLII.
   Only allows requests to austlii.edu.au for safety.
   ============================================================= */
async function handleFetchPage(body) {
  const { url } = body;
  if (!url || !url.includes('austlii.edu.au')) {
    throw new Error('Invalid or disallowed URL — only austlii.edu.au is permitted');
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
        else if (action === "axiom-relay") result = await handleAxiomRelay(body, env);
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
        else if (action === "upload-legislation" && request.method === "POST") result = await handleUploadLegislation(body, env);
        else if (action === "upload-secondary" && request.method === "POST") result = await handleUploadSecondarySource(body, env);
        else if (action === "library" && request.method === "GET") result = await handleLibraryList(env);
        else if (action.startsWith("library/delete/") && request.method === "DELETE") {
          // URL pattern: /api/legal/library/delete/{docType}/{id}
          const parts = action.replace("library/delete/", "").split("/");
          const docType = parts[0];
          const docId = parts.slice(1).join("/");
          result = await handleLibraryDelete(docType, docId, env);
        }
        else if (action === "section-lookup" && request.method === "POST") result = await handleSectionLookup(body, env);
        else if (action === "fetch-page" && request.method === "POST") result = await handleFetchPage(body);
        else return json({ error: "Invalid legal endpoint" }, 404);
        return json({ result });
      } catch (err) { return json({ error: err.message }, 500); }
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

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailySync(env));
  },
};
