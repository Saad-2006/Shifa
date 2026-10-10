"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Trash, X } from "lucide-react";
import { formatDate, t, urduFont } from "@/lib/i18n";
import type { CheckedTest, LabReport, Lang } from "@/lib/types";
import UrgencyBadge from "./UrgencyBadge";
import ValueRow from "./ValueRow";

function groupByPanel(tests: CheckedTest[], otherLabel: string): { panel: string; tests: CheckedTest[] }[] {
  const groups = new Map<string, CheckedTest[]>();
  for (const test of tests) {
    const panel = test.panel?.trim() || otherLabel;
    const list = groups.get(panel);
    if (list) list.push(test);
    else groups.set(panel, [test]);
  }
  return [...groups.entries()].map(([panel, list]) => ({ panel, tests: list }));
}

/** Every value in a report, grouped by panel. A modal on desktop, a bottom sheet on phones. */
export default function ReportSheet({
  report,
  lang,
  onClose,
  onDelete,
  onAsk,
}: {
  report: LabReport | null;
  lang: Lang;
  onClose: () => void;
  onDelete?: (reportId: string) => void;
  onAsk?: (question: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const open = report !== null;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!report) return null;
  const groups = groupByPanel(report.tests, t("otherTests", lang));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-sheet-title"
        className="relative flex max-h-[90dvh] w-full animate-slide-up flex-col rounded-t-card border bg-bg sm:max-w-2xl sm:rounded-card"
      >
        <div className="flex items-start gap-3 border-b px-4 pt-3 pb-3">
          <div className="min-w-0 flex-1">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
            <h2 id="report-sheet-title" className="truncate text-lg font-semibold">
              {report.labName || t("labReport", lang)}
            </h2>
            <p className="text-sm text-muted">
              <bdi>{formatDate(report.reportDate, lang)}</bdi> · <span className={urduFont(lang)}>{t("allValues", lang)}</span> (
              {report.tests.length})
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("close", lang)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-surface"
          >
            <X size={22} aria-hidden />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="pt-4">
            <UrgencyBadge urgency={report.urgency} lang={lang} size="lg" />
          </div>

          {groups.map((g) => (
            <section key={g.panel} className="mt-5">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{g.panel}</h3>
              <div className="divide-y">
                {g.tests.map((test, i) => (
                  <ValueRow key={`${test.key}-${i}`} test={test} lang={lang} onAsk={onAsk} showReason />
                ))}
              </div>
            </section>
          ))}

          {report.urgencyReasons.length > 0 && (
            <section className="mt-5 rounded-card bg-surface p-4">
              <h3 className={`text-sm font-semibold ${urduFont(lang)}`}>{t("whyUrgency", lang)}</h3>
              <ul className="mt-2 space-y-1 text-sm" dir="auto">
                {report.urgencyReasons.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-muted">
                      •
                    </span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck size={14} aria-hidden />
            <span className={urduFont(lang)}>{t("checkedByRules", lang)}</span>
          </p>

          {onDelete && (
            <div className="mt-5 mb-2 flex flex-wrap items-center gap-2 border-t pt-4">
              {!confirming ? (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-input border px-4 text-sm font-medium hover:bg-surface"
                >
                  <Trash size={16} aria-hidden />
                  <span className={urduFont(lang)}>{t("deleteReport", lang)}</span>
                </button>
              ) : (
                <>
                  <span className={`text-sm font-medium ${urduFont(lang)}`}>{t("confirmDelete", lang)}</span>
                  <button
                    type="button"
                    onClick={() => onDelete(report.id)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-input bg-ink px-4 text-sm font-medium text-on-ink hover:bg-ink/85"
                  >
                    <Trash size={16} aria-hidden />
                    <span className={urduFont(lang)}>{t("yesDelete", lang)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="inline-flex min-h-11 items-center rounded-input border px-4 text-sm font-medium hover:bg-surface"
                  >
                    <span className={urduFont(lang)}>{t("cancel", lang)}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
