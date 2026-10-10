"use client";

import { FileText, ShieldCheck } from "lucide-react";
import { formatDate, t, urduFont } from "@/lib/i18n";
import type { LabReport, Lang } from "@/lib/types";
import UrgencyBadge from "./UrgencyBadge";
import ValueRow from "./ValueRow";
import { flaggedTests } from "./reportUtils";

/**
 * The verified report card. Everything here (flags, urgency, reasons) comes from
 * deterministic code in labRules.ts, not from the AI.
 */
export default function ReportCard({
  report,
  lang,
  onAsk,
  onOpen,
}: {
  report: LabReport;
  lang: Lang;
  onAsk?: (question: string) => void;
  onOpen?: (reportId: string) => void;
}) {
  const flagged = flaggedTests(report);
  const shown = flagged.slice(0, 4);
  const total = report.tests.length;
  const flaggedCount = Math.max(report.flaggedCount, flagged.length);

  return (
    <section
      aria-label={`${report.labName || t("labReport", lang)}, ${formatDate(report.reportDate, lang)}`}
      className="animate-fade-in rounded-card border bg-bg p-4"
    >
      <header className="flex min-w-0 items-center gap-2 text-sm text-muted">
        <FileText size={16} aria-hidden className="shrink-0" />
        <span className="truncate font-medium text-ink">{report.labName || t("labReport", lang)}</span>
        <span aria-hidden>·</span>
        <bdi className="shrink-0 whitespace-nowrap">{formatDate(report.reportDate, lang)}</bdi>
      </header>

      <div className="mt-3">
        <UrgencyBadge urgency={report.urgency} lang={lang} size="lg" />
      </div>

      {report.urgencyReasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm" dir="auto">
          {report.urgencyReasons.slice(0, 3).map((reason, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-muted">
                •
              </span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}

      <p className={`mt-3 text-sm font-semibold ${urduFont(lang)}`}>
        {flaggedCount > 0 ? t("needCare", lang, { n: flaggedCount, total }) : t("allInRange", lang, { total })}
      </p>

      {shown.length > 0 && (
        <div className="divide-y">
          {shown.map((test, i) => (
            <ValueRow key={`${test.key}-${i}`} test={test} lang={lang} onAsk={onAsk} />
          ))}
        </div>
      )}
      {flagged.length > shown.length && (
        <p className={`text-sm text-muted ${urduFont(lang)}`}>{t("moreFlagged", lang, { n: flagged.length - shown.length })}</p>
      )}

      {onOpen && (
        <button
          type="button"
          onClick={() => onOpen(report.id)}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-input border px-4 text-sm font-medium transition-colors hover:bg-surface"
        >
          <span className={urduFont(lang)}>{t("seeAll", lang, { n: total })}</span>
        </button>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck size={14} aria-hidden className="shrink-0" />
        <span className={urduFont(lang)}>{t("checkedByRules", lang)}</span>
      </p>
    </section>
  );
}
