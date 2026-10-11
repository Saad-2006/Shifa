"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, ShieldCheck, Stethoscope } from "lucide-react";
import { Avatar } from "@/components/PersonMenu";
import TrendChart from "@/components/TrendChart";
import UrgencyBadge from "@/components/UrgencyBadge";
import ValueRow from "@/components/ValueRow";
import { flaggedTests, personReports } from "@/components/reportUtils";
import { formatDate, t, urduFont } from "@/lib/i18n";
import { shifa, useHydrated, useShifa } from "@/lib/store";
import { buildTrends, sortTrendsByUrgency } from "@/lib/trends";
import type { LabReport, Trend } from "@/lib/types";

function safeTrends(reports: LabReport[], personId: string): Trend[] {
  try {
    return buildTrends(reports, personId);
  } catch {
    return [];
  }
}

/** Trends & reports for one family member: every chart (most urgent first) and every report. */
export default function DashboardView() {
  const params = useSearchParams();
  const router = useRouter();
  const hydrated = useHydrated();
  const state = useShifa();
  const lang = state.lang;
  const ur = urduFont(lang);
  const wanted = params.get("person");

  const person = useMemo(
    () =>
      state.people.find((p) => p.id === wanted) ??
      state.people.find((p) => p.id === state.activePersonId) ??
      state.people[0] ??
      null,
    [state.people, state.activePersonId, wanted],
  );
  const reports = useMemo(() => personReports(state.reports, person?.id), [state.reports, person]);
  const trends = useMemo(
    () => (person ? sortTrendsByUrgency(safeTrends(state.reports, person.id), state.reports) : []),
    [state.reports, person],
  );

  useEffect(() => {
    document.documentElement.lang = lang === "ur" ? "ur" : "en";
  }, [lang]);

  if (!hydrated) return <p className="p-8 text-muted">…</p>;

  const latest = reports[0];
  const flagged = latest ? flaggedTests(latest) : [];
  const select = (id: string) => {
    shifa.setActivePerson(id);
    router.replace(`/dashboard?person=${encodeURIComponent(id)}`);
  };
  const card = "rounded-card border bg-bg p-4";
  const h2 = `text-base font-semibold ${ur}`;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[1100px] px-4 pt-4 pb-10 sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="-ms-2 inline-flex min-h-11 items-center gap-2 rounded-input px-2 text-muted hover:text-ink">
          <ArrowLeft size={18} aria-hidden className="rtl:rotate-180" />
          <span className={ur}>{t("backToChat", lang)}</span>
        </Link>
        {person && reports.length > 0 && (
          <Link
            href={`/summary?person=${encodeURIComponent(person.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-input border px-3 text-sm font-medium hover:bg-surface"
          >
            <Stethoscope size={17} aria-hidden />
            <span className={ur}>{t("doctorSummary", lang)}</span>
          </Link>
        )}
      </div>

      {!person ? (
        <p className={`mt-6 text-muted ${ur}`}>{t("dashNoFamily", lang)}</p>
      ) : (
        <>
          <h1 dir="auto" className={`mt-3 text-2xl font-semibold ${ur}`}>
            {t("dashTitle", lang, { name: person.name })}
          </h1>

          {/* Family switcher */}
          {state.people.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("family", lang)}>
              {state.people.map((p) => {
                const on = p.id === person.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => select(p.id)}
                    aria-pressed={on}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border py-1 ps-1 pe-4 transition-colors ${
                      on ? "border-ink bg-ink text-on-ink" : "bg-bg hover:bg-surface"
                    }`}
                  >
                    <Avatar person={p} active={!on} size={30} />
                    <span className="font-medium">{p.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!latest ? (
            <p className={`mt-6 text-muted ${ur}`}>{t("dashEmpty", lang, { name: person.name })}</p>
          ) : (
            <>
              {/* At a glance: the latest report */}
              <section className={`${card} mt-5`} aria-label={t("dashLatest", lang)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm text-muted ${ur}`}>{t("dashLatest", lang)}</p>
                    <p className="mt-0.5 font-semibold">
                      <bdi>{formatDate(latest.reportDate, lang)}</bdi> · {latest.labName || t("labReport", lang)}
                    </p>
                    <p className={`mt-1 text-sm ${ur}`}>
                      {latest.flaggedCount > 0
                        ? t("needCare", lang, { n: latest.flaggedCount, total: latest.tests.length })
                        : t("allInRange", lang, { total: latest.tests.length })}
                    </p>
                  </div>
                  <UrgencyBadge urgency={latest.urgency} lang={lang} size="lg" />
                </div>
              </section>

              {/* Every chart, most urgent first */}
              <section className="mt-6">
                <h2 className={h2}>{t("dashTrends", lang)}</h2>
                {trends.length === 0 ? (
                  <p className={`mt-1 text-sm text-muted ${ur}`}>{t("noTrends", lang)}</p>
                ) : (
                  <>
                    <p className={`mt-0.5 text-sm text-muted ${ur}`}>{t("dashTrendsHint", lang)}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {trends.map((tr) => (
                        <TrendChart key={tr.key} trend={tr} lang={lang} />
                      ))}
                    </div>
                  </>
                )}
              </section>

              {/* What needs attention now */}
              {flagged.length > 0 && (
                <section className="mt-6">
                  <h2 className={h2}>{t("dashAttention", lang)}</h2>
                  <div className={`${card} mt-3 divide-y py-1`}>
                    {flagged.map((test, i) => (
                      <ValueRow key={`${test.key}-${i}`} test={test} lang={lang} showReason />
                    ))}
                  </div>
                </section>
              )}

              {/* All reports: open one in the chat */}
              <section className="mt-6">
                <h2 className={h2}>{t("dashAllReports", lang)}</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {reports.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/?report=${encodeURIComponent(r.id)}`}
                        aria-label={`${t("dashOpenReport", lang)}: ${r.labName || t("labReport", lang)}, ${formatDate(r.reportDate, lang)}`}
                        className="flex min-h-14 items-center gap-3 rounded-card border bg-bg p-3 transition-colors hover:border-ink/25"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <bdi className="font-medium whitespace-nowrap">{formatDate(r.reportDate, lang)}</bdi>
                            <UrgencyBadge urgency={r.urgency} lang={lang} />
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2 text-sm text-muted">
                            <span className="truncate">{r.labName || t("labReport", lang)}</span>
                            <span className={`shrink-0 ${ur}`}>
                              {r.flaggedCount > 0 ? t("flaggedN", lang, { n: r.flaggedCount }) : t("allNormalShort", lang)}
                            </span>
                          </span>
                        </span>
                        <ChevronRight size={18} aria-hidden className="shrink-0 text-muted rtl:rotate-180" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>

              <p className={`mt-8 flex items-center gap-1.5 text-xs text-muted ${ur}`}>
                <ShieldCheck size={14} aria-hidden className="shrink-0" />
                {t("checkedByRules", lang)}
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}
