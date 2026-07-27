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
