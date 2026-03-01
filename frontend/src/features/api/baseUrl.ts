const KEY = "kidmorph.apiBaseUrl";
const DEFAULT = "http://192.168.0.28:8000";

function safeGetLS(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLS(key: string, value: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function normalizeBaseUrl(url: string): string {
  const u = url.trim();
  if (!u) return DEFAULT;
  return u.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const saved = safeGetLS(KEY);
  return normalizeBaseUrl(saved ?? DEFAULT);
}

export function setApiBaseUrl(url: string): void {
  safeSetLS(KEY, normalizeBaseUrl(url));
}

export function toAbsoluteUrl(pathOrUrl: string): string {
  const v = pathOrUrl.trim();
  if (!v) return v;

  // already absolute
  if (/^https?:\/\//i.test(v)) return v;

  const base = getApiBaseUrl();
  if (v.startsWith("/")) return `${base}${v}`;
  return `${base}/${v}`;
}