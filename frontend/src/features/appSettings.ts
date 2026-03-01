const KEY_POLL = "kidmorph.pollIntervalMs";

function safeGetInt(key: string, fallback: number): number {
  try {
    if (typeof window === "undefined") return fallback;
    const v = window.localStorage.getItem(key);
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

function safeSetInt(key: string, value: number): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

export function getPollIntervalMs(): number {
  const v = safeGetInt(KEY_POLL, 1500);
  // 최소 300ms 안전장치
  return Math.max(300, v);
}

export function setPollIntervalMs(ms: number): void {
  safeSetInt(KEY_POLL, Math.max(300, ms));
}