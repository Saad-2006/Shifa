// Server-only Gemini REST client (no SDK). Never import this from client code:
// it reads GEMINI_API_KEY from the environment.
//
// - GEMINI_MODEL is an ordered, comma-separated chain (default DEFAULT_MODEL_CHAIN). Each request
//   tries the last model that worked first, then the chain in order, moving on after a 404, 429,
//   5xx/overload or a per-model timeout. ListModels discovery is only a last resort and never
//   picks versions above 3.6 (3.7/3.8 benchmarked far too slow).
// - Thinking is turned down for speed (none for lite models); if a model rejects the thinking
//   config we retry it once without.
// - Never log the API key, request bodies or image data.

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
/** Ordered fallback chain used when GEMINI_MODEL is unset (benchmarked: fast first). */
export const DEFAULT_MODEL_CHAIN = ["gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-flash-latest"];
/** Last-resort discovery only picks versions 3.0-3.6 (2.5 is closed to new keys; 3.7/3.8 far too slow). */
const MIN_AUTO_MAJOR = 3;
const MAX_AUTO_VERSION: [number, number] = [3, 6];
const DISCOVERY_RE = /^models\/gemini-(\d+)(?:\.(\d+))?-flash(-lite)?$/;
/** A model that worked stays first for this long, then the configured order is tried again. */
const STICKY_MS = 10 * 60 * 1000;
const MIN_ATTEMPT_MS = 1500;

export type GeminiErrorCode = "no_key" | "quota" | "model" | "upstream" | "blocked" | "timeout" | "bad_json";

export class GeminiError extends Error {
  code: GeminiErrorCode;
  /** Upstream HTTP status when there was one, otherwise a sensible stand-in. */
  status: number;
  constructor(code: GeminiErrorCode, message: string, status = 0) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
    this.status = status;
  }
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

// ---------------------------------------------------------------- configuration

function apiKey(): string {
  return (process.env.GEMINI_API_KEY ?? "").trim();
}

export function isConfigured(): boolean {
  return apiKey().length > 0;
}

/** GEMINI_MODEL as an ordered chain ("a,b,c"), or the default chain. No "models/" prefixes. */
export function getModelChain(): string[] {
  const list = (process.env.GEMINI_MODEL ?? "")
    .split(",")
    .map((m) => m.trim().replace(/^models\//, ""))
    .filter(Boolean);
  return [...new Set(list.length ? list : DEFAULT_MODEL_CHAIN)];
}

/** The first model of the chain (what /api/health reports). */
export function getConfiguredModel(): string {
  return getModelChain()[0];
}

/** The model that answered last (per server instance) and when. */
let lastGood: { model: string; at: number } | null = null;
/** Models that rejected thinkingConfig, so we stop sending it to them. */
const noThinking = new Set<string>();

/** The model the next request will try first. */
export function getActiveModel(): string {
  return attemptOrder()[0];
}

/** Test helper: forget the cached model and thinking quirks. */
export function _resetGeminiCache(): void {
  lastGood = null;
  noThinking.clear();
}

function attemptOrder(): string[] {
  const chain = getModelChain();
  if (!lastGood) return chain;
  const head = chain[0];
  if (lastGood.model !== head && Date.now() - lastGood.at > STICKY_MS) {
    lastGood = null; // give the preferred model another chance
    return chain;
  }
  return [lastGood.model, ...chain.filter((m) => m !== lastGood!.model)];
}

/** thinkingLevel "low" for non-lite Gemini 3+ (and non-lite *-latest), budget 0 for 2.5 Flash, nothing for lite. */
export function thinkingConfigFor(model: string): Record<string, unknown> | undefined {
  const m = model.toLowerCase();
  if (m.includes("lite")) return undefined;
  if (m.includes("2.5-flash")) return { thinkingBudget: 0 };
  const v = /gemini-(\d+)/.exec(m);
  if ((v && Number(v[1]) >= 3) || m.endsWith("-latest")) return { thinkingLevel: "low" };
  return undefined;
}

// ---------------------------------------------------------------- last-resort discovery

interface ListedModel {
  name?: string;
  supportedGenerationMethods?: string[];
}

/**
 * Discovery candidates from ListModels: "gemini-X.Y-flash" and "gemini-X.Y-flash-lite" that support
 * generateContent and are version 3.0-3.6 (never 3.7/3.8, no 2.x). Non-lite newest first, then lite newest first.
 */
export function pickDiscoveryCandidates(models: ListedModel[]): string[] {
  const found: { id: string; major: number; minor: number; lite: boolean }[] = [];
  for (const m of models) {
    if (!m.name || !m.supportedGenerationMethods?.includes("generateContent")) continue;
    const r = DISCOVERY_RE.exec(m.name);
    if (!r) continue;
    const major = Number(r[1]);
    const minor = Number(r[2] ?? 0);
    if (major < MIN_AUTO_MAJOR) continue;
    if (major > MAX_AUTO_VERSION[0] || (major === MAX_AUTO_VERSION[0] && minor > MAX_AUTO_VERSION[1])) continue;
    found.push({ id: m.name.replace(/^models\//, ""), major, minor, lite: !!r[3] });
  }
  found.sort((a, b) => Number(a.lite) - Number(b.lite) || b.major - a.major || b.minor - a.minor);
  return found.map((f) => f.id);
}

async function listModels(key: string, signal: AbortSignal): Promise<ListedModel[]> {
  const out: ListedModel[] = [];
  let pageToken = "";
  for (let page = 0; page < 3; page++) {
    const url = `${BASE_URL}/models?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url, { headers: { "x-goog-api-key": key }, signal });
    if (!res.ok) break;
    const json = (await res.json()) as { models?: ListedModel[]; nextPageToken?: string };
    out.push(...(json.models ?? []));
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return out;
}

// ---------------------------------------------------------------- HTTP core

interface UpstreamError {
  status: string;
  message: string;
}

async function readError(res: Response): Promise<UpstreamError> {
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: { status?: string; message?: string } };
      return { status: j.error?.status ?? "", message: (j.error?.message ?? "").slice(0, 300) };
    } catch {
      return { status: "", message: text.slice(0, 300) };
    }
  } catch {
    return { status: "", message: "" };
  }
}

function httpError(status: number, e: UpstreamError, model: string): GeminiError {
  const detail = e.message ? `: ${e.message}` : "";
  if (status === 429 || e.status === "RESOURCE_EXHAUSTED") {
    return new GeminiError("quota", `Gemini quota or rate limit reached on ${model}${detail}`, status);
  }
  if (
    status === 404 ||
    e.status === "NOT_FOUND" ||
    (status === 400 && /model.*(not found|not supported|no longer available)/i.test(e.message))
  ) {
    return new GeminiError("model", `Gemini model ${model} not available${detail}`, status);
  }
  if (/api key/i.test(e.message) || status === 401 || status === 403) {
    return new GeminiError("upstream", "Gemini rejected the API key or permissions", status);
  }
  return new GeminiError("upstream", `Gemini request to ${model} failed (${status})${detail}`, status);
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}

const timeoutError = (model: string) => new GeminiError("timeout", `Gemini (${model}) took too long to answer`, 504);

/** Failures where trying the next model in the chain can help. */
function shouldAdvance(e: GeminiError): boolean {
  if (e.code === "model" || e.code === "quota" || e.code === "timeout") return true; // quota is per model on Gemini
  return e.code === "upstream" && (e.status >= 500 || e.status === 0);
}

/** POST one model, retrying once without thinkingConfig if the model rejects it. */
async function postModel(
  key: string,
  model: string,
  method: "generateContent" | "streamGenerateContent",
  body: { generationConfig?: Record<string, unknown> } & Record<string, unknown>,
  signal: AbortSignal,
): Promise<Response> {
  let thinkingRetried = false;
  for (;;) {
    const thinking = noThinking.has(model) ? undefined : thinkingConfigFor(model);
    const payload = {
      ...body,
      generationConfig: { ...(body.generationConfig ?? {}), ...(thinking ? { thinkingConfig: thinking } : {}) },
    };
    const qs = method === "streamGenerateContent" ? "?alt=sse" : "";
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/models/${encodeURIComponent(model)}:${method}${qs}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (e) {
      if (signal.aborted || isAbort(e)) throw timeoutError(model);
      throw new GeminiError("upstream", "Could not reach Gemini", 0);
    }
    if (res.ok) return res;
    const err = await readError(res);
    if (res.status === 400 && /thinking/i.test(err.message) && thinking && !thinkingRetried) {
      thinkingRetried = true;
      noThinking.add(model);
      continue;
    }
    throw httpError(res.status, err, model);
  }
}

/** Timers and abort wiring for one model attempt. */
interface AttemptCtl {
  signal: AbortSignal;
  /** Swap the per-attempt timer for the overall deadline (call once the first bytes arrived). */
  toDeadline: () => void;
  /** Clear timers and detach from the caller's signal (idempotent). */
  done: () => void;
}

function makeAttempt(attemptMs: number, deadline: number, outer?: AbortSignal): AttemptCtl {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timer = setTimeout(abort, Math.max(0, Math.min(attemptMs, deadline - Date.now())));
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    toDeadline: () => {
      clearTimeout(timer);
      timer = setTimeout(abort, Math.max(0, deadline - Date.now()));
    },
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", abort);
    },
  };
}

/**
 * Try each model of the chain (last-good first) until one succeeds; on availability, overload,
 * 5xx, quota or timeout failures move to the next. When the chain is exhausted, discover up to
 * three more models via ListModels as a last resort. Remembers the model that worked.
 */
async function runChain<T>(o: {
  totalMs: number;
  attemptMs: number;
  signal?: AbortSignal;
  attempt: (key: string, model: string, ctl: AttemptCtl) => Promise<T>;
}): Promise<{ value: T; model: string }> {
  const key = apiKey();
  if (!key) throw new GeminiError("no_key", "GEMINI_API_KEY is not set", 503);
  const deadline = Date.now() + o.totalMs;
  const tried = new Set<string>();
  const errors: GeminiError[] = [];

  const tryModel = async (model: string): Promise<{ value: T; model: string } | null> => {
    tried.add(model);
    const ctl = makeAttempt(o.attemptMs, deadline, o.signal);
    try {
      const value = await o.attempt(key, model, ctl);
      lastGood = { model, at: Date.now() };
      return { value, model };
    } catch (e) {
      ctl.done();
      if (o.signal?.aborted) throw timeoutError(model); // the caller went away: stop, don't advance
      const ge =
        e instanceof GeminiError
          ? e
          : isAbort(e)
            ? timeoutError(model)
            : new GeminiError("upstream", "Gemini request failed", 0);
      if (!shouldAdvance(ge)) throw ge;
      console.warn(`[gemini] ${model} failed (${ge.code} ${ge.status}); trying the next model`);
      errors.push(ge);
      return null;
    }
  };

  for (const model of attemptOrder()) {
    if (tried.size > 0 && deadline - Date.now() < MIN_ATTEMPT_MS) break; // always try at least one
    const r = await tryModel(model);
    if (r) return r;
  }

  if (deadline - Date.now() >= MIN_ATTEMPT_MS * 2) {
    let discovered: string[] = [];
    const ctl = makeAttempt(5000, deadline, o.signal);
    try {
      discovered = pickDiscoveryCandidates(await listModels(key, ctl.signal)).filter((m) => !tried.has(m));
    } catch {
      // listing failed: nothing more to try
    } finally {
      ctl.done();
    }
    for (const model of discovered.slice(0, 3)) {
      if (deadline - Date.now() < MIN_ATTEMPT_MS) break;
      const r = await tryModel(model);
      if (r) return r;
    }
  }

  const has = (c: GeminiErrorCode) => errors.some((e) => e.code === c);
  const triedList = [...tried].join(", ") || "none";
  if (has("quota")) throw new GeminiError("quota", `Gemini quota reached on every model tried (${triedList})`, 429);
  if (has("timeout") || !errors.length) throw new GeminiError("timeout", `No Gemini model answered in time (${triedList})`, 504);
  if (errors.every((e) => e.code === "model")) throw new GeminiError("model", `No Gemini model available (${triedList})`, 404);
  throw new GeminiError("upstream", `Gemini failed on every model tried (${triedList})`, 502);
}

// ---------------------------------------------------------------- response helpers

interface GenResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; status?: string; message?: string };
}

const BLOCKED_RE = /SAFETY|PROHIBITED|BLOCKLIST|SPII/;

function blockedReason(r: GenResponse): string | null {
  if (r.promptFeedback?.blockReason) return r.promptFeedback.blockReason;
  const fr = r.candidates?.[0]?.finishReason ?? "";
  return BLOCKED_RE.test(fr) ? fr : null;
}

function textOf(r: GenResponse): string {
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

/** Parse model JSON, tolerating ``` fences or stray prose around the object. */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    // fall through
  }
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(t);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // fall through
    }
  }
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      // fall through
    }
  }
  throw new GeminiError("bad_json", "Gemini returned text that is not valid JSON", 502);
}

// ---------------------------------------------------------------- generateJSON / generateText

/** One non-streaming generateContent call across the model chain; `parse` turns the text into T. */
async function generateOnce<T>(o: {
  body: Record<string, unknown>;
  timeoutMs: number;
  attemptTimeoutMs: number;
  signal?: AbortSignal;
  parse: (text: string) => T;
}): Promise<{ data: T; model: string }> {
  const { value, model } = await runChain<T>({
    totalMs: o.timeoutMs,
    attemptMs: o.attemptTimeoutMs,
    signal: o.signal,
    attempt: async (key, model, ctl) => {
      try {
        const res = await postModel(key, model, "generateContent", o.body, ctl.signal);
        let json: GenResponse;
        try {
          json = (await res.json()) as GenResponse;
        } catch (e) {
          if (ctl.signal.aborted || isAbort(e)) throw timeoutError(model);
          throw new GeminiError("upstream", "Gemini sent an unreadable response", 502);
        }
        const blocked = blockedReason(json);
        if (blocked) throw new GeminiError("blocked", `Gemini blocked the request (${blocked})`, 422);
        const text = textOf(json);
        if (!text.trim()) {
          const fr = json.candidates?.[0]?.finishReason ?? "none";
          throw new GeminiError("bad_json", `Gemini returned no text (finishReason ${fr})`, 502);
        }
        return o.parse(text);
      } finally {
        ctl.done();
      }
    },
  });
  return { data: value, model };
}

export async function generateJSON<T>(o: {
  system: string;
  parts: GeminiPart[];
  schema: Record<string, unknown>;
  temperature?: number;
  /** Overall budget across the model chain. */
  timeoutMs?: number;
  /** Budget per model before moving to the next one. */
  attemptTimeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ data: T; model: string }> {
  const { system, parts, schema, temperature = 0.1, timeoutMs = 45000, attemptTimeoutMs = 25000, signal } = o;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema },
  };
  return generateOnce<T>({ body, timeoutMs, attemptTimeoutMs, signal, parse: (text) => parseJsonLoose(text) as T });
}

/** Plain-text answer in one piece (no streaming), e.g. translating an answer. */
export async function generateText(o: {
  system: string;
  text: string;
  temperature?: number;
  timeoutMs?: number;
  attemptTimeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ text: string; model: string }> {
  const { system, text, temperature = 0.1, timeoutMs = 40000, attemptTimeoutMs = 20000, signal } = o;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: { temperature },
  };
  const { data, model } = await generateOnce<string>({ body, timeoutMs, attemptTimeoutMs, signal, parse: (t) => t.trim() });
  return { text: data, model };
}

// ---------------------------------------------------------------- SSE + streamText

/**
 * Yields the data payload of each Server-Sent Event (multi-line data joined by "\n").
 * Buffers partial lines across chunks, ignores comments/keep-alives and other fields.
 */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let data: string[] = [];

  function* lines(final: boolean): Generator<string> {
    for (;;) {
      const nl = buf.indexOf("\n");
      if (nl < 0) break;
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      yield line;
    }
    if (final && buf) {
      const line = buf.endsWith("\r") ? buf.slice(0, -1) : buf;
      buf = "";
      yield line;
    }
  }

  function take(line: string): string | null {
    if (line === "") {
      const evt = data.length ? data.join("\n") : null;
      data = [];
      return evt;
    }
    if (line.startsWith(":")) return null; // comment / keep-alive
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    if (field !== "data") return null;
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    data.push(value);
    return null;
  }

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      for (const line of lines(false)) {
        const evt = take(line);
        if (evt !== null) yield evt;
      }
    }
    buf += decoder.decode();
    for (const line of lines(true)) {
      const evt = take(line);
      if (evt !== null) yield evt;
    }
    const last = take("");
    if (last !== null) yield last;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // already closed
    }
  }
}

/** Turns Gemini SSE events into text pieces; throws GeminiError on in-stream errors or blocks. */
export async function* geminiTextFromSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const evt of parseSSE(body)) {
    const payload = evt.trim();
    if (!payload || payload === "[DONE]") continue;
    let json: GenResponse;
    try {
      json = JSON.parse(payload) as GenResponse;
    } catch {
      continue; // ignore a malformed event rather than killing the answer
    }
    if (json.error) {
      const quota = json.error.code === 429 || json.error.status === "RESOURCE_EXHAUSTED";
      throw new GeminiError(quota ? "quota" : "upstream", "Gemini stream error", json.error.code ?? 502);
    }
    const text = textOf(json);
    if (text) yield text;
    const blocked = blockedReason(json);
    if (blocked) throw new GeminiError("blocked", `Gemini stopped the answer (${blocked})`, 422);
  }
}

export async function streamText(o: {
  system: string;
  contents: GeminiContent[];
  temperature?: number;
  /** Overall budget for the whole answer (all attempts plus streaming). */
  timeoutMs?: number;
  /** Per model: time allowed until the first text arrives before moving to the next model. */
  firstByteTimeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ stream: AsyncIterable<string>; model: string }> {
  const { system, contents, temperature = 0.3, timeoutMs = 60000, firstByteTimeoutMs = 20000, signal } = o;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature },
  };
  // Each attempt waits for the first text piece, so a slow or broken model can still be swapped
  // before anything has been sent to the user.
  const { value, model } = await runChain({
    totalMs: timeoutMs,
    attemptMs: firstByteTimeoutMs,
    signal,
    attempt: async (key, model, ctl) => {
      const res = await postModel(key, model, "streamGenerateContent", body, ctl.signal);
      if (!res.body) throw new GeminiError("upstream", "Gemini sent an empty stream", 502);
      const it = geminiTextFromSSE(res.body);
      let first: IteratorResult<string>;
      try {
        first = await it.next();
      } catch (e) {
        await it.return(undefined).catch(() => undefined);
        if (e instanceof GeminiError) throw e;
        if (ctl.signal.aborted || isAbort(e)) throw timeoutError(model);
        throw new GeminiError("upstream", "Gemini stream broke", 502);
      }
      ctl.toDeadline();
      return { it, first, ctl };
    },
  });

  async function* run(): AsyncGenerator<string> {
    const { it, first, ctl } = value;
    try {
      if (first.done) return;
      yield first.value;
      for (;;) {
        const next = await it.next();
        if (next.done) return;
        yield next.value;
      }
    } catch (e) {
      if (e instanceof GeminiError) throw e;
      if (ctl.signal.aborted || isAbort(e)) throw timeoutError(model);
      throw new GeminiError("upstream", "Gemini stream broke", 502);
    } finally {
      await it.return(undefined).catch(() => undefined);
      ctl.done();
    }
  }
  return { stream: run(), model };
}
