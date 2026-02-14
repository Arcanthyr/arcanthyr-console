# ARCANTHYR v3

**A forge for clarity** — Personal productivity console with AI-powered legal research.

---

## ✨ Features

### Core Productivity (v1-v2)
- **Smart Entry Processing**: Auto-classify tasks, decisions, questions, ideas, notes
- **AI Draft Enhancement**: Rewrite entries for clarity
- **Next Actions Generator**: Get 3 concrete action items
- **Weekly Pattern Review**: Identify recurring themes and stuck loops
- **Axiom Relay**: 3-stage reasoning agent for deep synthesis
- **Clarify Agent**: Conversational AI to refine your thinking
- **Search & Filter**: By tag, date, keyword with live highlighting

### Email Automation (v3 NEW)
- **Send Entries via Email**: Share thoughts, reports, or summaries
- **Contact Management**: Save frequent recipients
- **Custom Messages**: Edit before sending
- **Resend Integration**: Reliable delivery via Resend API
- **Free Tier**: 100 emails/day

### Legal Research (v3 NEW)
- **Case Upload System**: Paste case text from AustLII/PDFs for instant AI analysis
- **Auto-Sync for New Cases**: Daily checks for recently published Tasmanian criminal decisions
- **AI Case Summarization**: Extract facts, issues, holdings, principles automatically
- **Principles Database**: Consolidated legal principles with multi-case citations
- **Smart Search**: By keyword, statute, offence type, or court
- **Court Filtering**: Magistrates, Supreme, CCA, Full Court
- **Email Notifications**: Get notified when new cases are found

---

## 🚀 Quick Start

### 1. Prerequisites
- Cloudflare account (free)
- Resend account (free: https://resend.com)
- Basic command line knowledge

### 2. Database Setup
```bash
# In Cloudflare D1 Console, run:
wrangler d1 execute arcanthyr-db --file=init-db.sql
```

### 3. Configure Secrets
```bash
wrangler secret put RESEND_API_KEY
# Enter your Resend API key

wrangler secret put RESEND_FROM_EMAIL
# Enter: arcanthyr@yourdomain.com (or use Resend onboarding domain)
```

### 4. Deploy Worker
```bash
# Edit wrangler.toml and set YOUR_DATABASE_ID
wrangler deploy
```

### 5. Update Frontend
In `app.js`, replace:
```javascript
const API_BASE = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/entries";
const AI_BASE = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/ai";
const EMAIL_BASE = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/email";
const LEGAL_BASE = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/legal";
```

### 6. Deploy Frontend
Upload to your web host:
- `index.html`
- `console.html`
- `styles.css`
- `app.js`

### 7. Initial Legal Sync
Click **"Sync Cases"** in Legal Research section, or wait for first cron run (2 AM UTC).

---

## 📁 File Structure

```
arcanthyr-v3/
├── index.html          # Landing page with new sigil
├── console.html        # Main console interface
├── styles.css          # Complete styling
├── app.js              # Frontend logic (all features)
├── Worker.js           # Cloudflare Worker backend
├── wrangler.toml       # Worker configuration
├── init-db.sql         # Database schema
├── SETUP.md            # Detailed setup guide
└── README.md           # This file
```

---

## 🎨 New Sigil Design

Updated to match your reference image:
- 8-pointed compass rose (cardinal + intercardinal points)
- 4 asymmetric satellites (top, right, bottom, left)
- Distressed/textured appearance via SVG filters
- Dashed outer ring with tick marks
- Small diamond signature mark

---

## 💾 Database Schema

### Tables
- `entries` — Your productivity entries (existing)
- `cases` — Legal case summaries
- `legal_principles` — Consolidated legal principles
- `email_contacts` — Saved email contacts

See `init-db.sql` for complete schema.

---

## 🤖 AI Models

### Current: Llama 3.1 8B (Free)
- Cloudflare Workers AI
- 10,000 neurons/day free tier
- Decent quality, some legal reasoning limitations

### Upgrade Path: Claude Haiku ($)
- Higher accuracy for legal summaries
- ~$0.01 per case (~$15 one-time + $1/month)
- Easy swap (see SETUP.md)

---

## 📊 Usage Stats

### Legal Research Model
- **Historical cases**: Upload as needed (5-10/day typical)
- **New cases**: Auto-checked daily (~5-15/week in Tasmania)
- **AI processing**: 30-60 seconds per case
- **Storage**: ~50KB per case summary

### Rate Limits
- AI calls: 15/minute
- Email: 10/minute (100/day total)
- Legal uploads: 15/hour
- Entries: 20 POST/min, 60 GET/min

---

## 🔒 Security

✅ **Secure by Default**:
- Resend API key stored as Worker secret
- Server-side email sending only
- Rate limiting on all endpoints
- CORS configured for your frontend only

⚠️ **Note**: No user authentication (designed for personal use). Anyone with your Worker URL can use the API.

**To restrict access**, add IP whitelist in `Worker.js`:
```javascript
const allowedIPs = ["YOUR_IP"];
if (!allowedIPs.includes(ip)) {
  return new Response("Forbidden", { status: 403 });
}
```

---

## 💰 Cost

**Free Tier** (current setup):
- Cloudflare Workers: Free (100k requests/day)
- Cloudflare D1: Free (5GB storage)
- Cloudflare Workers AI: Free (10k neurons/day)
- Resend: Free (100 emails/day)
- **Total: $0/month**

**With Claude Haiku** (optional upgrade):
- ~$10-20/month for better legal summaries

---

## 📖 Documentation

- `SETUP.md` — Detailed deployment guide
- `init-db.sql` — Database schema with comments
- `wrangler.toml` — Worker configuration template

---

## 🐛 Troubleshooting

### Email not sending
1. Check `RESEND_API_KEY` is set: `wrangler secret list`
2. Verify domain DNS records in Resend dashboard
3. Check Resend logs for errors
4. Test with Resend onboarding domain first

### Cases not syncing
1. Check Worker logs in Cloudflare dashboard
2. Verify Cron trigger: `wrangler deployments list`
3. Manually trigger: Click "Sync Cases" button
4. Check AustLII is accessible (test URL in browser)

### AI summarization failing
1. Check Workers AI binding in wrangler.toml
2. Verify daily quota not exceeded (dashboard)
3. Review error logs for JSON parsing issues
4. Consider manual review fallback

See `SETUP.md` for complete troubleshooting guide.

---

## 🔄 Updates & Maintenance

### Monitoring
- Check Cloudflare Worker logs weekly
- Review sync progress in UI
- Monitor Resend usage dashboard
- Export data monthly (backup via "Export" button)

### Known Issues
- **AustLII HTML changes** → Scraper may break → Update parser in `Worker.js`
- **AI model limits** → Exceeding 10k neurons/day → Upgrade to paid AI
- **Rate limiting** → High usage → Adjust limits in `Worker.js`

---

## 📜 License

Personal use only. Not for redistribution.

---

## 🙏 Credits

- **Design**: Monumental Stoic aesthetic
- **Typography**: Cormorant Garamond + DM Mono
- **Infrastructure**: Cloudflare Workers, D1, Workers AI
- **Email**: Resend API
- **Legal Data**: AustLII (Australian Legal Information Institute)

---

## 🚦 Version History

- **v1** (Initial): Entry processing, AI draft, next actions
- **v2**: Weekly review, Axiom Relay, Clarify Agent
- **v3** (Current): Email automation, Legal research, AustLII scraper

---

**Built with clarity. Forged with discipline.**
