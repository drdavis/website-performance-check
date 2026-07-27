// src/panel.js
import { trafficChartSvg } from "./lib/chart.js";

const app = document.getElementById("app");
const domainEl = document.getElementById("domain");
const refreshBtn = document.getElementById("refresh");
const nf = new Intl.NumberFormat();
let generation = 0;

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
