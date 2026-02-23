# ARCANTHYR v3 — Setup & Deployment Guide

## Overview
Arcanthyr v3 adds:
- **Email functionality** via Resend API
- **Legal case research** with AustLII scraper
- **AI-powered case summarization**
- **Principles database** with multi-citation tracking
- **Scheduled daily sync** using Cloudflare Cron

---

## Prerequisites

1. **Cloudflare Account** (free tier works)
2. **Resend Account** (free: 100 emails/day)
   - Sign up at: https://resend.com
   - Get API key from dashboard
3. **Domain** (for Resend "from" email - can use free Resend subdomain)

---

## Database Schema

Your Cloudflare D1 database needs these tables:

### 1. Existing `entries` table (keep as-is)
```sql
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  text TEXT NOT NULL,
  tag TEXT NOT NULL,
  next TEXT,
  clarify TEXT,
  draft TEXT,
  _v INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0
);
```

### 2. NEW `cases` table
```sql
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  citation TEXT NOT NULL UNIQUE,
  court TEXT NOT NULL,
  case_date TEXT,
  case_name TEXT,
  url TEXT,
  facts TEXT,
  issues TEXT,
  holding TEXT,
  principles_extracted TEXT,
  processed_date TEXT,
  summary_quality_score REAL DEFAULT 0.0
);

CREATE INDEX idx_cases_court ON cases(court);
CREATE INDEX idx_cases_date ON cases(case_date);
CREATE INDEX idx_cases_citation ON cases(citation);
```

### 3. NEW `legal_principles` table
```sql
CREATE TABLE IF NOT EXISTS legal_principles (
  id TEXT PRIMARY KEY,
  principle_text TEXT NOT NULL,
  keywords TEXT,
  statute_refs TEXT,
  case_citations TEXT,
  most_recent_citation TEXT,
  date_added TEXT
);

CREATE INDEX idx_principles_text ON legal_principles(principle_text);
```

### 4. NEW `email_contacts` table
```sql
CREATE TABLE IF NOT EXISTS email_contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT
);

CREATE INDEX idx_contacts_email ON email_contacts(email);
```

---

## Deployment Steps

### Step 1: Create Database Tables

In your Cloudflare dashboard:
1. Go to **Workers & Pages** > **D1**
2. Select your database (or create new one named `arcanthyr-db`)
3. Open **Console** tab
4. Run each CREATE TABLE and CREATE INDEX statement above

### Step 2: Configure Worker Secrets

Set these environment variables in Cloudflare:

```bash
# Via Cloudflare Dashboard:
# Workers & Pages > Your Worker > Settings > Variables

RESEND_API_KEY = "re_xxxxxxxxxxxxx"  # Your Resend API key
RESEND_FROM_EMAIL = "arcanthyr@yourdomain.com"  # Or use Resend's onboarding domain
```

### Step 3: Configure Cloudflare Bindings

In your `wrangler.toml` (or via dashboard):

```toml
name = "arcanthyr-api"
main = "Worker.js"
compatibility_date = "2024-01-01"

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "arcanthyr-db"
database_id = "your-database-id-here"

# Workers AI binding (for free tier AI)
[ai]
binding = "AI"

# Cron trigger for daily sync
[triggers]
crons = ["0 2 * * *"]  # Runs daily at 2 AM UTC
```

### Step 4: Deploy Worker

```bash
# Install Wrangler if needed
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
wrangler deploy
```

### Step 5: Update Frontend API URLs

In `app.js`, replace the base URLs with your Worker URL:

```javascript
const API_BASE = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/entries";
const AI_BASE = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/ai";
const EMAIL_BASE = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/email";
const LEGAL_BASE = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/legal";
```

### Step 6: Deploy Frontend

Upload these files to your web host:
- `index.html`
- `console.html`
- `styles.css`
- `app.js`

---

## Resend Email Setup

### Option 1: Use Resend's Onboarding Domain (Quick Start)
1. In Resend dashboard, go to **Domains**
2. Copy the onboarding domain (e.g., `onboarding@resend.dev`)
3. Use this as `RESEND_FROM_EMAIL`

### Option 2: Use Your Own Domain (Recommended for Production)
1. In Resend dashboard, click **Add Domain**
2. Enter your domain (e.g., `yourdomain.com`)
3. Add the provided DNS records (SPF, DKIM, DMARC)
4. Verify domain
5. Use format: `arcanthyr@yourdomain.com` or `noreply@yourdomain.com`

---

## AustLII Integration Notes

### Two-Pronged Approach

**1. Historical Cases (Pre-Today): Manual Upload**
- You upload cases ad-hoc from AustLII or PDFs
- Paste full case text into upload form
- AI processes and extracts principles
- Stored in database immediately
- **No automated backlog scraping** (avoids HTML parsing fragility)

**2. New Cases (Going Forward): Auto-Sync**
- Daily Cron checks current year only
- Finds new published decisions
- Auto-processes with AI
- Email notification when new cases found
- **Lightweight and reliable**

### Why This Approach?

✅ **Simpler**: No complex HTML parsing for 1990-2025 backlog  
✅ **Reliable**: Upload is under your control  
✅ **Faster**: No 12-15 day wait for backlog  
✅ **Flexible**: Upload only cases you actually need  
✅ **Current**: Auto-sync keeps you updated on new decisions  

### Upload Workflow

1. Go to AustLII: http://www.austlii.edu.au
2. Find Tasmanian criminal case
3. Copy full text from browser
4. Paste into Arcanthyr upload form
5. Add citation + case name
6. Click "Process & Save"
7. AI summarizes (30-60 seconds)
8. Case added to database

### Rate Limits (Upload)
- **AI processing**: 15 uploads/hour (free tier limit)
- **Daily capacity**: ~200-300 cases/day (10k neurons)
- **Realistic usage**: 5-10 uploads/day (as needed)

### Expected Timeline
- **Upload historical cases**: As needed (at your pace)
- **Daily new case checks**: Automated  
- **Weekly new cases**: Typically 5-15 Tasmanian criminal decisions
- **Monthly maintenance**: Near zero (fully automated)

---

## AI Model Notes

### Current: Llama 3.1 8B (Free)
- **Pros**: Free via Cloudflare Workers AI
- **Cons**: Lower accuracy on legal reasoning
- **Daily limit**: 10,000 neurons (~200-300 case summaries)

### Future Upgrade Path

#### Option 1: Claude Haiku (Recommended)
```javascript
// In Worker.js, replace callWorkersAI with:
async function callClaudeAPI(env, systemPrompt, userContent, maxTokens = 600) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    })
  });
  const data = await response.json();
  return data.content[0].text;
}
```

**Cost**: ~$0.01 per case = ~$15 for full backlog + ~$0.50/month maintenance

#### Option 2: GPT-4 Turbo
```javascript
async function callOpenAI(env, systemPrompt, userContent, maxTokens = 600) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4-turbo-preview",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    })
  });
  const data = await response.json();
  return data.choices[0].message.content;
}
```

**Cost**: ~$0.02 per case = ~$30 for full backlog

---

## Usage Examples

### Email Workflow
1. Create entry or select from history
2. Click "Email This"
3. Add recipients (type or select from contacts)
4. Customize message
5. Send

### Legal Research Workflow
1. Wait for initial sync (or trigger manually)
2. Search by keyword, statute, or offence
3. Filter by court
4. Toggle between Cases and Principles view
5. Click "View on AustLII" for full decision

### Adding Contacts
1. Click "Contacts" in Email Center
2. Enter name + email
3. Click to add to recipients list

---

## Troubleshooting

### Email Not Sending
1. Check `RESEND_API_KEY` is set correctly
2. Verify domain DNS records if using custom domain
3. Check Resend dashboard for error logs
4. Ensure within free tier limits (100/day)

### Cases Not Syncing
1. Check Worker logs in Cloudflare dashboard
2. Verify Cron trigger is configured
3. Manually trigger sync to test
4. Check AustLII is accessible (not blocking your IP)

### AI Summarization Failing
1. Check Cloudflare Workers AI binding
2. Verify daily quota not exceeded
3. Review Worker logs for JSON parsing errors
4. Consider fallback to manual review

### Database Errors
1. Verify all tables created with correct schema
2. Check indexes are in place
3. Test with simple queries in D1 Console
4. Ensure Worker has DB binding configured

---

## Security Notes

✅ **Secure**:
- Resend API key stored as Worker secret (not in code)
- All email sending happens server-side
- Rate limiting on all endpoints
- No user auth needed (personal use)

⚠️ **Considerations**:
- Anyone with Worker URL can use API endpoints
- Add IP whitelist if you want restriction:

```javascript
// In Worker.js fetch handler:
const allowedIPs = ["YOUR_IP_HERE"];
if (!allowedIPs.includes(ip)) {
  return new Response("Forbidden", { status: 403 });
}
```

---

## Cost Breakdown (Monthly)

| Service | Free Tier | Expected Usage | Cost |
|---------|-----------|----------------|------|
| Cloudflare Workers | 100k requests/day | ~1k/day | **$0** |
| Cloudflare D1 | 5GB storage, 5M reads | ~10MB, ~100k reads | **$0** |
| Cloudflare Workers AI | 10k neurons/day | ~3k/day | **$0** |
| Resend Email | 100 emails/day | ~5/day | **$0** |
| **TOTAL** | | | **$0/month** |

**With Claude Haiku upgrade**: ~$10-20/month

---

## API Endpoints Reference

### Entries (Existing)
- `GET /api/entries` - List entries
- `POST /api/entries` - Create entry
- `DELETE /api/entries/:id` - Delete entry
- `PATCH /api/entries` - Restore all

### AI (Existing)
- `POST /api/ai/draft` - Draft rewrite
- `POST /api/ai/next-actions` - Suggest actions
- `POST /api/ai/weekly-review` - Pattern analysis
- `POST /api/ai/axiom-relay` - 3-stage reasoning
- `POST /api/ai/clarify-agent` - Conversational clarification

### Email (NEW)
- `POST /api/email/send` - Send email
- `GET /api/email/contacts` - List contacts
- `POST /api/email/contacts` - Add contact
- `DELETE /api/email/contacts/:id` - Delete contact

### Legal (NEW)
- `GET /api/legal/sync-progress` - Get sync status
- `POST /api/legal/search-cases` - Search cases
- `POST /api/legal/search-principles` - Search principles
- `POST /api/legal/trigger-sync` - Manual sync trigger

---

## Next Steps

1. ✅ Deploy database schema
2. ✅ Configure Resend API key
3. ✅ Deploy Worker with Cron trigger
4. ✅ Update frontend URLs
5. ✅ Deploy frontend files
6. ✅ Test email sending
7. ✅ Trigger initial legal sync
8. ⏱️ Wait for cases to populate (12-15 days)
9. 🎯 Upgrade AI model when ready

---

## Support & Maintenance

### Monitoring
- Check Cloudflare Worker logs weekly
- Review sync progress in UI
- Monitor Resend usage dashboard
- Export data monthly (backup)

### Updates
- AustLII HTML may change → scraper breaks → fix parser
- Cloudflare AI model updates → test compatibility
- Resend API changes → minimal impact

### Data Management
- Export data regularly via "Export" button
- Cases + principles stored indefinitely
- No automatic cleanup (manual if needed)

---

**Version**: 3.0  
**Last Updated**: February 2026  
**License**: Personal use
