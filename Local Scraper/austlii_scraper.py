import base64
import requests
from bs4 import BeautifulSoup
import json
import time
import random
import logging
import re
from datetime import datetime
import os

# ── Paths (Windows-compatible) ───────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, 'scraper.log')
PROGRESS_FILE = os.path.join(BASE_DIR, 'scraper_progress.json')

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)

# ── Config ────────────────────────────────────────────────────────────────────
# Per-court year ranges (newest first). AustLII coverage varies by court:
# TASSC/TASMC go back to 2005; TASCCA/TASFC only reliably from 2010.
COURT_YEARS = {
    'TASSC':  list(range(2026, 2004, -1)),  # 2026 down to 2005
    'TASCCA': list(range(2026, 2009, -1)),  # 2026 down to 2010
    'TASFC':  list(range(2026, 2009, -1)),  # 2026 down to 2010
    'TASMC':  list(range(2026, 2004, -1)),  # 2026 down to 2005
}
UPLOAD_URL = 'https://arcanthyr.com/api/legal/upload-case'

# Max cases per session — at 10-20s average delay, 100 cases ≈ 17-33 minutes.
# Target rate: ~3-6 requests/minute — within normal human researcher range.
MAX_CASES_PER_SESSION = 150

# Business hours AEST only (UTC+10 standard, UTC+11 daylight saving)
BUSINESS_HOURS_START = 8   # 08:00
BUSINESS_HOURS_END = 18    # 18:00

# ── Text extraction ───────────────────────────────────────────────────────────

# Boilerplate patterns to strip from AustLII judgments.
# These are predictable sections that consume token budget without adding
# anything extractable by Llama (appearances, navigation, AustLII footer, etc.)
_BOILERPLATE_PATTERNS = [
    # AustLII navigation / database footer blocks
    re.compile(
        r'AustLII:.*?(?=\n\n|\Z)', re.IGNORECASE | re.DOTALL
    ),
    # "COUNSEL FOR THE [PARTY]" / appearances block
    # Matches from "Counsel:" or "Representation:" through to first blank line after last counsel entry
    re.compile(
        r'(?:Counsel|Solicitors?|Representation|Appearances?)[\s\S]{0,800}?(?=\n\n)',
        re.IGNORECASE
    ),
    # "I have read the draft reasons of [judge] and agree" — common in multi-judge decisions
    re.compile(
        r'I have (?:read|considered) the (?:draft )?(?:reasons|judgment) of\b[^\n]*\n?',
        re.IGNORECASE
    ),
    # AustLII page header / metadata line (e.g. "TASSC 1 of 2024 | AustLII | Databases")
    re.compile(
        r'^.*?(?:AustLII|Databases|LawCite|WorldLII).*?\n',
        re.IGNORECASE | re.MULTILINE
    ),
    # Repeated "ORDERS" block — orders often appear verbatim at both top and bottom.
    # We keep the first occurrence; this strips a duplicate if it appears after the reasons.
    # (Handled in deduplicate_orders() below rather than regex to be safer.)
]

# Short phrases that add no legal content — strip entire lines containing only these
_NOISE_LINES = {
    'austlii', 'worldlii', 'lawcite', 'feedback', 'home', 'databases',
    'search', 'download', 'bookmark', 'email', 'print this page',
    'no warranty', 'disclaimer', 'privacy policy', 'terms of use',
    '© austlii', 'copyright', 'last updated',
}


def _strip_boilerplate(text: str) -> str:
    """Remove predictable AustLII filler that wastes Llama token budget."""
    for pattern in _BOILERPLATE_PATTERNS:
        text = pattern.sub('', text)
    return text


def _strip_noise_lines(text: str) -> str:
    """Remove lines that consist only of navigation/footer noise."""
    lines = text.splitlines()
    cleaned = []
    for line in lines:
        stripped = line.strip().lower()
        # Drop very short lines that are pure noise keywords
        if stripped and any(noise in stripped for noise in _NOISE_LINES) and len(stripped) < 80:
            continue
        cleaned.append(line)
    return '\n'.join(cleaned)


def _compress_whitespace(text: str) -> str:
    """
    Normalise whitespace without losing paragraph structure.
    - Collapse runs of 3+ blank lines to 2 (preserve paragraph breaks)
    - Strip trailing whitespace from each line
    - Collapse multiple spaces/tabs within a line to single space
    """
    # Strip trailing whitespace per line
    lines = [line.rstrip() for line in text.splitlines()]
    text = '\n'.join(lines)
    # Collapse 3+ consecutive blank lines to 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Collapse multiple spaces/tabs within lines to single space
    text = re.sub(r'[ \t]{2,}', ' ', text)
    return text.strip()


def _deduplicate_orders(text: str) -> str:
    """
    AustLII judgments sometimes print the orders block verbatim at both the
    top (as a summary) and at the end of the reasons. If the orders block
    appears twice, remove the second occurrence to save token budget.
    We detect this by looking for a repeated 'ORDERS' / 'ORDER' heading.
    """
    # Find all positions of an ORDERS heading
    order_positions = [m.start() for m in re.finditer(
        r'\bORDERS?\b', text, re.IGNORECASE
    )]
    if len(order_positions) < 2:
        return text
    # Keep everything up to and including the second-last ORDERS heading,
    # then skip to the content after it only if the block appears to be a
    # near-duplicate (same first 200 chars). Otherwise leave untouched.
    first_block = text[order_positions[0]:order_positions[0] + 200].strip()
    last_block = text[order_positions[-1]:order_positions[-1] + 200].strip()
    similarity = sum(a == b for a, b in zip(first_block, last_block)) / max(len(first_block), 1)
    if similarity > 0.7:
        # Likely a duplicate — truncate at the last ORDERS heading
        text = text[:order_positions[-1]].strip()
    return text


def extract_text(html: str) -> str:
    """
    Extract clean plain text from AustLII HTML judgment page.

    Pipeline:
      1. BeautifulSoup: remove script/style/nav/header/footer tags
      2. Extract judgment div or body
      3. Get plain text with paragraph-preserving separator
      4. Strip AustLII boilerplate patterns
      5. Strip noise lines (navigation, footer keywords)
      6. Deduplicate repeated ORDERS block
      7. Compress whitespace
      8. Log compression ratio for monitoring

    The goal is maximum legal signal per character sent to Llama.
    """
    soup = BeautifulSoup(html, 'html.parser')

    # Remove non-content tags
    for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript']):
        tag.decompose()

    # Prefer the judgment div; fall back to body
    judgment = soup.find(class_='judgment') or soup.find('article') or soup.find('body')
    if not judgment:
        return ''

    raw_text = judgment.get_text(separator='\n', strip=True)
    original_len = len(raw_text)

    # Apply cleaning pipeline
    text = _strip_boilerplate(raw_text)

    # Truncate everything before the first judgment content marker.
    # AustLII pages reliably begin substantive content at "COURT :" or "CITATION :".
    _JUDGMENT_START_MARKERS = ['COURT :', 'CITATION :']
    _start_pos = -1
    for _marker in _JUDGMENT_START_MARKERS:
        _idx = text.find(_marker)
        if _idx != -1:
            if _start_pos == -1 or _idx < _start_pos:
                _start_pos = _idx
    if _start_pos != -1:
        text = text[_start_pos:]

    text = _strip_noise_lines(text)
    text = _deduplicate_orders(text)
    text = _compress_whitespace(text)

    final_len = len(text)
    reduction_pct = round((1 - final_len / original_len) * 100, 1) if original_len > 0 else 0
    logging.info(
        f'Text extraction: {original_len:,} → {final_len:,} chars '
        f'({reduction_pct}% reduction from boilerplate/whitespace stripping)'
    )

    return text


# ── Progress tracking ─────────────────────────────────────────────────────────
def load_progress():
    try:
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    except:
        return {}

def save_progress(progress):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, indent=2)

# ── Business hours check (AEST/AEDT) ─────────────────────────────────────────
def is_business_hours():
    """Returns True if current time is within 08:00–18:00 AEST or AEDT."""
    from zoneinfo import ZoneInfo
    hobart = ZoneInfo("Australia/Hobart")
    now = datetime.now(hobart)
    return BUSINESS_HOURS_START <= now.hour < BUSINESS_HOURS_END

# ── AustLII fetch (via Cloudflare Worker proxy) ───────────────────────────────
PROXY_URL = 'https://arcanthyr.com/api/legal/fetch-page'

def scrape_case(court, year, num):
    """Fetches AustLII case HTML via the Cloudflare Worker fetch-page proxy."""
    url = f'https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/tas/{court}/{year}/{num}.html'
    try:
        r = requests.post(PROXY_URL, json={'url': url}, timeout=90)
        if not r.ok:
            logging.error(f'Proxy error {court}/{year}/{num}: HTTP {r.status_code}')
            return None, r.status_code
        data = r.json()
        status = data.get('result', {}).get('status', 0)
        html = data.get('result', {}).get('html', '')
        if status in (404, 410):
            return None, status
        if status != 200 or not html:
            return None, status
        return html, 200
    except Exception as e:
        logging.error(f'Proxy request error {court}/{year}/{num}: {e}')
        return None, 0

# ── Upload to Worker ──────────────────────────────────────────────────────────
def upload_case(html, court, year, num):
    text = extract_text(html)
    if not text:
        return 0

    citation = f'[{year}] {court} {num}'

    if len(text) > 2_000_000:
        logging.warning(
            f'TRUNCATION ALERT: {citation} is {len(text):,} chars'
            f' — will be truncated to 2,000,000 at Worker'
        )
    elif len(text) > 200_000:
        logging.info(
            f'LARGE CASE: {citation} is {len(text):,} chars'
            f' (previously would have been truncated at 200K)'
        )

    try:
        r = requests.post(UPLOAD_URL, json={
            'case_text': base64.b64encode(text.encode()).decode(),
            'citation': citation,
            'source': 'AustLII',
            'court_hint': court,
            'year_hint': str(year),
            'encoding': 'base64',
        }, timeout=120)
        return r.status_code
    except Exception as e:
        logging.error(f'Upload error {court}/{year}/{num}: {e}')
        return 0

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if not is_business_hours():
        logging.info('Outside business hours (08:00–18:00 AEST) — exiting.')
        print('Outside business hours — scraper will not run outside 08:00–18:00 AEST.')
        return

    progress = load_progress()
    logging.info('=== Scraper started ===')
    cases_this_session = 0

    for court, years in COURT_YEARS.items():
        for year in years:
            key = f'{court}_{year}'

            if progress.get(key) == 'done':
                logging.info(f'Skipping {key} (already done)')
                continue

            logging.info(f'Starting {court} {year}')
            consecutive_misses = 0
            num = 1

            while consecutive_misses < 20:
                if cases_this_session >= MAX_CASES_PER_SESSION:
                    logging.info(f'Session limit ({MAX_CASES_PER_SESSION}) reached — stopping.')
                    save_progress(progress)
                    return

                html, status = scrape_case(court, year, num)

                if html:
                    consecutive_misses = 0
                    upload_status = upload_case(html, court, year, num)
                    logging.info(f'{court}/{year}/{num} → uploaded (HTTP {upload_status})')
                    cases_this_session += 1
                elif status == 500:
                    # AustLII server error — transient. Back off and retry once.
                    # If the retry also 500s, count as a miss and move on.
                    logging.warning(f'{court}/{year}/{num} → 500 (backing off 60-90s, retrying once)')
                    time.sleep(random.uniform(60, 90))
                    html2, status2 = scrape_case(court, year, num)
                    if html2:
                        consecutive_misses = 0
                        upload_status = upload_case(html2, court, year, num)
                        logging.info(f'{court}/{year}/{num} → uploaded after retry (HTTP {upload_status})')
                        cases_this_session += 1
                    else:
                        consecutive_misses += 1
                        logging.warning(f'{court}/{year}/{num} → {status2} after retry (miss {consecutive_misses}/20)')
                else:
                    consecutive_misses += 1
                    logging.info(f'{court}/{year}/{num} → {status} (miss {consecutive_misses}/20)')

                num += 1

                delay = random.uniform(10, 20)
                time.sleep(delay)

                # Occasional long pause (~7% chance) — mimics human reading behaviour
                if random.random() < 0.07:
                    time.sleep(random.uniform(25, 45))

            progress[key] = 'done'
            save_progress(progress)
            logging.info(f'Finished {court} {year}')

    logging.info('=== Scraper complete ===')

if __name__ == '__main__':
    main()
