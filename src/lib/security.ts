// Server-only access & safety layer for the API routes (Node runtime: uses node:crypto).
// There are no user accounts: this protects the public demo's Gemini quota and rejects
// junk uploads before they reach the model. Nothing here logs or stores request bodies.
import { createHash, timingSafeEqual } from "node:crypto";
import type { ApiError } from "./types";

type Route = "extract" | "chat" | "health";

/** Requests per minute, per client IP, per route. */
const LIMITS: Record<Route, number> = { extract: 12, chat: 30, health: 60 };
/** Wrong access codes allowed per minute per IP before we answer 429 instead of 401. */
const AUTH_FAIL_LIMIT = 10;
const WINDOW_MS = 60_000;

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;
type AllowedMime = (typeof ALLOWED_MIME)[number];

const MIME_LABEL: Record<AllowedMime, string> = {
  "image/jpeg": "JPG photo",
  "image/png": "PNG image",
  "image/webp": "WEBP image",
  "image/heic": "HEIC photo",
  "image/heif": "HEIF photo",
  "application/pdf": "PDF",
};

// ---------------------------------------------------------------------------
// Access code
// ---------------------------------------------------------------------------
function accessCode(): string {
  return (process.env.SHIFA_ACCESS_CODE ?? "").trim();
}

export function accessRequired(): boolean {
  return accessCode().length > 0;
}

/** Constant-time compare: hash both sides so the buffers are always equal length (no length leak). */
function codeMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
// Best-effort only: this is an in-memory sliding window. On serverless (Vercel) every
// warm instance has its own memory and cold starts reset it, so the real ceiling is
// "limit x instances". Good enough to stop a casual script draining the demo's Gemini
// quota; a shared store (e.g. Upstash/Redis) would be the production fix.
type Buckets = Map<string, number[]>;
const store = globalThis as typeof globalThis & { __shifaRate?: Buckets; __shifaRateCalls?: number };
function buckets(): Buckets {
  return (store.__shifaRate ??= new Map());
}

function prune(now: number) {
  const map = buckets();
  store.__shifaRateCalls = (store.__shifaRateCalls ?? 0) + 1;
  if (store.__shifaRateCalls % 200 !== 0 && map.size < 5000) return;
  for (const [key, hits] of map) {
    if (!hits.length || now - hits[hits.length - 1] >= WINDOW_MS) map.delete(key);
  }
}

/** Records a hit unless over the limit. Returns 0 when allowed, else seconds until a slot frees up. */
function hit(key: string, limit: number, now = Date.now()): number {
  prune(now);
  const map = buckets();
  const hits = (map.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    map.set(key, hits);
    return Math.max(1, Math.ceil((hits[0] + WINDOW_MS - now) / 1000));
  }
  hits.push(now);
  map.set(key, hits);
  return 0;
}

/** Test helper: forget all rate-limit state. */
export function resetRateLimits(): void {
  buckets().clear();
}

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  const ip = first || req.headers.get("x-real-ip")?.trim() || "local";
  return ip.toLowerCase().slice(0, 64);
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------
function jsonError(status: number, body: ApiError, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin GETs and non-browser clients omit it
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false; // "null" (sandboxed iframe, file://) or garbage
  }
  let host = req.headers.get("host")?.trim().toLowerCase();
  if (!host) {
    try {
      host = new URL(req.url).host.toLowerCase();
    } catch {
      return false;
    }
  }
  return originHost === host;
}

/** Returns null when the request may proceed, otherwise a ready-to-return ApiError response. */
export function guardRequest(req: Request, o: { route: Route }): Response | null {
  const { route } = o;
  const ip = clientKey(req);

  // 1. Same-origin (POST only): stops other websites from using this API via visitors' browsers.
  if (req.method.toUpperCase() === "POST" && !sameOrigin(req)) {
    return jsonError(403, { error: "Requests from other websites are not allowed.", code: "unauthorized" });
  }

  // 2. Demo access code (health stays open so the client can learn whether a code is needed).
  if (route !== "health" && accessRequired()) {
    const provided = (req.headers.get("x-shifa-access") ?? "").trim();
    if (!codeMatches(provided, accessCode())) {
      // Count failures so the passcode can't be brute-forced at full speed.
      const retry = hit(`authfail:${ip}`, AUTH_FAIL_LIMIT);
      if (retry > 0) {
        return jsonError(
          429,
          { error: `Too many wrong access codes. Please wait ${retry} seconds and try again.`, code: "rate_limited" },
          { "retry-after": String(retry) },
        );
      }
      return jsonError(401, { error: "Please enter the demo access code.", code: "unauthorized" });
    }
  }

  // 3. Per-IP sliding-window rate limit.
  const retry = hit(`${route}:${ip}`, LIMITS[route]);
  if (retry > 0) {
    return jsonError(
      429,
      { error: `Too many requests. Please wait ${retry} seconds and try again.`, code: "rate_limited" },
      { "retry-after": String(retry) },
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------
const DATA_URL_RE = /^data:[^,]*?;base64,/i;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function normalizeMime(m: string): string {
  const base = m.split(";")[0].trim().toLowerCase();
  return base === "image/jpg" || base === "image/pjpeg" ? "image/jpeg" : base;
}

function ascii(b: Uint8Array, from: number, len: number): string {
  return String.fromCharCode(...b.subarray(from, from + len));
}

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

/** Does the file's first bytes agree with the claimed type? */
function sniffMatches(mime: AllowedMime, b: Uint8Array): boolean {
  switch (mime) {
    case "image/jpeg":
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png":
      return b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a;
    case "application/pdf":
      // PDF readers accept the header anywhere in the first 1 KB; most files start with it.
      return ascii(b, 0, Math.min(b.length, 1024)).includes("%PDF-");
    case "image/webp":
      return b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP";
    case "image/heic":
    case "image/heif":
      // Phones label the same files either way, so accept any HEIF-family brand for both.
      return b.length >= 12 && ascii(b, 4, 4) === "ftyp" && HEIF_BRANDS.has(ascii(b, 8, 4).toLowerCase());
  }
}

export function validateUpload(i: {
  imageBase64: unknown;
  mimeType: unknown;
}):
  | { ok: true; mimeType: string; bytes: number; base64: string }
  | { ok: false; status: number; error: string } {
  const { imageBase64, mimeType } = i ?? {};
  if (typeof imageBase64 !== "string" || typeof mimeType !== "string") {
    return { ok: false, status: 400, error: "No file was received. Please attach a photo or PDF of the report." };
  }

  // Cheap size check before any regex work on a huge string.
  if (imageBase64.length > Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 4096) {
    return { ok: false, status: 413, error: "That file is too large. Please use a photo or PDF under 4 MB." };
  }

  let b64 = imageBase64.trim().replace(DATA_URL_RE, "").replace(/\s+/g, "");
  b64 = b64.replace(/-/g, "+").replace(/_/g, "/"); // tolerate base64url
  if (!b64) {
    return { ok: false, status: 400, error: "The file was empty. Please attach the report again." };
  }
  if (!BASE64_RE.test(b64) || b64.length % 4 === 1) {
    return { ok: false, status: 400, error: "The file could not be read. Please attach it again." };
  }

  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((b64.length * 3) / 4) - padding;
  if (bytes <= 0) {
    return { ok: false, status: 400, error: "The file was empty. Please attach the report again." };
  }
  if (bytes > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: "That file is too large. Please use a photo or PDF under 4 MB." };
  }

  const mime = normalizeMime(mimeType);
  if (!(ALLOWED_MIME as readonly string[]).includes(mime)) {
    return {
      ok: false,
      status: 415,
      error: "That file type isn't supported. Please upload a JPG, PNG, WEBP or HEIC photo, or a PDF.",
    };
  }

  // Decode only the head (~1 KB) for the magic-byte sniff.
  const head = new Uint8Array(Buffer.from(b64.slice(0, 1368), "base64"));
  if (!sniffMatches(mime as AllowedMime, head)) {
    return {
      ok: false,
      status: 415,
      error: `This file doesn't look like a real ${MIME_LABEL[mime as AllowedMime]}. Please upload the original photo or PDF.`,
    };
  }

  return { ok: true, mimeType: mime, bytes, base64: b64 };
}
