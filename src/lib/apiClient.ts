// Browser-side fetch wrapper: attaches the demo access code and announces 401s.
// Safe to import from server components too (every browser API is guarded).

const STORAGE_KEY = "shifa:access";
export const ACCESS_HEADER = "x-shifa-access";
export const ACCESS_REQUIRED_EVENT = "shifa:access-required";

export function getAccessCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null; // private mode / blocked storage
  }
}

/** Stores the code; an empty string clears it. */
export function setAccessCode(code: string): void {
  if (typeof window === "undefined") return;
  try {
    const v = (code ?? "").trim();
    if (v) window.localStorage.setItem(STORAGE_KEY, v);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable: the user will simply be asked again next time
  }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const code = getAccessCode();
  if (code && !headers.has(ACCESS_HEADER)) {
    try {
      headers.set(ACCESS_HEADER, code);
    } catch {
      // non-Latin-1 characters can't go in a header; the server will answer 401
    }
  }
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ACCESS_REQUIRED_EVENT));
  }
  return res;
}
