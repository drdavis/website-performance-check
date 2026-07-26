# Website Performance Check — Chrome Extension Design

**Date:** 2026-07-26
**Owner:** Don Davis (personal use, single user)
**Status:** Approved design → ready for implementation plan

## Purpose

A personal Chrome extension. While browsing any site, click the toolbar icon and a
side panel opens showing that site's organic SEO strength at a glance:

- **Overall Score** (0–100)
- **Organic ranked keywords** (count + position distribution)
- **Estimated monthly organic traffic** — current number **plus a month-over-month graph**
- **AI Verdict** — a short plain-English assessment plus 2–3 opportunities

Data comes from the user's DataForSEO account (REST API). The AI verdict is generated
via the user's OpenRouter account, routed to a Claude model.

## Non-Goals (v1)

- No backlinks / referring domains (may be added later).
- No multi-user support, accounts, or sync. Credentials live in local extension storage.
- No interactive/zoomable charts. The month-over-month graph is a simple read-only line.
- No paid-search / PPC data.

## Architecture

Manifest V3 Chrome extension with three parts:

1. **Side panel** (`chrome.sidePanel` API) — the UI. Clicking the toolbar icon opens
   the panel docked to the right of the current page. Renders score, metrics, and AI
   verdict. Plain HTML/CSS/JS (no framework needed).
2. **Background service worker** — orchestrates the work: reads the active tab's URL,
   derives the registrable domain, calls DataForSEO and OpenRouter, computes the score,
   and returns a result object to the panel. API calls run here so `host_permissions`
   grant CORS access.
3. **Settings (options) page** — where the user stores:
   - DataForSEO API login + password
   - OpenRouter API key (optional; if empty, the AI Verdict section is hidden)
   - OpenRouter model slug (default: a Haiku-class Claude model)
   - Default location (United States, `location_code` 2840) and language (`en`)

Credentials are stored with `chrome.storage.local`. No backend or proxy — acceptable
because this is a single-user personal tool.

### Permissions (manifest)
- `sidePanel`
- `activeTab`, `tabs` — to read the current tab's URL
- `storage` — to persist credentials/settings
- `host_permissions`: `https://api.dataforseo.com/*`, `https://openrouter.ai/*`

## Data Flow (one click / one refresh)

1. Panel opens, asks the service worker to analyze the active tab.
2. Service worker extracts the domain from the tab URL (e.g. `www.nike.com` → `nike.com`).
   Skips `chrome://`, `about:`, extension, and blank pages with a friendly message.
3. **DataForSEO calls** — two live requests (run concurrently), same Basic auth and the
   same `location_code` / `language_code`:

   a. **Current snapshot** — `POST /v3/dataforseo_labs/google/domain_rank_overview/live`
      - Body: `[{ "target": "<domain>", "location_code": <code>, "language_code": "<lang>" }]`
      - Returns (under `tasks[0].result[0].items[0].metrics.organic`):
        - `etv` — estimated monthly organic traffic (visits/month)
        - `count` — total ranked organic keywords
        - `pos_1`, `pos_2_3`, `pos_4_10`, `pos_11_20`, `pos_21_30`, ... — keyword counts by
          SERP position bucket

   b. **History** — `POST /v3/dataforseo_labs/google/historical_rank_overview/live`
      - Body: `[{ "target": "<domain>", "location_code": <code>, "language_code": "<lang>" }]`
      - Returns `tasks[0].result[0].items[]`, one entry per month, each with `year`,
        `month`, and `metrics.organic.etv`. We take the most recent ~12 months, sorted
        oldest→newest, to build the month-over-month traffic series.
4. **Compute Overall Score** locally (formula below).
5. **OpenRouter call** (only if an OpenRouter key is set) —
   `POST https://openrouter.ai/api/v1/chat/completions`
   - Auth: `Authorization: Bearer <openrouter_key>`
   - Model: the configured slug (default Haiku-class Claude)
   - Prompt: the domain + the computed metrics + score, asking for one verdict sentence
     and 2–3 concrete opportunities. Response requested as compact JSON
     (`{ "verdict": "...", "opportunities": ["...", "..."] }`) and parsed defensively.
6. Panel renders score, metric cards, and (if present) the AI verdict. The traffic card
   shows the **current monthly estimate as a big number above a month-over-month line
   graph** (last ~12 months, drawn as inline SVG — no charting library), with a caption
   noting the latest month and its change vs. the prior month. If history has only one
   usable data point, the number shows and the graph is hidden. Shows a "last checked"
   timestamp and a Refresh button.

### Result object (service worker → panel)
```
{
  domain: string,
  score: number,            // 0–100
  scoreBand: "low"|"medium"|"high",
  traffic: number,          // etv, current monthly organic visits
  history: [                // month-over-month organic traffic, oldest → newest
    { label: string,        // e.g. "2025-08"
      traffic: number }
  ],
  keywords: {
    total: number,
    top3: number,           // pos_1 + pos_2_3
    top10: number,          // + pos_4_10
    rest: number
  },
  ai: { verdict: string, opportunities: string[] } | null,
  checkedAt: string,        // ISO timestamp
  error?: string
}
```

## Overall Score Formula (0–100, tunable)

Weighted composite so the score reflects strength, not just raw size:

- **Traffic — 40 pts:** `40 * clamp(log10(etv + 1) / 6, 0, 1)`
  (log10 of 1,000,000 = 6 → a site at ~1M monthly organic visits maxes this component.)
- **Keywords — 30 pts:** `30 * clamp(log10(count + 1) / 5, 0, 1)`
  (log10 of 100,000 = 5 → ~100k ranked keywords maxes this component.)
- **Rank quality — 30 pts:** `30 * (pos_1*1.0 + pos_2_3*0.7 + pos_4_10*0.4) / max(count, 1)`
  (Rewards keywords that actually rank near the top, not just presence.)

Total rounded to an integer. Bands: **0–39 low (red)**, **40–69 medium (amber)**,
**70–100 high (green)**. Constants live in one config object so they're easy to retune.

## Error Handling

- **Missing credentials:** panel shows a "Add your DataForSEO credentials in Settings"
  state with a button that opens the options page.
- **Non-analyzable page** (`chrome://`, new tab, blank): friendly "Navigate to a website
  to analyze it" message, no API call made.
- **DataForSEO error / no data for domain (either call)** (new or unknown domain returns empty
  `result`): show "No organic data found for this domain" rather than a broken score.
- **DataForSEO auth failure (401) or quota error:** surface the API's status message.
- **OpenRouter failure or unparseable response:** metrics still render; the AI Verdict
  section shows a small "AI verdict unavailable" note instead of failing the whole panel.
- All network calls wrapped with try/catch; the result object carries an `error` field
  the panel can display.

## File Structure

```
manifest.json
src/
  background.js        # service worker: tab → domain, API calls, scoring
  panel.html          # side panel markup
  panel.js            # renders result, handles refresh + settings link
  panel.css
  options.html        # settings form
  options.js          # load/save credentials & prefs to chrome.storage.local
  lib/
    dataforseo.js     # domainRankOverview() + historicalRankOverview() → normalized data
    openrouter.js     # aiVerdict(domain, metrics, score, opts) → {verdict, opportunities}
    score.js          # computeScore(metrics) → {score, band}  (pure, unit-testable)
    domain.js         # urlToDomain(url) → registrable domain  (pure, unit-testable)
    chart.js          # trafficChartSvg(history) → SVG line-chart string  (pure, unit-testable)
icons/                # 16/32/48/128 px
test/                 # unit tests for score.js, domain.js, chart.js
```

## Testing

- **`score.js`** — pure function; unit tests covering low/medium/high fixtures, the
  log-scale clamps, and division-by-zero safety (count = 0).
- **`domain.js`** — pure function; tests for `www.` stripping, subdomains, paths/query
  removal, and non-http URLs returning null.
- **`chart.js`** — pure function; tests that N points produce a valid SVG path, that a
  single point hides the graph, and that a flat/zero series doesn't divide by zero.
- **API modules** — thin fetch wrappers; verified by manual smoke test against a known
  domain (e.g. a site with clear organic presence) plus one unknown/empty domain.
- **End-to-end** — load unpacked, enter credentials, click through a few live sites.

## Open Items / Future (not in v1)

- Backlinks + referring-domains component in the score.
- Location selector in the panel itself (not just settings).
- Caching recent lookups to save API calls on repeat visits.
