// "Questions to ask the doctor" for the Doctor Summary, built by code from the flagged values and
// trends (no AI), in any of the three languages. The family asks them, so they follow the
// preferred language; the summary prints the English line too, for the doctor.
import { formatDate, t } from "@/lib/i18n";
import type { Lang, LabReport, Person, Trend } from "@/lib/types";
import { flaggedTests, formatValue, rangeText } from "./reportUtils";

const isSelf = (p: Person) => /^(self|me)$/i.test(p.relation.trim()) || /^me$/i.test(p.name.trim());

export function buildDoctorQuestions(person: Person, latest: LabReport | undefined, trends: Trend[], lang: Lang): string[] {
  if (!latest) return [];
  const who = isSelf(person) ? t("dqWhoSelf", lang) : t("dqWhoOther", lang, { name: person.name });
  const qs: string[] = [];
  const flagged = flaggedTests(latest);
  for (const test of flagged.slice(0, 6)) {
    const range = rangeText(test);
    const vars = { test: test.name, value: formatValue(test), normal: range ? t("dqNormal", lang, { range }) : "", who };
    qs.push(t(test.critical ? "dqDanger" : "dqFlagged", lang, vars));
  }
  for (const tr of trends.filter((x) => x.direction !== "flat" && x.latestStatus !== "normal").slice(0, 2)) {
    const first = tr.points[0];
    const last = tr.points[tr.points.length - 1];
    const v = (n: number) => `${n}${tr.unit ? ` ${tr.unit}` : ""}`;
    qs.push(
      t("dqTrend", lang, {
        test: tr.name,
        from: v(first.value),
        fromDate: formatDate(first.date, lang),
        to: v(last.value),
        toDate: formatDate(last.date, lang),
      }),
    );
  }
  if (flagged.length > 0) {
    qs.push(t("dqRepeat", lang));
    qs.push(t("dqLifestyle", lang));
  } else {
    qs.push(t("dqAllNormal", lang));
  }
  return qs;
}
