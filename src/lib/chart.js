// src/lib/chart.js
const round2 = (n) => Math.round(n * 100) / 100;

export const DEFAULT_DIMS = { width: 260, height: 80, padX: 6, padY: 8 };

export function chartPoints(history, dims) {
  const { width, height, padX, padY } = { ...DEFAULT_DIMS, ...(dims || {}) };
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
  const opts = { ...DEFAULT_DIMS, ...(dims || {}) };
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

// Compact, human-readable number: 166, 1.2k, 45k, 3.4M. Preserves sign.
export function compactNumber(v) {
  const n = Math.round(Number(v) || 0);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2025-05" -> "May". Falls back to the raw label if it can't parse.
export function formatMonth(label) {
  const part = String(label || "").split("-")[1];
  return MONTHS[Number(part)] || String(label || "");
}

// Filled area chart with y-axis ticks, month labels, and point dots.
// Colors come from CSS classes (.area/.line/.dot/.grid/.ytick/.xtick) so the
// panel theme controls them. Returns "" when there is nothing meaningful to draw.
export function trafficAreaChartSvg(history, dims) {
  const rows = Array.isArray(history) ? history : [];
  if (rows.length < 2) return "";

  const W = dims?.width ?? 320;
  const H = dims?.height ?? 170;
  const padL = 36, padR = 12, padT = 12, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const vals = rows.map((r) => Number(r.traffic) || 0);
  const maxRaw = Math.max(...vals, 0);
  const max = maxRaw === 0 ? 1 : maxRaw; // avoid divide-by-zero on an all-zero series
  const n = rows.length;

  const x = (i) => round2(padL + (i * plotW) / (n - 1));
  const y = (v) => round2(padT + (1 - (Number(v) || 0) / max) * plotH);
  const baseline = round2(padT + plotH);

  const linePts = rows.map((r, i) => `${x(i)},${y(r.traffic)}`).join(" ");
  const areaPts = `${x(0)},${baseline} ${linePts} ${x(n - 1)},${baseline}`;

  const grid = [0, 1 / 3, 2 / 3, 1]
    .map((f) => {
      const gy = y(max * f);
      return (
        `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" class="grid"/>` +
        `<text x="${padL - 6}" y="${round2(gy + 3)}" class="ytick" text-anchor="end">${compactNumber(max * f)}</text>`
      );
    })
    .join("");

  const step = Math.ceil(n / 6);
  const xlabels = rows
    .map((r, i) => {
      if (i % step !== 0 && i !== n - 1) return "";
      return `<text x="${x(i)}" y="${H - 8}" class="xtick" text-anchor="middle">${formatMonth(r.label)}</text>`;
    })
    .join("");

  const dots = rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.traffic)}" r="3" class="dot"/>`).join("");

  return (
    `<svg viewBox="0 0 ${W} ${H}" width="100%" class="area-chart" role="img" ` +
    `aria-label="Organic monthly traffic trend">` +
    grid +
    `<polygon class="area" points="${areaPts}"/>` +
    `<polyline class="line" fill="none" points="${linePts}"/>` +
    dots +
    xlabels +
    `</svg>`
  );
}
