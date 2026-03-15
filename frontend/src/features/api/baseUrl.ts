// frontend/src/features/api/baseUrl.ts

const KEY = "kidmorph.apiBaseUrl";

// ✅ env 기본값: 배포에선 .env.production의 VITE_API_BASE_URL이 들어옴
export const DEFAULT_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "https://api.kidmorph.cloud";

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

function safeRemoveLS(key: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function normalizeBaseUrl(url: string): string {
  const u = (url || "").trim();
  if (!u) return DEFAULT_API_BASE_URL;
  return u.replace(/\/+$/, "");
}

/**
 * ✅ API 호출에 쓰는 base url
 * - localStorage에 저장된 값이 있으면 그걸 사용 (Settings override)
 * - 없으면 env 기본값 사용
 */
export function getApiBaseUrl(): string {
  const saved = safeGetLS(KEY);
  return normalizeBaseUrl(saved ?? DEFAULT_API_BASE_URL);
}

/**
 * Settings에서 저장할 때 호출
 */
export function setApiBaseUrl(url: string): void {
  safeSetLS(KEY, normalizeBaseUrl(url));
}

/**
 * ✅ Settings에서 "Reset to default" 같은 동작: override 제거
 */
export function resetApiBaseUrl(): void {
  safeRemoveLS(KEY);
}

/**
 * /files/... 같은 상대경로를 절대경로로 변환할 때도 같은 base를 사용해야 함.
 * (지금처럼 API_BASE_URL 따로 두면 API는 A로, 파일은 B로 가는 문제가 생김)
 */
export function toAbsoluteUrl(url: string) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = getApiBaseUrl();
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}