console.log("APP v6 LOADED");

/* =============================================================
   SCHEMA VERSION
   ============================================================= */
const SCHEMA_VERSION = 1;

/* =============================================================
   API BASES
   ============================================================= */
const API_BASE = "https://arcanthyr-api.virtual-wiseman-operations.workers.dev/api/entries";
const AI_BASE  = "https://arcanthyr-api.virtual-wiseman-operations.workers.dev/api/ai";

/* =============================================================
   DOM refs
   ============================================================= */
const inputEl       = document.getElementById("input");
const outputEl      = document.getElementById("output");
const historyEl     = document.getElementById("history");
const historyCount  = document.getElementById("historyCount");
const processBtn    = document.getElementById("processBtn");
const saveBtn       = document.getElementById("saveBtn");
const draftBtn      = document.getElementById("draftBtn");
const nextActionBtn = document.getElementById("nextActionBtn");
const clearInputBtn = document.getElementById("clearInputBtn");
const clearBtn      = document.getElementById("clearBtn");
const exportBtn     = document.getElementById("exportBtn");
const relayBtn      = document.getElementById("relayBtn");
const restoreBtn    = document.getElementById("restoreBtn");
const reviewBtn     = document.getElementById("reviewBtn");
const reviewOutput  = document.getElementById("reviewOutput");
const searchInput   = document.getElementById("searchInput");
const tagFilters    = document.getElementById("tagFilters");
const filterSummary = document.getElementById("filterSummary");

/* =============================================================
   RATE LIMITER (client-side, prevents accidental spam)
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
   All AI requests go to your Worker — API key never in browser.
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

async function draftEntry(text, tag) {
  return aiCall("draft", { text, tag });
}

async function suggestNextActions(text, tag, next, clarify) {
  return aiCall("next-actions", { text, tag, next, clarify });
}

async function weeklyReview(entries) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = entries.filter(e => new Date(e.created_at).getTime() > sevenDaysAgo);
  const sample = recent.length > 0 ? recent : entries.slice(-30);
  const slim = sample.map(e => ({ tag: e.tag, text: e.text }));
  return aiCall("weekly-review", { entries: slim });
}

/* =============================================================
   SCHEMA MIGRATION
   ============================================================= */
function migrateEntry(e) {
  const v = e._v || 0;
  if (v < 1) {
    e.draft = e.draft || null;
    e._v = 1;
  }
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
    case "task":     return "Define the smallest next action and a time: who/what/when.";
    case "decision": return "Write 2 options + the downside if wrong + one reversible test.";
    case "question": return "State what a good answer would let you do. Then list 2 constraints.";
    case "idea":     return "Turn it into a 1-sentence pitch + first tiny prototype step.";
    default:         return "Rewrite as one clear sentence. Then add one concrete next action.";
  }
}

function clarifyQuestion(tag) {
  switch (tag) {
    case "task":     return "What's the deadline, and what is 'done' in one sentence?";
    case "decision": return "What would change your mind most?";
    case "question": return "What context is missing that makes this hard to answer?";
    case "idea":     return "Who is this for, and what pain does it remove?";
    default:         return "Is this something you want to act on, or just capture?";
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

function getFilteredEntries(entries) {
  let result = [...entries];

  if (activeTag !== "all") {
    result = result.filter(e => e.tag === activeTag);
  }

  if (activeDateRange !== "all") {
    const now = Date.now();
    const cutoffs = {
      today: now - 24 * 60 * 60 * 1000,
      week:  now - 7  * 24 * 60 * 60 * 1000,
      month: now - 30 * 24 * 60 * 60 * 1000,
    };
    const cutoff = cutoffs[activeDateRange];
    if (cutoff) result = result.filter(e => new Date(e.created_at).getTime() > cutoff);
  }

  if (searchKeyword.trim()) {
    const kw = searchKeyword.trim().toLowerCase();
    result = result.filter(e =>
      e.text.toLowerCase().includes(kw) ||
      (e.next    || "").toLowerCase().includes(kw) ||
      (e.clarify || "").toLowerCase().includes(kw) ||
      (e.draft   || "").toLowerCase().includes(kw)
    );
  }

  return result;
}

function updateFilterSummary(filtered, total) {
  if (filtered.length === total && !searchKeyword.trim() && activeTag === "all" && activeDateRange === "all") {
    filterSummary.textContent = "";
    historyCount.textContent = `${total} ${total === 1 ? "entry" : "entries"}`;
  } else {
    filterSummary.textContent = `Showing ${filtered.length} of ${total} entries`;
    historyCount.textContent = `${filtered.length} of ${total} ${total === 1 ? "entry" : "entries"}`;
  }
}

/* =============================================================
   UI HELPERS
   ============================================================= */
function showOutput(msg, mode = "") {
  outputEl.textContent = msg;
  outputEl.className = "output" + (mode ? " " + mode : "");
}

function highlightKeyword(text, kw) {
  if (!kw) return escapeHtml(text);
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escapeHtml(text).replace(
    new RegExp(escaped, "gi"),
    m => `<mark>${m}</mark>`
  );
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let _saveToastTimer = null;
function showSaveFeedback(msg = "✓ Entry saved") {
  const toast = document.getElementById("saveToast");
  if (_saveToastTimer) clearTimeout(_saveToastTimer);
  toast.textContent = msg;
  toast.className = "save-toast toast-visible";
  toast.style.display = "block";
  _saveToastTimer = setTimeout(() => {
    toast.className = "save-toast toast-out";
    _saveToastTimer = setTimeout(() => {
      toast.style.display = "none";
      toast.className = "save-toast";
    }, 400);
  }, 1500);
}

/* =============================================================
   RENDER
   ============================================================= */
function render(entries) {
  historyEl.innerHTML = "";

  const filtered = getFilteredEntries(entries);
  updateFilterSummary(filtered, entries.length);

  if (!filtered.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    const title = entries.length === 0 ? "No entries yet." : "No entries match your filters.";
    const sub = entries.length === 0
      ? "Create your first record to begin."
      : "Try adjusting your search or filters.";
    empty.innerHTML = `<span class='empty-title'>${title}</span><span class='empty-sub'>${sub}</span>`;
    historyEl.appendChild(empty);
    return;
  }

  const newestFirst = [...filtered].reverse();
  const kw = searchKeyword.trim().toLowerCase();

  for (const e of newestFirst) {
    const li = document.createElement("li");
    li.className = "item";

    const meta = document.createElement("div");
    meta.className = "meta";
    const tagEl = document.createElement("span");
    tagEl.className = `tag tag-${e.tag}`;
    tagEl.textContent = e.tag;
    const timeEl = document.createElement("span");
    timeEl.textContent = new Date(e.created_at).toLocaleString();
    meta.appendChild(tagEl);
    meta.appendChild(timeEl);

    const textEl = document.createElement("div");
    textEl.innerHTML = highlightKeyword(e.text, kw);

    let draftEl = null;
    if (e.draft) {
      draftEl = document.createElement("div");
      draftEl.style.cssText = "margin-top:8px;padding:10px 12px;background:var(--surface-raise);border-radius:6px;border-left:2px solid var(--blue);font-size:0.8125rem;color:var(--text-mid);line-height:1.75;";
      draftEl.innerHTML = `<span style="font-size:0.6rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--blue);display:block;margin-bottom:4px;">Drafted</span>${highlightKeyword(e.draft, kw)}`;
    }

    const agentEl = document.createElement("div");
    agentEl.style.cssText = "margin-top:8px;opacity:0.9;font-size:0.8rem;white-space:pre-wrap;";
    agentEl.textContent = "Next: " + e.next + "\nQuestion: " + e.clarify;

    const actions = document.createElement("div");
    actions.className = "row";
    actions.style.marginTop = "10px";

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "btn ghost small";
    deleteBtn.addEventListener("click", async () => {
      if (!checkRate("delete_" + e.id, 2, 3000)) {
        showOutput("Slow down — wait a moment before deleting again.");
        return;
      }
      try {
        await apiDeleteEntry(e.id);
        entries = entries.filter(x => x.id !== e.id);
        render(entries);
        showOutput("Entry deleted.");
      } catch (err) {
        showOutput("Delete failed: " + err.message);
      }
    });

    actions.appendChild(deleteBtn);
    li.appendChild(meta);
    li.appendChild(textEl);
    if (draftEl) li.appendChild(draftEl);
    li.appendChild(agentEl);
    li.appendChild(actions);
    historyEl.appendChild(li);
  }
}

/* =============================================================
   BOOT
   ============================================================= */
let entries = [];

(async () => {
  try {
    entries = await apiLoadEntries();
    render(entries);
    showOutput("Vault connected.");
  } catch (e) {
    render(entries);
    showOutput("Vault not reachable: " + e.message);
  }
})();

/* =============================================================
   EVENTS
   ============================================================= */
processBtn.addEventListener("click", () => {
  const text = inputEl.value.trim();
  if (!text) return showOutput("Type something first.");
  const p = processText(text);
  showOutput(`Tag: ${p.tag}\nNext: ${p.next}\nQuestion: ${p.clarify}`);
});

saveBtn.addEventListener("click", async () => {
  if (!checkRate("save", 5, 8000)) {
    showOutput("Rate limit: wait a moment before saving again.");
    return;
  }
  const text = inputEl.value.trim();
  if (!text) return showOutput("Nothing to save.");

  const p = processText(text);
  const entry = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    text,
    draft: null,
    _v: SCHEMA_VERSION,
    ...p,
  };

  try {
    await apiSaveEntry(entry);
    entries.push(entry);
    render(entries);
    showSaveFeedback();
    inputEl.value = "";
  } catch (e) {
    showOutput("Save failed: " + e.message);
  }
});

draftBtn.addEventListener("click", async () => {
  if (!checkRate("draft", 3, 10000)) {
    showOutput("Rate limit: wait before requesting another draft.");
    return;
  }
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
  } catch (err) {
    showOutput("Draft failed: " + err.message);
  } finally {
    draftBtn.disabled = false;
  }
});

nextActionBtn.addEventListener("click", async () => {
  if (!checkRate("nextAction", 3, 10000)) {
    showOutput("Rate limit: wait before requesting next actions again.");
    return;
  }
  const text = inputEl.value.trim();
  if (!text) return showOutput("Type something to get next actions for.");

  const p = processText(text);
  showOutput("Generating next actions…", "loading");
  nextActionBtn.disabled = true;

  try {
    const actions = await suggestNextActions(text, p.tag, p.next, p.clarify);
    showOutput(`Tag: ${p.tag}\n\nSuggested next actions:\n${actions}`, "ai-output");
  } catch (err) {
    showOutput("Next actions failed: " + err.message);
  } finally {
    nextActionBtn.disabled = false;
  }
});

reviewBtn.addEventListener("click", async () => {
  if (!checkRate("review", 2, 30000)) {
    showOutput("Rate limit: wait 30 seconds before running another review.");
    return;
  }
  if (entries.length === 0) {
    reviewOutput.textContent = "No entries to review yet.";
    reviewOutput.style.display = "block";
    return;
  }

  reviewOutput.textContent = "Analysing patterns…";
  reviewOutput.style.display = "block";
  reviewBtn.disabled = true;

  try {
    const result = await weeklyReview(entries);
    reviewOutput.innerHTML = result
      .replace(/^(RECURRING THEMES)/m, '<div class="review-section-title">$1</div>')
      .replace(/^(STUCK LOOPS)/m, '<div class="review-section-title">$1</div>')
      .replace(/^(DECISIONS PENDING)/m, '<div class="review-section-title">$1</div>');
  } catch (err) {
    reviewOutput.textContent = "Review failed: " + err.message;
  } finally {
    reviewBtn.disabled = false;
  }
});

let _searchDebounce = null;
searchInput.addEventListener("input", () => {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => {
    searchKeyword = searchInput.value;
    render(entries);
  }, 200);
});

tagFilters.addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const tag = chip.dataset.tag;
  if (!tag) return;
  activeTag = tag;
  tagFilters.querySelectorAll(".chip").forEach(c =>
    c.classList.toggle("active", c.dataset.tag === tag)
  );
  render(entries);
});

document.querySelectorAll(".date-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    activeDateRange = chip.dataset.range;
    document.querySelectorAll(".date-chip").forEach(c =>
      c.classList.toggle("active", c.dataset.range === activeDateRange)
    );
    render(entries);
  });
});

document.getElementById("clearFiltersBtn").addEventListener("click", () => {
  activeTag = "all";
  activeDateRange = "all";
  searchKeyword = "";
  searchInput.value = "";
  document.querySelectorAll(".chip[data-tag]").forEach(c =>
    c.classList.toggle("active", c.dataset.tag === "all")
  );
  document.querySelectorAll(".date-chip").forEach(c =>
    c.classList.toggle("active", c.dataset.range === "all")
  );
  render(entries);
});

clearInputBtn.addEventListener("click", () => {
  inputEl.value = "";
  outputEl.textContent = "";
  outputEl.className = "output";
});

clearBtn.addEventListener("click", async () => {
  if (!checkRate("clearAll", 1, 15000)) {
    showOutput("Rate limit: wait before clearing again.");
    return;
  }
  if (!confirm("Clear all entries from the vault? This cannot be undone.")) return;
  try {
    await apiClearAll();
    entries = [];
    render(entries);
    showOutput("Vault cleared.");
  } catch (e) {
    showOutput("Clear failed: " + e.message);
  }
});

exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "arcanthyr_console_export.json";
  a.click();
  URL.revokeObjectURL(url);
});

relayBtn.addEventListener("click", () => {
  showOutput("Axiom Relay: not yet implemented.");
});

restoreBtn.addEventListener("click", async () => {
  if (!checkRate("restore", 2, 10000)) {
    showOutput("Rate limit: wait before restoring again.");
    return;
  }
  try {
    await apiRestoreAll();
    entries = await apiLoadEntries();
    render(entries);
    showOutput("All entries restored.");
  } catch (e) {
    showOutput("Restore failed: " + e.message);
  }
});