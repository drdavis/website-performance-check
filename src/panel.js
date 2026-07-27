// src/panel.js
import { trafficAreaChartSvg, formatMonth, compactNumber } from "./lib/chart.js";

const app = document.getElementById("app");
const domainEl = document.getElementById("domain");
const refreshBtn = document.getElementById("refresh");
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
      ${scoreCard(r.score, r.scoreBand)}
    </div>
    ${trafficChartCard(r)}
    ${aiCard(r.ai)}
    <footer>Checked ${esc(new Date(r.checkedAt).toLocaleString())}</footer>
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
