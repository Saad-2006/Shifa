"use client";

import { useMemo, useState } from "react";
import { ExternalLink, RotateCcw, Stethoscope, Trash, UserPlus, Users } from "lucide-react";
import { formatDate, t, urduFont } from "@/lib/i18n";
import { buildTrends } from "@/lib/trends";
import type { LabReport, Lang, Person, Trend } from "@/lib/types";
import AddPersonForm, { type NewPerson } from "./AddPersonForm";
import BackupRestore from "./BackupRestore";
import { Avatar } from "./PersonMenu";
import TrendChart from "./TrendChart";
import UrgencyBadge from "./UrgencyBadge";
import { personReports } from "./reportUtils";

function SectionTitle({ children, lang }: { children: React.ReactNode; lang: Lang }) {
  return <h2 className={`mb-2 px-1 text-xs font-semibold tracking-wide text-muted uppercase ${urduFont(lang)}`}>{children}</h2>;
}

function safeTrends(reports: LabReport[], personId: string | null): Trend[] {
  if (!personId) return [];
  try {
    const rank = (tr: Trend) => (tr.latestStatus === "low" || tr.latestStatus === "high" ? 0 : 1);
    return [...buildTrends(reports, personId)].sort((a, b) => rank(a) - rank(b)).slice(0, 4);
  } catch (e) {
    console.error("[shifa] buildTrends failed", e);
    return [];
  }
}

/** Family, reports, trends and the Doctor Summary: the "dashboard" beside the chat. */
export default function Sidebar({
  lang,
  people,
  activeId,
  reports,
  hasMessages,
  busy,
  onSelectPerson,
  onAddPerson,
  onOpenReport,
  onLoadDemo,
  onClearChat,
  onReset,
}: {
  lang: Lang;
  people: Person[];
  activeId: string | null;
  reports: LabReport[];
  hasMessages: boolean;
  busy: boolean;
  onSelectPerson: (id: string) => void;
  onAddPerson: (p: NewPerson) => void;
  onOpenReport: (id: string) => void;
  onLoadDemo: () => void;
  onClearChat: () => void;
  onReset: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const mine = useMemo(() => personReports(reports, activeId), [reports, activeId]);
  const trends = useMemo(() => safeTrends(reports, activeId), [reports, activeId]);
  const active = people.find((p) => p.id === activeId) ?? null;

  const rowBtn = "flex min-h-11 w-full items-center gap-2.5 rounded-input px-2 text-start transition-colors hover:bg-bg";

  return (
    <div className="flex flex-col gap-7 px-3 py-4">
      {/* Family */}
      <section>
        <SectionTitle lang={lang}>
          <span className="inline-flex items-center gap-1.5">
            <Users size={14} aria-hidden /> {t("family", lang)}
          </span>
        </SectionTitle>
        <ul className="space-y-0.5">
          {people.map((p) => {
            const isActive = p.id === activeId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelectPerson(p.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={`${rowBtn} ${isActive ? "border bg-bg font-semibold" : ""}`}
                >
                  <Avatar person={p} active={isActive} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.name}</span>
                    <span className="block truncate text-xs font-normal text-muted">
                      {p.relation}
                      {p.age ? ` · ${t("years", lang, { n: p.age })}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {adding ? (
          <div className="mt-2 rounded-card border bg-bg p-3">
            <AddPersonForm
              lang={lang}
              onSubmit={(p) => {
                onAddPerson(p);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`${rowBtn} mt-1 text-muted hover:text-ink`}>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed">
              <UserPlus size={15} aria-hidden />
            </span>
            <span className={`text-sm font-medium ${urduFont(lang)}`}>{t("addFamily", lang)}</span>
          </button>
        )}
      </section>

      {/* Reports */}
      {active && (
        <section>
          <SectionTitle lang={lang}>
            {t("reports", lang)} · {active.name}
          </SectionTitle>
          {mine.length === 0 ? (
            <p className={`px-1 text-sm text-muted ${urduFont(lang)}`}>{t("noReports", lang)}</p>
          ) : (
            <ul className="space-y-2">
              {mine.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onOpenReport(r.id)}
                    className="w-full rounded-card border bg-bg p-3 text-start transition-colors hover:border-ink/25"
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium whitespace-nowrap">{formatDate(r.reportDate, lang)}</span>
                      <UrgencyBadge urgency={r.urgency} lang={lang} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-sm text-muted">
                      <span className="truncate">{r.labName || t("labReport", lang)}</span>
                      <span className={`shrink-0 ${urduFont(lang)}`}>
                        {r.flaggedCount > 0 ? t("flaggedN", lang, { n: r.flaggedCount }) : t("allNormalShort", lang)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Trends */}
      {active && mine.length > 0 && (
        <section>
          <SectionTitle lang={lang}>{t("trends", lang)}</SectionTitle>
          {trends.length === 0 ? (
            <p className={`px-1 text-sm text-muted ${urduFont(lang)}`}>{t("noTrends", lang)}</p>
          ) : (
            <div className="space-y-2">
              {trends.map((tr) => (
                <TrendChart key={tr.key} trend={tr} lang={lang} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Doctor Summary */}
      {active && (
        <section>
          <a
            href={`/summary?person=${encodeURIComponent(active.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-3 rounded-card border bg-bg p-3 transition-colors hover:border-ink/25"
          >
            <Stethoscope size={22} aria-hidden className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className={`block font-medium ${urduFont(lang)}`}>{t("doctorSummary", lang)}</span>
              <span className={`block text-xs text-muted ${urduFont(lang)}`}>{t("doctorSummaryHint", lang)}</span>
            </span>
            <ExternalLink size={16} aria-hidden className="shrink-0 text-muted" />
          </a>
        </section>
      )}

      {/* Backup / Restore: reports live only on this phone */}
      <section className="border-t pt-4">
        <SectionTitle lang={lang}>{t("yourData", lang)}</SectionTitle>
        <BackupRestore lang={lang} busy={busy} hasData={people.length > 0 || reports.length > 0} />
      </section>

      {/* Demo & reset */}
      <section className="space-y-1 border-t pt-4">
        <button type="button" onClick={onLoadDemo} disabled={busy} className={`${rowBtn} text-sm disabled:opacity-50`}>
          <Users size={18} aria-hidden className="mx-1" />
          <span className={urduFont(lang)}>{t("loadDemo", lang)}</span>
        </button>
        {hasMessages && (
          <button type="button" onClick={onClearChat} disabled={busy} className={`${rowBtn} text-sm disabled:opacity-50`}>
            <Trash size={18} aria-hidden className="mx-1" />
            <span className={urduFont(lang)}>{t("clearChat", lang)}</span>
          </button>
        )}
        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            disabled={busy}
            className={`${rowBtn} text-sm text-muted disabled:opacity-50`}
          >
            <RotateCcw size={18} aria-hidden className="mx-1" />
            <span className={urduFont(lang)}>{t("resetAll", lang)}</span>
          </button>
        ) : (
          <div className="rounded-card border bg-bg p-3" role="alertdialog" aria-label={t("resetAll", lang)}>
            <p className={`text-sm font-medium ${urduFont(lang)}`}>{t("resetConfirm", lang)}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(false);
                  onReset();
                }}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-input bg-ink px-3 text-sm font-medium text-white hover:bg-black"
              >
                <span className={urduFont(lang)}>{t("yesReset", lang)}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-input border px-3 text-sm font-medium hover:bg-surface"
              >
                <span className={urduFont(lang)}>{t("cancel", lang)}</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
