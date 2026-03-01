/* =============================================================
   ARCANTHYR — Cloudflare Worker  v6
   CHANGES FROM v5:
     - case_name extracted by Llama in summarizeCase() — regex removed
     - handleSearchCases: pagination (offset/limit), year/year_range filter,
       returns { total, limit, offset, cases[] } instead of bare array
     - fetchCaseContent: case_name extraction removed (Llama owns this now)
     - runDailySync / runYearBackfill: use Llama-extracted case_name
   ============================================================= */
console.log('Worker loaded successfully');

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
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        if (response.status === 404 || response.status === 410) { consecutiveMisses++; num++; continue; }
        if (!response.ok) { num++; continue; }

        consecutiveMisses = 0;
        const html = await response.text();
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
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (!response.ok) return null;
      html = await response.text();
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
  // case_name is extracted HERE by Llama from the case text.
  // fetchCaseContent intentionally does NOT extract case names — that approach
  // was fragile (regex on raw HTML, missed most cases, produced garbage on
  // edge cases). Llama already reads the full text for facts/holding/principles;
  // case_name is simply one more field in the same JSON extraction pass.
  // ─────────────────────────────────────────────────────────────────────────
  const systemPrompt = `You are a legal research assistant analyzing Australian criminal case law.
Extract and structure the following information from the case as JSON.

Fields required:
- case_name: the case title. Look in the first 500 words — it is usually in the heading or opening paragraph. Common patterns: "R v Smith", "DPP v Jones", "Tasmania v Brown", "Re Application of White". Use the citation string as a fallback if no name is clearly present.
- facts: brief factual background (2-3 sentences)
- issues: legal issues considered (string, up to 3 points separated by semicolons)
- holding: the court's decision and reasoning (2-3 sentences)
- principles: key legal principles established or applied (array, max 5 items)

Principles format — array of objects: { "principle": "text", "statute_refs": ["Act s.123"], "keywords": ["sentencing"] }

Output ONLY valid JSON. No markdown fences. No commentary.`;

  const userContent = `Citation: ${caseData.citation}
Court: ${caseData.court}

Case text (excerpt):
${caseData.full_text.substring(0, 8000)}`;

  let raw;
  try {
    console.log(`Calling AI for ${caseData.citation}...`);
    raw = await callWorkersAI(env, systemPrompt, userContent, 1500);
    console.log(`AI response length: ${raw?.length || 0} chars`);

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const summary = JSON.parse(cleaned);

    if (!summary.facts || !summary.holding) {
      console.error(`Incomplete AI summary for ${caseData.citation}`);
      throw new Error("Incomplete AI response");
    }

    return {
      case_name: (summary.case_name || "").trim() || null,
      facts: summary.facts || "Not extracted",
      issues: Array.isArray(summary.issues) ? summary.issues.join("; ") : (summary.issues || "Not extracted"),
      holding: summary.holding || "Not extracted",
      principles: Array.isArray(summary.principles) ? summary.principles : [],
      summary_quality_score: 0.7,
    };
  } catch (error) {
    console.error(`Case summarization failed for ${caseData.citation}:`, error);
    console.error(`AI raw response:`, raw?.substring(0, 200));
    return {
      case_name: null,
      facts: "AI extraction failed",
      issues: "AI extraction failed",
      holding: "AI extraction failed",
      principles: [],
      summary_quality_score: 0.0,
    };
  }
}

/* =============================================================
   DATABASE FUNCTIONS
   ============================================================= */
async function saveCaseToDb(env, caseData, summary) {
  const id = caseData.citation.replace(/\s+/g, '-');

  await env.DB.prepare(`
    INSERT OR REPLACE INTO cases 
    (id, citation, court, case_date, case_name, url, facts, issues, holding, principles_extracted, processed_date, summary_quality_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    caseData.citation,
    caseData.court,
    `${caseData.year}-01-01`,
    caseData.case_name,
    caseData.url || "",
    summary.facts,
    summary.issues,
    summary.holding,
    JSON.stringify(summary.principles),
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
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (response.status === 404 || response.status === 410) { consecutiveMisses++; }
        else if (response.ok) {
          consecutiveMisses = 0;
          const html = await response.text();
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
    if (year_to)   { conditions.push("strftime('%Y', case_date) <= ?"); params.push(String(year_to)); }
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
  let { case_text, citation, case_name, court, encoding } = body;
  if (!case_text || !citation) throw new Error("Missing required fields: case_text and citation");
  if (encoding === 'base64') case_text = atob(case_text);
  return processCaseUpload(env, case_text, citation, case_name, court);
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
