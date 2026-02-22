/* =============================================================
   ARCANTHYR — Cloudflare Worker  v5
   NEW FEATURES:
     - Email sending via Resend API
     - AustLII case scraper (Tasmanian criminal law)
     - Legal principles database
     - Case summarization AI
     - Scheduled daily sync (Cloudflare Cron)
     - Contact management
   ============================================================= */
console.log('Worker loaded successfully');  // ← ADD THIS NEW LINE HERE

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
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured");
  }

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

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }

  return await response.json();
}

/* =============================================================
   AUSTLII SCRAPER FUNCTIONS (NEW CASES ONLY)
   ============================================================= */

// AustLII search URL patterns for Tasmanian criminal courts
const AUSTLII_SEARCH_URLS = {
  magistrates: "http://www.austlii.edu.au/cgi-bin/viewtoc/au/cases/tas/TAMagC/",
  supreme: "http://www.austlii.edu.au/cgi-bin/viewtoc/au/cases/tas/TASSC/",
  cca: "http://www.austlii.edu.au/cgi-bin/viewtoc/au/cases/tas/TASCCA/",
  // Full Court decisions are also in TASSC
};

// Only check CURRENT year for new cases
async function fetchRecentAustLIICases(env, limit = 50) {
  const currentYear = new Date().getFullYear();
  const allNewCases = [];

  // Check all courts for current year only
  for (const court of ['magistrates', 'supreme', 'cca']) {
    const baseUrl = AUSTLII_SEARCH_URLS[court];
    if (!baseUrl) continue;

    try {
      const url = `${baseUrl}${currentYear}/`;
      const response = await fetch(url);

      if (!response.ok) {
        console.log(`AustLII fetch failed for ${court} ${currentYear}: ${response.status}`);
        continue;
      }

      const html = await response.text();
      const cases = parseAustLIIHtml(html, court, currentYear);

      // Filter out cases we already have
      for (const caseData of cases) {
        const exists = await env.DB.prepare("SELECT id FROM cases WHERE citation = ?")
          .bind(caseData.citation).first();

        if (!exists) {
          allNewCases.push(caseData);
        }
      }

      if (allNewCases.length >= limit) break;

    } catch (error) {
      console.error(`Error fetching AustLII ${court} ${currentYear}:`, error);
    }
  }

  return allNewCases.slice(0, limit);
}

function parseAustLIIHtml(html, court, year) {
  const cases = [];

  // Look for case links in the format [YEAR] TASSC 123 or similar
  const casePattern = /\[(\d{4})\]\s+(TASSC|TAMagC|TASCCA)\s+(\d+)/g;
  let match;

  while ((match = casePattern.exec(html)) !== null && cases.length < 100) {
    cases.push({
      citation: match[0],
      year: match[1],
      court_abbrev: match[2],
      case_num: match[3],
      url: `http://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/tas/${match[2]}/${match[1]}/${match[3]}.html`,
      court: court,
    });
  }

  return cases;
}

async function fetchCaseContent(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const html = await response.text();

    // Extract case name from title or header
    const nameMatch = html.match(/<title>([^<]+)<\/title>/i);
    const caseName = nameMatch ? nameMatch[1].trim() : "Unknown Case";

    // Extract main content (simplified - would need better parsing)
    const contentMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const content = contentMatch ? contentMatch[1] : html;

    // Remove HTML tags for text extraction
    const textContent = content.replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50000); // Limit content size

    return {
      case_name: caseName,
      full_text: textContent,
    };
  } catch (error) {
    console.error(`Error fetching case content from ${url}:`, error);
    return null;
  }
}

/* =============================================================
   PDF UPLOAD & PROCESSING
   ============================================================= */

async function extractTextFromPDF(pdfBase64) {
  // Simple PDF text extraction
  // For production, would use a PDF parsing library
  // This is a placeholder - Cloudflare Workers can't easily parse PDFs
  // So we'll treat the base64 as-is and let the AI extract from it

  // Decode base64
  const pdfBuffer = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));

  // For now, return placeholder - in production, you'd use a PDF library
  // or external service to extract text
  // Alternative: Have user paste text instead of upload PDF

  return {
    success: false,
    error: "PDF parsing not yet implemented - please paste case text instead"
  };
}

async function processCaseUpload(env, caseText, citation, caseName, court) {
  // Validate inputs
  if (!caseText || !citation) {
    throw new Error("Missing required fields: caseText and citation");
  }

  // Check if case already exists
  const exists = await env.DB.prepare("SELECT id FROM cases WHERE citation = ?")
    .bind(citation).first();

  if (exists) {
    throw new Error(`Case ${citation} already exists in database`);
  }

  // Prepare case data for AI summarization
  const caseData = {
    citation,
    case_name: caseName || "Unknown Case",
    court: court || "unknown",
    year: citation.match(/\[(\d{4})\]/)?.[1] || new Date().getFullYear().toString(),
    full_text: caseText,
    url: "", // User upload has no URL
  };

  // Summarize with AI
  const summary = await summarizeCase(env, caseData);

  // Save to database
  const id = await saveCaseToDb(env, caseData, summary);

  // ── Nexus vector storage ──────────────────────────────────────
  try {
    await fetch("http://31.220.86.192:18789/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        citation: caseData.citation,
        source: "AustLII",
        text: caseData.full_text
      })
    });
  } catch (e) {
    console.error("Nexus ingest failed:", e.message);
  }
  //

  return {
    id,
    citation,
    case_name: caseData.case_name,
    summary,
  };
}

async function summarizeCase(env, caseData) {
  const systemPrompt = `You are a legal research assistant analyzing Australian criminal case law.
Extract and structure the following information from the case:

1. FACTS: Brief factual background (2-3 sentences)
2. ISSUES: Legal issues considered (bullet points, max 3)
3. HOLDING: Court's decision and reasoning (2-3 sentences)
4. PRINCIPLES: Key legal principles established or applied (bullet points, max 5)

Format your response as JSON with keys: facts, issues, holding, principles
Principles should be array of objects: { principle: "text", statute_refs: ["Act s.123"], keywords: ["sentencing", "assault"] }

Output ONLY valid JSON. No markdown fences.`;

  const userContent = `Case: ${caseData.case_name}
Citation: ${caseData.citation}
Court: ${caseData.court}

Case text (excerpt):
${caseData.full_text.substring(0, 8000)}`;

  try {
    console.log(`Calling AI for ${caseData.citation}...`);
    const raw = await callWorkersAI(env, systemPrompt, userContent, 1500); // Increased from 1200
    console.log(`AI response length: ${raw?.length || 0} chars`);

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const summary = JSON.parse(cleaned);

    // Validate we got actual data
    if (!summary.facts || !summary.holding) {
      console.error(`AI returned incomplete summary for ${caseData.citation}`);
      throw new Error("Incomplete AI response");
    }

    return {
      facts: summary.facts || "Not extracted",
      issues: Array.isArray(summary.issues) ? summary.issues.join("; ") : "Not extracted",
      holding: summary.holding || "Not extracted",
      principles: Array.isArray(summary.principles) ? summary.principles : [],
      summary_quality_score: 0.7,
    };
  } catch (error) {
    console.error(`Case summarization failed for ${caseData.citation}:`, error);
    console.error(`AI raw response was:`, raw?.substring(0, 200));
    return {
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
  const id = `${caseData.citation.replace(/\s+/g, '-')}`;

  await env.DB.prepare(`
    INSERT OR REPLACE INTO cases 
    (id, citation, court, case_date, case_name, url, facts, issues, holding, principles_extracted, processed_date, summary_quality_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    caseData.citation,
    caseData.court,
    `${caseData.year}-01-01`, // Approximate - would extract actual date from case
    caseData.case_name,
    caseData.url,
    summary.facts,
    summary.issues,
    summary.holding,
    JSON.stringify(summary.principles),
    new Date().toISOString(),
    summary.summary_quality_score
  ).run();

  // Save principles to separate table
  for (const principle of summary.principles) {
    await savePrinciple(env, principle, caseData.citation);
  }

  return id;
}

async function savePrinciple(env, principle, citation) {
  const principleText = principle.principle || principle;
  const keywords = principle.keywords || [];
  const statuteRefs = principle.statute_refs || [];

  // Check if principle already exists (fuzzy match would be better)
  const existing = await env.DB.prepare(
    "SELECT id FROM legal_principles WHERE principle_text = ?"
  ).bind(principleText).first();

  if (existing) {
    // Update existing principle with new citation
    const current = await env.DB.prepare("SELECT case_citations FROM legal_principles WHERE id = ?")
      .bind(existing.id).first();

    const citations = JSON.parse(current.case_citations || "[]");
    if (!citations.includes(citation)) {
      citations.push(citation);

      await env.DB.prepare(
        "UPDATE legal_principles SET case_citations = ?, most_recent_citation = ? WHERE id = ?"
      ).bind(JSON.stringify(citations), citation, existing.id).run();
    }
  } else {
    // Create new principle
    const id = `prin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await env.DB.prepare(`
      INSERT INTO legal_principles 
      (id, principle_text, keywords, statute_refs, case_citations, most_recent_citation, date_added)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      principleText,
      JSON.stringify(keywords),
      JSON.stringify(statuteRefs),
      JSON.stringify([citation]),
      citation,
      new Date().toISOString()
    ).run();
  }
}

async function getSyncProgress(env) {
  const stats = await env.DB.prepare(`
    SELECT 
      COUNT(*) as total_cases,
      MIN(case_date) as earliest_case,
      MAX(case_date) as latest_case,
      MAX(processed_date) as last_sync
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
   SCHEDULED SYNC (Daily Cron) - NEW CASES ONLY
   ============================================================= */
async function runDailySync(env) {
  console.log("Starting daily AustLII check for new cases...");

  let casesProcessed = 0;
  let casesFailed = 0;
  const dailyLimit = 50;
  const errors = [];

  // Only fetch recent cases (current year)
  const newCases = await fetchRecentAustLIICases(env, dailyLimit);

  console.log(`Found ${newCases.length} new cases to process`);

  for (const caseData of newCases) {
    if (casesProcessed >= dailyLimit) break;

    try {
      console.log(`Processing: ${caseData.citation}`);

      // Fetch full case content with retry
      let content = null;
      let retries = 0;
      while (!content && retries < 3) {
        content = await fetchCaseContent(caseData.url);
        if (!content) {
          retries++;
          console.log(`Fetch failed for ${caseData.citation}, retry ${retries}/3`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!content) {
        console.error(`Failed to fetch content for ${caseData.citation} after 3 attempts`);
        errors.push(`${caseData.citation}: Content fetch failed`);
        casesFailed++;
        continue;
      }

      // Merge case data
      const fullCaseData = { ...caseData, ...content };

      // Validate we have text
      if (!fullCaseData.full_text || fullCaseData.full_text.length < 100) {
        console.error(`Insufficient text for ${caseData.citation} (${fullCaseData.full_text?.length || 0} chars)`);
        errors.push(`${caseData.citation}: Insufficient text extracted`);
        casesFailed++;
        continue;
      }

      console.log(`Summarizing ${caseData.citation} (${fullCaseData.full_text.length} chars)`);

      // Summarize with AI
      const summary = await summarizeCase(env, fullCaseData);

      // Check if AI extraction succeeded
      if (summary.facts === "AI extraction failed") {
        console.error(`AI extraction failed for ${caseData.citation}`);
        errors.push(`${caseData.citation}: AI extraction failed`);
        casesFailed++;
        // Still save to database so we know we tried
      }

      // Save to database
      await saveCaseToDb(env, fullCaseData, summary);

      casesProcessed++;
      console.log(`✓ Saved ${caseData.citation}`);

      // Rate limiting delay (2 seconds between cases)
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`Error processing ${caseData.citation}:`, error);
      errors.push(`${caseData.citation}: ${error.message}`);
      casesFailed++;
    }
  }

  console.log(`Daily sync complete. Processed: ${casesProcessed}, Failed: ${casesFailed}`);

  // Send email notification if cases were found
  if ((casesProcessed > 0 || casesFailed > 0) && env.RESEND_API_KEY) {
    try {
      let emailBody = `<p>Daily sync found ${newCases.length} new cases:</p>`;
      emailBody += `<p><strong>Successfully processed: ${casesProcessed}</strong></p>`;

      if (casesProcessed > 0) {
        emailBody += `<ul>${newCases.slice(0, casesProcessed).map(c => `<li>${c.citation} - ${c.case_name || 'Processing...'}</li>`).join('')}</ul>`;
      }

      if (casesFailed > 0) {
        emailBody += `<p><strong>Failed: ${casesFailed}</strong></p>`;
        emailBody += `<ul>${errors.map(err => `<li style="color:#c8a96e;">${err}</li>`).join('')}</ul>`;
      }

      emailBody += `<p>View in console: <a href="https://your-console-url.com/legal.html">Legal Research</a></p>`;

      await sendEmail(
        env,
        env.RESEND_FROM_EMAIL, // Send to yourself
        `Arcanthyr: ${casesProcessed} new cases, ${casesFailed} failed`,
        emailBody
      );
    } catch (err) {
      console.error("Failed to send sync notification email:", err);
    }
  }

  return { success: true, cases_processed: casesProcessed, cases_failed: casesFailed, errors };
}

/* =============================================================
   ORIGINAL AI ACTION HANDLERS (from v4)
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

  const userMsg = `Entry type: ${tag}
Raw text: ${text}
Rule-based guidance: ${next || ""}
Clarifying question: ${clarify || ""}`;

  return callWorkersAI(env, system, userMsg, 300);
}

async function handleWeeklyReview(body, env) {
  const { entries } = body;
  if (!entries || !entries.length) return "No entries to review.";

  const system = `You are a pattern recognition engine inside Arcanthyr, a personal clarity console.
Analyse the entries and produce a concise weekly review.
Respond with EXACTLY these three sections and no other text:

RECURRING THEMES
[2-3 sentences on topics or concerns that appear repeatedly]

STUCK LOOPS
[2-3 sentences on anything recurring without resolution]

DECISIONS PENDING
[1-2 sentences on unresolved decisions in the data]

If a section has nothing to report, write: None identified.`;

  const entrySummary = entries
    .map(e => `[${(e.tag || "note").toUpperCase()}] ${e.text}`)
    .join("\n");

  return callWorkersAI(env, system, `Entries:\n${entrySummary}`, 700);
}

async function handleAxiomRelay(body, env) {
  const { entries, focus } = body;
  if (!entries || !entries.length) throw new Error("No entries to relay.");

  const stage1System = `You are Stage 1 of a multi-step reasoning agent called Axiom Relay inside Arcanthyr.
Decompose each entry into its components.
For each entry identify:
- surface: what they literally said (very short)
- intent: what they actually need underneath
- constraint: a hidden assumption or blocker
Respond as a JSON array only. Each item: { "id": number, "surface": "...", "intent": "...", "constraint": "..." }
Output ONLY valid JSON. No markdown fences, no explanation.`;

  const entryText = entries
    .slice(-20)
    .map((e, i) => `${i}: [${e.tag}] ${e.text}`)
    .join("\n");

  let decomposed;
  try {
    const raw1 = await callWorkersAI(env, stage1System, entryText, 800);
    const cleaned = raw1.replace(/```json|```/g, "").trim();
    decomposed = JSON.parse(cleaned);
  } catch {
    decomposed = entries.map((e, i) => ({
      id: i, surface: e.text, intent: e.text, constraint: ""
    }));
  }

  const stage2System = `You are Stage 2 of Axiom Relay.
Identify the 3 most important tensions, risks, or opportunities ACROSS the entries.
Each point must reference specific content (not generic advice) and be under 20 words.
Output EXACTLY:
TENSION_1: [text]
TENSION_2: [text]
TENSION_3: [text]
No other text.`;

  const stage2Input = `Focus area: ${focus || "none"}
Decomposed:\n${decomposed.map(d =>
    `[${d.id}] Surface: ${d.surface} | Intent: ${d.intent} | Constraint: ${d.constraint}`
  ).join("\n")}`;

  const stage2Raw = await callWorkersAI(env, stage2System, stage2Input, 400);

  const stage3System = `You are Stage 3 of Axiom Relay — final synthesis.
Produce an actionable relay report using EXACTLY these sections:

SIGNAL
[1-2 sentences: the single most important insight]

LEVERAGE POINT
[1 sentence: the one action that unlocks the most]

RELAY ACTIONS
1. [specific action, under 12 words]
2. [specific action, under 12 words]
3. [specific action, under 12 words]

DEAD WEIGHT
[1 sentence: what to stop doing or deprioritise]

Output only these sections. No preamble, no sign-off.`;

  const finalReport = await callWorkersAI(
    env,
    stage3System,
    `${stage2Raw}\n\nFocus: ${focus || "none"}`,
    500
  );

  return {
    stages: { decomposed, tensions: stage2Raw },
    report: finalReport,
  };
}

async function handleClarifyAgent(body, env) {
  const { text, tag, history = [], userReply = null } = body;
  if (!text || !tag) throw new Error("Missing text or tag");

  const historyContext = history.length > 0
    ? `\nConversation so far:\n${history.map(h =>
      `${h.role === "agent" ? "Agent" : "User"}: ${h.content}`
    ).join("\n")}`
    : "";

  const userExchanges = history.filter(h => h.role === "user").length;

  if (userExchanges >= 2 && userReply) {
    const synthSystem = `You are a clarity synthesis engine inside Arcanthyr.
You've had a clarifying conversation with a user about their entry.
Produce a final crystallised version that incorporates everything you've learned.
Rules:
- 2-3 sentences max
- Plain prose, no bullets, no markdown
- Capture their full intent, not just the literal words
- Output ONLY the crystallised entry. Nothing else.`;

    const synthInput = `Original entry (${tag}): ${text}${historyContext}\nUser final reply: ${userReply}`;
    const crystallised = await callWorkersAI(env, synthSystem, synthInput, 300);
    return { done: true, draft: crystallised, question: null };
  }

  const questionSystem = `You are a conversational clarity agent inside Arcanthyr.
Ask ONE precise question to help the user think more clearly about their entry.
Rules:
- One question only. Never two.
- Specific to THEIR content — not generic coaching
- Each question should dig deeper than the last
- Under 20 words
- No preamble, no "Great!" or "Interesting!" — just the question
- Output ONLY the question.`;

  const questionInput = `Entry type: ${tag}
Entry: ${text}${historyContext}${userReply ? `\nUser just replied: ${userReply}` : ""}
${userExchanges === 0 ? "First question — find the most important gap in this entry." : "Go deeper on what they revealed."}`;

  const question = await callWorkersAI(env, questionSystem, questionInput, 120);
  return { done: false, question, draft: null };
}

/* =============================================================
   NEW API HANDLERS
   ============================================================= */

async function handleSendEmail(body, env) {
  const { to, subject, content, type } = body;
  if (!to || !subject || !content) {
    throw new Error("Missing required fields: to, subject, content");
  }

  // Format content as HTML
  let html = `
    <div style="font-family: 'DM Mono', monospace; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="border-bottom: 1px solid #3a3b3f; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="color: #a8b4c0; font-family: 'Cormorant Garamond', serif; letter-spacing: 0.12em;">ARCANTHYR</h2>
      </div>
      <div style="white-space: pre-wrap; line-height: 1.7; color: #f0f1f2;">
        ${content}
      </div>
      <div style="border-top: 1px solid #3a3b3f; margin-top: 20px; padding-top: 12px; font-size: 12px; color: #888c94;">
        Sent from Arcanthyr Console
      </div>
    </div>
  `;

  const result = await sendEmail(env, to, subject, html);
  return { success: true, message_id: result.id };
}

async function handleGetContacts(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM email_contacts ORDER BY name ASC"
  ).all();
  return results || [];
}

async function handleAddContact(body, env) {
  const { name, email } = body;
  if (!name || !email) throw new Error("Missing name or email");

  const id = `contact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await env.DB.prepare(
    "INSERT INTO email_contacts (id, name, email, created_at) VALUES (?, ?, ?, ?)"
  ).bind(id, name, email, new Date().toISOString()).run();

  return { id, name, email };
}

async function handleDeleteContact(contactId, env) {
  await env.DB.prepare("DELETE FROM email_contacts WHERE id = ?").bind(contactId).run();
  return { success: true };
}

async function handleSearchCases(body, env) {
  const { query, court, limit = 50 } = body;

  let sql = "SELECT * FROM cases WHERE 1=1";
  const params = [];

  if (query && query.trim()) {
    sql += " AND (case_name LIKE ? OR facts LIKE ? OR issues LIKE ? OR holding LIKE ?)";
    const searchTerm = `%${query}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (court && court !== "all") {
    sql += " AND court = ?";
    params.push(court);
  }

  sql += " ORDER BY case_date DESC LIMIT ?";
  params.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return results || [];
}

async function handleSearchPrinciples(body, env) {
  const { query, limit = 50 } = body;

  let sql = "SELECT * FROM legal_principles WHERE 1=1";
  const params = [];

  if (query && query.trim()) {
    sql += " AND (principle_text LIKE ? OR keywords LIKE ? OR statute_refs LIKE ?)";
    const searchTerm = `%${query}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  sql += " ORDER BY date_added DESC LIMIT ?";
  params.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...params).all();

  // Parse JSON fields
  return (results || []).map(r => ({
    ...r,
    keywords: JSON.parse(r.keywords || "[]"),
    statute_refs: JSON.parse(r.statute_refs || "[]"),
    case_citations: JSON.parse(r.case_citations || "[]"),
  }));
}

async function handleUploadCase(body, env) {
  const { case_text, citation, case_name, court } = body;

  if (!case_text || !citation) {
    throw new Error("Missing required fields: case_text and citation");
  }

  // Process the uploaded case
  const result = await processCaseUpload(env, case_text, citation, case_name, court);

  return result;
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

    const corsOrigin = origin || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET,POST,DELETE,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    /* ── AI PROXY ROUTES ─────────────────────────────────────── */
    if (url.pathname.startsWith("/api/ai/")) {
      if (!rateLimit(`${ip}:ai`, 15, 60_000)) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Wait a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } }
        );
      }

      if (!env.AI) {
        return new Response(
          JSON.stringify({ error: "AI binding not configured." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (request.method !== "POST") {
        return new Response(
          JSON.stringify({ error: "AI routes accept POST only." }),
          { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const action = url.pathname.replace("/api/ai/", "");
      let body;
      try { body = await request.json(); }
      catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        let result;
        if (action === "draft") result = await handleDraft(body, env);
        else if (action === "next-actions") result = await handleNextActions(body, env);
        else if (action === "weekly-review") result = await handleWeeklyReview(body, env);
        else if (action === "axiom-relay") result = await handleAxiomRelay(body, env);
        else if (action === "clarify-agent") result = await handleClarifyAgent(body, env);
        else return new Response(
          JSON.stringify({ error: `Unknown AI action: ${action}` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

        return new Response(JSON.stringify({ result }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    /* ── EMAIL ROUTES ────────────────────────────────────────── */
    if (url.pathname.startsWith("/api/email/")) {
      if (!rateLimit(`${ip}:email`, 10, 60_000)) {
        return new Response(
          JSON.stringify({ error: "Email rate limit exceeded." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const action = url.pathname.replace("/api/email/", "");
      const body = request.method === "POST" ? await request.json() : null;

      try {
        let result;
        if (action === "send" && request.method === "POST") {
          result = await handleSendEmail(body, env);
        } else if (action === "contacts" && request.method === "GET") {
          result = await handleGetContacts(env);
        } else if (action === "contacts" && request.method === "POST") {
          result = await handleAddContact(body, env);
        } else if (action.startsWith("contacts/") && request.method === "DELETE") {
          const contactId = action.replace("contacts/", "");
          result = await handleDeleteContact(contactId, env);
        } else {
          return new Response(
            JSON.stringify({ error: "Invalid email endpoint" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ result }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    /* ── LEGAL RESEARCH ROUTES ───────────────────────────────── */
    if (url.pathname.startsWith("/api/legal/")) {
      if (!rateLimit(`${ip}:legal`, 30, 60_000)) {
        return new Response(
          JSON.stringify({ error: "Legal API rate limit exceeded." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const action = url.pathname.replace("/api/legal/", "");
      const body = request.method === "POST" ? await request.json() : null;

      try {
        let result;
        if (action === "sync-progress") {
          result = await getSyncProgress(env);
        } else if (action === "search-cases" && request.method === "POST") {
          result = await handleSearchCases(body, env);
        } else if (action === "search-principles" && request.method === "POST") {
          result = await handleSearchPrinciples(body, env);
        } else if (action === "trigger-sync" && request.method === "POST") {
          // Manual trigger for sync (in addition to scheduled)
          result = await runDailySync(env);
        } else if (action === "upload-case" && request.method === "POST") {
          // NEW: Upload and process a case manually
          result = await handleUploadCase(body, env);
        } else {
          return new Response(
            JSON.stringify({ error: "Invalid legal endpoint" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ result }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    /* ── ENTRIES ROUTES (existing) ────────────────────────────── */
    if (url.pathname.startsWith("/api/entries")) {
      const limits = {
        GET: { max: 60, windowMs: 60_000 },
        POST: { max: 20, windowMs: 60_000 },
        DELETE: { max: 10, windowMs: 60_000 },
        PATCH: { max: 10, windowMs: 60_000 },
      };
      const limit = limits[request.method];
      if (limit && !rateLimit(`${ip}:${request.method}`, limit.max, limit.windowMs)) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } }
        );
      }

      if (request.method === "GET") {
        const { results } = await env.DB
          .prepare("SELECT * FROM entries WHERE deleted = 0 ORDER BY created_at DESC LIMIT 200")
          .all();
        return new Response(JSON.stringify({ entries: results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (request.method === "POST") {
        const body = await request.json();
        for (const k of ["id", "created_at", "text", "tag", "next", "clarify"]) {
          if (body?.[k] === undefined || body?.[k] === null) {
            return new Response(
              JSON.stringify({ error: `Missing required field: ${k}` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        await env.DB
          .prepare(`INSERT INTO entries (id, created_at, text, tag, next, clarify, draft, _v, deleted)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`)
          .bind(
            body.id, body.created_at, body.text, body.tag,
            body.next, body.clarify, body.draft ?? null, body._v ?? 0
          )
          .run();
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (request.method === "DELETE") {
        const id = url.pathname.replace("/api/entries", "").replace(/^\//, "");
        if (id) await env.DB.prepare("UPDATE entries SET deleted = 1 WHERE id = ?").bind(id).run();
        else await env.DB.prepare("UPDATE entries SET deleted = 1 WHERE deleted = 0").run();
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (request.method === "PATCH") {
        await env.DB.prepare("UPDATE entries SET deleted = 0 WHERE deleted = 1").run();
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },

  /* ── SCHEDULED HANDLER (Cron Trigger) ───────────────────────── */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailySync(env));
  },
};
