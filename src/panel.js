// src/panel.js
import { trafficAreaChartSvg, formatMonth, compactNumber } from "./lib/chart.js";

const app = document.getElementById("app");
const domainEl = document.getElementById("domain");
const refreshBtn = document.getElementById("refresh");
let generation = 0;
const fullNum = (n) => new Intl.NumberFormat().format(Math.round(Number(n) || 0));

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function messageView(text, withSettings) {
  const btn = withSettings ? `<button id="open-settings">Open Settings</button>` : "";
  return `<div class="message">${esc(text)}<br>${btn}</div>`;
}

function deltaHtml(n) {
  if (n === null || n === undefined) return `<div class="delta empty"></div>`;
  const up = n >= 0;
  const cls = up ? "delta up" : "delta down";
  const sign = up ? "+" : "−";
  return `<div class="${cls}">${sign}${compactNumber(Math.abs(n))}<span>Since Last Month</span></div>`;
}

function statCard(label, value, deltaN) {
  return `<div class="stat">
    <div class="stat-num">${esc(value)}</div>
    <div class="stat-label">${esc(label)}</div>
    ${deltaHtml(deltaN)}
  </div>`;
}

function scoreCard(score, band) {
  return `<div class="stat">
    <div class="stat-num band-${esc(band)}">${esc(String(score))}</div>
    <div class="stat-label">Overall Score</div>
    <div class="delta empty"></div>
  </div>`;
}

function avgPositionCard(avg) {
  const value = avg === null || avg === undefined ? "—" : String(avg);
  return `<div class="stat">
    <div class="stat-num">${esc(value)}</div>
    <div class="stat-label">Avg. Position (est.)</div>
    <div class="delta empty"></div>
  </div>`;
}

function backlinksBlock(b) {
  if (!b) {
    return `<div class="backlinks-block unavailable">
      <div class="bl-num">—</div>
      <div class="bl-meta">
        <div class="bl-label">Backlinks</div>
        <div class="bl-sub">Data unavailable (check your DataForSEO plan)</div>
      </div>
    </div>`;
  }
  return `<div class="backlinks-block">
    <div class="bl-num">${esc(fullNum(b.total))}</div>
    <div class="bl-meta">
      <div class="bl-label">Backlinks</div>
      <div class="bl-sub">${esc(fullNum(b.referringDomains))} referring domains</div>
    </div>
  </div>`;
}

function sitemapCard(s) {
  if (!s) {
    return `<div class="card">
      <div class="card-head"><h3>Sitemap</h3></div>
      <div class="muted">Could not check the sitemap.</div>
    </div>`;
  }
  if (!s.found) {
    return `<div class="card">
      <div class="card-head"><h3>Sitemap</h3></div>
      <div class="sitemap-row bad">✗ No sitemap found</div>
    </div>`;
  }
  const detail = s.type === "index"
    ? `${compactNumber(s.urlCount)} child sitemaps`
    : `${compactNumber(s.urlCount)} URLs`;
  return `<div class="card">
    <div class="card-head">
      <h3>Sitemap</h3>
      <span class="range">${s.inRobots ? "in robots.txt" : "not in robots.txt"}</span>
    </div>
    <div class="sitemap-row ok">✓ Found · ${esc(detail)}</div>
    <div class="sitemap-url">${esc(s.url)}</div>
  </div>`;
}

function rangeLabel(history) {
  if (!history || history.length < 2) return "";
  return `${formatMonth(history[0].label)} - ${formatMonth(history[history.length - 1].label)}`;
}

function trafficChartCard(r) {
  const chart = trafficAreaChartSvg(r.history);
  const range = rangeLabel(r.history);
  const body = chart || `<div class="muted">Not enough history to chart yet.</div>`;
  return `<div class="card">
    <div class="card-head">
      <h3>Traffic Overview</h3>
      ${range ? `<span class="range">${esc(range)}</span>` : ""}
    </div>
    ${body}
  </div>`;
}

function aiCard(ai) {
  if (!ai || !ai.verdict) return "";
  const opps = (ai.opportunities || []).map((o) => `<li>${esc(o)}</li>`).join("");
  return `<div class="card ai-verdict">
    <div class="card-head"><h3>AI Verdict</h3></div>
    <p>${esc(ai.verdict)}</p>
    ${opps ? `<ul>${opps}</ul>` : ""}
  </div>`;
}

function resultView(r) {
  return `
    <div class="stats">
      ${statCard("Organic Keywords", compactNumber(r.keywords.total), r.changes?.keywords)}
      ${statCard("Organic Monthly Traffic", compactNumber(r.traffic), r.changes?.traffic)}
      ${avgPositionCard(r.avgPosition)}
      ${scoreCard(r.score, r.scoreBand)}
    </div>
    ${trafficChartCard(r)}
    ${sitemapCard(r.sitemap)}
    ${aiCard(r.ai)}
    ${backlinksBlock(r.backlinks)}
    <footer>Checked ${esc(new Date(r.checkedAt).toLocaleString())}<br>Built by D3 Digital Media</footer>
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
  const myGen = ++generation;
  refreshBtn.disabled = true;
  app.innerHTML = `<div class="loading">Analyzing…</div>`;
  try {
    const res = await chrome.runtime.sendMessage({ type: "analyze" });
    if (myGen !== generation) return;
    render(res);
  } catch (e) {
    if (myGen !== generation) return;
    render({ error: e?.message || "Could not reach the analyzer." });
  } finally {
    if (myGen === generation) refreshBtn.disabled = false;
  }
}

refreshBtn.addEventListener("click", run);
document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
run();
