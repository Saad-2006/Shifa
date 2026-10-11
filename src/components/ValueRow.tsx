"use client";

import { useEffect, useState } from "react";
import { MessageCircleQuestionMark, TriangleAlert } from "lucide-react";
import { t, urduFont } from "@/lib/i18n";
import type { CheckedTest, Lang } from "@/lib/types";
import { TONE_CLASSES, TONE_DOT, barGeometry, formatValue, rangeText, statusMeta, type Tone } from "./reportUtils";

/** Where the value sits against the normal range (see barGeometry: works for "UPTO 45" too). */
export function RangeBar({ test, tone }: { test: CheckedTest; tone: Tone }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const g = barGeometry(test);
  if (!g) return null;
  const [from, to] = g.band;
  return (
    <div className="relative mt-2.5 h-2 rounded-full bg-border" aria-hidden>
      <div className="absolute inset-y-0 rounded-[2px] bg-ok/25" style={{ left: `${from}%`, width: `${to - from}%` }} />
      <div
        className={`range-marker absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black/10 ${TONE_DOT[tone]}`}
        style={{ left: `${settled ? g.marker : (from + to) / 2}%` }}
      />
    </div>
  );
}

export function StatusPill({ test, lang }: { test: CheckedTest; lang: Lang }) {
  const meta = statusMeta(test, lang);
  const { Icon } = meta;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm font-medium whitespace-nowrap ${TONE_CLASSES[meta.tone]}`}
    >
      <Icon size={15} aria-hidden strokeWidth={2.25} />
      <span className={urduFont(lang)} aria-hidden={meta.label === "—"}>
        {meta.label}
      </span>
      {meta.label === "—" && <span className="sr-only">{meta.srLabel}</span>}
    </span>
  );
}

export function DangerTag({ lang }: { lang: Lang }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emergency bg-emergency px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-white">
      <TriangleAlert size={13} aria-hidden strokeWidth={2.25} />
      <span className={urduFont(lang)}>{t("danger", lang)}</span>
    </span>
  );
}

export default function ValueRow({
  test,
  lang,
  onAsk,
  showReason = false,
}: {
  test: CheckedTest;
  lang: Lang;
  onAsk?: (question: string) => void;
  showReason?: boolean;
}) {
  const meta = statusMeta(test, lang);
  const range = rangeText(test);
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="leading-snug font-medium break-words">{test.name}</div>
          <div className="mt-0.5 text-sm text-muted">
            <span className="font-semibold text-ink tabular-nums">{test.value}</span>
            {test.unit ? <span> {test.unit}</span> : null}
            <span aria-hidden> · </span>
            <span className={urduFont(lang)}>{range ? t("normalRange", lang, { range }) : t("noRange", lang)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex flex-col items-end gap-1">
            <StatusPill test={test} lang={lang} />
            {test.critical && <DangerTag lang={lang} />}
          </div>
          {onAsk && (
            <button
              type="button"
              onClick={() => onAsk(t("askValue", lang, { name: test.name, value: formatValue(test) }))}
              aria-label={t("askAbout", lang, { name: test.name })}
              title={t("askAbout", lang, { name: test.name })}
              className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <MessageCircleQuestionMark size={20} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {showReason && test.criticalReason && <p className="mt-1 text-sm text-bad">{test.criticalReason}</p>}
      <RangeBar test={test} tone={meta.tone} />
    </div>
  );
}
