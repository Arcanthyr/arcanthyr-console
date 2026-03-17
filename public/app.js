console.log("APP v12 — case_name from Llama, paginated case search");

/* =============================================================
   SCHEMA VERSION
   ============================================================= */
const SCHEMA_VERSION = 1;

/* =============================================================
   API BASES
   ============================================================= */
const API_BASE = "https://arcanthyr.com/api/entries";
const AI_BASE = "https://arcanthyr.com/api/ai";
const EMAIL_BASE = "https://arcanthyr.com/api/email";
const LEGAL_BASE  = "https://arcanthyr.com/api/legal";
const INGEST_BASE = "https://arcanthyr.com/api/ingest";

/* =============================================================
   DOM refs
   ============================================================= */
const inputEl = document.getElementById("input");
const outputEl = document.getElementById("output");
const historyEl = document.getElementById("history");
const historyCount = document.getElementById("historyCount");
const processBtn = document.getElementById("processBtn");
const saveBtn = document.getElementById("saveBtn");
const draftBtn = document.getElementById("draftBtn");
const nextActionBtn = document.getElementById("nextActionBtn");
const clearInputBtn = document.getElementById("clearInputBtn");
const clearBtn = document.getElementById("clearBtn");
const exportBtn = document.getElementById("exportBtn");
const relayBtn = document.getElementById("relayBtn");
const restoreBtn = document.getElementById("restoreBtn");
const reviewBtn = document.getElementById("reviewBtn");
const reviewOutput = document.getElementById("reviewOutput");
const searchInput = document.getElementById("searchInput");
const tagFilters = document.getElementById("tagFilters");
const filterSummary = document.getElementById("filterSummary");

// Email elements
const emailEntryBtn = document.getElementById("emailEntryBtn");
const emailCompose = document.getElementById("emailCompose");
const emailRecipients = document.getElementById("emailRecipients");
const emailSubject = document.getElementById("emailSubject");
const emailBody = document.getElementById("emailBody");
const sendEmailBtn = document.getElementById("sendEmailBtn");
const cancelEmailBtn = document.getElementById("cancelEmailBtn");
const manageContactsBtn = document.getElementById("manageContactsBtn");
const contactsModal = document.getElementById("contactsModal");
const closeContactsBtn = document.getElementById("closeContactsBtn");
const addContactBtn = document.getElementById("addContactBtn");
const contactsList = document.getElementById("contactsList");
const addFromContactsBtn = document.getElementById("addFromContactsBtn");
const emailOutput = document.getElementById("emailOutput");

// Legal research elements
const legalSearchInput = document.getElementById("legalSearchInput");
const courtFilters = document.getElementById("courtFilters");
const legalResults = document.getElementById("legalResults");
const legalSyncBtn = document.getElementById("legalSyncBtn");
const legalSyncStatus = document.getElementById("legalSyncStatus");

/* =============================================================
   RATE LIMITER (client-side)
   ============================================================= */
const _rateLimits = {};

function checkRate(key, max = 3, windowMs = 5000) {
  const now = Date.now();
  if (!_rateLimits[key] || now - _rateLimits[key].ts > windowMs) {
    _rateLimits[key] = { count: 1, ts: now };
    return true;
  }
  _rateLimits[key].count += 1;
  if (_rateLimits[key].count > max) return false;
  return true;
}

/* =============================================================
   VAULT API
   ============================================================= */
async function apiLoadEntries() {
  const r = await fetch(API_BASE, { method: "GET" });
  if (!r.ok) throw new Error(`Failed to load entries: ${r.status}`);
  const data = await r.json();
  return (data.entries || []).map(migrateEntry).slice().reverse();
}

async function apiSaveEntry(entry) {
  const r = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!r.ok) throw new Error(await r.text());
}

async function apiClearAll() {
  const r = await fetch(API_BASE, { method: "DELETE" });
  if (!r.ok) throw new Error(`Failed to clear vault: ${r.status}`);
}

async function apiDeleteEntry(id) {
  const r = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`Failed to delete entry: ${r.status}`);
}

async function apiRestoreAll() {
  const r = await fetch(API_BASE, { method: "PATCH" });
  if (!r.ok) throw new Error(`Failed to restore entries: ${r.status}`);
}

/* =============================================================
   AI PROXY CALLS
   ============================================================= */
async function aiCall(action, body) {
  const r = await fetch(`${AI_BASE}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `AI call failed (${r.status})`);
  return data.result;
}

async function draftEntry(text, tag) { return aiCall("draft", { text, tag }); }
async function suggestNextActions(text, tag, next, clarify) { return aiCall("next-actions", { text, tag, next, clarify }); }

async function weeklyReview(entries) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = entries.filter(e => new Date(e.created_at).getTime() > sevenDaysAgo);
  const sample = recent.length > 0 ? recent : entries.slice(-30);
  return aiCall("weekly-review", { entries: sample.map(e => ({ tag: e.tag, text: e.text })) });
}

async function axiomRelay(entries, focus = "") {
  return aiCall("axiom-relay", { entries: entries.slice(-20).map(e => ({ tag: e.tag, text: e.text })), focus });
}

async function clarifyAgentStep(text, tag, history, userReply) {
  return aiCall("clarify-agent", { text, tag, history, userReply });
}

/* =============================================================
   EMAIL API CALLS
   ============================================================= */
async function emailSend(to, subject, content) {
  const r = await fetch(`${EMAIL_BASE}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, content }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Email send failed");
  return data.result;
}

async function emailGetContacts() {
  const r = await fetch(`${EMAIL_BASE}/contacts`, { method: "GET" });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Failed to load contacts");
  return data.result;
}

async function emailAddContact(name, email) {
  const r = await fetch(`${EMAIL_BASE}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Failed to add contact");
  return data.result;
}

async function emailDeleteContact(contactId) {
  const r = await fetch(`${EMAIL_BASE}/contacts/${contactId}`, { method: "DELETE" });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Failed to delete contact");
  return data.result;
}

/* =============================================================
   LEGAL RESEARCH API CALLS
   ============================================================= */
async function legalGetSyncProgress() {
  const r = await fetch(`${LEGAL_BASE}/sync-progress`, { method: "GET" });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Failed to get sync progress");
  return data.result;
}

async function legalSearchCases({ query = "", court = "all", year = "all", year_from = "", year_to = "", limit = 100, offset = 0 } = {}) {
  // Returns { total, limit, offset, cases[] }
  const r = await fetch(`${LEGAL_BASE}/search-cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, court, year, year_from, year_to, limit, offset }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Case search failed");
  return data.result;
}

async function legalSearchPrinciples(query) {
  const r = await fetch(`${LEGAL_BASE}/search-principles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Principle search failed");
  return data.result;
}

async function legalTriggerSync() {
  const r = await fetch(`${LEGAL_BASE}/trigger-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Sync trigger failed");
  return data.result;
}

async function legalUploadCase(caseText, citation, caseName, court) {
  const r = await fetch(`${LEGAL_BASE}/upload-case`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ case_text: caseText, citation, case_name: caseName, court }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Case upload failed");
  return data.result;
}

/* =============================================================
   SCHEMA MIGRATION
   ============================================================= */
function migrateEntry(e) {
  const v = e._v || 0;
  if (v < 1) { e.draft = e.draft || null; e._v = 1; }
  return e;
}

/* =============================================================
   RULE-BASED AGENT
   ============================================================= */
function classify(text) {
  const t = text.trim().toLowerCase();
  const hasQ = /^(how|why|what|where|when|who)\b/.test(t) || t.includes("?");
  const decisionCue = /\b(should i|decide|choice|either|or)\b/.test(t);
  const taskCue = /\b(today|tomorrow|next week|by |due |call |email |book |schedule |pay )\b/.test(t);
  const ideaCue = /\b(idea|concept|maybe|what if|could we)\b/.test(t);
  if (decisionCue) return "decision";
  if (hasQ) return "question";
  if (taskCue) return "task";
  if (ideaCue) return "idea";
  return "note";
}

function nextStep(tag) {
  switch (tag) {
    case "task": return "Define the smallest next action and a time: who/what/when.";
    case "decision": return "Write 2 options + the downside if wrong + one reversible test.";
    case "question": return "State what a good answer would let you do. Then list 2 constraints.";
    case "idea": return "Turn it into a 1-sentence pitch + first tiny prototype step.";
    default: return "Rewrite as one clear sentence. Then add one concrete next action.";
  }
}

function clarifyQuestion(tag) {
  switch (tag) {
    case "task": return "What's the deadline, and what is 'done' in one sentence?";
    case "decision": return "What would change your mind most?";
    case "question": return "What context is missing that makes this hard to answer?";
    case "idea": return "Who is this for, and what pain does it remove?";
    default: return "Is this something you want to act on, or just capture?";
  }
}

function processText(text) {
  const tag = classify(text);
  return { tag, next: nextStep(tag), clarify: clarifyQuestion(tag), _v: SCHEMA_VERSION };
}

/* =============================================================
   SEARCH / FILTER STATE
   ============================================================= */
let activeTag = "all";
let activeDateRange = "all";
let searchKeyword = "";
let activeCourt = "all";
let activeLegalView = "cases";
let activeYear = "all";      // year filter for legal search
let legalCurrentOffset = 0; // pagination state
const LEGAL_PAGE_SIZE = 100;

function getFilteredEntries(entries) {
  let result = [...entries];
  if (activeTag !== "all") result = result.filter(e => e.tag === activeTag);
  if (activeDateRange !== "all") {
    const now = Date.now();
    const cutoffs = { today: now - 86400000, week: now - 604800000, month: now - 2592000000 };
    const cutoff = cutoffs[activeDateRange];
    if (cutoff) result = result.filter(e => new Date(e.created_at).getTime() > cutoff);
  }
  if (searchKeyword.trim()) {
    const kw = searchKeyword.trim().toLowerCase();
    result = result.filter(e =>
      e.text.toLowerCase().includes(kw) ||
      (e.next || "").toLowerCase().includes(kw) ||
      (e.clarify || "").toLowerCase().includes(kw) ||
      (e.draft || "").toLowerCase().includes(kw)
    );
  }
  return result;
}

function updateFilterSummary(filtered, total) {
  if (!filterSummary || !historyCount) return;
  if (filtered.length === total && !searchKeyword.trim() && activeTag === "all" && activeDateRange === "all") {
    filterSummary.textContent = "";
    historyCount.textContent = `${total} ${total === 1 ? "entry" : "entries"}`;
  } else {
    filterSummary.textContent = `Showing ${filtered.length} of ${total} entries`;
    historyCount.textContent = `${filtered.length} of ${total} ${total === 1 ? "entry" : "entries"}`;
  }
}

/* =============================================================
   STATE
   ============================================================= */
let entries = [];
let contacts = [];
let currentEmailContent = null;

/* =============================================================
   RENDER (vault entries)
   ============================================================= */
function render(data) {
  if (!historyEl) return;

  const filtered = getFilteredEntries(data);
  updateFilterSummary(filtered, data.length);

  if (filtered.length === 0) {
    historyEl.innerHTML = `
      <li class="empty-state">
        <p class="empty-title">No entries found</p>
        <p class="empty-sub">Adjust filters or create your first entry above.</p>
      </li>`;
    return;
  }

  historyEl.innerHTML = filtered.map(entry => {
    const date = new Date(entry.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    const time = new Date(entry.created_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });

    const highlightText = (text) => {
      if (!searchKeyword.trim()) return text;
      const regex = new RegExp(`(${searchKeyword.trim()})`, "gi");
      return text.replace(regex, "<mark>$1</mark>");
    };

    return `
      <li class="item" data-id="${entry.id}">
        <div class="meta">
          <span class="tag tag-${entry.tag}">${entry.tag}</span>
          <span>${date} · ${time}</span>
        </div>
        <p>${highlightText(entry.text)}</p>
        ${entry.draft ? `<p style="margin-top:8px;color:var(--text-mid);font-style:italic;">Draft: ${highlightText(entry.draft)}</p>` : ""}
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn ghost small email-entry-btn" data-id="${entry.id}">Email</button>
          <button class="btn ghost small delete-btn" data-id="${entry.id}">Delete</button>
        </div>
      </li>`;
  }).join("");

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      if (!confirm("Delete this entry?")) return;
      try {
        await apiDeleteEntry(id);
        entries = entries.filter(entry => entry.id !== id);
        render(entries);
        showToast("Entry deleted");
      } catch (err) { showOutput("Delete failed: " + err.message); }
    });
  });

  document.querySelectorAll(".email-entry-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      const entry = entries.find(e => e.id === id);
      if (entry) openEmailComposer(entry.text, `Arcanthyr Entry: ${entry.tag}`);
    });
  });
}

/* =============================================================
   RELAY REPORT RENDERER
   ============================================================= */
function renderRelayReport(data) {
  const relayOutput = document.getElementById("relayOutput");
  if (!relayOutput) return;
  const formatted = data.report
    .replace(/^(SIGNAL)/m, '<div class="review-section-title">$1</div>')
    .replace(/^(LEVERAGE POINT)/m, '<div class="review-section-title">$1</div>')
    .replace(/^(RELAY ACTIONS)/m, '<div class="review-section-title">$1</div>')
    .replace(/^(DEAD WEIGHT)/m, '<div class="review-section-title">$1</div>');
  relayOutput.innerHTML = formatted;
  relayOutput.style.display = "block";
}

/* =============================================================
   CLARIFY AGENT
   ============================================================= */
let clarifyHistory = [];
let clarifyOriginalText = "";
let clarifyOriginalTag = "";

async function startClarifyAgent() {
  if (!checkRate("clarify", 3, 10000)) { showOutput("Rate limit: wait before starting clarify again."); return; }
  const text = inputEl.value.trim();
  if (!text) return showOutput("Type something to clarify.");

  clarifyOriginalText = text;
  clarifyOriginalTag = classify(text);
  clarifyHistory = [];

  showOutput("Starting clarity loop…", "loading");
  try {
    const result = await clarifyAgentStep(text, clarifyOriginalTag, clarifyHistory, null);
    if (result.question) showClarifyQuestion(result.question);
    else showOutput("Agent completed without question.");
  } catch (err) { showOutput("Clarify failed: " + err.message); }
}

function showClarifyQuestion(question) {
  clarifyHistory.push({ role: "agent", content: question });
  outputEl.innerHTML = `
    <div style="margin-bottom:12px;color:var(--blue);">Agent: ${question}</div>
    <input type="text" id="clarifyReplyInput" class="search-input" placeholder="Your answer…" style="margin-bottom:8px;" />
    <div style="display:flex;gap:8px;">
      <button id="clarifyReplyBtn" class="btn small">Reply</button>
      <button id="clarifySkipBtn" class="btn ghost small">Skip</button>
    </div>`;
  outputEl.className = "output ai-output";
  document.getElementById("clarifyReplyInput").focus();

  document.getElementById("clarifyReplyBtn").addEventListener("click", async () => {
    const reply = document.getElementById("clarifyReplyInput").value.trim();
    if (!reply) return;
    clarifyHistory.push({ role: "user", content: reply });
    showOutput("Processing your reply…", "loading");
    try {
      const result = await clarifyAgentStep(clarifyOriginalText, clarifyOriginalTag, clarifyHistory, reply);
      if (result.done && result.draft) {
        outputEl.innerHTML = `
          <div style="margin-bottom:12px;color:var(--green);">Crystallised entry:</div>
          <div style="white-space:pre-wrap;margin-bottom:12px;">${result.draft}</div>
          <button id="useClarifiedBtn" class="btn small">Use This</button>`;
        outputEl.className = "output ai-output";
        document.getElementById("useClarifiedBtn").addEventListener("click", () => {
          inputEl.value = result.draft;
          outputEl.textContent = "Clarified entry loaded into input. Edit and save when ready.";
          outputEl.className = "output";
          clarifyHistory = [];
        });
      } else if (result.question) {
        showClarifyQuestion(result.question);
      }
    } catch (err) { showOutput("Clarify continuation failed: " + err.message); }
  });

  document.getElementById("clarifySkipBtn").addEventListener("click", () => {
    outputEl.textContent = "Clarify loop cancelled.";
    outputEl.className = "output";
    clarifyHistory = [];
  });

  document.getElementById("clarifyReplyInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") document.getElementById("clarifyReplyBtn").click();
  });
}

/* =============================================================
   EMAIL COMPOSER
   ============================================================= */
function openEmailComposer(content = "", subject = "") {
  currentEmailContent = content;
  emailCompose.style.display = "block";
  emailBody.value = content;
  emailSubject.value = subject;
  emailRecipients.value = "";
  emailOutput.textContent = "";
  emailCompose.scrollIntoView({ behavior: "smooth" });
}

function closeEmailComposer() {
  emailCompose.style.display = "none";
  currentEmailContent = null;
}

/* =============================================================
   CONTACTS MODAL
   ============================================================= */
async function loadContacts() {
  try {
    contacts = await emailGetContacts();
    renderContactsList();
  } catch (err) { console.error("Failed to load contacts:", err); }
}

function renderContactsList() {
  if (!contactsList) return;
  if (contacts.length === 0) {
    contactsList.innerHTML = `<li style="padding:20px;text-align:center;color:var(--text-dim);">No contacts saved yet</li>`;
    return;
  }
  contactsList.innerHTML = contacts.map(c => `
    <li class="contact-item" data-id="${c.id}">
      <div><strong>${c.name}</strong><span style="color:var(--text-mid);margin-left:8px;">${c.email}</span></div>
      <button class="btn ghost small delete-contact-btn" data-id="${c.id}">Delete</button>
    </li>`).join("");

  document.querySelectorAll(".delete-contact-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      if (!confirm("Delete this contact?")) return;
      try {
        await emailDeleteContact(id);
        contacts = contacts.filter(c => c.id !== id);
        renderContactsList();
        showToast("Contact deleted");
      } catch (err) { alert("Delete failed: " + err.message); }
    });
  });

  document.querySelectorAll(".contact-item").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-contact-btn")) return;
      const contact = contacts.find(c => c.id === item.dataset.id);
      if (contact && emailRecipients) {
        const current = emailRecipients.value.trim();
        emailRecipients.value = current ? `${current}, ${contact.email}` : contact.email;
        if (contactsModal) contactsModal.style.display = "none";
      }
    });
  });
}

/* =============================================================
   LEGAL RESEARCH RENDERING
   ============================================================= */
async function updateLegalSyncStatus() {
  try {
    const progress = await legalGetSyncProgress();
    legalSyncStatus.textContent = `${progress.total_cases.toLocaleString()} cases | ${progress.total_principles.toLocaleString()} principles | Last sync: ${progress.last_sync === "Never" ? "Never" : new Date(progress.last_sync).toLocaleDateString()}`;
  } catch (err) { legalSyncStatus.textContent = "Sync status unavailable"; }
}

async function performLegalSearch(offset = 0) {
  if (!legalResults) return;
  // Reset to first page on a new search (offset = 0), or use provided offset for pagination
  legalCurrentOffset = offset;
  const query = legalSearchInput ? legalSearchInput.value.trim() : "";

  legalResults.innerHTML = `<div style="padding:20px;color:var(--text-dim);">Searching…</div>`;

  try {
    if (activeLegalView === "cases") {
      const response = await legalSearchCases({
        query,
        court: activeCourt,
        year: activeYear,
        limit: LEGAL_PAGE_SIZE,
        offset: legalCurrentOffset,
      });
      renderCases(response);
    } else {
      const principles = await legalSearchPrinciples(query);
      renderPrinciples(principles);
    }
  } catch (err) {
    legalResults.innerHTML = `<div style="padding:20px;color:var(--amber);">Search failed: ${err.message}</div>`;
  }
}

function renderCases(response) {
  // response: { total, limit, offset, cases[] }
  // Handles both old (bare array) and new (object with cases[]) format for safety
  let cases, total, offset, limit;
  if (Array.isArray(response)) {
    // Legacy format — shouldn't happen after Worker v6 deploys, but safe fallback
    cases = response;
    total = response.length;
    offset = 0;
    limit = response.length;
  } else {
    cases = response.cases || [];
    total = response.total || 0;
    offset = response.offset || 0;
    limit = response.limit || LEGAL_PAGE_SIZE;
  }

  if (cases.length === 0 && total === 0) {
    legalResults.innerHTML = `<div style="padding:20px;color:var(--text-dim);">No cases found</div>`;
    return;
  }

  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + cases.length, total);
  const hasMore = offset + cases.length < total;
  const hasPrev = offset > 0;

  const countBar = `
    <div style="padding:12px 0 8px;color:var(--text-mid);font-size:0.82rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <span>Showing ${pageStart}–${pageEnd} of <strong style="color:var(--text)">${total.toLocaleString()}</strong> cases</span>
      <div style="display:flex;gap:8px;">
        ${hasPrev ? `<button class="btn ghost small" id="casesPrevBtn">← Prev</button>` : ""}
        ${hasMore ? `<button class="btn ghost small" id="casesNextBtn">Next →</button>` : ""}
      </div>
    </div>`;

  const caseCards = cases.map(c => {
    const year = c.case_date ? c.case_date.substring(0, 4) : "—";
    const displayName = c.case_name && c.case_name !== c.citation ? c.case_name : c.citation;
    const principles = (() => {
      try {
        const arr = JSON.parse(c.principles_extracted || "[]");
        return arr.slice(0, 3);
      } catch { return []; }
    })();
    const legislation = (() => {
      try { return JSON.parse(c.legislation_extracted || "[]"); }
      catch { return []; }
    })();
    const legChips = legislation.length > 0 ? `
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
        ${legislation.map(ref => `<button class="leg-ref-chip"
          data-ref="${encodeURIComponent(ref)}"
          style="background:var(--green-dim);border:1px solid var(--green);border-radius:4px;color:var(--green);cursor:pointer;font-family:'DM Mono',monospace;font-size:0.7rem;padding:3px 8px;"
          onclick="lookupLegislationRef(decodeURIComponent(this.dataset.ref))">${ref}</button>`).join("")}
      </div>` : "";

    return `
      <div class="legal-item">
        <div class="legal-item-header">
          <strong>${displayName}</strong>
          <span class="tag tag-${c.court}">${c.citation}</span>
        </div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:6px;">${c.court} · ${year}</div>
        <div class="legal-item-body">
          ${c.facts && c.facts !== "AI extraction failed" ? `<p><strong>Facts:</strong> ${c.facts}</p>` : ""}
          ${c.holding && c.holding !== "AI extraction failed" ? `<p><strong>Holding:</strong> ${c.holding}</p>` : ""}
          ${principles.length > 0 ? `
            <div style="margin-top:6px;">
              <span style="color:var(--text-dim);font-size:0.75rem;">Principles:</span>
              <ul style="margin:4px 0 0 16px;padding:0;font-size:0.8rem;color:var(--text-mid);">
                ${principles.map(p => `<li>${p.principle || p}</li>`).join("")}
              </ul>
            </div>` : ""}
          ${c.procedure_notes ? `
            <details style="margin-top:8px;">
              <summary style="font-size:0.75rem;color:var(--text-dim);cursor:pointer;">Procedure Notes</summary>
              <div class="procedure-notes" style="margin-top:6px;font-size:0.8rem;color:var(--text-mid);white-space:pre-wrap;">${c.procedure_notes}</div>
            </details>` : ""}
          ${legChips}
          ${c.url ? `<a href="${c.url}" target="_blank" class="btn ghost small" style="margin-top:8px;">View on AustLII ↗</a>` : ""}
        </div>
      </div>`;
  }).join("");

  legalResults.innerHTML = countBar + caseCards + (hasMore || hasPrev ? countBar : "");

  // Pagination button handlers
  document.getElementById("casesNextBtn")?.addEventListener("click", () => {
    performLegalSearch(offset + limit);
    legalResults.scrollIntoView({ behavior: "smooth" });
  });
  document.getElementById("casesPrevBtn")?.addEventListener("click", () => {
    performLegalSearch(Math.max(0, offset - limit));
    legalResults.scrollIntoView({ behavior: "smooth" });
  });
}

function renderPrinciples(principles) {
  if (principles.length === 0) {
    legalResults.innerHTML = `<div style="padding:20px;color:var(--text-dim);">No principles found</div>`;
    return;
  }
  legalResults.innerHTML = principles.map(p => `
    <div class="legal-item">
      <div class="legal-item-body">
        <p style="font-weight:500;margin-bottom:8px;">${p.principle_text}</p>
        ${p.keywords.length > 0 ? `<div style="margin-bottom:4px;"><span style="color:var(--text-dim);font-size:0.75rem;">Keywords:</span> ${p.keywords.join(", ")}</div>` : ""}
        ${p.statute_refs.length > 0 ? `<div style="margin-bottom:4px;"><span style="color:var(--text-dim);font-size:0.75rem;">Statutes:</span> ${p.statute_refs.join(", ")}</div>` : ""}
        <div style="margin-top:8px;"><span style="color:var(--text-dim);font-size:0.75rem;">Citations:</span> ${p.case_citations.join(", ")}</div>
        <div style="margin-top:4px;color:var(--gold);font-size:0.75rem;">Most recent: ${p.most_recent_citation}</div>
      </div>
    </div>`).join("");
}

/* =============================================================
   TOAST NOTIFICATIONS
   ============================================================= */
function showToast(msg) {
  const toast = document.getElementById("saveToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = "block";
  toast.className = "save-toast toast-visible";
  setTimeout(() => {
    toast.className = "save-toast toast-out";
    setTimeout(() => { toast.style.display = "none"; }, 400);
  }, 2000);
}

function showOutput(msg, className = "") {
  if (!outputEl) { console.log("Output:", msg); return; }
  outputEl.textContent = msg;
  outputEl.className = className ? `output ${className}` : "output";
}

/* =============================================================
   INITIALIZATION
   ============================================================= */
(async () => {
  try {
    entries = await apiLoadEntries();
    render(entries);

    if (document.getElementById('manageContactsBtn')) await loadContacts();
    if (document.getElementById('legalSyncBtn')) {
      await updateLegalSyncStatus();
      performLegalSearch(0); // load cases on page init so filters work immediately
    }
  } catch (e) {
    if (outputEl) showOutput("Failed to load vault: " + e.message);
    else console.error("Failed to load vault:", e.message);
  }
})();

/* =============================================================
   EVENT HANDLERS — Main Input
   ============================================================= */
processBtn?.addEventListener("click", () => {
  const text = inputEl.value.trim();
  if (!text) return showOutput("Type something to process.");
  const p = processText(text);
  showOutput(`Tag: ${p.tag}\n\nNext: ${p.next}\n\nClarify: ${p.clarify}`);
});

saveBtn?.addEventListener("click", async () => {
  const text = inputEl.value.trim();
  if (!text) return showOutput("Type something to save.");
  const p = processText(text);
  const entry = {
    id: `e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    created_at: new Date().toISOString(),
    text,
    ...p,
  };
  try {
    await apiSaveEntry(entry);
    entries.unshift(entry);
    render(entries);
    inputEl.value = "";
    outputEl.textContent = "";
    outputEl.className = "output";
    showToast("Entry saved");
  } catch (e) { showOutput("Save failed: " + e.message); }
});

draftBtn?.addEventListener("click", async () => {
  if (!checkRate("draft", 3, 10000)) { showOutput("Rate limit: wait before drafting again."); return; }
  const text = inputEl.value.trim();
  if (!text) return showOutput("Type something to draft.");
  const tag = classify(text);
  showOutput("Drafting…", "loading");
  draftBtn.disabled = true;
  try {
    const drafted = await draftEntry(text, tag);
    showOutput(`Drafted version:\n\n${drafted}\n\n— Edit and save as normal.`, "ai-output");
    const useBtn = document.createElement("button");
    useBtn.textContent = "Use Draft";
    useBtn.className = "btn small";
    useBtn.style.marginTop = "8px";
    useBtn.addEventListener("click", () => {
      inputEl.value = drafted;
      outputEl.textContent = "Draft loaded into input. Edit and save when ready.";
      outputEl.className = "output";
    });
    outputEl.appendChild(document.createElement("br"));
    outputEl.appendChild(useBtn);
  } catch (err) { showOutput("Draft failed: " + err.message); }
  finally { draftBtn.disabled = false; }
});

nextActionBtn?.addEventListener("click", async () => {
  if (!checkRate("nextAction", 3, 10000)) { showOutput("Rate limit: wait before requesting next actions again."); return; }
  const text = inputEl.value.trim();
  if (!text) return showOutput("Type something to get next actions for.");
  const p = processText(text);
  showOutput("Generating next actions…", "loading");
  nextActionBtn.disabled = true;
  try {
    const actions = await suggestNextActions(text, p.tag, p.next, p.clarify);
    showOutput(`Tag: ${p.tag}\n\nSuggested next actions:\n${actions}`, "ai-output");
  } catch (err) { showOutput("Next actions failed: " + err.message); }
  finally { nextActionBtn.disabled = false; }
});

emailEntryBtn?.addEventListener("click", () => {
  const text = inputEl.value.trim();
  if (!text) { showOutput("Type something to email."); return; }
  openEmailComposer(text, "Arcanthyr Entry");
});

clearInputBtn?.addEventListener("click", () => {
  inputEl.value = "";
  outputEl.textContent = "";
  outputEl.className = "output";
});

/* =============================================================
   EVENT HANDLERS — Reviews & Relay
   ============================================================= */
reviewBtn?.addEventListener("click", async () => {
  if (!checkRate("review", 2, 30000)) { showOutput("Rate limit: wait 30 seconds before running another review."); return; }
  if (entries.length === 0) { reviewOutput.textContent = "No entries to review yet."; reviewOutput.style.display = "block"; return; }
  reviewOutput.textContent = "Analysing patterns…";
  reviewOutput.style.display = "block";
  reviewBtn.disabled = true;
  try {
    const result = await weeklyReview(entries);
    reviewOutput.innerHTML = result
      .replace(/^(RECURRING THEMES)/m, '<div class="review-section-title">$1</div>')
      .replace(/^(STUCK LOOPS)/m, '<div class="review-section-title">$1</div>')
      .replace(/^(DECISIONS PENDING)/m, '<div class="review-section-title">$1</div>');
  } catch (err) { reviewOutput.textContent = "Review failed: " + err.message; }
  finally { reviewBtn.disabled = false; }
});

document.addEventListener("click", e => {
  if (e.target && e.target.id === "clarifyBtn") startClarifyAgent();
});

relayBtn?.addEventListener("click", async () => {
  if (!checkRate("relay", 2, 30000)) { showOutput("Rate limit: wait 30 seconds before running Axiom Relay again."); return; }
  if (entries.length === 0) {
    const relayOutput = document.getElementById("relayOutput");
    if (relayOutput) { relayOutput.textContent = "No entries to relay."; relayOutput.style.display = "block"; }
    return;
  }
  relayBtn.disabled = true;
  const relayOutput = document.getElementById("relayOutput");
  if (relayOutput) { relayOutput.textContent = "Relay initialising — Stage 1: Decompose…"; relayOutput.style.display = "block"; }

  const focus = document.getElementById("relayFocus")?.value.trim() || "";
  let stageIdx = 0;
  const stages = ["Relay initialising — Stage 1: Decompose…", "Stage 2: Finding tensions…", "Stage 3: Synthesising report…"];
  const stageTimer = setInterval(() => {
    stageIdx++;
    if (stageIdx < stages.length && relayOutput) relayOutput.textContent = stages[stageIdx];
  }, 2500);

  try {
    const result = await axiomRelay(entries, focus);
    clearInterval(stageTimer);
    renderRelayReport(result);
  } catch (err) {
    clearInterval(stageTimer);
    if (relayOutput) relayOutput.textContent = "Relay failed: " + err.message;
  } finally { relayBtn.disabled = false; }
});

/* =============================================================
   EVENT HANDLERS — Search & Filters (vault)
   ============================================================= */
let _searchDebounce = null;
searchInput?.addEventListener("input", () => {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => { searchKeyword = searchInput.value; render(entries); }, 200);
});

tagFilters?.addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const tag = chip.dataset.tag;
  if (!tag) return;
  activeTag = tag;
  tagFilters.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.tag === tag));
  render(entries);
});

document.querySelectorAll(".date-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    activeDateRange = chip.dataset.range;
    document.querySelectorAll(".date-chip").forEach(c => c.classList.toggle("active", c.dataset.range === activeDateRange));
    render(entries);
  });
});

document.getElementById("clearFiltersBtn")?.addEventListener("click", () => {
  activeTag = "all";
  activeDateRange = "all";
  searchKeyword = "";
  if (searchInput) searchInput.value = "";
  document.querySelectorAll(".chip[data-tag]").forEach(c => c.classList.toggle("active", c.dataset.tag === "all"));
  document.querySelectorAll(".date-chip").forEach(c => c.classList.toggle("active", c.dataset.range === "all"));
  render(entries);
});

/* =============================================================
   EVENT HANDLERS — Email
   ============================================================= */
sendEmailBtn?.addEventListener("click", async () => {
  const to = emailRecipients.value.trim().split(",").map(e => e.trim()).filter(Boolean);
  const subject = emailSubject.value.trim();
  const body = emailBody.value.trim();
  if (to.length === 0 || !subject || !body) { emailOutput.textContent = "Please fill in all fields"; emailOutput.className = "output"; return; }

  emailOutput.textContent = "Sending email…";
  emailOutput.className = "output loading";
  sendEmailBtn.disabled = true;
  try {
    await emailSend(to, subject, body);
    emailOutput.textContent = "Email sent successfully!";
    emailOutput.className = "output";
    showToast("Email sent");
    setTimeout(closeEmailComposer, 2000);
  } catch (err) { emailOutput.textContent = "Send failed: " + err.message; emailOutput.className = "output"; }
  finally { sendEmailBtn.disabled = false; }
});

cancelEmailBtn?.addEventListener("click", closeEmailComposer);

manageContactsBtn?.addEventListener("click", () => {
  contactsModal.style.display = "block";
  renderContactsList();
});

closeContactsBtn?.addEventListener("click", () => { contactsModal.style.display = "none"; });

addContactBtn?.addEventListener("click", async () => {
  const name = document.getElementById("newContactName").value.trim();
  const email = document.getElementById("newContactEmail").value.trim();
  if (!name || !email) { alert("Please enter both name and email"); return; }
  try {
    const newContact = await emailAddContact(name, email);
    contacts.push(newContact);
    renderContactsList();
    document.getElementById("newContactName").value = "";
    document.getElementById("newContactEmail").value = "";
    showToast("Contact added");
  } catch (err) { alert("Add contact failed: " + err.message); }
});

addFromContactsBtn?.addEventListener("click", () => {
  contactsModal.style.display = "block";
  renderContactsList();
});

/* =============================================================
   EVENT HANDLERS — Legal Research
   ============================================================= */
legalSyncBtn?.addEventListener("click", async () => {
  if (!confirm("Check for new cases from AustLII? This will fetch recent Tasmanian criminal decisions.")) return;
  legalSyncBtn.disabled = true;
  legalSyncStatus.textContent = "Checking for new cases…";
  try {
    const result = await legalTriggerSync();
    showToast(`Found ${result.cases_processed} new cases`);
    await updateLegalSyncStatus();
    if (result.cases_processed > 0) performLegalSearch();
  } catch (err) { legalSyncStatus.textContent = "Sync failed: " + err.message; }
  finally { legalSyncBtn.disabled = false; }
});

// NOTE: backfillYearBtn handler intentionally removed.
// The Python scraper (austlii_scraper.py) on the VPS handles all backfill.
// The Worker-side backfill hits CPU time limits on large years and is not reliable.
// The button can be removed from legal.html in the next HTML pass.

// Upload case form toggle
const toggleUploadBtn = document.getElementById("toggleUploadBtn");
const uploadCaseForm = document.getElementById("uploadCaseForm");
toggleUploadBtn?.addEventListener("click", () => {
  const isVisible = uploadCaseForm.style.display !== "none";
  uploadCaseForm.style.display = isVisible ? "none" : "block";
  toggleUploadBtn.textContent = isVisible ? "Show Upload" : "Hide Upload";
  if (!isVisible) initDropzone();
});

document.getElementById("cancelUploadBtn")?.addEventListener("click", () => {
  uploadCaseForm.style.display = "none";
  toggleUploadBtn.textContent = "Show Upload";
  document.getElementById("uploadCitation").value = "";
  document.getElementById("uploadCaseName").value = "";
  document.getElementById("uploadCaseText").value = "";
  document.getElementById("uploadOutput").style.display = "none";
});

document.getElementById("uploadCaseBtn")?.addEventListener("click", async () => {
  const citation = document.getElementById("uploadCitation").value.trim();
  const caseName = document.getElementById("uploadCaseName").value.trim();
  const court = document.getElementById("uploadCourt").value;
  const caseText = document.getElementById("uploadCaseText").value.trim();
  const uploadOutput = document.getElementById("uploadOutput");

  if (!citation || !caseText) {
    uploadOutput.textContent = "Please provide at least citation and case text";
    uploadOutput.className = "output";
    uploadOutput.style.display = "block";
    return;
  }

  uploadOutput.textContent = "Processing case with AI… this may take up to 60 seconds";
  uploadOutput.className = "output loading";
  uploadOutput.style.display = "block";
  document.getElementById("uploadCaseBtn").disabled = true;

  try {
    const result = await legalUploadCase(caseText, citation, caseName, court);
    // result.case_name now comes from Llama extraction
    uploadOutput.textContent = `✓ Successfully processed: ${result.citation}\nCase name: ${result.case_name}\n\nExtracted ${result.summary.principles.length} legal principles.\n\nCase added to database and searchable now.`;
    uploadOutput.className = "output";
    setTimeout(() => {
      document.getElementById("uploadCitation").value = "";
      document.getElementById("uploadCaseName").value = "";
      document.getElementById("uploadCaseText").value = "";
      uploadCaseForm.style.display = "none";
      toggleUploadBtn.textContent = "Show Upload";
    }, 4000);
    await updateLegalSyncStatus();
    performLegalSearch();
    showToast("Case uploaded and processed");
  } catch (err) {
    uploadOutput.textContent = "Upload failed: " + err.message;
    uploadOutput.className = "output";
  } finally { document.getElementById("uploadCaseBtn").disabled = false; }
});

let _legalSearchDebounce = null;
legalSearchInput?.addEventListener("input", () => {
  clearTimeout(_legalSearchDebounce);
  _legalSearchDebounce = setTimeout(() => performLegalSearch(0), 400);
});

courtFilters?.addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const court = chip.dataset.court;
  if (!court) return;
  activeCourt = court;
  courtFilters.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.court === court));
  performLegalSearch(0);
});

// Year filter chips — expects chips with data-year attribute in legal.html
document.querySelectorAll(".year-chip")?.forEach(chip => {
  chip.addEventListener("click", () => {
    activeYear = chip.dataset.year || "all";
    document.querySelectorAll(".year-chip").forEach(c => c.classList.toggle("active", c.dataset.year === activeYear));
    performLegalSearch(0);
  });
});

document.querySelectorAll(".legal-view").forEach(chip => {
  chip.addEventListener("click", () => {
    activeLegalView = chip.dataset.view;
    document.querySelectorAll(".legal-view").forEach(c => c.classList.toggle("active", c.dataset.view === activeLegalView));
    performLegalSearch(0);
  });
});

/* =============================================================
   EVENT HANDLERS — History Management
   ============================================================= */
clearBtn?.addEventListener("click", async () => {
  if (!checkRate("clearAll", 1, 15000)) { showOutput("Rate limit: wait before clearing again."); return; }
  if (!confirm("Clear all entries from the vault? This cannot be undone.")) return;
  try {
    await apiClearAll();
    entries = [];
    render(entries);
    showOutput("Vault cleared.");
  } catch (e) { showOutput("Clear failed: " + e.message); }
});

exportBtn?.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "arcanthyr_console_export.json";
  a.click();
  URL.revokeObjectURL(url);
});

restoreBtn?.addEventListener("click", async () => {
  if (!checkRate("restore", 2, 10000)) { showOutput("Rate limit: wait before restoring again."); return; }
  try {
    await apiRestoreAll();
    entries = await apiLoadEntries();
    render(entries);
    showOutput("All entries restored.");
  } catch (e) { showOutput("Restore failed: " + e.message); }
});

/* =============================================================
   LEGAL CASE FILE UPLOAD (PDF / TXT)
   ============================================================= */
function initDropzone() {
  const caseDropzone = document.getElementById('caseDropzone');
  const caseFileInput = document.getElementById('caseFileInput');
  if (!caseDropzone || !caseFileInput || caseDropzone._init) return;
  caseDropzone._init = true;

  caseDropzone.addEventListener('click', () => caseFileInput.click());
  caseDropzone.addEventListener('dragover', (e) => { e.preventDefault(); caseDropzone.classList.add('dragover'); });
  caseDropzone.addEventListener('dragleave', () => caseDropzone.classList.remove('dragover'));
  caseDropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    caseDropzone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) await handleCaseFile(files[0]);
  });
  caseFileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) await handleCaseFile(files[0]);
    e.target.value = '';
  });

  console.log('[Arcanthyr] Dropzone ready');
}

async function handleCaseFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'txt'].includes(extension)) {
    document.getElementById('uploadCaseText').value = `Error: Unsupported file type. Please use PDF or TXT.`;
    return;
  }
  document.getElementById('uploadCaseText').value = 'Extracting text from file...';
  try {
    let extractedText = '';
    if (extension === 'txt') {
      extractedText = await file.text();
    } else if (extension === 'pdf' && typeof pdfjsLib !== 'undefined') {
      extractedText = await extractPdfTextForCase(file);
    } else {
      throw new Error('PDF.js library not loaded');
    }
    document.getElementById('uploadCaseText').value = extractedText.trim();
    autoFillCaseMetadata(extractedText);
    const caseDropzone = document.getElementById('caseDropzone');
    if (caseDropzone) {
      const orig = caseDropzone.innerHTML;
      caseDropzone.innerHTML = '<div class="dropzone-text" style="color:var(--green);">✓ Text extracted successfully</div>';
      setTimeout(() => { caseDropzone.innerHTML = orig; }, 3000);
    }
  } catch (error) {
    console.error('Error extracting text:', error);
    document.getElementById('uploadCaseText').value = `Error extracting text: ${error.message}\n\nPlease paste case text manually.`;
  }
}

async function extractPdfTextForCase(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n\n';
  }
  return fullText;
}

function autoFillCaseMetadata(text) {
  // Only search the first 1500 chars (header) to avoid picking up cited cases
  const header = text.substring(0, 1500);

  const citationMatch = header.match(/\[(\d{4})\]\s+(TASSC|TAMagC|TASCCA|TASMC)\s+(\d+)/) ||
    text.match(/\[(\d{4})\]\s+(TASSC|TAMagC|TASCCA|TASMC)\s+(\d+)/);
  if (citationMatch) {
    const el = document.getElementById('uploadCitation');
    if (el) el.value = citationMatch[0];
  }

  // Note: case name from the form is just a hint — Llama will extract the real name.
  // autoFillCaseMetadata still fills it as a convenience, but Worker will override it.
  const caseNameMatch = header.match(/((?:R|DPP|Director of Public Prosecutions|Police|[A-Z][a-z]+)\s+v\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (caseNameMatch) {
    const el = document.getElementById('uploadCaseName');
    if (el) el.value = caseNameMatch[1];
  }

  const courtEl = document.getElementById('uploadCourt');
  if (courtEl) {
    if (text.includes('Court of Criminal Appeal') || text.includes('TASCCA')) courtEl.value = 'cca';
    else if (text.includes('Supreme Court') || text.includes('TASSC')) courtEl.value = 'supreme';
    else if (text.includes('Magistrates') || text.includes('TAMagC') || text.includes('TASMC')) courtEl.value = 'magistrates';
  }
}

/* ── Legislation click-through ─────────────────────────────────────────────
   Called when a user clicks a legislation chip on a case card.
   Parses "Criminal Code Act 1924 (Tas) s 389" into title/jurisdiction/section,
   calls the section-lookup endpoint, and displays the result in a modal.
   ──────────────────────────────────────────────────────────────────────── */
async function lookupLegislationRef(ref) {
  // Parse ref: "Criminal Code Act 1924 (Tas) s 389" or "Evidence Act 2001 s 38"
  // Extract jurisdiction from parentheses if present
  const jurMatch = ref.match(/\(([A-Za-z]{2,4})\)/);
  const jurisdiction = jurMatch ? jurMatch[1] : 'Tas';

  // Extract section number — everything after " s " or " s. "
  const secMatch = ref.match(/\bs\.?\s+(\S+)/i);
  if (!secMatch) { showLegModal(ref, null, 'Could not parse section number from: ' + ref); return; }
  const section = secMatch[1];

  // Title is everything before "(Jurisdiction)" or before " s "
  let title = ref
    .replace(/\s*\([A-Za-z]{2,4}\)/, '')   // strip (Tas)
    .replace(/\s+s\.?\s+\S+.*$/, '')         // strip s 389 onwards
    .trim();

  showLegModal(ref, null, 'Looking up ' + ref + '…');

  try {
    const r = await fetch('/api/legal/section-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, jurisdiction, section })
    });
    const data = await r.json();
    const res = data.result || data;
    if (!res.found) {
      showLegModal(ref, null, res.message || 'Section not found. Upload the Act first.');
      return;
    }
    showLegModal(ref, res, null);
  } catch (err) {
    showLegModal(ref, null, 'Lookup error: ' + err.message);
  }
}

function showLegModal(ref, section, errorMsg) {
  // Remove any existing modal
  document.getElementById('legModal')?.remove();

  const content = errorMsg
    ? `<p style="color:var(--amber);font-size:0.85rem;">${errorMsg}</p>`
    : `<div style="color:var(--text-dim);font-size:0.72rem;margin-bottom:8px;">
         ${section.title} (${section.jurisdiction}) ${section.year || ''} — s ${section.section_number}
       </div>
       <div style="color:var(--text);font-size:0.9rem;font-weight:500;margin-bottom:12px;">
         ${section.heading || ''}
       </div>
       <div style="color:var(--text-mid);font-size:0.82rem;line-height:1.8;white-space:pre-wrap;">${section.text || ''}</div>`;

  const modal = document.createElement('div');
  modal.id = 'legModal';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);max-width:680px;width:100%;max-height:80vh;overflow-y:auto;padding:24px;position:relative;">
        <button onclick="document.getElementById('legModal').remove()"
          style="position:absolute;top:12px;right:12px;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.2rem;line-height:1;">✕</button>
        <div style="font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-dim);margin-bottom:16px;">${ref}</div>
        ${content}
      </div>
    </div>`;

  // Close on backdrop click
  modal.querySelector('div').addEventListener('click', e => {
    if (e.target === modal.querySelector('div')) modal.remove();
  });

  document.body.appendChild(modal);
}

/* =============================================================
   PROCESS DOCUMENT — corpus ingest pipeline
   ============================================================= */
(function initProcessDocument() {
  const dropzone   = document.getElementById('processDocDropzone');
  const fileInput  = document.getElementById('processDocFileInput');
  const uploadBtn  = document.getElementById('processDocUploadBtn');
  const statusBox  = document.getElementById('processDocStatus');

  if (!dropzone || !fileInput || !uploadBtn) return;  // not on this page

  let selectedFile = null;
  let pollTimer    = null;

  // ── Dropzone ──────────────────────────────────────────────
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) setFile(file);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
  });

  function setFile(file) {
    selectedFile = file;
    dropzone.querySelector('.dropzone-text').textContent = `✓ ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    uploadBtn.disabled = false;
  }

  // ── Status display helpers ─────────────────────────────────
  function showStatus(job) {
    statusBox.style.display = 'block';

    const badge = document.getElementById('processDocStatusBadge');
    const badgeColors = { queued: 'var(--text-dim)', extracting: 'var(--gold)', splitting: 'var(--gold)', enriching: 'var(--gold)', inserting: 'var(--gold)', complete: '#81c784', failed: '#e57373' };
    badge.textContent = job.status.toUpperCase();
    badge.style.color = badgeColors[job.status] || 'var(--gold)';

    const progressEl = document.getElementById('processDocBlockProgress');
    if (job.total_blocks && job.block_current) {
      progressEl.style.display = 'block';
      progressEl.textContent = `Block ${job.block_current} of ${job.total_blocks}`;
    } else if (job.total_blocks) {
      progressEl.style.display = 'block';
      progressEl.textContent = `${job.total_blocks} block${job.total_blocks !== 1 ? 's' : ''} detected`;
    } else {
      progressEl.style.display = 'none';
    }

    document.getElementById('processDocChunksParsed').textContent   = job.chunks_parsed   || 0;
    document.getElementById('processDocChunksInserted').textContent = job.chunks_inserted || 0;
    document.getElementById('processDocChunksSkipped').textContent  = job.chunks_skipped  || 0;

    const errEl = document.getElementById('processDocErrors');
    if (job.errors && job.errors.length > 0) {
      errEl.style.display = 'block';
      errEl.textContent = job.errors.slice(-3).join('\n');  // last 3 errors
    } else if (job.error) {
      errEl.style.display = 'block';
      errEl.textContent = job.error;
    } else {
      errEl.style.display = 'none';
    }
  }

  // ── Poll ──────────────────────────────────────────────────
  function startPolling(jobId) {
    pollTimer = setInterval(async () => {
      try {
        const r = await fetch(`${INGEST_BASE}/status/${jobId}`);
        const data = await r.json();
        const job = data.result || data;
        showStatus(job);
        if (job.status === 'complete' || job.status === 'failed') {
          clearInterval(pollTimer);
          uploadBtn.disabled = false;
          uploadBtn.textContent = 'Upload & Process';
        }
      } catch (err) {
        clearInterval(pollTimer);
        document.getElementById('processDocStatusBadge').textContent = 'POLL ERROR';
        document.getElementById('processDocErrors').style.display = 'block';
        document.getElementById('processDocErrors').textContent = err.message;
      }
    }, 5000);
  }

  // ── Upload ────────────────────────────────────────────────
  uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading…';
    if (pollTimer) clearInterval(pollTimer);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const file_b64 = btoa(binary);

      const promptMode = document.getElementById('processDocPromptMode').value;

      const r = await fetch(`${INGEST_BASE}/upload-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_b64, filename: selectedFile.name, prompt_mode: promptMode }),
      });

      const data = await r.json();
      const result = data.result || data;

      if (data.error || result.error) throw new Error(data.error || result.error);

      showStatus({ status: result.status || 'queued', chunks_parsed: 0, chunks_inserted: 0, chunks_skipped: 0, errors: [] });
      uploadBtn.textContent = 'Processing…';
      startPolling(result.job_id);

    } catch (err) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload & Process';
      statusBox.style.display = 'block';
      document.getElementById('processDocStatusBadge').textContent = 'ERROR';
      document.getElementById('processDocStatusBadge').style.color = '#e57373';
      document.getElementById('processDocErrors').style.display = 'block';
      document.getElementById('processDocErrors').textContent = err.message;
    }
  });
})();
