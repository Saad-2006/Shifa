"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, HeartPulse, Printer, ShieldCheck } from "lucide-react";
import UrgencyBadge from "@/components/UrgencyBadge";
import { DangerTag, StatusPill } from "@/components/ValueRow";
import { buildDoctorQuestions } from "@/components/doctorQuestions";
import { flaggedTests, personReports, rangeText } from "@/components/reportUtils";
import { formatDate, t, urduFont } from "@/lib/i18n";
import { apiFetch } from "@/lib/apiClient";
import { EMERGENCY_SENTINEL } from "@/lib/emergency";
import { numbersWithin, reportNumbersText } from "@/lib/numberCheck";
import { shifa, useHydrated, useShifa } from "@/lib/store";
import { buildTrends } from "@/lib/trends";
import type { LabReport, Trend } from "@/lib/types";

// The summary is for the doctor, so it is in English. The questions are for the family to ask,
// so they follow the preferred language, with the English line under each for the doctor.
const LANG = "en" as const;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function safeTrends(reports: LabReport[], personId: string): Trend[] {
  try {
    return buildTrends(reports, personId);
  } catch {
    return [];
  }
}

export default function SummaryView() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const state = useShifa();
  const personId = params.get("person");

  const person = useMemo(
    () => state.people.find((p) => p.id === personId) ?? state.people.find((p) => p.id === state.activePersonId) ?? null,
    [state.people, state.activePersonId, personId],
  );
  const reports = useMemo(() => personReports(state.reports, person?.id), [state.reports, person]);
  const trends = useMemo(() => (person ? safeTrends(state.reports, person.id) : []), [state.reports, person]);

  // "In simple words": one AI paragraph about the latest report, written once per report and
  // language, then saved. Code checks that every number in it comes from the reports.
  const newest = reports[0];
  const ask = state.lang;
  const saved = newest?.aiSummary?.[ask];
  const [summaryState, setSummaryState] = useState<"idle" | "writing" | "unavailable">("idle");
  const requested = useRef("");
  useEffect(() => {
    if (!hydrated || !person || !newest || saved) return;
    const key = `${newest.id}:${ask}`;
    if (requested.current === key) return;
    requested.current = key;
    setSummaryState("writing");
    const forRequest = reports.slice(0, 6);
    void (async () => {
      try {
        const res = await apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang: ask, person, reports: forRequest, messages: [], task: "summary", focusReportId: newest.id }),
        });
        // Only a real AI paragraph: the offline fallback isn't a summary.
        if (!res.ok || res.headers.get("x-shifa-offline") === "1") throw new Error("unavailable");
        const text = (await res.text()).split(EMERGENCY_SENTINEL).join("").trim();
        const maxCount = Math.min(20, Math.max(...forRequest.map((r) => r.tests.length)));
        if (!text || !numbersWithin(text, reportNumbersText(forRequest), maxCount)) throw new Error("unsafe");
        const fresh = shifa.getState().reports.find((r) => r.id === newest.id);
        if (fresh) shifa.addReport({ ...fresh, aiSummary: { ...fresh.aiSummary, [ask]: text } });
        setSummaryState("idle");
      } catch {
        setSummaryState("unavailable");
      }
    })();
  }, [hydrated, person, newest, saved, ask, reports]);

  if (!hydrated) return <p className="p-8 text-muted">Loading…</p>;

  if (!person) {
    return (
      <main className="mx-auto max-w-[800px] p-8">
        <h1 className="text-2xl font-semibold">Doctor Summary</h1>
        <p className="mt-2 text-muted">No family member found on this device. Add one and scan a report first.</p>
        <Link href="/" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-input border px-4 font-medium hover:bg-surface">
          <ArrowLeft size={18} aria-hidden /> Back to Shifa
        </Link>
      </main>
    );
  }

  const latest = newest;
  const flagged = latest ? flaggedTests(latest) : [];
  const questions = buildDoctorQuestions(person, latest, trends, ask);
  const questionsEn = ask === "en" ? [] : buildDoctorQuestions(person, latest, trends, "en");

  return (
    <main className="print-sheet mx-auto max-w-[820px] px-4 py-6 sm:px-8 sm:py-10">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-input px-2 text-muted hover:text-ink">
          <ArrowLeft size={18} aria-hidden /> <span className={urduFont(ask)}>{t("backToShifa", ask)}</span>
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center gap-2 rounded-input bg-ink px-5 font-semibold text-on-ink hover:bg-ink/90"
        >
          <Printer size={18} aria-hidden /> <span className={urduFont(ask)}>{t("printSummary", ask)}</span>
        </button>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
            <HeartPulse size={16} aria-hidden /> Shifa · Doctor Summary
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{person.name}</h1>
          <p className="text-muted">
            {[person.relation, person.age ? `${person.age} years` : "", person.sex === "F" ? "Female" : person.sex === "M" ? "Male" : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <p className="text-sm text-muted">Generated {formatDate(todayISO(), LANG)}</p>
      </header>

      {!latest ? (
        <p className="mt-6 text-muted">No reports saved for {person.name} yet.</p>
      ) : (
        <>
          <section className="print-avoid-break mt-6">
            <h2 className="text-lg font-semibold">Latest report</h2>
            <p className="text-sm text-muted">
              {latest.labName || "Lab report"} · {formatDate(latest.reportDate, LANG)} · {latest.tests.length} tests,{" "}
              {latest.flaggedCount} outside the normal range
            </p>
            <div className="mt-3">
              <UrgencyBadge urgency={latest.urgency} lang={LANG} size="lg" />
            </div>
            {latest.urgencyReasons.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 ps-5 text-sm">
                {latest.urgencyReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <h2 className="text-lg font-semibold">Values outside the normal range</h2>
            {flagged.length === 0 ? (
              <p className="mt-1 text-sm text-muted">All values in this report are within the printed reference ranges.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs tracking-wide text-muted uppercase">
                      <th className="py-2 pe-3 font-semibold">Test</th>
                      <th className="py-2 pe-3 font-semibold">Value</th>
                      <th className="py-2 pe-3 font-semibold">Unit</th>
                      <th className="py-2 pe-3 font-semibold">Normal range</th>
                      <th className="py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flagged.map((test, i) => (
                      <tr key={`${test.key}-${i}`} className="print-avoid-break border-b align-top">
                        <td className="py-2 pe-3 font-medium">{test.name}</td>
                        <td className="py-2 pe-3 font-semibold tabular-nums">{test.value}</td>
                        <td className="py-2 pe-3">{test.unit}</td>
                        <td className="py-2 pe-3">{rangeText(test) || "—"}</td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            <StatusPill test={test} lang={LANG} />
                            {test.critical && <DangerTag lang={LANG} />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {trends.length > 0 && (
        <section className="print-avoid-break mt-6">
          <h2 className="text-lg font-semibold">Trends across reports</h2>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
            {trends.map((tr) => (
              <li key={tr.key}>{tr.summary}</li>
            ))}
          </ul>
        </section>
      )}

      {reports.length > 1 && (
        <section className="print-avoid-break mt-6">
          <h2 className="text-lg font-semibold">Reports on file</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{formatDate(r.reportDate, LANG)}</span>
                <span className="text-muted">{r.labName || "Lab report"}</span>
                <UrgencyBadge urgency={r.urgency} lang={LANG} />
                <span className="text-muted">{r.flaggedCount} flagged</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {latest && (saved || summaryState !== "idle") && (
        <section className="print-avoid-break mt-6">
          <h2 className="text-lg font-semibold">
            <span dir="auto" className={urduFont(ask)}>
              {t("aiSummaryTitle", ask)}
            </span>
          </h2>
          {saved ? (
            <>
              <p dir="auto" className={`mt-1.5 ${ask === "ur" ? "urdu text-base" : "text-sm leading-relaxed"}`}>
                {saved}
              </p>
              <p className={`mt-1 text-xs text-muted ${urduFont(ask)}`}>{t("aiSummaryNote", ask)}</p>
            </>
          ) : (
            <p className={`no-print mt-1 text-sm text-muted ${urduFont(ask)}`}>
              {summaryState === "writing" ? t("aiSummaryWriting", ask) : t("aiSummaryUnavailable", ask)}
            </p>
          )}
        </section>
      )}

      {questions.length > 0 && (
        <section className="print-avoid-break mt-6">
          <h2 className="text-lg font-semibold">
            <span dir="auto" className={urduFont(ask)}>
              {t("dqTitle", ask)}
            </span>
            {ask !== "en" && <span className="text-base font-normal text-muted"> · {t("dqTitle", "en")}</span>}
          </h2>
          <ol className="mt-2 list-decimal space-y-2 ps-5 text-sm">
            {questions.map((q, i) => (
              <li key={i}>
                <p dir="auto" className={ask === "ur" ? "urdu text-base" : ""}>
                  {q}
                </p>
                {questionsEn[i] && <p className="text-xs text-muted">{questionsEn[i]}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="mt-8 border-t pt-3 text-xs leading-relaxed text-muted">
        <p className="flex items-start gap-1.5">
          <ShieldCheck size={14} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Values were read from the report by AI, then each value was checked against the report&apos;s own reference
            range and a danger-value list by Shifa&apos;s fixed rules (no AI). Shifa explains reports; it does not diagnose
            or replace a doctor. Please confirm all values against the original lab report.
          </span>
        </p>
      </footer>
    </main>
  );
}
