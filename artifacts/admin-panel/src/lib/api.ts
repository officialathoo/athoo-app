export const API_KEY = "athoo_admin_api";
export const TOKEN_KEY = "athoo_admin_token";

/**
 * Always sanitize URL (remove trailing slash)
 */
function sanitizeBaseUrl(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  return raw ? raw.replace(/\/$/, "") : "";
}

/**
 * Get API base (PRODUCTION SAFE)
 * - No localhost fallback
 * - No window.origin fallback (this was breaking your app)
 * - Always uses env or stored value
 */
export function getApiBase(): string {
  const saved = sanitizeBaseUrl(localStorage.getItem(API_KEY));

  const viteEnv = sanitizeBaseUrl(
    (import.meta as any)?.env?.VITE_API_BASE_URL
  );

  // Use window.origin — Replit proxy routes /api to the API server
  const fallback = typeof window !== "undefined" ? window.location.origin : "";

  return saved || viteEnv || fallback;
}

/**
 * Get auth token
 */
export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

/**
 * Save API base (optional manual override)
 */
export function setApiBase(url: string): void {
  const clean = sanitizeBaseUrl(url);

  if (!clean) {
    localStorage.removeItem(API_KEY);
    return;
  }

  localStorage.setItem(API_KEY, clean);
}

/**
 * Save token
 */
export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Clear token
 */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Main API request handler
 */
export async function api<T = unknown>(
  path: string,
  options: RequestInit & {
    params?: Record<
      string,
      string | number | boolean | undefined
    >;
  } = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  const token = getToken();
  const base = getApiBase();

  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;

  let url = `${base}${normalizedPath}`;

  // Query params
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)])
    ).toString();

    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOptions.headers || {}),
    },
  });

  const text = await res.text();

  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "Invalid server response" };
  }

  if (!res.ok) {
    throw new Error(
      data.error || data.message || `Request failed (${res.status})`
    );
  }

  return data as T;
}

/**
 * Format currency (PKR)
 */
export function currency(value: number | null | undefined): string {
  return `Rs. ${Number(value || 0).toLocaleString()}`;
}

/**
 * Full date format
 */
export function formatDate(
  value: string | Date | null | undefined
): string {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Short date format
 */
export function formatDateShort(
  value: string | Date | null | undefined
): string {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleDateString("en-PK", {
    dateStyle: "medium",
  });
}