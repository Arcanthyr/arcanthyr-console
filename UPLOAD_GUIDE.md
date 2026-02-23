# Case Upload Quick Guide

## 🎯 Purpose

Upload historical Tasmanian criminal cases from AustLII for AI analysis and database storage. New cases are auto-synced daily, but use upload for any historical decisions you need.

---

## 📋 Step-by-Step Upload Process

### 1. Find Case on AustLII

Visit: http://www.austlii.edu.au

**Example paths**:
- Supreme Court: http://www.austlii.edu.au/cgi-bin/viewtoc/au/cases/tas/TASSC/
- Magistrates: http://www.austlii.edu.au/cgi-bin/viewtoc/au/cases/tas/TAMagC/
- CCA: http://www.austlii.edu.au/cgi-bin/viewtoc/au/cases/tas/TASCCA/

### 2. Open Case Decision

Click on the case you want. You'll see the full decision text.

### 3. Copy Full Text

- Use Ctrl+A (Windows) or Cmd+A (Mac) to select all
- Or manually select the case text content
- Copy to clipboard

### 4. Open Arcanthyr Console

Navigate to: **Legal Research section**

### 5. Click "Show Upload"

Expands the upload form.

### 6. Fill In Details

**Citation** (Required):
```
[2015] TASSC 42
```
Format: `[YEAR] COURT NUMBER`

**Case Name** (Optional but recommended):
```
R v Smith
DPP v Jones
```

**Court** (Select from dropdown):
- Supreme Court
- Magistrates Court
- Court of Criminal Appeal
- Full Court

**Case Text** (Required):
Paste the full text you copied from AustLII.

### 7. Click "Process & Save"

Wait 30-60 seconds while AI:
- Extracts facts
- Identifies issues
- Summarizes holding
- Extracts legal principles
- Links statute references

### 8. Done!

Case is now in your database and searchable.

---

## 💡 Tips & Best Practices

### What to Upload
✅ Cases you're currently researching  
✅ Key precedents in your practice area  
✅ Recent decisions you're tracking  
✅ Cases referenced in current matters  

### What NOT to Upload
❌ Every case from 1990-2025 (unnecessary)  
❌ Irrelevant jurisdictions (this is for Tas only)  
❌ Civil cases (configured for criminal only)  

### Batch Uploading
- Upload 5-10 cases at a time
- Take a break (AI rate limit: 15/hour)
- Spread large batches across multiple days

### Data Quality
- **Full text = better summaries**
- Include judgment header (parties, court, date)
- Don't worry about formatting - AI handles it
- If summary quality is poor, can re-upload with better text

---

## 🔍 After Upload

### Search Your Cases
1. Use search box to find by keyword
2. Filter by court
3. Toggle between Cases and Principles view

### Principles Database
Extracted principles are automatically:
- Consolidated (duplicates merged)
- Linked to all citing cases
- Indexed by keyword and statute
- Searchable independently

### Email Case Summaries
1. Click on a case in results
2. Copy summary text
3. Use Email Center to send

---

## 🚨 Troubleshooting

### "Case already exists"
**Cause**: Citation is duplicate  
**Fix**: Check if you already uploaded it (search by citation)

### "AI extraction failed"
**Cause**: Text too long/malformed, or AI quota exceeded  
**Fix**: Try shorter excerpt, or wait if quota exceeded (resets daily)

### "Processing very slow"
**Cause**: Large case text (100+ pages)  
**Fix**: Normal for large cases. Wait up to 2 minutes.

### "Upload failed"
**Cause**: Network error or Worker timeout  
**Fix**: Check Worker logs in Cloudflare, retry upload

---

## ⚙️ Technical Details

### AI Processing
- Model: Llama 3.1 8B (free tier)
- Max tokens: 1200 per summary
- Input limit: ~50,000 characters
- Processing time: 30-60 seconds

### Upgrade to Better AI
For higher quality legal summaries:
- Swap to Claude Haiku (~$0.01/case)
- See SETUP.md for instructions
- Same upload workflow, better results

### Data Storage
- Each case: ~50KB in database
- Principles: ~5KB each
- D1 free tier: 5GB (room for ~100k cases)

---

## 📊 Example Upload

### Input
```
Citation: [2018] TASSC 56
Case Name: R v Thompson
Court: Supreme Court

Case Text:
[Paste full judgment here - includes parties, facts, 
issues, reasoning, orders, etc. from AustLII]
```

### AI Output (30-60 seconds later)
```
✓ Successfully processed: [2018] TASSC 56

Facts: Defendant convicted of aggravated burglary. 
Prior criminal history including violent offences. 
Entered premises while occupants present.

Issues: 
- Appropriate sentencing range for aggravated burglary
- Weight of prior criminal history
- Relevance of early guilty plea

Holding: Sentenced to 4 years imprisonment, 
2 years suspended. Court considered seriousness 
of offence, prior history, but credited early plea.

Principles Extracted: 5
- Aggravated burglary sentencing framework
- Prior violent history as aggravating factor
- Early guilty plea discount principles
- [etc.]

Case added to database and searchable now.
```

---

## 🎯 Next Steps After Uploading

1. **Search test**: Try searching for keywords from the case
2. **Principles view**: Check what principles were extracted
3. **Cross-reference**: See if other cases cite same principles
4. **Email yourself**: Test sending case summary via email
5. **Upload more**: Build your research library over time

---

## 📅 Ongoing Workflow

### Daily (Automated)
- Cron checks for new Tasmanian criminal cases
- Auto-processes any found
- Email notification with new case list

### Weekly (You)
- Review new cases in email
- Upload any historical cases you need
- Search and research as needed

### Monthly (Optional)
- Export backup of database
- Review principles database growth
- Update Worker if needed

---

**Upload smarter, not harder. Focus on cases you actually need.**
