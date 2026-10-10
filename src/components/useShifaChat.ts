"use client";

// Chat, scan and sample flows. The AI only reads (extract) and explains (chat);
// flags and urgency come from checkReport() in code, and the emergency banner is
// raised by code (keywords, danger values) before any AI reply.

import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { SAMPLE_EXTRACTION } from "@/lib/demoData";
import { detectEmergency, EMERGENCY_SENTINEL } from "@/lib/emergency";
import { blobToBase64, fileToPayload, UploadError, type UploadPayload } from "@/lib/image";
import { t, type I18nKey } from "@/lib/i18n";
import { checkReport } from "@/lib/labRules";
import { shifa } from "@/lib/store";
import type {
  ApiError,
  ChatRequest,
  ExtractedReport,
  ExtractRequest,
  ExtractResponse,
  LabReport,
  Person,
} from "@/lib/types";
import type { ScanState } from "./ChatThread";
import { personReports, sortReportsNewestFirst } from "./reportUtils";

type ErrCode = ApiError["code"] | "network" | "too_large" | "other";

const FLUSH_MS = 60;
const MAX_TURN_CHARS = 1990; // /api/chat rejects any message over 2000 characters
const CHECK_STEP_MS = 450; // lets people see the "Checking every value" step

class FlowError extends Error {
  code: ErrCode;
  constructor(code: ErrCode) {
    super(code);
    this.code = code;
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function readErrorCode(res: Response): Promise<ErrCode> {
  if (res.status === 429) return "rate_limited";
  try {
    const body = (await res.json()) as Partial<ApiError>;
    if (body && typeof body.code === "string") return body.code;
  } catch {
    /* not JSON */
  }
  if (res.status === 401) return "unauthorized";
  if (res.status === 413) return "too_large";
  return "other";
}

function extractErrorKey(code: ErrCode | null): I18nKey {
  switch (code) {
    case "no_key":
      return "errNoKey";
    case "not_a_report":
      return "errNotReport";
    case "rate_limited":
      return "errRateLimited";
    case "bad_upload":
    case "bad_request":
      return "errBadUpload";
    case "too_large":
      return "errTooLarge";
    case "unauthorized":
      return "errUnauthorized";
    case "sign_in_required":
      return "errSignIn";
    case "network":
      return "errNetwork";
    default:
      return "errOther";
  }
}

function chatErrorKey(code: ErrCode): I18nKey {
  if (code === "rate_limited") return "errRateLimited";
  if (code === "unauthorized") return "errUnauthorized";
  if (code === "sign_in_required") return "errSignIn";
  if (code === "network") return "errNetwork";
  return "errChat";
}

/** Active person, or auto-create "Me" (Self) when the family is empty. */
function ensurePerson(): Person {
  const s = shifa.getState();
  let person = s.people.find((p) => p.id === s.activePersonId) ?? s.people[0];
  if (!person) person = shifa.addPerson({ name: "Me", relation: "Self" });
  if (shifa.getState().activePersonId !== person.id) shifa.setActivePerson(person.id);
  if (!shifa.getState().onboarded) shifa.completeOnboarding();
  return person;
}

function freshPerson(fallback: Person): Person {
  return shifa.getState().people.find((p) => p.id === fallback.id) ?? fallback;
}

/** This person's reports, newest first, max 6, always including the focus report. */
function reportsForRequest(personId: string, focusId?: string): LabReport[] {
  const all = personReports(shifa.getState().reports, personId);
  let top = all.slice(0, 6);
  if (focusId && !top.some((r) => r.id === focusId)) {
    const focus = all.find((r) => r.id === focusId);
    if (focus) top = sortReportsNewestFirst([...top.slice(0, 5), focus]);
  }
  return top;
}

/**
 * POST /api/chat and stream the reply into an assistant message.
 * - A leading EMERGENCY_SENTINEL line is stripped and raises the banner.
 * - `x-shifa-offline: 1` marks the message as an offline answer.
 * - Store updates are throttled to ~60ms.
 */
export async function streamChat(req: ChatRequest, messageId: string, onEmergency: () => void): Promise<void> {
  let res: Response;
  try {
    res = await apiFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    throw new FlowError("network");
  }
  if (!res.ok || !res.body) throw new FlowError(await readErrorCode(res));
  if (res.headers.get("x-shifa-offline") === "1") shifa.updateMessage(messageId, { offline: true });
  if (res.headers.get("x-shifa-emergency") === "1") {
    onEmergency();
    shifa.updateMessage(messageId, { emergency: true });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let sentinelChecked = false;
  let lastFlush = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const visible = () => raw.split(EMERGENCY_SENTINEL).join("").replace(/^\s+/, "");
  const flush = () => {
    timer = null;
    lastFlush = Date.now();
    shifa.updateMessage(messageId, { text: visible() });
  };
  const checkSentinel = (final: boolean) => {
    if (sentinelChecked) return;
    if (!final && raw.length <= EMERGENCY_SENTINEL.length && EMERGENCY_SENTINEL.startsWith(raw)) return;
    sentinelChecked = true;
    if (raw.startsWith(EMERGENCY_SENTINEL)) {
      raw = raw.slice(EMERGENCY_SENTINEL.length);
      onEmergency();
      shifa.updateMessage(messageId, { emergency: true });
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      checkSentinel(false);
      if (sentinelChecked && !timer) timer = setTimeout(flush, Math.max(0, FLUSH_MS - (Date.now() - lastFlush)));
    }
    raw += decoder.decode();
  } catch {
    // Connection dropped mid-answer: keep what arrived, otherwise report it.
    if (!raw.trim()) {
      if (timer) clearTimeout(timer);
      throw new FlowError("network");
    }
  }
  checkSentinel(true);
  if (timer) clearTimeout(timer);
  const text = visible().trim();
  if (!text) throw new FlowError("ai_error");
  shifa.updateMessage(messageId, { text });
}

export function useShifaChat() {
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState | null>(null);
  const [emergency, setEmergency] = useState(false);
  const busyRef = useRef(false);

  const raiseEmergency = useCallback(() => setEmergency(true), []);
  const dismissEmergency = useCallback(() => setEmergency(false), []);

  const begin = () => {
    if (busyRef.current) return false;
    busyRef.current = true;
    return true;
  };
  const finish = () => {
    busyRef.current = false;
    setBusyMessageId(null);
    setScan(null);
  };

  /** Shared by "scan a report" and "try a sample report". */
  const runExtraction = async (
    getPayload: () => Promise<UploadPayload>,
    opts: { sample: boolean; attachmentName: string },
  ) => {
    if (!begin()) return;
    const lang = shifa.getState().lang;
    let placeholderId: string | null = null;
    try {
      const person = ensurePerson();
      shifa.addMessage({ personId: person.id, role: "user", text: "", attachmentName: opts.attachmentName });
      const placeholder = shifa.addMessage({ personId: person.id, role: "assistant", text: "", lang });
      placeholderId = placeholder.id;
      setBusyMessageId(placeholder.id);
      setScan({ messageId: placeholder.id, step: 0 });
      const fail = (key: I18nKey) => shifa.updateMessage(placeholder.id, { text: t(key, lang) });

      // 1. AI reads the report.
      let extracted: ExtractedReport | null = null;
      let offline = false;
      let code: ErrCode | null = null;
      try {
        const payload = await getPayload();
        const body: ExtractRequest = { imageBase64: payload.imageBase64, mimeType: payload.mimeType };
        if (opts.sample) body.sample = true;
        let res: Response;
        try {
          res = await apiFetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch {
          throw new FlowError("network");
        }
        if (res.ok) {
          const data = (await res.json()) as ExtractResponse;
          extracted = data.report;
          offline = Boolean(data.offline);
        } else {
          code = await readErrorCode(res);
        }
      } catch (e) {
        code = e instanceof UploadError ? (e.code === "too_large" ? "too_large" : "bad_upload") : e instanceof FlowError ? e.code : "network";
      }

      // Demo safety net: the sample always works, even with no server or key.
      if (!extracted && opts.sample && code !== "unauthorized" && SAMPLE_EXTRACTION.tests.length > 0) {
        extracted = SAMPLE_EXTRACTION;
        offline = true;
        code = null;
      }
      if (!extracted) return fail(extractErrorKey(code));
      if (!extracted.isLabReport || !Array.isArray(extracted.tests) || extracted.tests.length === 0) {
        return fail("errNotReport");
      }

      // 2. Code checks every value (no AI).
      setScan({ messageId: placeholder.id, step: 1 });
      await wait(CHECK_STEP_MS);
      const report = checkReport(extracted, { personId: person.id, source: opts.sample ? "sample" : "scan" });
      shifa.addReport(report);
      const isEmergency = report.urgency === "emergency";
      shifa.updateMessage(placeholder.id, {
        reportId: report.id,
        ...(offline ? { offline: true } : {}),
        ...(isEmergency ? { emergency: true } : {}),
      });
      if (isEmergency) setEmergency(true);

      // 3. AI explains, grounded in the checked report.
      setScan({ messageId: placeholder.id, step: 2 });
      // Use the language selected now: the user may have switched it while the report was being read.
      const explainLang = shifa.getState().lang;
      if (explainLang !== lang) shifa.updateMessage(placeholder.id, { lang: explainLang });
      try {
        await streamChat(
          {
            lang: explainLang,
            person: freshPerson(person),
            reports: reportsForRequest(person.id, report.id),
            messages: [],
            task: "explain_report",
            focusReportId: report.id,
          },
          placeholder.id,
          raiseEmergency,
        );
      } catch (e) {
        const c = e instanceof FlowError ? e.code : "other";
        fail(c === "rate_limited" || c === "unauthorized" || c === "sign_in_required" ? chatErrorKey(c) : "errExplain");
      }
    } catch (e) {
      console.error("[shifa] scan flow failed", e);
      if (placeholderId) shifa.updateMessage(placeholderId, { text: t("errOther", lang) });
    } finally {
      finish();
    }
  };

  const scanFile = (file: File) =>
    runExtraction(() => fileToPayload(file), { sample: false, attachmentName: file.name || "report" });

  const runSample = () =>
    runExtraction(
      async () => {
        const res = await fetch("/samples/sample-report.png");
        if (!res.ok) throw new Error("sample image missing");
        const blob = await res.blob();
        return { imageBase64: await blobToBase64(blob), mimeType: blob.type || "image/png", name: "sample-report.png" };
      },
      { sample: true, attachmentName: "sample-report.png" },
    );

  const sendText = async (input: string) => {
    const text = input.trim();
    if (!text || !begin()) return;
    const lang = shifa.getState().lang;
    let placeholderId: string | null = null;
    try {
      const person = ensurePerson();
      // Code-side emergency check runs before any network call.
      let isEmergency = false;
      try {
        isEmergency = detectEmergency(text).isEmergency;
      } catch {
        isEmergency = false;
      }
      if (isEmergency) setEmergency(true);
      shifa.addMessage({ personId: person.id, role: "user", text, ...(isEmergency ? { emergency: true } : {}) });
      const placeholder = shifa.addMessage({
        personId: person.id,
        role: "assistant",
        text: "",
        lang,
        ...(isEmergency ? { emergency: true } : {}),
      });
      placeholderId = placeholder.id;
      setBusyMessageId(placeholder.id);

      const history = shifa
        .getState()
        .messages.filter((m) => m.personId === person.id && m.id !== placeholder.id && m.text.trim())
        .slice(-12)
        .map((m) => ({
          role: m.role,
          text: m.text.length > MAX_TURN_CHARS ? `${m.text.slice(0, MAX_TURN_CHARS)}…` : m.text,
        }));

      await streamChat(
        { lang, person: freshPerson(person), reports: reportsForRequest(person.id), messages: history, task: "chat" },
        placeholder.id,
        raiseEmergency,
      );
    } catch (e) {
      if (!(e instanceof FlowError)) console.error("[shifa] chat flow failed", e);
      const code = e instanceof FlowError ? e.code : "other";
      if (placeholderId) shifa.updateMessage(placeholderId, { text: t(chatErrorKey(code), lang) });
    } finally {
      finish();
    }
  };

  return {
    busy: busyMessageId !== null,
    busyMessageId,
    scan,
    emergency,
    raiseEmergency,
    dismissEmergency,
    sendText,
    scanFile,
    runSample,
  };
}
