// Display helpers for checked lab data. Pure functions; no AI involved.
import type { LucideIcon } from "lucide-react";
import { CircleAlert, CircleArrowDown, CircleArrowUp, CircleCheck, CircleMinus, Stethoscope, TriangleAlert } from "lucide-react";
import { t, type I18nKey } from "@/lib/i18n";
import type { CheckedTest, LabReport, Lang, PatientOnReport, Person, Urgency } from "@/lib/types";
import { displayName, parseAge, parseSex } from "@/lib/identity";

export type Tone = "ok" | "warn" | "bad" | "muted" | "emergency";

/** Pill/badge colours. Colour is only ever used for health status. */
export const TONE_CLASSES: Record<Tone, string> = {
  ok: "text-ok bg-ok-bg border-ok/30",
  warn: "text-warn bg-warn-bg border-warn/30",
  bad: "text-bad bg-bad-bg border-bad/30",
  muted: "text-muted bg-surface border-border",
  emergency: "text-white bg-emergency border-emergency",
};

export const TONE_DOT: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  muted: "bg-muted",
  emergency: "bg-emergency",
};

export const URGENCY_META: Record<Urgency, { Icon: LucideIcon; tone: Tone; label: I18nKey; short: I18nKey; action: I18nKey }> = {
  emergency: { Icon: Stethoscope, tone: "emergency", label: "urgEmergency", short: "urgEmergency", action: "actEmergency" },
  soon: { Icon: TriangleAlert, tone: "bad", label: "urgSoon", short: "urgSoonShort", action: "actSoon" },
  routine: { Icon: CircleAlert, tone: "warn", label: "urgRoutine", short: "urgRoutine", action: "actRoutine" },
  normal: { Icon: CircleCheck, tone: "ok", label: "urgNormal", short: "urgNormal", action: "actNormal" },
};

export function isFlagged(test: CheckedTest): boolean {
  return test.status === "low" || test.status === "high" || test.critical;
}

function flagRank(test: CheckedTest): number {
  if (test.critical || test.severity === "critical") return 3;
  if (test.severity === "marked") return 2;
  if (test.severity === "mild") return 1;
  return 0;
}

/** Flagged tests, critical → marked → mild. */
export function flaggedTests(report: LabReport): CheckedTest[] {
  return report.tests
    .map((test, i) => ({ test, i }))
    .filter(({ test }) => isFlagged(test))
    .sort((a, b) => flagRank(b.test) - flagRank(a.test) || a.i - b.i)
    .map(({ test }) => test);
}

export function toneFor(test: CheckedTest): Tone {
  if (test.status === "unknown") return test.critical ? "bad" : "muted";
  if (test.status === "normal" && !test.critical) return "ok";
  if (test.critical || test.severity === "critical" || test.severity === "marked") return "bad";
  return "warn";
}

export function statusMeta(test: CheckedTest, lang: Lang): { label: string; Icon: LucideIcon; tone: Tone; srLabel: string } {
  const tone = toneFor(test);
  switch (test.status) {
    case "low":
      return { label: t("statusLow", lang), srLabel: t("statusLow", lang), Icon: CircleArrowDown, tone };
    case "high":
      if (test.numericValue === null) {
        return { label: t("statusAbnormal", lang), srLabel: t("statusAbnormal", lang), Icon: CircleAlert, tone };
      }
      return { label: t("statusHigh", lang), srLabel: t("statusHigh", lang), Icon: CircleArrowUp, tone };
    case "normal":
      return { label: t("statusNormal", lang), srLabel: t("statusNormal", lang), Icon: CircleCheck, tone };
    default:
      return { label: "—", srLabel: t("statusUnknown", lang), Icon: CircleMinus, tone };
  }
}

export function formatValue(test: Pick<CheckedTest, "value" | "unit">): string {
  return `${test.value}${test.unit ? ` ${test.unit}` : ""}`;
}

export function rangeText(test: Pick<CheckedTest, "refRangeText" | "refLow" | "refHigh" | "rangeSource">): string {
  // A guideline range used because the report printed none is always labelled as such.
  if (test.rangeSource === "standard") return `${test.refRangeText?.trim() || ""} (standard)`.trim();
  if (test.refRangeText?.trim()) return test.refRangeText.trim();
  if (test.refLow !== null && test.refHigh !== null) return `${test.refLow}–${test.refHigh}`;
  if (test.refLow !== null) return `≥ ${test.refLow}`;
  if (test.refHigh !== null) return `≤ ${test.refHigh}`;
  return "";
}

/** Sort newest first by report date, then by when it was added. */
export function sortReportsNewestFirst(reports: LabReport[]): LabReport[] {
  return [...reports].sort(
    (a, b) => (b.reportDate || "").localeCompare(a.reportDate || "") || (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
}

export function personReports(reports: LabReport[], personId: string | null | undefined): LabReport[] {
  if (!personId) return [];
  return sortReportsNewestFirst(reports.filter((r) => r.personId === personId));
}

export function initialOf(p: Pick<Person, "name"> | null | undefined): string {
  const n = p?.name?.trim();
  return n ? n.charAt(0).toUpperCase() : "?";
}

/** "IMRAN QURESHI ." / "35 (Y)" / "M" -> "Imran Qureshi · 35 yrs · Male" (raw text when it can't be read). */
export function patientLine(p: PatientOnReport, lang: Lang): string {
  const age = parseAge(p.age);
  const sex = parseSex(p.sex);
  return [
    displayName(p.name) || p.name.trim(),
    age !== null && age >= 1 ? t("years", lang, { n: Math.floor(age) }) : p.age.trim(),
    sex === "F" ? t("sexF", lang) : sex === "M" ? t("sexM", lang) : p.sex.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
}
