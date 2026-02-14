console.log("APP LOADED");
const inputEl = document.getElementById("input");
const outputEl = document.getElementById("output");
const historyEl = document.getElementById("history");

const processBtn = document.getElementById("processBtn");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const exportBtn = document.getElementById("exportBtn");
const relayBtn = document.getElementById("relayBtn");
const restoreBtn = document.getElementById("restoreBtn");

const API_BASE = "https://arcanthyr-api.virtual-wiseman-operations.workers.dev/api/entries";

// ---------- Vault API ----------
async function apiLoadEntries() {
  const r = await fetch(API_BASE, { method: "GET" });
  if (!r.ok) throw new Error(`Failed to load entries: ${r.status}`);
  const data = await r.json();
  // API returns newest-first (ORDER BY created_at DESC); reverse once so local
  // array is oldest-first. render() then reverses again to display newest-first.
  return (data.entries || []).slice().reverse();
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
  const r = await fetch(API_BASE + "/" + id, { method: "DELETE" });
  if (!r.ok) throw new Error(`Failed to delete entry: ${r.status}`);
}

async function apiRestoreAll() {
  const r = await fetch(API_BASE, { method: "PATCH" });
  if (!r.ok) throw new Error(`Failed to restore entries: ${r.status}`);
}

// ---------- Agent logic ----------
function classify(text) {
  const t = text.trim().toLowerCase();
  const hasQuestionWord = /^(how|why|what|where|when|who)\b/.test(t) || t.includes("?");
  const decisionCue = /\b(should i|decide|choice|either|or)\b/.test(t);
  const taskCue = /\b(today|tomorrow|next week|by |due |call |email |book |schedule |pay )\b/.test(t);
  const ideaCue = /\b(idea|concept|maybe|what if|could we)\b/.test(t);

  if (decisionCue) return "decision";
  if (hasQuestionWord) return "question";
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
  return { tag, next: nextStep(tag), clarify: clarifyQuestion(tag) };
}

// ---------- UI ----------
function showOutput(msg) {
  outputEl.textContent = msg;
}

let _saveToastTimer = null;
function showSaveFeedback() {
  const toast = document.getElementById("saveToast");
  // Clear any in-flight timers so rapid saves don't stack
  if (_saveToastTimer) clearTimeout(_saveToastTimer);
  toast.className = "save-toast toast-visible";
  _saveToastTimer = setTimeout(() => {
    toast.className = "save-toast toast-out";
    _saveToastTimer = setTimeout(() => {
      toast.className = "save-toast";
    }, 400); // matches toast-fade duration
  }, 1500);
}

function render(entries) {
  historyEl.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.innerHTML = "<span class='empty-title'>No entries yet.</span><span class='empty-sub'>Create your first record to begin.</span>";
    historyEl.appendChild(empty);
    return;
  }

  // entries is stored oldest-first internally; display newest-first
  const newestFirst = [...entries].reverse();
  for (const e of newestFirst) {
    const li = document.createElement("li");
    li.className = "item";

    const meta = document.createElement("div");
    meta.className = "meta";

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = e.tag;

    const time = document.createElement("span");
    time.textContent = new Date(e.created_at).toLocaleString();

    meta.appendChild(tag);
    meta.appendChild(time);

    const text = document.createElement("div");
    text.textContent = e.text;

    const agent = document.createElement("div");
    agent.style.marginTop = "8px";
    agent.style.opacity = "0.9";
    agent.textContent = "Next: " + e.next + "\nQuestion: " + e.clarify;

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "btn ghost small";
    deleteBtn.style.marginTop = "10px";
    deleteBtn.addEventListener("click", async () => {
      try {
        await apiDeleteEntry(e.id);
        entries = entries.filter(x => x.id !== e.id);
        render(entries);
        showOutput("Entry deleted.");
      } catch (err) {
        showOutput("Delete failed: " + err.message);
      }
    });

    li.appendChild(meta);
    li.appendChild(text);
    li.appendChild(agent);
    li.appendChild(deleteBtn);
    historyEl.appendChild(li);
  }
}

// ---------- Boot ----------
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

processBtn.addEventListener("click", () => {
  const text = inputEl.value.trim();
  if (!text) return showOutput("Type something first.");

  const p = processText(text);
  showOutput("Tag: " + p.tag + "\nNext: " + p.next + "\nQuestion: " + p.clarify);
});

saveBtn.addEventListener("click", async () => {
  const text = inputEl.value.trim();
  if (!text) return showOutput("Nothing to save.");

  const p = processText(text);
  const entry = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    text,
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

clearBtn.addEventListener("click", async () => {
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

// Axiom Relay - placeholder; wire up when ready
relayBtn.addEventListener("click", () => {
  showOutput("Axiom Relay: not yet implemented.");
});

restoreBtn.addEventListener("click", async () => {
  try {
    await apiRestoreAll();
    entries = await apiLoadEntries();
    render(entries);
    showOutput("All entries restored.");
  } catch (e) {
    showOutput("Restore failed: " + e.message);
  }
});
