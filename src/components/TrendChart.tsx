"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CircleArrowDown, CircleArrowUp, CircleCheck, CircleMinus } from "lucide-react";
import { formatDate, formatMonthShort, t, urduFont } from "@/lib/i18n";
import { useResolvedTheme } from "@/lib/theme";
import type { Lang, TestStatus, Trend } from "@/lib/types";
import { TONE_CLASSES, type Tone } from "./reportUtils";

// Recharts needs concrete colours (SVG attributes), so pick the palette for the theme on screen.
const PALETTES = {
  light: { INK: "#18181B", MUTED: "#71717A", GRID: "#E4E4E7", OK: "#15803D", BAD: "#B91C1C", BG: "#FFFFFF" },
  dark: { INK: "#F4F4F5", MUTED: "#A1A1AA", GRID: "#2E2E33", OK: "#4ADE80", BAD: "#F87171", BG: "#18181B" },
} as const;

function statusTone(s: TestStatus): Tone {
  if (s === "normal") return "ok";
  if (s === "low" || s === "high") return "warn";
  return "muted";
}

function statusWord(s: TestStatus, lang: Lang): string {
  if (s === "low") return t("statusLow", lang);
  if (s === "high") return t("statusHigh", lang);
  if (s === "normal") return t("statusNormal", lang);
  return "—";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** One analyte over time against the latest report's normal band. */
export default function TrendChart({ trend, lang }: { trend: Trend; lang: Lang }) {
  const { INK, MUTED, GRID, OK, BAD, BG } = PALETTES[useResolvedTheme()];
  const latest = trend.points[trend.points.length - 1];
  const refLow = latest?.refLow ?? null;
  const refHigh = latest?.refHigh ?? null;

  const data = useMemo(
    () =>
      trend.points.map((p) => ({
        label: formatMonthShort(p.date),
        date: p.date,
        value: p.value,
        out: (p.refLow !== null && p.value < p.refLow) || (p.refHigh !== null && p.value > p.refHigh),
      })),
    [trend.points],
  );

  // "Nice" axis: bounds and the middle tick snap to a round step (5, 10, 0.5...) so the
  // axis never shows values like 168.9 or 57.1.
  const [yMin, yMax, yTicks] = useMemo(() => {
    const vals = trend.points.map((p) => p.value);
    if (refLow !== null) vals.push(refLow);
    if (refHigh !== null) vals.push(refHigh);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const range = hi - lo || Math.abs(hi) || 1;
    const step = Math.pow(10, Math.floor(Math.log10(range))) / 2;
    const clean = (n: number) => Number(n.toFixed(6));
    const niceLo = clean(Math.max(0, Math.floor((lo - range * 0.1) / step) * step));
    const niceHi = clean(Math.ceil((hi + range * 0.1) / step) * step);
    // Label the normal range's limits (the green band's edges); otherwise a round middle tick.
    // Skip a label that would sit on top of another one.
    const limits = [refLow, refHigh].filter((x): x is number => x !== null && x > niceLo && x < niceHi);
    const inner = limits.length ? limits : [clean(Math.round((niceLo + niceHi) / 2 / step) * step)];
    const gap = (niceHi - niceLo) * 0.12;
    const ticks = [niceLo];
    for (const x of [...inner, niceHi]) if (x - ticks[ticks.length - 1] >= gap || x === niceHi) ticks.push(x);
    if (ticks.length > 2 && niceHi - ticks[ticks.length - 2] < gap) ticks.splice(ticks.length - 2, 1);
    return [niceLo, niceHi, ticks];
  }, [trend.points, refLow, refHigh]);

  // The badge shows the latest status ("✓ Normal"); the direction is in the sentence below it.
  const StatusIcon =
    trend.latestStatus === "normal" ? CircleCheck : trend.latestStatus === "high" ? CircleArrowUp : trend.latestStatus === "low" ? CircleArrowDown : CircleMinus;
  const tone = statusTone(trend.latestStatus);
  const animate = !prefersReducedMotion();

  return (
    <figure className="rounded-card border bg-bg p-3">
      <figcaption>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{trend.name}</span>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
          >
            <StatusIcon size={13} aria-hidden />
            <span className={urduFont(lang)}>{statusWord(trend.latestStatus, lang)}</span>
          </span>
        </div>
        <p className="mt-1 text-sm leading-snug text-muted">{trend.summary}</p>
      </figcaption>
      {trend.unit && <p className="mt-2 -mb-1 text-[11px] text-muted">{trend.unit}</p>}
      {/* 2:1, so a wider sidebar gives a bigger chart (140–280px tall). */}
      <div className="mt-2 aspect-[2/1] max-h-[280px] min-h-[140px] w-full" role="img" aria-label={trend.summary}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
            {(refLow !== null || refHigh !== null) && (
              <ReferenceArea
                y1={refLow ?? yMin}
                y2={refHigh ?? yMax}
                fill={OK}
                fillOpacity={0.1}
                stroke={OK}
                strokeOpacity={0.25}
                ifOverflow="hidden"
              />
            )}
            <XAxis
              dataKey="label"
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              domain={[yMin, yMax]}
              ticks={yTicks}
              tickFormatter={(v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              cursor={{ stroke: MUTED, strokeDasharray: "3 3" }}
              contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 13, color: INK, background: BG }}
              labelFormatter={(_, payload) => {
                const d = payload?.[0]?.payload as { date?: string } | undefined;
                return d?.date ? formatDate(d.date, "en") : "";
              }}
              formatter={(value) => [`${value}${trend.unit ? ` ${trend.unit}` : ""}`, trend.name]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={INK}
              strokeWidth={2}
              isAnimationActive={animate}
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: { out?: boolean } }) => (
                <circle
                  key={`dot-${props.index}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill={props.payload?.out ? BAD : INK}
                  stroke={BG}
                  strokeWidth={2}
                />
              )}
              activeDot={{ r: 6, stroke: BG, strokeWidth: 2, fill: INK }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
