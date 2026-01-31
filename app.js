const inputEl = document.getElementById("input");
const outputEl = document.getElementById("output");
const historyEl = document.getElementById("history");

const processBtn = document.getElementById("processBtn");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const exportBtn = document.getElementById("exportBtn");

const STORAGE_KEY = "arcanthyr_console_entries_v0";

function nowIso() {
  return new Date().toISOString();
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

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

function nextStep(tag, text) {
  switch (tag) {
    case "task":
      return "Define the smallest next action and a time: who/what/when.";
    case "decision":
      return "Write 2 options + the downside if wrong + one reversible test.";
    case "question":
      return "State what a good answer would let you do. Then list 2 constraints.";
    case "idea":
      return "Turn it into a 1-sentence pitch + first tiny prototype step.";
    default:
      return "Rewrite as one clear sentence. Then add one concrete next action.";
  }
}

function clarifyQuestion(tag, text) {
  switch (tag) {
    case "task":
      return "What’s the deadline, and what is ‘done’ in one sentence?";
    case "decision":
      return "What would change your mind most?";
    case "question":
      return "What context is missing that makes this hard to answer?";
    case "idea":
      return "Who is this for, and what pain does it remove?";
    default:
      return "Is this something you want to act on, or just capture?";
  }
}

function processText(text) {
  const tag = classify(text);
  return {
    tag,
    next: nextStep(tag, text),
    clarify: clarifyQuestion(tag, text),
  };
}

function render(entries) {
  historyEl.innerHTML = "";

  if (!entries.length) {
    const li = document.createElement("li");
    li.className = "item";
    li.textContent = "No entries yet.";
    historyEl.appendChild(li);
    return;
  }

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
    agent.textContent = `Next: ${e.next}\nQuestion: ${e.clarify}`;

    li.appendChild(meta);
    li.appendChild(text);
    li.appendChild(agent);
    historyEl.appendChild(li);
  }
}

function showOutput(msg) {
  outputEl.textContent = msg;
}

let entries = loadEntries();
render(entries);

processBtn.addEventListener("click", () => {
  const text = inputEl.value.trim();
  if (!text) return showOutput("Type something first.");

  const p = processText(text);
  showOutput(`Tag: ${p.tag}\nNext: ${p.next}\nQuestion: ${p.clarify}`);
});

saveBtn.addEventListener("click", () => {
  const text = inputEl.value.trim();
  if (!text) return showOutput("Nothing to save.");

  const p = processText(text);
  const entry = {
    id: crypto.randomUUID(),
    created_at: nowIso(),
    text,
    ...p,
  };

  entries.push(entry);
  saveEntries(entries);
  render(entries);
  showOutput("Saved.");
  inputEl.value = "";
});

clearBtn.addEventListener("click", () => {
  entries = [];
  saveEntries(entries);
  render(entries);
  showOutput("Cleared.");
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
