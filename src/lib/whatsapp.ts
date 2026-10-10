// One-tap WhatsApp alerts for emergencies decided by CODE (a danger value in a report, or the
// keyword emergency detector). The message is built here, never by the AI; the user taps Send.
import { formatDate, t } from "@/lib/i18n";
import type { EmergencyCategory } from "@/lib/emergency";
import type { LabReport, Lang } from "@/lib/types";

/**
 * Pakistani and international numbers to wa.me format (digits only, with country code).
 * "0300-1234567" / "+92 300 1234567" / "00923001234567" / "3001234567" -> "923001234567".
 * Returns null when it can't be a phone number.
 */
export function normalisePhone(input: string): string | null {
  let d = (input || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (/^03\d{9}$/.test(d)) d = `92${d.slice(1)}`;
  else if (/^3\d{9}$/.test(d)) d = `92${d}`;
  d = d.replace(/\D/g, "");
  if (d.startsWith("920")) d = `92${d.slice(3)}`; // "+92 0300..." typed with the trunk zero
  if (d.startsWith("92") && d.length !== 12) return null; // Pakistani mobiles: 92 + 10 digits
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** "923001234567" -> "+92 300 1234567" for display. */
export function formatPhone(digits: string): string {
  const m = /^92(\d{3})(\d{7})$/.exec(digits);
  return m ? `+92 ${m[1]} ${m[2]}` : `+${digits}`;
}

/** wa.me link: opens that chat, or (no number) lets the user pick a chat in WhatsApp. */
export function waLink(text: string, phone?: string | null): string {
  return `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;
}

/** Alert for a report whose danger values were flagged by labRules (urgency "emergency"). */
export function reportAlertText(report: LabReport, personName: string, lang: Lang): string {
  const dangers = report.tests
    .filter((x) => x.critical)
    .slice(0, 3)
    .map((x) => `• ${x.criticalReason ?? `${x.name} ${x.value} ${x.unit}`.trim()}`);
  const lab = [report.labName, formatDate(report.reportDate, lang)].filter(Boolean).join(", ");
  return [
    t("waAlertTitle", lang, { name: personName }),
    t("waAlertReport", lang, { lab }),
    ...dangers,
    t("waAlertAction", lang),
    t("waAlertFooter", lang),
  ].join("\n");
}

const CATEGORY_KEY: Record<EmergencyCategory, Parameters<typeof t>[0]> = {
  cardiac: "waCatCardiac",
  breathing: "waCatBreathing",
  stroke: "waCatStroke",
  bleeding: "waCatBleeding",
  unconscious: "waCatUnconscious",
  seizure: "waCatSeizure",
  suicide: "waCatSuicide",
  poisoning: "waCatPoisoning",
  allergy: "waCatAllergy",
  other: "waCatOther",
};

/** Alert for an emergency typed in the chat (caught by the keyword detector). */
export function keywordAlertText(category: EmergencyCategory | null, personName: string, lang: Lang): string {
  return [
    t("waAlertTitle", lang, { name: personName }),
    t("waAlertSigns", lang, { signs: t(CATEGORY_KEY[category ?? "other"], lang) }),
    t("waAlertAction", lang),
    t("waAlertFooter", lang),
  ].join("\n");
}
