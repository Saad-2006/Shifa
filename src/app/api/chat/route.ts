import { detectEmergency, type EmergencyKind } from "@/lib/emergency";
import { offlineAnswer } from "@/lib/fallback";
import { GeminiError, isConfigured, streamText } from "@/lib/gemini";
import { guardOutput } from "@/lib/streamGuard";
import { buildChatContents, buildChatSystem, pickFocusReport } from "@/lib/prompts";
import { requireSignIn } from "@/lib/authGuard";
import { guardRequest } from "@/lib/security";
import type { ApiError, ChatRequest, CheckedTest, Lang, LabReport, Person, Urgency } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_REPORTS = 6;
const MAX_MESSAGES = 12;
const MAX_TEXT = 2000;
const MAX_TESTS = 150;
const LANGS: Lang[] = ["en", "ur", "roman"];
const URGENCIES: Urgency[] = ["emergency", "soon", "routine", "normal"];

function apiError(status: number, code: ApiError["code"], error: string): Response {
  const body: ApiError = { error, code };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// ---------------------------------------------------------------- validation

const s = (x: unknown, max = 200): string => (typeof x === "string" ? x.slice(0, max) : typeof x === "number" ? String(x) : "");
const n = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

function coerceTest(x: unknown): CheckedTest | null {
  if (!x || typeof x !== "object") return null;
  const t = x as Record<string, unknown>;
  const name = s(t.name, 120);
  if (!name) return null;
  const status = ["low", "high", "normal", "unknown"].includes(t.status as string) ? (t.status as CheckedTest["status"]) : "unknown";
  const severity = ["none", "mild", "marked", "critical"].includes(t.severity as string) ? (t.severity as CheckedTest["severity"]) : "none";
  return {
    panel: s(t.panel, 120),
    name,
    value: s(t.value, 80),
    numericValue: n(t.numericValue),
    unit: s(t.unit, 40),
    refRangeText: s(t.refRangeText, 120),
    refLow: n(t.refLow),
    refHigh: n(t.refHigh),
    printedFlag: s(t.printedFlag, 12),
    key: s(t.key, 80),
    status,
    severity,
    critical: t.critical === true,
    criticalReason: typeof t.criticalReason === "string" ? s(t.criticalReason, 300) : undefined,
    position: n(t.position),
  };
}

function coerceReport(x: unknown): LabReport | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const tests = (Array.isArray(r.tests) ? r.tests : []).slice(0, MAX_TESTS).map(coerceTest).filter((t): t is CheckedTest => !!t);
  const urgency = URGENCIES.includes(r.urgency as Urgency) ? (r.urgency as Urgency) : "routine";
  return {
    id: s(r.id, 100),
    personId: s(r.personId, 100),
    createdAt: s(r.createdAt, 40),
    reportDate: s(r.reportDate, 20),
    labName: s(r.labName, 120),
    source: r.source === "scan" || r.source === "sample" || r.source === "demo" ? r.source : "scan",
    tests,
    urgency,
    urgencyReasons: (Array.isArray(r.urgencyReasons) ? r.urgencyReasons : []).slice(0, 10).map((u) => s(u, 300)).filter(Boolean),
    flaggedCount: n(r.flaggedCount) ?? tests.filter((t) => t.status === "low" || t.status === "high").length,
  };
}

function coercePerson(x: unknown): Person {
  const p = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  const sex = p.sex === "F" || p.sex === "M" ? p.sex : "";
  return {
    id: s(p.id, 100),
    name: s(p.name, 60),
    relation: s(p.relation, 40),
    age: n(p.age) ?? undefined,
    sex,
    createdAt: s(p.createdAt, 40),
  };
}

function parseChatRequest(body: unknown): { ok: true; value: ChatRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "The request must be a JSON object." };
  const b = body as Record<string, unknown>;
  if (!LANGS.includes(b.lang as Lang)) return { ok: false, error: 'lang must be "en", "ur" or "roman".' };
  if (b.task !== "explain_report" && b.task !== "chat") return { ok: false, error: 'task must be "explain_report" or "chat".' };
  if (b.reports !== undefined && !Array.isArray(b.reports)) return { ok: false, error: "reports must be an array." };
  if (!Array.isArray(b.messages)) return { ok: false, error: "messages must be an array." };
  const rawReports = (b.reports as unknown[] | undefined) ?? [];
  if (rawReports.length > MAX_REPORTS) return { ok: false, error: `Send at most ${MAX_REPORTS} reports.` };
  if (b.messages.length > MAX_MESSAGES) return { ok: false, error: `Send at most ${MAX_MESSAGES} messages.` };

  const messages: ChatRequest["messages"] = [];
  for (const m of b.messages as unknown[]) {
    const o = m && typeof m === "object" ? (m as Record<string, unknown>) : null;
    if (!o || (o.role !== "user" && o.role !== "assistant") || typeof o.text !== "string") {
      return { ok: false, error: 'Each message needs role "user" or "assistant" and a text string.' };
    }
    if (o.text.length > MAX_TEXT) return { ok: false, error: `Each message must be at most ${MAX_TEXT} characters.` };
    messages.push({ role: o.role, text: o.text });
  }
  if (b.task === "chat" && !messages.some((m) => m.role === "user" && m.text.trim())) {
    return { ok: false, error: "Send at least one user message." };
  }

  return {
    ok: true,
    value: {
      lang: b.lang as Lang,
      task: b.task,
      person: coercePerson(b.person),
      reports: rawReports.map(coerceReport).filter((r): r is LabReport => !!r),
      messages,
      focusReportId: typeof b.focusReportId === "string" ? b.focusReportId.slice(0, 100) : undefined,
    },
  };
}

// ---------------------------------------------------------------- streaming helpers

async function* once(text: string): AsyncGenerator<string> {
  // A few chunks so the client's streaming UI behaves the same as with the model.
  const parts = text.split(/(?<=\n)/);
  for (const p of parts) yield p;
}

function toReadable(gen: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // Keep pulling until we enqueue something or finish: an empty pull would stall the reader.
        for (;;) {
          const { value, done } = await gen.next();
          if (done) {
            controller.close();
            return;
          }
          if (value) {
            controller.enqueue(enc.encode(value));
            return;
          }
        }
      } catch {
        controller.close();
      }
    },
    async cancel() {
      await gen.return(undefined);
    },
  });
}

function streamResponse(gen: AsyncGenerator<string>, headers: Record<string, string>): Response {
  return new Response(toReadable(gen), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      ...headers,
    },
  });
}

// ---------------------------------------------------------------- handler

export async function POST(req: Request): Promise<Response> {
  const blocked = guardRequest(req, { route: "chat" });
  if (blocked) return blocked;
  const needsSignIn = await requireSignIn();
  if (needsSignIn) return needsSignIn;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(400, "bad_request", "The request body must be JSON.");
  }
  const parsed = parseChatRequest(raw);
  if (!parsed.ok) return apiError(400, "bad_request", parsed.error);
  const chat = parsed.value;

  const lastUser = [...chat.messages].reverse().find((m) => m.role === "user")?.text ?? "";
  const detected = detectEmergency(lastUser).isEmergency;
  const focus = pickFocusReport(chat.reports, chat.focusReportId);
  // Code decides: emergency words in the latest message, or danger values in the report being
  // explained. Follow-up questions about that report don't raise it again (its card already shows).
  const kind: EmergencyKind | null = detected
    ? "words"
    : chat.task === "explain_report" && focus?.urgency === "emergency"
      ? "report"
      : null;
  const mustFlag = kind !== null;
  const flagHeader: Record<string, string> = kind ? { "x-shifa-emergency": kind } : {};

  const offline = (): Response =>
    streamResponse(once(offlineAnswer(chat)), { "x-shifa-offline": "1", "x-shifa-model": "offline", ...flagHeader });

  if (!isConfigured()) return offline();

  try {
    const { stream, model } = await streamText({
      system: buildChatSystem({
        lang: chat.lang,
        person: chat.person,
        reports: chat.reports,
        task: chat.task,
        focusReportId: chat.focusReportId,
        emergencyDetected: detected,
      }),
      contents: buildChatContents(chat.messages, chat.task, chat.lang),
      timeoutMs: 55000, // whole answer incl. fallbacks (fits maxDuration 60)
      firstByteTimeoutMs: 20000, // per model, until the first text arrives
      signal: req.signal,
    });
    return streamResponse(guardOutput(stream, kind, chat.lang), { "x-shifa-model": model, ...flagHeader });
  } catch (e) {
    const code = e instanceof GeminiError ? e.code : "upstream";
    console.error(`[chat] Gemini ${code}${e instanceof GeminiError ? ` (${e.status})` : ""}`);
    // Safety first: in an emergency always answer (deterministically) instead of erroring.
    if (mustFlag) return offline();
    if (code === "quota") return apiError(429, "rate_limited", "The AI is busy right now (usage limit reached). Please try again in a minute.");
    if (code === "no_key") return offline();
    if (code === "timeout") return apiError(504, "ai_error", "The AI took too long to answer. Please try again.");
    return apiError(502, "ai_error", "The AI could not answer right now. Please try again.");
  }
}
