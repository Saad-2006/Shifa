// Trends: the same test across a person's reports. Pure code, no AI.
import type { CheckedTest, LabReport, Trend, TrendPoint } from "@/lib/types";
import { normaliseUnit } from "@/lib/labRules";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-12" -> "Mar 2026" (fixed English names, same on server and client). */
function monthYear(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : ymd;
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(Math.abs(n) < 1 ? 3 : 2)));
}

/** The value as printed when it is a plain number (keeps "4.0"), else a tidy number. */
function shown(t: CheckedTest, v: number): string {
  const s = (t.value || "").trim();
  const printed = /^[-+]?\d[\d,]*(?:\.\d+)?$/.test(s) ? s : fmt(v);
  return t.unit && t.unit.trim() ? `${printed} ${t.unit.trim()}` : printed;
}

interface Entry {
  point: TrendPoint;
  test: CheckedTest;
}

export function buildTrends(reports: LabReport[], personId?: string): Trend[] {
  const list = (reports || [])
    .filter((r) => !personId || r.personId === personId)
    .slice()
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.createdAt.localeCompare(b.createdAt));

  // key -> one entry per report, oldest first
  const groups = new Map<string, Entry[]>();
  for (const r of list) {
    const seen = new Set<string>();
    for (const t of r.tests || []) {
      const v = t.numericValue;
      if (typeof v !== "number" || !Number.isFinite(v) || !t.key || seen.has(t.key)) continue;
      seen.add(t.key);
      const arr = groups.get(t.key) ?? [];
      arr.push({
        point: { date: r.reportDate, value: v, refLow: t.refLow, refHigh: t.refHigh, reportId: r.id },
        test: t,
      });
      groups.set(t.key, arr);
    }
  }

  const out: { trend: Trend; change: number }[] = [];
  for (const [key, all] of groups) {
    // Only compare like with like: drop points printed in a different unit from the latest one.
    const latestUnit = normaliseUnit(all[all.length - 1].test.unit);
    const entries = all.filter((e) => {
      const u = normaliseUnit(e.test.unit);
      return !u || !latestUnit || u === latestUnit;
    });
    if (entries.length < 2) continue;

    const first = entries[0];
    const last = entries[entries.length - 1];
    const a = first.point.value;
    const b = last.point.value;
    const change = a === 0 ? (b === 0 ? 0 : Math.sign(b) * 1e9) : (b - a) / Math.abs(a);
    const direction: Trend["direction"] = change > 0.03 ? "up" : change < -0.03 ? "down" : "flat";

    const name = last.test.name.trim() || key;
    const from = `${shown(first.test, a)} (${monthYear(first.point.date)})`;
    const to = `${shown(last.test, b)} (${monthYear(last.point.date)})`;
    const summary =
      direction === "up"
        ? `${name} rose from ${from} to ${to}`
        : direction === "down"
          ? `${name} fell from ${from} to ${to}`
          : `${name} stayed about the same at ${shown(last.test, b)} (${monthYear(first.point.date)} to ${monthYear(last.point.date)})`;

    out.push({
      trend: {
        key,
        name,
        unit: last.test.unit,
        points: entries.map((e) => e.point),
        direction,
        summary,
        latestStatus: last.test.status,
      },
      change: Math.abs(change),
    });
  }

  const abnormal = (t: Trend) => (t.latestStatus === "low" || t.latestStatus === "high" ? 1 : 0);
  return out
    .sort((x, y) => abnormal(y.trend) - abnormal(x.trend) || y.change - x.change || x.trend.key.localeCompare(y.trend.key))
    .map((x) => x.trend);
}

/**
 * How urgent a trend is right now, from its latest value's check by code:
 * 3 danger level, 2 well outside the range, 1 slightly outside, 0 normal or not checked.
 */
export function trendUrgency(trend: Trend, reports: LabReport[]): number {
  const last = trend.points[trend.points.length - 1];
  const test = reports.find((r) => r.id === last?.reportId)?.tests.find((x) => x.key === trend.key);
  if (!test) return trend.latestStatus === "low" || trend.latestStatus === "high" ? 1 : 0;
  if (test.critical || test.severity === "critical") return 3;
  if (test.status !== "low" && test.status !== "high") return 0;
  return test.severity === "marked" ? 2 : 1;
}

const latestDate = (t: Trend) => t.points[t.points.length - 1]?.date ?? "";

/** Most urgent first; then the most recently updated; then buildTrends' own order. */
export function sortTrendsByUrgency(trends: Trend[], reports: LabReport[]): Trend[] {
  return trends
    .map((trend, i) => ({ trend, i, u: trendUrgency(trend, reports) }))
    .sort((a, b) => b.u - a.u || latestDate(b.trend).localeCompare(latestDate(a.trend)) || a.i - b.i)
    .map((x) => x.trend);
}

/**
 * The one chart the laptop sidebar shows: the most urgent trend if any value is out of range
 * (danger first), else the most recently updated one. The rest are on the dashboard.
 */
export function pickSidebarTrend(trends: Trend[], reports: LabReport[]): { trend: Trend; reason: "urgent" | "latest" } | null {
  if (!trends.length) return null;
  const top = sortTrendsByUrgency(trends, reports)[0];
  return { trend: top, reason: trendUrgency(top, reports) > 0 ? "urgent" : "latest" };
}
