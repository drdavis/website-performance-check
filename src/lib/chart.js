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
