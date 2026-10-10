// Shared data contracts for Shifa. Every module codes against these.
// Need another field? Keep it local to your module instead of editing this file.

export type Lang = "en" | "ur" | "roman";
export type Sex = "F" | "M" | "";

export interface Person {
  id: string;
  name: string; // "Ammi"
  relation: string; // "Mother", "Father", "Self"
  age?: number;
  sex?: Sex;
  createdAt: string; // ISO
  reportNames?: string[]; // patient names seen on this person's confirmed reports ("Shazia Bano")
}

/** A family member's WhatsApp number for one-tap emergency alerts (stored only on the phone). */
export interface AlertContact {
  id: string;
  name: string;
  phone: string; // digits with country code, e.g. "923001234567"
}

/** Patient details as printed on a report (display strings, not parsed). */
export interface PatientOnReport {
  name: string;
  age: string;
  sex: string;
}

/** One reason the report's patient doesn't look like the chosen family member (built by code). */
export interface IdentityConflict {
  kind: "name" | "sex" | "age";
  report: string; // what the report says
  profile: string; // what the family profile says
}

/**
 * A report waiting for the user to confirm whose it is.
 * "confirm": read but NOT added yet (identity didn't match), so nothing scary is shown.
 * "move": already added; the user tapped "Not Ammi?" to move it to someone else.
 */
export interface PendingIdentity {
  mode: "confirm" | "move";
  forPersonId: string;
  patient: PatientOnReport;
  conflicts: IdentityConflict[];
  suggestedPersonId?: string;
  extracted?: ExtractedReport;
  source?: "scan" | "sample" | "demo";
  offline?: boolean;
  userMessageId?: string;
}

/** One test exactly as the AI read it off the report. */
export interface ExtractedTest {
  panel: string; // "Complete Blood Count", "" if none printed
  name: string; // as printed: "Haemoglobin"
  value: string; // as printed: "10.6", "Negative", "<0.5"
  numericValue: number | null; // parsed number, null if not numeric
  unit: string; // as printed: "g/dL"
  refRangeText: string; // as printed: "12.0 - 15.5"
  refLow: number | null;
  refHigh: number | null;
  printedFlag: string; // "H", "L", "High", "" if none printed
}

/** What /api/extract returns. */
export interface ExtractedReport {
  isLabReport: boolean;
  labName: string;
  reportDate: string; // YYYY-MM-DD, "" if unreadable
  patientName: string;
  patientAge: string;
  patientSex: string;
  tests: ExtractedTest[];
  notes: string; // anything the AI could not read cleanly
}

export type TestStatus = "low" | "high" | "normal" | "unknown";
export type Severity = "none" | "mild" | "marked" | "critical";
export type Urgency = "emergency" | "soon" | "routine" | "normal";

/** A test after the deterministic checks in labRules.ts (no AI involved). */
export interface CheckedTest extends ExtractedTest {
  key: string; // canonical analyte key for trends, e.g. "hemoglobin"
  status: TestStatus;
  severity: Severity;
  critical: boolean; // crossed a danger (panic) value
  criticalReason?: string; // "Potassium 6.8 mmol/L is above the danger level of 6.0"
  position: number | null; // where the value sits in the ref range: 0 = refLow, 1 = refHigh (may be <0 or >1)
  rangeSource?: "report" | "standard"; // "standard" = the report printed no usable range; a published guideline range was used
  rangeNote?: string; // e.g. "Standard range (ADA): the report did not print a usable range"
}

export interface LabReport {
  id: string;
  personId: string;
  createdAt: string; // ISO, when added to Shifa
  reportDate: string; // YYYY-MM-DD from the report, falls back to createdAt date
  labName: string;
  source: "scan" | "sample" | "demo";
  tests: CheckedTest[];
  urgency: Urgency;
  urgencyReasons: string[]; // plain English, built by code
  flaggedCount: number; // tests with status low/high
  patient?: PatientOnReport; // who the report says it is for
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  personId: string;
  role: ChatRole;
  text: string;
  createdAt: string; // ISO
  reportId?: string; // assistant message that shows a report card
  attachmentName?: string; // user message that attached a file
  emergency?: boolean; // show the emergency banner with this message
  offline?: boolean; // answer came from the offline fallback, not Gemini
  lang?: Lang;
  pendingIdentity?: PendingIdentity; // "is this report for Ammi?" waiting for the user
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  value: number;
  refLow: number | null;
  refHigh: number | null;
  reportId: string;
}

export interface Trend {
  key: string;
  name: string; // display name from the latest report
  unit: string;
  points: TrendPoint[]; // oldest first, at least 2
  direction: "up" | "down" | "flat";
  summary: string; // "HbA1c rose from 6.1% (Mar 2026) to 7.4% (Oct 2026)"
  latestStatus: TestStatus;
}

/** Request body for POST /api/extract */
export interface ExtractRequest {
  imageBase64: string; // raw base64, no "data:" prefix
  mimeType: string; // image/jpeg | image/png | image/webp | application/pdf
  sample?: boolean; // true when the user picked "Try a sample report"
}

/** 200 response from POST /api/extract */
export interface ExtractResponse {
  report: ExtractedReport;
  model: string | null;
  offline: boolean; // true when served from the canned sample without Gemini
}

/** Request body for POST /api/chat (response is a text/plain stream) */
export interface ChatRequest {
  lang: Lang;
  person: Person;
  reports: LabReport[]; // this person's reports, newest first, max 6
  messages: { role: ChatRole; text: string }[]; // recent turns, max 12, last one is the new user turn
  task: "explain_report" | "chat";
  focusReportId?: string; // the report to explain when task = explain_report
}

/** Error body for any /api route */
export interface ApiError {
  error: string;
  code:
    | "no_key"
    | "not_a_report"
    | "bad_upload"
    | "rate_limited"
    | "unauthorized"
    | "ai_error"
    | "bad_request"
    | "sign_in_required";
}

/** GET /api/health */
export interface HealthResponse {
  ok: true;
  aiConfigured: boolean;
  model: string | null;
  accessRequired: boolean;
  authEnabled: boolean; // Google sign-in is configured on this server
  signInRequired: boolean; // API refuses guests (SHIFA_REQUIRE_SIGNIN=true)
}
