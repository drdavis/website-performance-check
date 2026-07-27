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
