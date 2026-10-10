"use client";

// Chat, scan and sample flows. The AI only reads (extract) and explains (chat);
// flags and urgency come from checkReport() in code, and the emergency banner is
// raised by code (keywords, danger values) before any AI reply.

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { SAMPLE_EXTRACTION } from "@/lib/demoData";
import { detectEmergency, EMERGENCY_SENTINEL } from "@/lib/emergency";
import { blobToBase64, fileToPayload, UploadError, type UploadPayload } from "@/lib/image";
import { t, type I18nKey } from "@/lib/i18n";
import { ageNow, compareIdentity, displayName, parseAge, parseSex, readPatient } from "@/lib/identity";
import { checkReport } from "@/lib/labRules";
import { shifa } from "@/lib/store";
import type {
  ApiError,
  ChatRequest,
  ExtractedReport,
  ExtractRequest,
  ExtractResponse,
  LabReport,
  PatientOnReport,
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
function ensurePersonInfo(): { person: Person; created: boolean } {
  const s = shifa.getState();
  let person = s.people.find((p) => p.id === s.activePersonId) ?? s.people[0];
  const created = !person;
  if (!person) person = shifa.addPerson({ name: "Me", relation: "Self" });
  if (shifa.getState().activePersonId !== person.id) shifa.setActivePerson(person.id);
  if (!shifa.getState().onboarded) shifa.completeOnboarding();
  return { person, created };
}
const ensurePerson = (): Person => ensurePersonInfo().person;

/** Age today from the report's printed age ("35 (Y)" on a Dec 2023 report -> 38), or null. */
function currentAge(patient: PatientOnReport, reportDate: string): number | null {
  const age = parseAge(patient.age);
  return age !== null && age >= 1 ? ageNow(age, reportDate) : null;
}

/**
 * Learn from a confirmed report: remember the printed name and fill in a missing age or sex.
 * `rename` is only for a profile we just auto-created ("Me"), which takes the report's name.
 */
function learnPatient(personId: string, patient: PatientOnReport, reportDate: string, rename = false): void {
  const person = shifa.getState().people.find((p) => p.id === personId);
  if (!person) return;
  const name = displayName(patient.name);
  const age = currentAge(patient, reportDate);
  const sex = parseSex(patient.sex);
  const patch: Partial<Pick<Person, "name" | "relation" | "age" | "sex">> = {};
  if (rename && name) Object.assign(patch, { name, relation: "" });
  if (typeof person.age !== "number" && age !== null) patch.age = age;
  if (!person.sex && sex) patch.sex = sex;
  if (Object.keys(patch).length) shifa.updatePerson(personId, patch);
  if (name) shifa.rememberReportName(personId, name);
}

/** New family member from the details printed on a report. */
function personFromPatient(patient: PatientOnReport, reportDate: string, fallbackName: string): Person {
  const age = currentAge(patient, reportDate);
  const sex = parseSex(patient.sex);
  const person = shifa.addPerson({
    name: displayName(patient.name) || fallbackName,
    relation: "",
    ...(age !== null ? { age } : {}),
    ...(sex ? { sex } : {}),
  });
  if (patient.name) shifa.rememberReportName(person.id, patient.name);
  return person;
}

export type IdentityChoice = { kind: "person"; personId: string } | { kind: "new" } | { kind: "cancel" };

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
 * - A leading EMERGENCY_SENTINEL line (sent only when code flagged an emergency) is stripped
 *   and marks the message; the calm urgent card in the chat is decided by code, not this.
 * - `x-shifa-offline: 1` marks the message as an offline answer.
 * - Store updates are throttled to ~60ms.
 */
export async function streamChat(req: ChatRequest, messageId: string): Promise<void> {
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
  if (res.headers.get("x-shifa-emergency")) shifa.updateMessage(messageId, { emergency: true });

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
  const busyRef = useRef(false);

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
      const { person, created } = ensurePersonInfo();
      const userMsg = shifa.addMessage({ personId: person.id, role: "user", text: "", attachmentName: opts.attachmentName });
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

      // 2. Code checks WHO the report is for before showing anything (no AI), so a wrong
      //    report never puts a scary result on the wrong family member.
      const source: LabReport["source"] = opts.sample ? "sample" : "scan";
      if (created) {
        learnPatient(person.id, readPatient(extracted).shown, extracted.reportDate, true);
      } else {
        const verdict = compareIdentity(extracted, freshPerson(person), shifa.getState().people);
        if (verdict.status === "mismatch") {
          shifa.updateMessage(placeholder.id, {
            pendingIdentity: {
              mode: "confirm",
              forPersonId: person.id,
              patient: verdict.patient,
              conflicts: verdict.conflicts,
              ...(verdict.suggestedPersonId ? { suggestedPersonId: verdict.suggestedPersonId } : {}),
              extracted,
              source,
              offline,
              userMessageId: userMsg.id,
            },
          });
          return; // wait for the user's choice (resolveIdentity)
        }
      }
      await completeScan(person.id, placeholder.id, extracted, source, offline, lang);
    } catch (e) {
      console.error("[shifa] scan flow failed", e);
      if (placeholderId) shifa.updateMessage(placeholderId, { text: t("errOther", lang) });
    } finally {
      finish();
    }
  };

  /** Steps 3-4: code checks every value, then the AI explains, for the confirmed person. */
  const completeScan = async (
    personId: string,
    messageId: string,
    extracted: ExtractedReport,
    source: LabReport["source"],
    offline: boolean,
    lang: ReturnType<typeof shifa.getState>["lang"],
  ) => {
    learnPatient(personId, readPatient(extracted).shown, extracted.reportDate);
    setBusyMessageId(messageId);
    setScan({ messageId, step: 1 });
    await wait(CHECK_STEP_MS);
    const report = checkReport(extracted, { personId, source });
    shifa.addReport(report);
    const isEmergency = report.urgency === "emergency";
    shifa.updateMessage(messageId, {
      reportId: report.id,
      ...(offline ? { offline: true } : {}),
      ...(isEmergency ? { emergency: true } : {}),
    });
    setScan({ messageId, step: 2 });
    await explainInto(personId, report.id, messageId, lang);
  };

  /** AI explains a checked report into an assistant message, grounded in that person's reports. */
  const explainInto = async (
    personId: string,
    reportId: string,
    messageId: string,
    lang: ReturnType<typeof shifa.getState>["lang"],
  ) => {
    // Use the language selected now: the user may have switched it while the report was being read.
    const explainLang = shifa.getState().lang;
    if (explainLang !== lang) shifa.updateMessage(messageId, { lang: explainLang });
    const person = shifa.getState().people.find((p) => p.id === personId);
    if (!person) return;
    try {
      await streamChat(
        {
          lang: explainLang,
          person,
          reports: reportsForRequest(personId, reportId),
          messages: [],
          task: "explain_report",
          focusReportId: reportId,
        },
        messageId,
      );
    } catch (e) {
      const c = e instanceof FlowError ? e.code : "other";
      shifa.updateMessage(messageId, {
        text: t(c === "rate_limited" || c === "unauthorized" || c === "sign_in_required" ? chatErrorKey(c) : "errExplain", explainLang),
      });
    }
  };

  /** The user answered "whose report is this?" (or tapped "Not Ammi?" and picked someone). */
  const resolveIdentity = async (messageId: string, choice: IdentityChoice) => {
    if (!begin()) return;
    const lang = shifa.getState().lang;
    try {
      const msg = shifa.getState().messages.find((m) => m.id === messageId);
      const pend = msg?.pendingIdentity;
      if (!msg || !pend) return;
      if (choice.kind === "cancel") {
        shifa.updateMessage(messageId, {
          pendingIdentity: undefined,
          ...(pend.mode === "confirm" ? { text: t("idCancelled", lang) } : {}),
        });
        return;
      }
      const reportDate = pend.extracted?.reportDate ?? shifa.getState().reports.find((r) => r.id === msg.reportId)?.reportDate ?? "";
      const personId =
        choice.kind === "person" ? choice.personId : personFromPatient(pend.patient, reportDate, t("familyMember", lang)).id;
      if (personId !== msg.personId) {
        shifa.moveMessages([messageId, ...(pend.userMessageId ? [pend.userMessageId] : [])], personId);
      }
      shifa.setActivePerson(personId);
      shifa.updateMessage(messageId, { pendingIdentity: undefined });
      if (pend.mode === "confirm" && pend.extracted) {
        await completeScan(personId, messageId, pend.extracted, pend.source ?? "scan", Boolean(pend.offline), lang);
      } else if (pend.mode === "move" && msg.reportId) {
        shifa.moveReport(msg.reportId, personId);
        const report = shifa.getState().reports.find((r) => r.id === msg.reportId);
        if (report?.patient) learnPatient(personId, report.patient, report.reportDate);
        if (personId !== msg.personId) {
          // Re-explain for the right person (the old answer named the wrong one).
          shifa.updateMessage(messageId, { text: "" });
          setBusyMessageId(messageId);
          await explainInto(personId, msg.reportId, messageId, lang);
        }
      }
    } catch (e) {
      console.error("[shifa] identity choice failed", e);
      shifa.updateMessage(messageId, { text: t("errOther", lang) });
    } finally {
      finish();
    }
  };

  /** "Not Ammi?" on a report card: ask whose report it is, then move it. */
  const startMove = (messageId: string) => {
    const s = shifa.getState();
    const idx = s.messages.findIndex((m) => m.id === messageId);
    const msg = s.messages[idx];
    if (!msg?.reportId || busyRef.current) return;
    const report = s.reports.find((r) => r.id === msg.reportId);
    const prev = s.messages
      .slice(0, idx)
      .reverse()
      .find((m) => m.personId === msg.personId);
    shifa.updateMessage(messageId, {
      pendingIdentity: {
        mode: "move",
        forPersonId: msg.personId,
        patient: report?.patient ?? { name: "", age: "", sex: "" },
        conflicts: [],
        ...(prev?.role === "user" && prev.attachmentName ? { userMessageId: prev.id } : {}),
      },
    });
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
    sendText,
    scanFile,
    runSample,
    resolveIdentity,
    startMove,
  };
}
