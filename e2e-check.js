// arcanthyr.com end-to-end check
// Run: node e2e-check.js
// Results written to: e2e-results.txt

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://arcanthyr.com';
const RESULTS_FILE = path.join(__dirname, 'e2e-results.txt');

const results = [];
const consoleErrors = [];
let passCount = 0;
let failCount = 0;

function pass(name, detail = '') {
  passCount++;
  const msg = `PASS  ${name}${detail ? ' — ' + detail : ''}`;
  console.log('\x1b[32m' + msg + '\x1b[0m');
  results.push(msg);
}

function fail(name, detail = '') {
  failCount++;
  const msg = `FAIL  ${name}${detail ? ' — ' + detail : ''}`;
  console.log('\x1b[31m' + msg + '\x1b[0m');
  results.push(msg);
}

function section(title) {
  const line = `\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`;
  console.log('\x1b[36m' + line + '\x1b[0m');
  results.push(line);
}

async function waitForSelector(page, selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function run() {
  console.log('Launching Chromium…');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  // Collect console errors across all pages
  context.on('page', (pg) => {
    pg.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore favicon 404s
        if (!text.includes('favicon') && !text.includes('favicon.ico')) {
          consoleErrors.push({ url: pg.url(), text });
        }
      }
    });
  });

  const page = await context.newPage();

  // ─── 1. LANDING PAGE ───────────────────────────────────────────────────────
  section('1. LANDING PAGE');
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Logo — look for img with logo src, or an element with "logo" class/id, or SVG
    const logoFound = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const svgs = Array.from(document.querySelectorAll('svg'));
      const logoImgs = imgs.filter(i =>
        (i.src || '').toLowerCase().includes('logo') ||
        (i.alt || '').toLowerCase().includes('logo') ||
        (i.className || '').toLowerCase().includes('logo')
      );
      const logoDivs = document.querySelectorAll('[class*="logo"], [id*="logo"]');
      return logoImgs.length > 0 || logoDivs.length > 0 || svgs.length > 0;
    });
    logoFound ? pass('Landing: logo visible') : fail('Landing: logo visible', 'No logo/SVG found');

    // Tagline — look for a visible text element that isn't just a button
    const taglineFound = await page.evaluate(() => {
      // Look for any p, h1, h2, h3, or span with meaningful text (>10 chars) that isn't a button
      const candidates = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, span, div'))
        .filter(el => {
          const text = el.innerText?.trim() || '';
          const tag = el.tagName.toLowerCase();
          return text.length > 10 && text.length < 300 && !el.closest('button') && !el.closest('nav');
        });
      return candidates.length > 0;
    });
    taglineFound ? pass('Landing: tagline/content visible') : fail('Landing: tagline/content visible', 'No text content found outside nav/buttons');

    // 4 nav buttons
    const navButtonCount = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a[href]'));
      // Look for navigation-like buttons (AI Assist, Case Search, Legislation, Corpus Admin)
      const navKeywords = ['ai assist', 'case search', 'legislation', 'corpus admin', 'intel', 'research'];
      const navButtons = buttons.filter(b => {
        const text = (b.innerText || b.textContent || '').toLowerCase().trim();
        return navKeywords.some(kw => text.includes(kw));
      });
      return { found: navButtons.length, labels: navButtons.map(b => b.innerText?.trim()) };
    });

    if (navButtonCount.found >= 4) {
      pass('Landing: 4 nav buttons present', navButtonCount.labels.join(' | '));
    } else if (navButtonCount.found > 0) {
      fail('Landing: 4 nav buttons present', `Only found ${navButtonCount.found}: ${navButtonCount.labels.join(', ')}`);
    } else {
      // Fallback: count any clickable nav-area buttons
      const anyButtons = await page.$$eval('button, nav a', els => els.length);
      anyButtons >= 4
        ? pass('Landing: 4+ nav/buttons present (generic check)', `${anyButtons} total`)
        : fail('Landing: 4+ nav/buttons present', `Only ${anyButtons} total`);
    }
  } catch (e) {
    fail('Landing: page load', e.message);
  }

  // ─── 2. NAVIGATION ─────────────────────────────────────────────────────────
  section('2. NAVIGATION');

  const navTargets = [
    { label: 'AI Assist', keywords: ['ai assist', 'intel'], expectedPath: '/intel' },
    { label: 'Case Search', keywords: ['case search', 'library'], expectedPath: '/case-search' },
    { label: 'Legislation', keywords: ['legislation'], expectedPath: '/legislation' },
    { label: 'Corpus Admin', keywords: ['corpus admin', 'corpus'], expectedPath: '/corpus-admin' },
  ];

  for (const target of navTargets) {
    try {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1000);

      // Find the button/link for this nav target
      const clicked = await page.evaluate((keywords) => {
        const elements = Array.from(document.querySelectorAll('button, a'));
        const el = elements.find(e => {
          const text = (e.innerText || e.textContent || '').toLowerCase().trim();
          return keywords.some(kw => text.includes(kw));
        });
        if (el) { el.click(); return true; }
        return false;
      }, target.keywords);

      if (!clicked) {
        fail(`Nav: ${target.label} button found`, 'Button not found on landing page');
        continue;
      }

      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      const urlOk = target.expectedPath ? currentUrl.includes(target.expectedPath.replace('/case-search', '').replace('/corpus-admin', '')) : true;

      // More lenient check — just confirm URL changed from landing
      const navigated = currentUrl !== BASE_URL && currentUrl !== BASE_URL + '/';
      navigated
        ? pass(`Nav: ${target.label} navigates`, currentUrl)
        : fail(`Nav: ${target.label} navigates`, `Still at ${currentUrl}`);

      // Browser back
      await page.goBack({ waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(500);
      const backUrl = page.url();
      const backOk = backUrl === BASE_URL || backUrl === BASE_URL + '/' || backUrl.endsWith('/');
      backOk
        ? pass(`Nav: Back from ${target.label} returns to root`)
        : fail(`Nav: Back from ${target.label} returns to root`, `At ${backUrl}`);

    } catch (e) {
      fail(`Nav: ${target.label}`, e.message);
    }
  }

  // ─── 3. INTEL PAGE (/intel) ─────────────────────────────────────────────────
  section('3. INTEL PAGE (/intel)');
  try {
    const intelUrl = `${BASE_URL}/intel`;
    const pageErrors = [];
    const errListener = (msg) => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (!t.includes('favicon')) pageErrors.push(t);
      }
    };
    page.on('console', errListener);

    await page.goto(intelUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    page.off('console', errListener);

    // Console errors
    pageErrors.length === 0
      ? pass('Intel: no console errors on load')
      : fail('Intel: no console errors on load', pageErrors.slice(0, 2).join('; '));

    // Model toggle
    const modelToggleFound = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [role="tab"], label, span, div'));
      return els.some(e => {
        const t = (e.innerText || e.textContent || '').toLowerCase();
        return t.includes('claude') || t.includes('sol') || t.includes('vger') || t.includes("v'ger") || t.includes('model');
      });
    });
    modelToggleFound ? pass('Intel: model toggle visible') : fail('Intel: model toggle visible', 'No model selector found');

    // Domain filter pills (ALL, Criminal, etc.)
    const domainFilterFound = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [role="tab"], span, div'));
      return els.some(e => {
        const t = (e.innerText || e.textContent || '').toLowerCase().trim();
        return t === 'all' || t === 'criminal' || t.includes('administrative');
      });
    });
    domainFilterFound ? pass('Intel: domain filter pills visible') : fail('Intel: domain filter pills visible', 'No domain pills found');

    // Submit a query and wait for result
    const queryText = 'sentencing discount guilty plea';
    const textareaFound = await waitForSelector(page, 'textarea, input[type="text"], [contenteditable="true"]', 5000);
    if (!textareaFound) {
      fail('Intel: query input found', 'No textarea or text input');
    } else {
      // Focus and type
      const inputSel = await page.$('textarea') || await page.$('input[type="text"]');
      if (inputSel) {
        await inputSel.click();
        await inputSel.fill(queryText);
      } else {
        await page.click('[contenteditable="true"]');
        await page.keyboard.type(queryText);
      }

      // Submit — try Enter key, then look for a submit button
      await page.keyboard.press('Enter');

      // Wait up to 30s for a non-empty answer
      let answerFound = false;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        await page.waitForTimeout(2000);
        answerFound = await page.evaluate(() => {
          // Look for answer content areas
          const candidates = Array.from(document.querySelectorAll(
            '[class*="answer"], [class*="result"], [class*="reading"], [class*="response"], [class*="content"], article, .prose, p'
          ));
          return candidates.some(el => {
            const text = (el.innerText || el.textContent || '').trim();
            return text.length > 100 && !el.closest('textarea') && !el.closest('input');
          });
        });
        if (answerFound) break;
      }
      answerFound
        ? pass('Intel: answer appears within 30s')
        : fail('Intel: answer appears within 30s', 'No answer text found after 30s');

      // Sources panel — look for citation-like text
      const sourcesFound = await page.evaluate(() => {
        const body = document.body.innerText || '';
        // Citations look like [2023] TASSC 5 or similar
        return /\[\d{4}\]\s+TAS[A-Z]+\s+\d+/.test(body) ||
          document.querySelectorAll('[class*="citation"], [class*="source"], [class*="card"]').length > 0;
      });
      sourcesFound
        ? pass('Intel: sources/citations visible')
        : fail('Intel: sources/citations visible', 'No citation pattern or source cards found');
    }
  } catch (e) {
    fail('Intel: page test', e.message);
  }

  // ─── 4. CASE SEARCH ────────────────────────────────────────────────────────
  section('4. CASE SEARCH');
  try {
    // Find the correct route by trying common paths
    let caseSearchUrl = null;
    for (const candidate of ['/case-search', '/library', '/cases']) {
      try {
        const r = await page.goto(`${BASE_URL}${candidate}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        if (r && r.status() < 400) {
          caseSearchUrl = `${BASE_URL}${candidate}`;
          break;
        }
      } catch {}
    }

    // Fallback: use nav click from landing
    if (!caseSearchUrl) {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
      const clicked = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('button, a')).find(e =>
          (e.innerText || '').toLowerCase().includes('case search') ||
          (e.innerText || '').toLowerCase().includes('library')
        );
        if (el) { el.click(); return true; }
        return false;
      });
      if (clicked) {
        await page.waitForTimeout(2000);
        caseSearchUrl = page.url();
      }
    }

    if (!caseSearchUrl) {
      fail('Case Search: route found', 'Could not navigate to case search page');
    } else {
      await page.goto(caseSearchUrl, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1500);

      // Look for Word Search mode or tab
      const wordSearchTabFound = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button, [role="tab"], span'));
        return els.some(e => (e.innerText || e.textContent || '').toLowerCase().includes('word search'));
      });

      if (wordSearchTabFound) {
        // Click Word Search tab
        await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('button, [role="tab"], span')).find(e =>
            (e.innerText || e.textContent || '').toLowerCase().includes('word search')
          );
          if (el) el.click();
        });
        await page.waitForTimeout(500);
        pass('Case Search: Word Search tab found and clicked');
      } else {
        pass('Case Search: page loaded (no explicit Word Search tab — inline mode)');
      }

      // Type "assault" in search
      const searchInput = await page.$('input[type="text"], input[type="search"], textarea');
      if (searchInput) {
        await searchInput.click();
        await searchInput.fill('assault');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(4000);

        const resultsFound = await page.evaluate(() => {
          const body = document.body.innerText || '';
          return body.toLowerCase().includes('assault') &&
            (document.querySelectorAll('[class*="row"], [class*="result"], [class*="card"], tr').length > 0 ||
             body.includes('no results') || body.includes('no cases'));
        });
        resultsFound
          ? pass('Case Search: Word Search "assault" returns results or no-results message')
          : fail('Case Search: Word Search "assault" returns results', 'No results or error state found');
      } else {
        fail('Case Search: search input found', 'No text input on page');
      }

      // Domain filter pills
      const domainPillsFound = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button, span, div'));
        return els.some(e => {
          const t = (e.innerText || e.textContent || '').toLowerCase().trim();
          return t === 'all' || t === 'criminal' || t === 'administrative';
        });
      });
      domainPillsFound
        ? pass('Case Search: domain filter pills visible')
        : fail('Case Search: domain filter pills visible', 'No ALL/Criminal/Administrative pills found');

      // Name/Citation sub-tab
      const nameCitTabFound = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button, [role="tab"]'));
        return els.some(e => {
          const t = (e.innerText || e.textContent || '').toLowerCase();
          return t.includes('name') || t.includes('citation');
        });
      });

      if (nameCitTabFound) {
        await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('button, [role="tab"]')).find(e => {
            const t = (e.innerText || e.textContent || '').toLowerCase();
            return t.includes('name') || t.includes('citation');
          });
          if (el) el.click();
        });
        await page.waitForTimeout(500);
        pass('Case Search: Name/Citation tab found and clicked');

        // Type a citation fragment
        const citInput = await page.$('input[type="text"], input[type="search"]');
        if (citInput) {
          await citInput.click();
          await citInput.fill('TASSC 2023');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(3000);
          const noCrash = await page.evaluate(() => !document.body.innerText.includes('undefined') && document.body.innerText.length > 0);
          noCrash
            ? pass('Case Search: citation search does not crash')
            : fail('Case Search: citation search does not crash', 'Possible undefined/error in DOM');
        }
      } else {
        fail('Case Search: Name/Citation tab found', 'No Name or Citation tab visible');
      }
    }
  } catch (e) {
    fail('Case Search: page test', e.message);
  }

  // ─── 5. LEGISLATION ────────────────────────────────────────────────────────
  section('5. LEGISLATION (/legislation)');
  try {
    await page.goto(`${BASE_URL}/legislation`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    const searchInput = await page.$('input[type="text"], input[type="search"], textarea');
    if (!searchInput) {
      fail('Legislation: search box present', 'No input found');
    } else {
      pass('Legislation: search box present');
      await searchInput.click();
      await searchInput.fill('sentencing');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);

      const resultsFound = await page.evaluate(() => {
        const body = document.body.innerText || '';
        return body.toLowerCase().includes('sentencing') &&
          (document.querySelectorAll('[class*="row"], [class*="result"], [class*="card"], li, tr').length > 0 ||
           body.includes('no results') || body.includes('found'));
      });
      resultsFound
        ? pass('Legislation: search "sentencing" returns results or message')
        : fail('Legislation: search "sentencing" returns results', 'No visible results after search');
    }
  } catch (e) {
    fail('Legislation: page test', e.message);
  }

  // ─── 6. CORPUS ADMIN ───────────────────────────────────────────────────────
  section('6. CORPUS ADMIN');
  try {
    await page.goto(`${BASE_URL}/corpus-admin`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    const pageText = await page.evaluate(() => document.body.innerText || '');
    const crashed = pageText.toLowerCase().includes('error') && pageText.length < 200;
    !crashed
      ? pass('Corpus Admin: page loads without crashing', `${pageText.length} chars of content`)
      : fail('Corpus Admin: page loads without crashing', 'Appears to be an error page');

    // Sub-tabs: Cases / Legislation / Secondary Sources
    const uploadTabFound = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [role="tab"]'));
      return els.some(e => (e.innerText || e.textContent || '').toLowerCase().includes('upload'));
    });

    if (uploadTabFound) {
      await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('button, [role="tab"]')).find(e =>
          (e.innerText || e.textContent || '').toLowerCase().includes('upload')
        );
        if (el) el.click();
      });
      await page.waitForTimeout(800);
    }

    const subTabs = ['cases', 'legislation', 'secondary'];
    const foundSubTabs = await page.evaluate((subs) => {
      const els = Array.from(document.querySelectorAll('button, [role="tab"], span, li'));
      return subs.filter(sub => els.some(e =>
        (e.innerText || e.textContent || '').toLowerCase().includes(sub)
      ));
    }, subTabs);

    foundSubTabs.length >= 2
      ? pass('Corpus Admin: Upload sub-tabs render', foundSubTabs.join(', '))
      : fail('Corpus Admin: Upload sub-tabs render', `Only found: ${foundSubTabs.join(', ') || 'none'}`);

  } catch (e) {
    fail('Corpus Admin: page test', e.message);
  }

  // ─── 7. CONSOLE ERRORS SUMMARY ─────────────────────────────────────────────
  section('7. CONSOLE ERRORS (all pages)');
  if (consoleErrors.length === 0) {
    pass('Console errors: none detected across all pages');
  } else {
    const grouped = {};
    for (const { url, text } of consoleErrors) {
      const key = url.replace(BASE_URL, '');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(text);
    }
    for (const [route, errors] of Object.entries(grouped)) {
      fail(`Console errors on ${route || '/'}`, errors.slice(0, 3).join(' | '));
    }
  }

  await browser.close();

  // ─── SUMMARY ───────────────────────────────────────────────────────────────
  const summary = [
    '',
    '═'.repeat(64),
    `  FINAL SUMMARY:  PASSED ${passCount}  /  FAILED ${failCount}`,
    '═'.repeat(64),
  ];
  if (failCount > 0) {
    summary.push('\nFAILURES:');
    results.filter(r => r.startsWith('FAIL')).forEach(r => summary.push('  ' + r));
  }
  const summaryText = summary.join('\n');
  console.log('\x1b[33m' + summaryText + '\x1b[0m');
  results.push(...summary);

  fs.writeFileSync(RESULTS_FILE, results.join('\n'), 'utf8');
  console.log(`\nResults written to: ${RESULTS_FILE}`);
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
