console.log("APP CONSOLE v3.2 — Input + Email + Axiom Relay + File Upload");

/* =============================================================
   SCHEMA VERSION
   ============================================================= */
const SCHEMA_VERSION = 1;

/* =============================================================
   API BASES
   ============================================================= */
const API_BASE = "https://arcanthyr-api.virtual-wiseman-operations.workers.dev/api/entries";
const AI_BASE = "https://arcanthyr-api.virtual-wiseman-operations.workers.dev/api/ai";
const EMAIL_BASE = "https://arcanthyr-api.virtual-wiseman-operations.workers.dev/api/email";

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

// File upload elements
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const filePreview = document.getElementById("filePreview");

/* =============================================================
   FILE UPLOAD STATE
   ============================================================= */
let uploadedFiles = [];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

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
async function callDraft(text, tag) {
  const r = await fetch(`${AI_BASE}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, tag }),
  });
  if (!r.ok) throw new Error(`Draft call failed: ${r.status}`);
  const data = await r.json();
  return data.result || "";
}

async function callNextActions(text, tag) {
  const r = await fetch(`${AI_BASE}/next-actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, tag }),
  });
  if (!r.ok) throw new Error(`Next-actions call failed: ${r.status}`);
  const data = await r.json();
  return data.result || "";
}

async function axiomRelay(entries, focus = "") {
  const r = await fetch(`${AI_BASE}/axiom-relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries, focus }),
  });
  if (!r.ok) throw new Error(`Axiom Relay failed: ${r.status}`);
  const data = await r.json();
  return data.result || "";
}

async function clarifyAgent(text, tag, history, userReply = "") {
  const r = await fetch(`${AI_BASE}/clarify-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, tag, history, userReply }),
  });
  if (!r.ok) throw new Error(`Clarify agent failed: ${r.status}`);
  const data = await r.json();
  return data.result || {};
}

/* =============================================================
   EMAIL API CALLS
   ============================================================= */
async function sendEmail(to, subject, content) {
  const r = await fetch(`${EMAIL_BASE}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, content }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Send failed: ${err}`);
  }
  return await r.json();
}

async function loadContacts() {
  const r = await fetch(`${EMAIL_BASE}/contacts`);
  if (!r.ok) throw new Error("Failed to load contacts");
  const data = await r.json();
  return data.result || [];
}

async function addContact(name, email) {
  const r = await fetch(`${EMAIL_BASE}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  if (!r.ok) throw new Error("Failed to add contact");
  return await r.json();
}

async function deleteContact(id) {
  const r = await fetch(`${EMAIL_BASE}/contacts/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete contact");
}

/* =============================================================
   SCHEMA MIGRATION
   ============================================================= */
function migrateEntry(e) {
  if (!e._v || e._v < SCHEMA_VERSION) {
    e._v = SCHEMA_VERSION;
    if (!e.next) e.next = "";
    if (!e.clarify) e.clarify = "";
  }
  return e;
}

/* =============================================================
   RULE-BASED AGENT
   ============================================================= */
function classifyEntry(raw) {
  const t = raw.toLowerCase();
  const hasQuestion = /\?/.test(raw) || /^(what|how|when|where|why|who|should|can|could)\b/i.test(raw);
  const hasAction = /\b(do|complete|finish|send|schedule|call|write|need to|have to)\b/.test(t);
  const hasDecision = /\b(decide|choice|option|whether|if i should|considering)\b/.test(t);
  const hasIdea = /\b(idea|concept|thought|maybe|potentially|what if)\b/.test(t);
  if (hasQuestion) return "question";
  if (hasDecision) return "decision";
  if (hasAction) return "task";
  if (hasIdea) return "idea";
  return "note";
}

/* =============================================================
   STATE
   ============================================================= */
let entries = [];
let contacts = [];
let currentEmailContent = null;

/* =============================================================
   RENDER - RECENT ENTRIES ONLY (limit 10)
   ============================================================= */
function render(data) {
  entries = data;
  const recent = entries.slice(0, 10); // Only show 10 most recent
  
  if (recent.length === 0) {
    historyEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">No entries yet</div>
        <div class="empty-sub">Your thoughts will appear here</div>
      </div>`;
    historyCount.textContent = "0 entries";
    return;
  }

  historyCount.textContent = `Showing ${recent.length} most recent${entries.length > 10 ? ` of ${entries.length} total` : ''}`;
  
  historyEl.innerHTML = recent.map(e => `
    <li class="item" data-id="${e.id}">
      <div class="meta">
        <span class="tag tag-${e.tag}">${e.tag}</span>
        <span>${formatDate(e.created_at)}</span>
      </div>
      <div class="entry-text">${escapeHtml(e.text)}</div>
      ${e.draft ? `<div class="draft-preview"><strong>Draft:</strong> ${escapeHtml(e.draft)}</div>` : ""}
      ${e.next ? `<div class="next-preview"><strong>Next:</strong> ${escapeHtml(e.next)}</div>` : ""}
      <div class="row">
        <button class="btn ghost small email-entry-btn" data-id="${e.id}">Email</button>
        <button class="btn ghost small delete-entry-btn" data-id="${e.id}">Delete</button>
      </div>
    </li>
  `).join("");
}

/* =============================================================
   RELAY REPORT RENDERER
   ============================================================= */
function renderRelayReport(report) {
  const relayOutput = document.getElementById("relayOutput");
  if (!relayOutput) return;
  
  relayOutput.innerHTML = report
    .replace(/^(DECOMPOSITION)/m, '<div class="review-section-title">$1</div>')
    .replace(/^(TENSIONS)/m, '<div class="review-section-title">$1</div>')
    .replace(/^(SYNTHESIS)/m, '<div class="review-section-title">$1</div>');
}

/* =============================================================
   CLARIFY AGENT (conversational loop)
   ============================================================= */
let clarifyHistory = [];
let clarifyExchanges = 0;

async function startClarifyAgent() {
  const text = inputEl.value.trim();
  if (!text) {
    showOutput("Write something first before using Clarify.");
    return;
  }
  
  clarifyHistory = [];
  clarifyExchanges = 0;
  const tag = classifyEntry(text);
  
  showOutput("Clarify agent started. Analysing...", true);
  
  try {
    const response = await clarifyAgent(text, tag, clarifyHistory, "");
    if (response.done) {
      inputEl.value = response.draft || text;
      showOutput("✓ Clarified and refined your entry.");
      clarifyHistory = [];
    } else {
      showClarifyQuestion(response.question, text, tag);
    }
  } catch (err) {
    showOutput("Clarify failed: " + err.message);
  }
}

function showClarifyQuestion(question, originalText, originalTag) {
  outputEl.innerHTML = `
    <div style="margin-bottom:12px;"><strong>Clarify asks:</strong> ${escapeHtml(question)}</div>
    <textarea id="clarifyReplyInput" class="textarea" style="min-height:60px;" placeholder="Your response..."></textarea>
    <div class="row" style="margin-top:8px;">
      <button id="clarifySubmitBtn" class="btn small">Submit</button>
      <button id="clarifySkipBtn" class="btn ghost small">Skip</button>
    </div>
  `;
  
  const submitBtn = document.getElementById("clarifySubmitBtn");
  const skipBtn = document.getElementById("clarifySkipBtn");
  const replyInput = document.getElementById("clarifyReplyInput");
  
  submitBtn.addEventListener("click", async () => {
    const reply = replyInput.value.trim();
    if (!reply) return;
    
    clarifyHistory.push({ question, reply });
    clarifyExchanges++;
    
    showOutput("Processing your reply...", true);
    
    try {
      const response = await clarifyAgent(originalText, originalTag, clarifyHistory, reply);
      if (response.done) {
        inputEl.value = response.draft || originalText;
        showOutput("✓ Clarified and refined your entry.");
        clarifyHistory = [];
      } else {
        showClarifyQuestion(response.question, originalText, originalTag);
      }
    } catch (err) {
      showOutput("Clarify failed: " + err.message);
    }
  });
  
  skipBtn.addEventListener("click", () => {
    showOutput("Clarify cancelled.");
  });
}

/* =============================================================
   EMAIL COMPOSER
   ============================================================= */
function showEmailComposer(content = null) {
  currentEmailContent = content;
  emailCompose.style.display = "block";
  emailSubject.value = "Update from Arcanthyr";
  emailBody.value = content || "";
  emailRecipients.value = "";
  emailOutput.textContent = "";
}

function hideEmailComposer() {
  emailCompose.style.display = "none";
  currentEmailContent = null;
}

/* =============================================================
   CONTACTS MODAL
   ============================================================= */
async function showContactsModal() {
  contactsModal.style.display = "block";
  try {
    contacts = await loadContacts();
    renderContacts();
  } catch (err) {
    contactsList.innerHTML = `<li style="color:var(--amber);">Failed to load contacts</li>`;
  }
}

function hideContactsModal() {
  contactsModal.style.display = "none";
}

function renderContacts() {
  if (contacts.length === 0) {
    contactsList.innerHTML = `<li style="color:var(--text-dim);padding:12px;">No contacts yet</li>`;
    return;
  }
  
  contactsList.innerHTML = contacts.map(c => `
    <li class="contact-item" style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-weight:400;color:var(--text);">${escapeHtml(c.name)}</div>
        <div style="font-size:0.75rem;color:var(--text-dim);">${escapeHtml(c.email)}</div>
      </div>
      <button class="btn ghost small delete-contact-btn" data-id="${c.id}">×</button>
    </li>
  `).join("");
}

/* =============================================================
   FILE UPLOAD HANDLERS
   ============================================================= */
if (dropzone && fileInput) {
  // Click to browse
  dropzone.addEventListener('click', () => {
    fileInput.click();
  });
  
  // Drag and drop events
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });
  
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    await handleFiles(files);
  });
  
  // File input change
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    await handleFiles(files);
    e.target.value = ''; // Reset input
  });
}

async function handleFiles(files) {
  for (const file of files) {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      showOutput(`File too large: ${file.name} (max 10MB)`);
      continue;
    }
    
    // Validate file type
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['docx', 'pdf', 'txt'].includes(extension)) {
      showOutput(`Unsupported file type: ${extension}`);
      continue;
    }
    
    // Add to preview
    const previewElement = addFilePreview(file);
    
    // Extract text from file
    await extractTextFromFile(file, previewElement);
  }
}

function addFilePreview(file) {
  if (!filePreview) return null;
  
  const preview = document.createElement('div');
  preview.className = 'file-preview';
  preview.dataset.filename = file.name;
  
  const icon = document.createElement('span');
  icon.className = 'file-icon';
  if (file.name.endsWith('.pdf')) icon.textContent = '📄';
  else if (file.name.endsWith('.docx')) icon.textContent = '📝';
  else icon.textContent = '📋';
  
  const info = document.createElement('div');
  info.className = 'file-info';
  
  const name = document.createElement('div');
  name.className = 'file-name';
  name.textContent = file.name;
  
  const size = document.createElement('div');
  size.className = 'file-size';
  size.textContent = formatFileSize(file.size);
  
  const status = document.createElement('div');
  status.className = 'file-status';
  status.textContent = 'Processing...';
  
  info.appendChild(name);
  info.appendChild(size);
  info.appendChild(status);
  
  const remove = document.createElement('span');
  remove.className = 'remove-file';
  remove.textContent = '×';
  remove.onclick = () => {
    preview.remove();
    uploadedFiles = uploadedFiles.filter(f => f.name !== file.name);
    updateTextarea();
  };
  
  preview.appendChild(icon);
  preview.appendChild(info);
  preview.appendChild(remove);
  
  filePreview.appendChild(preview);
  
  return preview;
}

async function extractTextFromFile(file, previewElement) {
  const statusElement = previewElement?.querySelector('.file-status');
  
  try {
    if (statusElement) statusElement.textContent = 'Extracting text...';
    
    const extension = file.name.split('.').pop().toLowerCase();
    let extractedText = '';
    
    if (extension === 'txt') {
      extractedText = await file.text();
    } else if (extension === 'pdf' && typeof pdfjsLib !== 'undefined') {
      extractedText = await extractPdfText(file);
    } else if (extension === 'docx' && typeof mammoth !== 'undefined') {
      extractedText = await extractDocxText(file);
    } else {
      throw new Error(`Cannot extract ${extension} - missing library`);
    }
    
    // Store file data
    uploadedFiles.push({
      name: file.name,
      type: extension,
      text: extractedText.trim()
    });
    
    // Update textarea
    updateTextarea();
    
    if (statusElement) {
      statusElement.textContent = '✓ Text extracted';
      statusElement.style.color = 'var(--green)';
    }
    
    showOutput(`Successfully processed ${file.name}`);
    
  } catch (error) {
    console.error(`Error processing ${file.name}:`, error);
    if (statusElement) {
      statusElement.textContent = '✗ Extraction failed';
      statusElement.style.color = 'var(--amber)';
    }
    showOutput(`Failed to process ${file.name}: ${error.message}`);
  }
}

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  
  return fullText;
}

async function extractDocxText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

function updateTextarea() {
  if (uploadedFiles.length === 0) {
    return;
  }
  
  const texts = uploadedFiles.map(file => {
    return `[Document: ${file.name}]\n\n${file.text}`;
  });
  
  const currentText = inputEl.value.trim();
  const separator = currentText ? '\n\n---\n\n' : '';
  inputEl.value = currentText + separator + texts.join('\n\n---\n\n');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* =============================================================
   TOAST NOTIFICATIONS
   ============================================================= */
function showToast(msg) {
  const toast = document.getElementById("saveToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = "block";
  toast.classList.add("toast-visible");
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    toast.classList.add("toast-out");
    setTimeout(() => {
      toast.style.display = "none";
      toast.classList.remove("toast-out");
    }, 400);
  }, 2000);
}

/* =============================================================
   UTILITIES
   ============================================================= */
function showOutput(msg, loading = false) {
  outputEl.textContent = msg;
  outputEl.className = loading ? "output loading" : "output";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/* =============================================================
   INITIALIZATION
   ============================================================= */
async function init() {
  try {
    entries = await apiLoadEntries();
    render(entries);
  } catch (err) {
    showOutput("Failed to load entries: " + err.message);
  }
}

/* =============================================================
   EVENT HANDLERS — Main Input
   ============================================================= */
processBtn.addEventListener("click", async () => {
  const raw = inputEl.value.trim();
  if (!raw) return;
  if (!checkRate("process")) {
    showOutput("Rate limit: wait a few seconds.");
    return;
  }
  
  const tag = classifyEntry(raw);
  showOutput(`Classified as: ${tag}`, true);
  processBtn.disabled = true;
  
  try {
    const nextActions = await callNextActions(raw, tag);
    showOutput(`Tag: ${tag}\n\nNext actions:\n${nextActions}`);
  } catch (err) {
    showOutput("Process failed: " + err.message);
  } finally {
    processBtn.disabled = false;
  }
});

saveBtn.addEventListener("click", async () => {
  const raw = inputEl.value.trim();
  if (!raw) {
    showOutput("Nothing to save.");
    return;
  }
  if (!checkRate("save")) {
    showOutput("Rate limit: wait a few seconds.");
    return;
  }
  
  saveBtn.disabled = true;
  showOutput("Saving...", true);
  
  try {
    const tag = classifyEntry(raw);
    const entry = {
      id: `e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
      text: raw,
      tag,
      next: "",
      clarify: "",
      draft: "",
      _v: SCHEMA_VERSION,
    };
    
    await apiSaveEntry(entry);
    entries = await apiLoadEntries();
    render(entries);
    
    inputEl.value = "";
    uploadedFiles = [];
    if (filePreview) filePreview.innerHTML = '';
    
    showToast("✓ Saved");
    showOutput("");
  } catch (err) {
    showOutput("Save failed: " + err.message);
  } finally {
    saveBtn.disabled = false;
  }
});

draftBtn.addEventListener("click", async () => {
  const raw = inputEl.value.trim();
  if (!raw) return;
  if (!checkRate("draft")) {
    showOutput("Rate limit: wait a few seconds.");
    return;
  }
  
  const tag = classifyEntry(raw);
  draftBtn.disabled = true;
  showOutput("Drafting...", true);
  
  try {
    const draft = await callDraft(raw, tag);
    inputEl.value = draft;
    showOutput("✓ Draft complete");
  } catch (err) {
    showOutput("Draft failed: " + err.message);
  } finally {
    draftBtn.disabled = false;
  }
});

nextActionBtn.addEventListener("click", async () => {
  const raw = inputEl.value.trim();
  if (!raw) return;
  if (!checkRate("next")) {
    showOutput("Rate limit: wait a few seconds.");
    return;
  }
  
  const tag = classifyEntry(raw);
  nextActionBtn.disabled = true;
  showOutput("Generating actions...", true);
  
  try {
    const actions = await callNextActions(raw, tag);
    showOutput(actions);
  } catch (err) {
    showOutput("Next actions failed: " + err.message);
  } finally {
    nextActionBtn.disabled = false;
  }
});

clearInputBtn.addEventListener("click", () => {
  inputEl.value = "";
  uploadedFiles = [];
  if (filePreview) filePreview.innerHTML = '';
  showOutput("");
});

/* =============================================================
   EVENT HANDLERS — Axiom Relay
   ============================================================= */
relayBtn.addEventListener("click", async () => {
  if (!checkRate("relay", 2, 30000)) {
    showOutput("Rate limit: wait 30 seconds before running Axiom Relay again.");
    return;
  }
  if (entries.length === 0) {
    const relayOutput = document.getElementById("relayOutput");
    if (relayOutput) { relayOutput.textContent = "No entries to relay."; relayOutput.style.display = "block"; }
    return;
  }

  relayBtn.disabled = true;
  const relayOutput = document.getElementById("relayOutput");
  if (relayOutput) {
    relayOutput.textContent = "Relay initialising — Stage 1: Decompose…";
    relayOutput.style.display = "block";
  }

  const focusEl = document.getElementById("relayFocus");
  const focus = focusEl ? focusEl.value.trim() : "";

  try {
    const stages = [
      "Relay initialising — Stage 1: Decompose…",
      "Stage 2: Finding tensions…",
      "Stage 3: Synthesising report…",
    ];
    let stageIdx = 0;
    const stageTimer = setInterval(() => {
      stageIdx++;
      if (stageIdx < stages.length && relayOutput) {
        relayOutput.textContent = stages[stageIdx];
      }
    }, 2500);

    const result = await axiomRelay(entries, focus);
    clearInterval(stageTimer);
    renderRelayReport(result);
  } catch (err) {
    if (relayOutput) relayOutput.textContent = "Relay failed: " + err.message;
  } finally {
    relayBtn.disabled = false;
  }
});

/* =============================================================
   EVENT HANDLERS — Email
   ============================================================= */
if (emailEntryBtn) {
  emailEntryBtn.addEventListener("click", () => {
    const text = inputEl.value.trim();
    if (!text) {
      showOutput("Write something first.");
      return;
    }
    showEmailComposer(text);
  });
}

if (cancelEmailBtn) {
  cancelEmailBtn.addEventListener("click", hideEmailComposer");
}

if (sendEmailBtn) {
  sendEmailBtn.addEventListener("click", async () => {
    const to = emailRecipients.value.trim();
    const subject = emailSubject.value.trim();
    const content = emailBody.value.trim();
    
    if (!to || !content) {
      emailOutput.textContent = "Missing recipients or content.";
      return;
    }
    
    sendEmailBtn.disabled = true;
    emailOutput.textContent = "Sending...";
    
    try {
      await sendEmail(to, subject, content);
      emailOutput.textContent = "✓ Email sent successfully!";
      setTimeout(hideEmailComposer, 2000);
    } catch (err) {
      emailOutput.textContent = err.message;
    } finally {
      sendEmailBtn.disabled = false;
    }
  });
}

if (manageContactsBtn) {
  manageContactsBtn.addEventListener("click", showContactsModal);
}

if (closeContactsBtn) {
  closeContactsBtn.addEventListener("click", hideContactsModal);
}

if (addContactBtn) {
  addContactBtn.addEventListener("click", async () => {
    const name = document.getElementById("newContactName").value.trim();
    const email = document.getElementById("newContactEmail").value.trim();
    
    if (!name || !email) return;
    
    try {
      await addContact(name, email);
      contacts = await loadContacts();
      renderContacts();
      document.getElementById("newContactName").value = "";
      document.getElementById("newContactEmail").value = "";
    } catch (err) {
      alert("Failed to add contact: " + err.message);
    }
  });
}

if (addFromContactsBtn) {
  addFromContactsBtn.addEventListener("click", showContactsModal);
}

// Delegate contact clicks
document.addEventListener("click", async (e) => {
  if (e.target.classList.contains("delete-contact-btn")) {
    const id = e.target.dataset.id;
    try {
      await deleteContact(id);
      contacts = await loadContacts();
      renderContacts();
    } catch (err) {
      alert("Failed to delete contact");
    }
  }
  
  if (e.target.classList.contains("contact-item")) {
    const contactEl = e.target.closest(".contact-item");
    const email = contactEl.querySelector("div:last-child").textContent;
    const current = emailRecipients.value.trim();
    emailRecipients.value = current ? `${current}, ${email}` : email;
    hideContactsModal();
  }
  
  if (e.target.classList.contains("email-entry-btn")) {
    const id = e.target.dataset.id;
    const entry = entries.find(e => e.id === id);
    if (entry) showEmailComposer(entry.text);
  }
  
  if (e.target.classList.contains("delete-entry-btn")) {
    const id = e.target.dataset.id;
    if (confirm("Delete this entry?")) {
      try {
        await apiDeleteEntry(id);
        entries = await apiLoadEntries();
        render(entries);
        showToast("✓ Deleted");
      } catch (err) {
        showOutput("Delete failed: " + err.message);
      }
    }
  }
});

/* =============================================================
   EVENT HANDLERS — History Management
   ============================================================= */
if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    try {
      const allEntries = await apiLoadEntries();
      const blob = new Blob([JSON.stringify(allEntries, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `arcanthyr-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("✓ Exported");
    } catch (err) {
      showOutput("Export failed: " + err.message);
    }
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    if (!confirm("Delete all entries? This cannot be undone.")) return;
    try {
      await apiClearAll();
      entries = [];
      render(entries);
      showToast("✓ Cleared");
    } catch (err) {
      showOutput("Clear failed: " + err.message);
    }
  });
}

// Initialize on load
init();
