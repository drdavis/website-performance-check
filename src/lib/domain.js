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
