// src/background.js
import { urlToDomain } from "./lib/domain.js";
import { computeScore } from "./lib/score.js";
import {
  domainRankOverview,
  historicalRankOverview,
  backlinksSummary,
  estimateAvgPosition
} from "./lib/dataforseo.js";
import { checkSitemap } from "./lib/sitemap.js";
import { aiVerdict } from "./lib/openrouter.js";
import { SETTINGS_DEFAULTS as DEFAULTS } from "./lib/defaults.js";

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

  // Core metrics must succeed; backlinks, history, and the sitemap check are best-effort.
  let metrics, history, backlinks, sitemap;
  try {
    [metrics, history, backlinks, sitemap] = await Promise.all([
      domainRankOverview(domain, dfOpts),
      historicalRankOverview(domain, dfOpts).catch(() => []),
      backlinksSummary(domain, dfOpts).catch(() => null),
      checkSitemap(domain).catch(() => null)
    ]);
  } catch (e) {
    return { domain, error: e.message || "DataForSEO request failed." };
  }
  if (!metrics) return { domain, error: "No organic data found for this domain." };

  const { score, band } = computeScore(metrics);
  const top3 = (metrics.pos_1 || 0) + (metrics.pos_2_3 || 0);
  const top10 = top3 + (metrics.pos_4_10 || 0);

  // Month-over-month change from the last two history points (null if too little history).
  const hist = history || [];
  const changes = { keywords: null, traffic: null };
  if (hist.length >= 2) {
    const last = hist[hist.length - 1];
    const prev = hist[hist.length - 2];
    changes.traffic = Math.round((last.traffic || 0) - (prev.traffic || 0));
    // Only report a keyword delta if the history actually carries keyword counts;
    // otherwise hide it rather than show a misleading "+0".
    const hasKeywordData = hist.some((h) => (h.keywords || 0) > 0);
    changes.keywords = hasKeywordData ? Math.round((last.keywords || 0) - (prev.keywords || 0)) : null;
  }

  const result = {
    domain,
    score,
    scoreBand: band,
    traffic: Math.round(metrics.etv || 0),
    avgPosition: estimateAvgPosition(metrics),
    backlinks: backlinks || null,
    sitemap: sitemap || null,
    history: hist,
    changes,
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
