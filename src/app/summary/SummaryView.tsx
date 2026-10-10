"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, HeartPulse, Printer, ShieldCheck } from "lucide-react";
import UrgencyBadge from "@/components/UrgencyBadge";
import { DangerTag, StatusPill } from "@/components/ValueRow";
import { flaggedTests, formatValue, personReports, rangeText } from "@/components/reportUtils";
import { formatDate } from "@/lib/i18n";
import { useHydrated, useShifa } from "@/lib/store";
import { buildTrends } from "@/lib/trends";
import type { LabReport, Person, Trend } from "@/lib/types";

// The summary is for the doctor, so it is always in English.
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

/** Questions built by code from the flagged values and trends (no AI). */
function buildQuestions(person: Person, latest: LabReport | undefined, trends: Trend[]): string[] {
  const self = /^(self|me)$/i.test(person.relation.trim()) || /^me$/i.test(person.name.trim());
  const whose = self ? "My" : `${person.name}'s`;
  const forWhom = self ? "me" : person.name;
  const qs: string[] = [];
  if (!latest) return qs;
  const flagged = flaggedTests(latest);
  for (const test of flagged.slice(0, 6)) {
    const range = rangeText(test);
    const normal = range ? ` (normal ${range})` : "";
    if (test.critical) {
      qs.push(
        `${whose} ${test.name} is ${formatValue(test)}${normal}, which Shifa marked as a danger level: does this need treatment today?`,
      );
    } else {
      qs.push(`${whose} ${test.name} is ${formatValue(test)}${normal}: what does this mean for ${forWhom}, and what should we do next?`);
    }
  }
  for (const tr of trends.filter((x) => x.direction !== "flat" && x.latestStatus !== "normal").slice(0, 2)) {
    qs.push(`${tr.summary.replace(/[.\s]+$/, "")}. Is this change a concern, and how should we track it?`);
  }
  if (flagged.length > 0) {
    qs.push("Which of these tests should be repeated, and when?");
    qs.push(`Could any current medicines, diet or lifestyle explain these results for ${forWhom}?`);
  } else {
    qs.push(`All values were in the normal range. When should ${forWhom === "me" ? "I" : forWhom} repeat these tests?`);
  }
  return qs;
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

  const latest = reports[0];
  const flagged = latest ? flaggedTests(latest) : [];
  const questions = buildQuestions(person, latest, trends);

  return (
    <main className="print-sheet mx-auto max-w-[820px] px-4 py-6 sm:px-8 sm:py-10">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-input px-2 text-muted hover:text-ink">
          <ArrowLeft size={18} aria-hidden /> Back to Shifa
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center gap-2 rounded-input bg-accent px-5 font-semibold text-white hover:bg-accent-hover"
        >
          <Printer size={18} aria-hidden /> Print / Save as PDF
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

      {questions.length > 0 && (
        <section className="print-avoid-break mt-6">
          <h2 className="text-lg font-semibold">Questions to ask the doctor</h2>
          <ol className="mt-2 list-decimal space-y-1.5 ps-5 text-sm">
            {questions.map((q, i) => (
              <li key={i}>{q}</li>
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
