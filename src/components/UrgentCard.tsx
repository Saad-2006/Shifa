"use client";

import { Phone, Stethoscope, TriangleAlert } from "lucide-react";
import { RESCUE_NUMBER, type EmergencyKind } from "@/lib/emergency";
import { t, urduFont } from "@/lib/i18n";
import type { AlertContact, Lang } from "@/lib/types";
import WhatsAppAlertButtons from "./WhatsAppAlertButtons";

/**
 * Calm urgent card, shown in the chat (never a popup), only for emergencies decided by CODE:
 * danger values on a report, or emergency words typed by the user. The main action is telling
 * the family on WhatsApp; typed emergencies also get one small "Call 1122" button.
 */
export default function UrgentCard({
  kind,
  personName,
  alertText,
  contacts,
  lang,
}: {
  kind: EmergencyKind;
  personName: string;
  /** Code-built WhatsApp message (whatsapp.ts). */
  alertText: string;
  contacts: AlertContact[];
  lang: Lang;
}) {
  const ur = urduFont(lang);
  const Icon = kind === "report" ? Stethoscope : TriangleAlert;
  return (
    <section
      aria-label={kind === "report" ? t("actEmergency", lang) : t("urgentWordsTitle", lang)}
      className="rounded-input border border-warn/40 bg-warn-bg p-3"
    >
      <div className="flex items-start gap-2.5">
        <Icon size={20} aria-hidden className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0">
          {kind === "words" && <p className={`font-semibold ${ur}`}>{t("urgentWordsTitle", lang)}</p>}
          <p className={`text-sm ${ur}`}>
            {kind === "report" ? t("urgentReportBody", lang, { name: personName }) : t("urgentWordsBody", lang)}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <WhatsAppAlertButtons text={alertText} contacts={contacts} lang={lang} />
      </div>
      {kind === "words" && (
        <a
          href={`tel:${RESCUE_NUMBER}`}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-input border bg-bg px-3 text-sm font-medium hover:bg-surface"
        >
          <Phone size={16} aria-hidden />
          <span className={ur}>{t("call1122", lang)}</span>
        </a>
      )}
    </section>
  );
}
