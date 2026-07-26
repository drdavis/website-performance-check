# Website Performance Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A personal Manifest V3 Chrome extension that, on toolbar click, opens a side panel showing the current site's organic SEO Overall Score, ranked-keyword breakdown, month-over-month organic traffic (number + graph), and an AI verdict — all from the user's DataForSEO and OpenRouter accounts.

**Architecture:** Everything is ES modules. Pure, side-effect-free logic (domain parsing, scoring, chart SVG, API-response parsing, prompt building) lives in `src/lib/` and is unit-tested with Node's built-in test runner. The background service worker orchestrates: read active tab → derive domain → load settings → call DataForSEO (2 concurrent calls) → compute score → optional OpenRouter verdict → return a result object. The side panel renders it; the options page stores credentials.

**Tech Stack:** Manifest V3, `chrome.sidePanel` / `chrome.storage.local` / `chrome.tabs`, vanilla JS ES modules, inline SVG chart, `node --test` for unit tests, a dependency-free Node PNG generator for icons.

---

## File Structure

```
package.json            # type:module, test + icons scripts
manifest.json           # MV3 manifest
tools/
  make-icons.mjs        # generates solid-color placeholder PNGs (no deps)
src/
  background.js         # service worker: orchestration (glue)
  panel.html            # side panel markup
  panel.js              # renders result, refresh, settings link (glue)
  panel.css             # panel styling
  options.html          # settings form
  options.js            # load/save settings to chrome.storage.local (glue)
  lib/
    domain.js           # urlToDomain(url) → domain|null           (pure)
    score.js            # computeScore(metrics) → {score, band}     (pure)
    chart.js            # chartPoints(), trafficChartSvg(history)   (pure)
    dataforseo.js       # parseRankOverview(), parseHistory() (pure) + network wrappers
    openrouter.js       # buildPrompt(), parseVerdict() (pure) + aiVerdict() wrapper
icons/                  # icon-16/32/48/128.png (generated)
test/
  domain.test.js
  score.test.js
  chart.test.js
  dataforseo.test.js
  openrouter.test.js
```

**Settings keys** (in `chrome.storage.local`), shared by `options.js` and `background.js`:
`dfLogin`, `dfPassword`, `orKey`, `orModel`, `locationCode`, `languageCode`.
Defaults: `orModel="anthropic/claude-3.5-haiku"`, `locationCode=2840`, `languageCode="en"`.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Verify: `.gitignore` (already exists with `node_modules/`, `.DS_Store`, `*.log`)

- [ ] **Step 1: Confirm Node has the test runner**

Run: `node --version`
Expected: `v18.x` or higher (built-in `node --test` requires Node 18+).

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "website-performance-check",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "icons": "node tools/make-icons.mjs"
  }
}
```

- [ ] **Step 3: Create directories**

Run: `mkdir -p src/lib tools test icons`
Expected: no output, directories created.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: project scaffold"
```

---

## Task 2: `domain.js` — URL → domain (pure, TDD)

**Files:**
- Create: `src/lib/domain.js`
- Test: `test/domain.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/domain.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { urlToDomain } from "../src/lib/domain.js";

test("strips www and path", () => {
  assert.equal(urlToDomain("https://www.nike.com/shoes"), "nike.com");
});
test("plain domain", () => {
  assert.equal(urlToDomain("https://nike.com"), "nike.com");
});
test("keeps non-www subdomain", () => {
  assert.equal(urlToDomain("https://blog.example.com/p?x=1"), "blog.example.com");
});
test("lowercases host", () => {
  assert.equal(urlToDomain("http://Example.COM/x"), "example.com");
});
test("rejects chrome:// pages", () => {
  assert.equal(urlToDomain("chrome://extensions"), null);
});
test("rejects about:blank", () => {
  assert.equal(urlToDomain("about:blank"), null);
});
test("rejects empty/garbage", () => {
  assert.equal(urlToDomain(""), null);
  assert.equal(urlToDomain("not a url"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/domain.test.js`
Expected: FAIL — cannot find module `../src/lib/domain.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/domain.js
export function urlToDomain(url) {
  if (!url) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  let host = u.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  return host || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/domain.test.js`
Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain.js test/domain.test.js
git commit -m "feat: urlToDomain — derive analyzable domain from tab URL"
```

---

## Task 3: `score.js` — Overall Score (pure, TDD)

**Files:**
- Create: `src/lib/score.js`
- Test: `test/score.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/score.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeScore } from "../src/lib/score.js";

test("all-zero metrics → 0, low", () => {
  const r = computeScore({ etv: 0, count: 0, pos_1: 0, pos_2_3: 0, pos_4_10: 0 });
  assert.equal(r.score, 0);
  assert.equal(r.band, "low");
});

test("huge authoritative site → high band, near 100", () => {
  const r = computeScore({
    etv: 1_000_000, count: 100_000,
    pos_1: 50_000, pos_2_3: 30_000, pos_4_10: 20_000
  });
  assert.equal(r.band, "high");
  assert.ok(r.score >= 85, `expected >=85, got ${r.score}`);
});

test("mid-size site → medium band", () => {
  const r = computeScore({
    etv: 5_000, count: 500, pos_1: 10, pos_2_3: 40, pos_4_10: 150
  });
  assert.equal(r.band, "medium");
  assert.ok(r.score >= 40 && r.score < 70, `expected 40-69, got ${r.score}`);
});

test("missing/undefined fields do not throw or NaN", () => {
  const r = computeScore({});
  assert.equal(Number.isFinite(r.score), true);
  assert.equal(r.score, 0);
});

test("count 0 with stray pos values → no divide-by-zero", () => {
  const r = computeScore({ etv: 100, count: 0, pos_1: 5 });
  assert.equal(Number.isFinite(r.score), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/score.test.js`
Expected: FAIL — cannot find module `../src/lib/score.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/score.js
// Weights are collected here so the score is easy to retune.
export const WEIGHTS = {
  trafficPts: 40, trafficLogMax: 6,   // log10(1e6) = 6
  keywordPts: 30, keywordLogMax: 5,   // log10(1e5) = 5
  rankPts: 30, rankPos1: 1.0, rankPos23: 0.7, rankPos410: 0.4
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function computeScore(metrics) {
  const m = metrics || {};
  const etv = Math.max(0, Number(m.etv) || 0);
  const count = Math.max(0, Number(m.count) || 0);
  const p1 = Number(m.pos_1) || 0;
  const p23 = Number(m.pos_2_3) || 0;
  const p410 = Number(m.pos_4_10) || 0;

  const traffic = WEIGHTS.trafficPts * clamp01(Math.log10(etv + 1) / WEIGHTS.trafficLogMax);
  const keywords = WEIGHTS.keywordPts * clamp01(Math.log10(count + 1) / WEIGHTS.keywordLogMax);
  const weighted = p1 * WEIGHTS.rankPos1 + p23 * WEIGHTS.rankPos23 + p410 * WEIGHTS.rankPos410;
  const rank = WEIGHTS.rankPts * (weighted / Math.max(count, 1));

  const raw = traffic + keywords + rank;
  const score = Math.round(Math.max(0, Math.min(100, raw)));
  const band = score < 40 ? "low" : score < 70 ? "medium" : "high";
  return { score, band };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/score.test.js`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/score.js test/score.test.js
git commit -m "feat: computeScore — 0-100 organic strength composite"
```

---

## Task 4: `chart.js` — month-over-month SVG (pure, TDD)

**Files:**
- Create: `src/lib/chart.js`
- Test: `test/chart.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/chart.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartPoints, trafficChartSvg } from "../src/lib/chart.js";

const hist = [
  { label: "2025-05", traffic: 100 },
  { label: "2025-06", traffic: 300 },
  { label: "2025-07", traffic: 200 }
];

test("chartPoints returns one point per data row", () => {
  const pts = chartPoints(hist, { width: 260, height: 80, padX: 6, padY: 8 });
  assert.equal(pts.length, 3);
  for (const p of pts) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test("fewer than 2 points → empty array / empty svg", () => {
  assert.deepEqual(chartPoints([{ label: "2025-07", traffic: 5 }]), []);
  assert.equal(trafficChartSvg([{ label: "2025-07", traffic: 5 }]), "");
  assert.equal(trafficChartSvg([]), "");
});

test("trafficChartSvg emits an <svg> with a <polyline>", () => {
  const svg = trafficChartSvg(hist);
  assert.ok(svg.includes("<svg"));
  assert.ok(svg.includes("<polyline"));
});

test("flat series does not produce NaN", () => {
  const svg = trafficChartSvg([
    { label: "a", traffic: 100 },
    { label: "b", traffic: 100 }
  ]);
  assert.ok(svg.includes("<svg"));
  assert.equal(svg.includes("NaN"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/chart.test.js`
Expected: FAIL — cannot find module `../src/lib/chart.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/chart.js
const round2 = (n) => Math.round(n * 100) / 100;

export function chartPoints(history, dims) {
  const { width = 260, height = 80, padX = 6, padY = 8 } = dims || {};
  const rows = Array.isArray(history) ? history : [];
  const n = rows.length;
  if (n < 2) return [];
  const vals = rows.map((h) => Number(h.traffic) || 0);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min;
  return rows.map((h, i) => {
    const x = padX + (i * (width - 2 * padX)) / (n - 1);
    const ratio = span === 0 ? 0.5 : ((Number(h.traffic) || 0) - min) / span;
    const y = padY + (1 - ratio) * (height - 2 * padY);
    return { x: round2(x), y: round2(y) };
  });
}

export function trafficChartSvg(history, dims) {
  const opts = { width: 260, height: 80, padX: 6, padY: 8, ...(dims || {}) };
  const pts = chartPoints(history, opts);
  if (pts.length < 2) return "";
  const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    `<svg viewBox="0 0 ${opts.width} ${opts.height}" width="100%" height="${opts.height}" ` +
    `preserveAspectRatio="none" class="traffic-chart" aria-hidden="true">` +
    `<polyline fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linejoin="round" stroke-linecap="round" points="${poly}"/>` +
    `<circle cx="${last.x}" cy="${last.y}" r="2.5" fill="currentColor"/>` +
    `</svg>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/chart.test.js`
Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chart.js test/chart.test.js
git commit -m "feat: trafficChartSvg — inline SVG month-over-month line chart"
```

---

## Task 5: `dataforseo.js` — parsers (pure, TDD) + network wrappers

**Files:**
- Create: `src/lib/dataforseo.js`
- Test: `test/dataforseo.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/dataforseo.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRankOverview, parseHistory } from "../src/lib/dataforseo.js";

const rankJson = {
  tasks: [{
    status_code: 20000,
    result: [{
      items: [{
        metrics: {
          organic: { etv: 1234.5, count: 5000, pos_1: 100, pos_2_3: 200, pos_4_10: 300 }
        }
      }]
    }]
  }]
};

const historyJson = {
  tasks: [{
    status_code: 20000,
    result: [{
      items: [
        { year: 2025, month: 7, metrics: { organic: { etv: 1200 } } },
        { year: 2025, month: 5, metrics: { organic: { etv: 900 } } },
        { year: 2025, month: 6, metrics: { organic: { etv: 1000 } } }
      ]
    }]
  }]
};

test("parseRankOverview pulls organic metrics", () => {
  const m = parseRankOverview(rankJson);
  assert.deepEqual(m, { etv: 1234.5, count: 5000, pos_1: 100, pos_2_3: 200, pos_4_10: 300 });
});

test("parseRankOverview returns null when no items", () => {
  assert.equal(parseRankOverview({ tasks: [{ result: [{ items: [] }] }] }), null);
  assert.equal(parseRankOverview({}), null);
});

test("parseHistory sorts oldest→newest and labels YYYY-MM", () => {
  const h = parseHistory(historyJson);
  assert.deepEqual(h, [
    { label: "2025-05", traffic: 900 },
    { label: "2025-06", traffic: 1000 },
    { label: "2025-07", traffic: 1200 }
  ]);
});

test("parseHistory caps to last N months", () => {
  const items = [];
  for (let mth = 1; mth <= 18; mth++) {
    items.push({ year: 2025, month: mth, metrics: { organic: { etv: mth } } });
  }
  const h = parseHistory({ tasks: [{ result: [{ items }] }] }, 12);
  assert.equal(h.length, 12);
  assert.equal(h[0].label, "2025-07"); // months 7..18 kept (with month>12 just an id here)
});

test("parseHistory returns [] for missing data", () => {
  assert.deepEqual(parseHistory({}), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dataforseo.test.js`
Expected: FAIL — cannot find module `../src/lib/dataforseo.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/dataforseo.js
const BASE = "https://api.dataforseo.com/v3";

// ---- Pure parsers ----
export function parseRankOverview(json) {
  const item = json?.tasks?.[0]?.result?.[0]?.items?.[0];
  const o = item?.metrics?.organic;
  if (!o) return null;
  return {
    etv: Number(o.etv) || 0,
    count: Number(o.count) || 0,
    pos_1: Number(o.pos_1) || 0,
    pos_2_3: Number(o.pos_2_3) || 0,
    pos_4_10: Number(o.pos_4_10) || 0
  };
}

export function parseHistory(json, limit = 12) {
  const items = json?.tasks?.[0]?.result?.[0]?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      year: Number(it.year) || 0,
      month: Number(it.month) || 0,
      traffic: Number(it?.metrics?.organic?.etv) || 0
    }))
    .filter((r) => r.year && r.month)
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-limit)
    .map((r) => ({ label: `${r.year}-${String(r.month).padStart(2, "0")}`, traffic: r.traffic }));
}

// ---- Network wrappers (run in the service worker; btoa/fetch are globals there) ----
function authHeader(login, password) {
  return "Basic " + btoa(`${login}:${password}`);
}

async function post(path, body, { login, password }) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { Authorization: authHeader(login, password), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`);
  const task = json?.tasks?.[0];
  if (task && task.status_code !== 20000) {
    throw new Error(task.status_message || "DataForSEO error");
  }
  return json;
}

export async function domainRankOverview(domain, o) {
  const json = await post(
    "/dataforseo_labs/google/domain_rank_overview/live",
    [{ target: domain, location_code: o.locationCode, language_code: o.languageCode }],
    o
  );
  return parseRankOverview(json);
}

export async function historicalRankOverview(domain, o) {
  const json = await post(
    "/dataforseo_labs/google/historical_rank_overview/live",
    [{ target: domain, location_code: o.locationCode, language_code: o.languageCode }],
    o
  );
  return parseHistory(json);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/dataforseo.test.js`
Expected: PASS — all 5 tests pass. (The network wrappers are not exercised here; they're smoke-tested end-to-end in Task 11.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/dataforseo.js test/dataforseo.test.js
git commit -m "feat: DataForSEO parsers + rank/history API wrappers"
```

---

## Task 6: `openrouter.js` — prompt + verdict parsing (pure, TDD) + wrapper

**Files:**
- Create: `src/lib/openrouter.js`
- Test: `test/openrouter.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/openrouter.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, parseVerdict } from "../src/lib/openrouter.js";

const metrics = { etv: 5000, count: 500, pos_1: 10, pos_2_3: 40, pos_4_10: 150 };

test("buildPrompt includes domain and key numbers", () => {
  const p = buildPrompt("nike.com", metrics, 47);
  assert.ok(p.includes("nike.com"));
  assert.ok(p.includes("47"));
  assert.ok(p.includes("500"));   // ranked keywords
  assert.ok(p.includes("50"));    // top-3 = pos_1 + pos_2_3 = 50
});

test("parseVerdict reads clean JSON", () => {
  const v = parseVerdict('{"verdict":"Solid authority.","opportunities":["Add content","Fix titles"]}');
  assert.equal(v.verdict, "Solid authority.");
  assert.deepEqual(v.opportunities, ["Add content", "Fix titles"]);
});

test("parseVerdict extracts JSON embedded in prose", () => {
  const v = parseVerdict('Here you go:\n{"verdict":"Growing.","opportunities":["Blog more"]}\nThanks!');
  assert.equal(v.verdict, "Growing.");
  assert.deepEqual(v.opportunities, ["Blog more"]);
});

test("parseVerdict falls back to first line on garbage", () => {
  const v = parseVerdict("This site looks strong overall.\nSome more text.");
  assert.equal(v.verdict, "This site looks strong overall.");
  assert.deepEqual(v.opportunities, []);
});

test("parseVerdict handles empty input", () => {
  const v = parseVerdict("");
  assert.equal(v.verdict, "");
  assert.deepEqual(v.opportunities, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/openrouter.test.js`
Expected: FAIL — cannot find module `../src/lib/openrouter.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/openrouter.js
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// ---- Pure helpers ----
export function buildPrompt(domain, m, score) {
  const top3 = (m.pos_1 || 0) + (m.pos_2_3 || 0);
  const top10 = top3 + (m.pos_4_10 || 0);
  return [
    `Domain: ${domain}`,
    `Overall score: ${score}/100`,
    `Estimated monthly organic traffic: ${Math.round(m.etv || 0)}`,
    `Ranked organic keywords: ${m.count || 0}`,
    `Keywords in top 3: ${top3}`,
    `Keywords in top 10: ${top10}`,
    ``,
    `Give a one-sentence verdict on this site's organic SEO strength, then 2-3 concrete opportunities to improve it.`
  ].join("\n");
}

export function parseVerdict(text) {
  if (!text) return { verdict: "", opportunities: [] };
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj && typeof obj.verdict === "string") {
        return {
          verdict: obj.verdict,
          opportunities: Array.isArray(obj.opportunities) ? obj.opportunities.map(String) : []
        };
      }
    } catch {
      // fall through to line-based fallback
    }
  }
  const firstLine = text.split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
  return { verdict: firstLine.slice(0, 240), opportunities: [] };
}

// ---- Network wrapper (service worker) ----
export async function aiVerdict(domain, metrics, score, { apiKey, model }) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Website Performance Check"
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            'You are an SEO analyst. Respond ONLY with compact JSON of the form ' +
            '{"verdict": "<one sentence>", "opportunities": ["...", "..."]}. No markdown, no prose.'
        },
        { role: "user", content: buildPrompt(domain, metrics, score) }
      ]
    })
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content || "";
  return parseVerdict(content);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/openrouter.test.js`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/openrouter.js test/openrouter.test.js
git commit -m "feat: OpenRouter prompt builder + verdict parser + aiVerdict"
```

---

## Task 7: Full test run + icons + manifest

**Files:**
- Create: `tools/make-icons.mjs`
- Create: `manifest.json`

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all suites (domain, score, chart, dataforseo, openrouter) green.

- [ ] **Step 2: Create the icon generator**

```js
// tools/make-icons.mjs
// Dependency-free solid-color PNG generator (placeholder brand icon: blue #2563eb).
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function makePng(size, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type 2 = RGB
  const rowLen = size * 3 + 1;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const o = y * rowLen + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("icons", { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`icons/icon-${size}.png`, makePng(size, [37, 99, 235]));
}
console.log("icons written: 16, 32, 48, 128");
```

- [ ] **Step 3: Generate the icons**

Run: `npm run icons`
Expected: `icons written: 16, 32, 48, 128`.

- [ ] **Step 4: Verify icon files exist and are valid PNGs**

Run: `file icons/icon-128.png`
Expected: `icons/icon-128.png: PNG image data, 128 x 128, 8-bit/color RGB, non-interlaced`.

- [ ] **Step 5: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Website Performance Check",
  "version": "1.0.0",
  "description": "Organic SEO score, keywords, and month-over-month traffic for the current site, via DataForSEO.",
  "permissions": ["sidePanel", "tabs", "storage"],
  "host_permissions": ["https://api.dataforseo.com/*", "https://openrouter.ai/*"],
  "background": { "service_worker": "src/background.js", "type": "module" },
  "action": { "default_title": "Website Performance Check" },
  "side_panel": { "default_path": "src/panel.html" },
  "options_page": "src/options.html",
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add tools/make-icons.mjs icons manifest.json
git commit -m "feat: icons generator, generated icons, MV3 manifest"
```

---

## Task 8: Options (settings) page

**Files:**
- Create: `src/options.html`
- Create: `src/options.js`

- [ ] **Step 1: Create `src/options.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Website Performance Check — Settings</title>
  <style>
    body { font: 14px system-ui, sans-serif; max-width: 460px; margin: 24px auto; padding: 0 16px; color: #1f2937; }
    h1 { font-size: 18px; }
    label { display: block; margin: 14px 0 4px; font-weight: 600; }
    input { width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; }
    .hint { color: #6b7280; font-weight: 400; font-size: 12px; margin-top: 2px; }
    .row { display: flex; gap: 12px; }
    .row > div { flex: 1; }
    button { margin-top: 18px; background: #2563eb; color: #fff; border: 0; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    #status { margin-left: 10px; color: #16a34a; }
  </style>
</head>
<body>
  <h1>Website Performance Check — Settings</h1>

  <label>DataForSEO API login</label>
  <input id="dfLogin" type="text" autocomplete="off" />

  <label>DataForSEO API password</label>
  <input id="dfPassword" type="password" autocomplete="off" />
  <div class="hint">From your DataForSEO dashboard → API access. Used with HTTP Basic auth.</div>

  <label>OpenRouter API key <span class="hint">(optional — enables the AI verdict)</span></label>
  <input id="orKey" type="password" autocomplete="off" />

  <label>OpenRouter model</label>
  <input id="orModel" type="text" placeholder="anthropic/claude-3.5-haiku" />
  <div class="hint">Any OpenRouter model slug. Default is a fast Claude Haiku model.</div>

  <div class="row">
    <div>
      <label>Location code</label>
      <input id="locationCode" type="number" placeholder="2840" />
      <div class="hint">2840 = United States.</div>
    </div>
    <div>
      <label>Language code</label>
      <input id="languageCode" type="text" placeholder="en" />
    </div>
  </div>

  <div>
    <button id="save">Save</button>
    <span id="status"></span>
  </div>

  <script type="module" src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `src/options.js`**

```js
// src/options.js
const DEFAULTS = { orModel: "anthropic/claude-3.5-haiku", locationCode: 2840, languageCode: "en" };
const FIELDS = ["dfLogin", "dfPassword", "orKey", "orModel", "locationCode", "languageCode"];

async function load() {
  const s = await chrome.storage.local.get(null);
  const merged = { ...DEFAULTS, ...s };
  for (const id of FIELDS) {
    const el = document.getElementById(id);
    if (el && merged[id] !== undefined && merged[id] !== null) el.value = merged[id];
  }
}

async function save() {
  const data = {};
  for (const id of FIELDS) data[id] = document.getElementById(id).value.trim();
  data.locationCode = Number(data.locationCode) || DEFAULTS.locationCode;
  data.languageCode = data.languageCode || DEFAULTS.languageCode;
  data.orModel = data.orModel || DEFAULTS.orModel;
  await chrome.storage.local.set(data);
  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
}

document.getElementById("save").addEventListener("click", save);
load();
```

- [ ] **Step 3: Commit**

```bash
git add src/options.html src/options.js
git commit -m "feat: settings page for DataForSEO + OpenRouter credentials"
```

*(Functional verification of the options page happens during the end-to-end load in Task 11.)*

---

## Task 9: Background service worker (orchestration)

**Files:**
- Create: `src/background.js`

- [ ] **Step 1: Create `src/background.js`**

```js
// src/background.js
import { urlToDomain } from "./lib/domain.js";
import { computeScore } from "./lib/score.js";
import { domainRankOverview, historicalRankOverview } from "./lib/dataforseo.js";
import { aiVerdict } from "./lib/openrouter.js";

const DEFAULTS = { orModel: "anthropic/claude-3.5-haiku", locationCode: 2840, languageCode: "en" };

// Clicking the toolbar icon opens the side panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

async function getSettings() {
  const s = await chrome.storage.local.get(null);
  return { ...DEFAULTS, ...s };
}

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || "";
}

async function analyze() {
  const url = await getActiveTabUrl();
  const domain = urlToDomain(url);
  if (!domain) return { error: "Navigate to a website to analyze it." };

  const s = await getSettings();
  if (!s.dfLogin || !s.dfPassword) return { error: "NO_CREDS" };

  const dfOpts = {
    login: s.dfLogin,
    password: s.dfPassword,
    locationCode: Number(s.locationCode) || DEFAULTS.locationCode,
    languageCode: s.languageCode || DEFAULTS.languageCode
  };

  let metrics, history;
  try {
    [metrics, history] = await Promise.all([
      domainRankOverview(domain, dfOpts),
      historicalRankOverview(domain, dfOpts).catch(() => []) // history is best-effort
    ]);
  } catch (e) {
    return { domain, error: e.message || "DataForSEO request failed." };
  }
  if (!metrics) return { domain, error: "No organic data found for this domain." };

  const { score, band } = computeScore(metrics);
  const top3 = (metrics.pos_1 || 0) + (metrics.pos_2_3 || 0);
  const top10 = top3 + (metrics.pos_4_10 || 0);

  const result = {
    domain,
    score,
    scoreBand: band,
    traffic: Math.round(metrics.etv || 0),
    history: history || [],
    keywords: {
      total: metrics.count || 0,
      top3,
      top10,
      rest: Math.max(0, (metrics.count || 0) - top10)
    },
    ai: null,
    checkedAt: new Date().toISOString()
  };

  if (s.orKey) {
    try {
      result.ai = await aiVerdict(domain, metrics, score, {
        apiKey: s.orKey,
        model: s.orModel || DEFAULTS.orModel
      });
    } catch {
      result.ai = null; // verdict is optional; never fails the whole panel
    }
  }

  return result;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "analyze") {
    analyze()
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message || "Unknown error" }));
    return true; // keep the message channel open for the async response
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/background.js
git commit -m "feat: background orchestration — tab→domain→DataForSEO→score→verdict"
```

*(The service worker is exercised end-to-end in Task 11.)*

---

## Task 10: Side panel UI

**Files:**
- Create: `src/panel.html`
- Create: `src/panel.css`
- Create: `src/panel.js`

- [ ] **Step 1: Create `src/panel.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Website Performance Check</title>
  <link rel="stylesheet" href="panel.css" />
</head>
<body>
  <header>
    <div id="domain">Website Performance Check</div>
    <div class="header-actions">
      <button id="refresh" title="Refresh">↻</button>
      <button id="settings" title="Settings">⚙</button>
    </div>
  </header>
  <main id="app"><div class="loading">Analyzing…</div></main>
  <script type="module" src="panel.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `src/panel.css`**

```css
:root {
  --low: #dc2626; --medium: #d97706; --high: #16a34a;
  --ink: #1f2937; --muted: #6b7280; --line: #e5e7eb; --accent: #2563eb;
}
* { box-sizing: border-box; }
body { margin: 0; font: 14px system-ui, sans-serif; color: var(--ink); }
header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: #fff;
}
#domain { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.header-actions button {
  border: 0; background: transparent; font-size: 16px; cursor: pointer; color: var(--muted); padding: 4px 6px;
}
main { padding: 14px; }
.loading, .message { color: var(--muted); padding: 20px 4px; text-align: center; }
.message button {
  display: inline-block; margin-top: 12px; background: var(--accent); color: #fff;
  border: 0; padding: 8px 14px; border-radius: 6px; cursor: pointer;
}
.score-wrap { text-align: center; margin-bottom: 16px; }
.score { font-size: 52px; font-weight: 800; line-height: 1; }
.score.low { color: var(--low); } .score.medium { color: var(--medium); } .score.high { color: var(--high); }
.score-label { color: var(--muted); font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.card { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
.card h3 { margin: 0 0 6px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.big-number { font-size: 26px; font-weight: 700; }
.kw-breakdown { display: flex; gap: 14px; margin-top: 8px; }
.kw-breakdown div { flex: 1; }
.kw-breakdown b { display: block; font-size: 18px; }
.kw-breakdown span { color: var(--muted); font-size: 11px; }
.traffic-chart { color: var(--accent); margin-top: 8px; display: block; }
.chart-caption { color: var(--muted); font-size: 12px; margin-top: 4px; }
.chart-caption .up { color: var(--high); } .chart-caption .down { color: var(--low); }
.ai-verdict p { margin: 0 0 8px; }
.ai-verdict ul { margin: 0; padding-left: 18px; }
.ai-verdict li { margin-bottom: 4px; }
footer { color: var(--muted); font-size: 11px; text-align: center; padding: 4px 0 14px; }
```

- [ ] **Step 3: Create `src/panel.js`**

```js
// src/panel.js
import { trafficChartSvg } from "./lib/chart.js";

const app = document.getElementById("app");
const domainEl = document.getElementById("domain");
const nf = new Intl.NumberFormat();

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function messageView(text, withSettings) {
  const btn = withSettings ? `<button id="open-settings">Open Settings</button>` : "";
  return `<div class="message">${esc(text)}<br>${btn}</div>`;
}

function chartCaption(history) {
  if (!history || history.length < 2) return "";
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const diff = last.traffic - prev.traffic;
  if (prev.traffic === 0) return `<div class="chart-caption">${esc(last.label)}: ${nf.format(last.traffic)}</div>`;
  const pct = Math.round((diff / prev.traffic) * 100);
  const cls = diff >= 0 ? "up" : "down";
  const arrow = diff >= 0 ? "▲" : "▼";
  return `<div class="chart-caption">${esc(last.label)}: ${nf.format(last.traffic)} ` +
    `<span class="${cls}">${arrow} ${Math.abs(pct)}% vs prior month</span></div>`;
}

function trafficCard(r) {
  const chart = trafficChartSvg(r.history);
  const caption = chartCaption(r.history);
  return `<div class="card">
    <h3>Estimated Monthly Organic Traffic</h3>
    <div class="big-number">${nf.format(r.traffic)}</div>
    ${chart}${caption}
  </div>`;
}

function keywordsCard(k) {
  return `<div class="card">
    <h3>Organic Keywords</h3>
    <div class="big-number">${nf.format(k.total)}</div>
    <div class="kw-breakdown">
      <div><b>${nf.format(k.top3)}</b><span>Top 3</span></div>
      <div><b>${nf.format(k.top10)}</b><span>Top 10</span></div>
      <div><b>${nf.format(k.rest)}</b><span>Rest</span></div>
    </div>
  </div>`;
}

function aiCard(ai) {
  if (!ai || !ai.verdict) return "";
  const opps = (ai.opportunities || []).map((o) => `<li>${esc(o)}</li>`).join("");
  return `<div class="card ai-verdict">
    <h3>AI Verdict</h3>
    <p>${esc(ai.verdict)}</p>
    ${opps ? `<ul>${opps}</ul>` : ""}
  </div>`;
}

function resultView(r) {
  return `
    <div class="score-wrap">
      <div class="score ${esc(r.scoreBand)}">${r.score}</div>
      <div class="score-label">Overall Score</div>
    </div>
    ${keywordsCard(r.keywords)}
    ${trafficCard(r)}
    ${aiCard(r.ai)}
    <footer>Checked ${new Date(r.checkedAt).toLocaleString()}</footer>
  `;
}

function render(res) {
  if (!res) {
    app.innerHTML = messageView("Something went wrong.", false);
    return;
  }
  if (res.error === "NO_CREDS") {
    domainEl.textContent = "Website Performance Check";
    app.innerHTML = messageView("Add your DataForSEO credentials to get started.", true);
    wireSettingsButton();
    return;
  }
  if (res.error) {
    domainEl.textContent = res.domain || "Website Performance Check";
    app.innerHTML = messageView(res.error, false);
    return;
  }
  domainEl.textContent = res.domain;
  app.innerHTML = resultView(res);
}

function wireSettingsButton() {
  const b = document.getElementById("open-settings");
  if (b) b.addEventListener("click", () => chrome.runtime.openOptionsPage());
}

async function run() {
  app.innerHTML = `<div class="loading">Analyzing…</div>`;
  try {
    const res = await chrome.runtime.sendMessage({ type: "analyze" });
    render(res);
  } catch (e) {
    render({ error: e?.message || "Could not reach the analyzer." });
  }
}

document.getElementById("refresh").addEventListener("click", run);
document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
run();
```

- [ ] **Step 4: Commit**

```bash
git add src/panel.html src/panel.css src/panel.js
git commit -m "feat: side panel UI — score, keywords, traffic graph, AI verdict"
```

---

## Task 11: End-to-end load & smoke test

**Files:** none (manual verification)

- [ ] **Step 1: Final full test run**

Run: `npm test`
Expected: PASS — every suite green.

- [ ] **Step 2: Load the unpacked extension**

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right) on.
3. Click **Load unpacked** and select the project root
   (`/Users/dondavis/Website Performance Check - Chrome Extension`).
4. Confirm the extension appears with the blue icon and no manifest errors.

- [ ] **Step 3: Enter credentials**

1. Click the extension's **Details → Extension options** (or right-click the icon → Options).
2. Enter your DataForSEO API login + password, and (optionally) your OpenRouter key.
3. Leave model = `anthropic/claude-3.5-haiku`, location = `2840`, language = `en`.
4. Click **Save** — status should read "Saved."

- [ ] **Step 4: Smoke test on a strong site**

1. Navigate a tab to a well-known site (e.g. `https://www.nytimes.com`).
2. Click the extension icon — the side panel should open on the right.
3. Verify: domain shows `nytimes.com`; an Overall Score renders with a color band;
   the keywords card shows totals; the traffic card shows a number **and a line graph**
   with a caption; the AI Verdict renders (if OpenRouter key was set).

- [ ] **Step 5: Smoke test the edge cases**

1. Open a `chrome://` page, click the icon → panel shows "Navigate to a website to analyze it."
2. Temporarily clear the DataForSEO login in Options, reopen the panel → shows the
   "Add your DataForSEO credentials" message with an **Open Settings** button; restore creds after.
3. Navigate to an obscure domain with little/no organic presence → panel shows either a
   low score or "No organic data found for this domain" (no crash).

- [ ] **Step 6: Check the service worker log if anything failed**

On `chrome://extensions`, click the extension's **service worker** link to open its
DevTools console and read any thrown errors. Fix and reload the extension as needed.

- [ ] **Step 7: Final commit (if any fixes were made)**

```bash
git add -A
git commit -m "fix: end-to-end smoke test adjustments"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** side panel on click (Tasks 7, 9, 10) · organic ranked keywords (Tasks 3, 5, 10) · estimated monthly traffic number **+ month-over-month graph** (Tasks 4, 5, 10) · Overall Score 0–100 (Task 3) · AI verdict via OpenRouter (Task 6, 9, 10) · settings-stored credentials (Task 8) · graceful degradation for no-creds / no-data / non-web pages (Tasks 9, 10, 11). No backlinks — correctly out of scope.
- **Type consistency:** the result object shape (`domain, score, scoreBand, traffic, history[], keywords{total,top3,top10,rest}, ai{verdict,opportunities}|null, checkedAt`) is produced in Task 9 and consumed unchanged in Task 10. Metric field names (`etv, count, pos_1, pos_2_3, pos_4_10`) match across `dataforseo.js`, `score.js`, and `openrouter.js`.
- **No placeholders:** every code step contains complete, runnable code.
