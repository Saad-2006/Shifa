// Code checks on numbers in AI-written text (translations, the Doctor Summary paragraph).
// Pure and tiny, so the browser can use it without pulling in the AI prompts.

/** Urdu / Arabic-Indic digits to 0-9 ("۸٫۳" -> "8.3"), so both scripts compare equally. */
export function normaliseDigits(text: string): string {
  return (text || "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

/** Distinct numbers in a text, sorted: "Hb 10.6 (12.0 - 15.5), 1,50,000" -> ["10.6","12.0","150000","15.5"]. */
export function numbersIn(text: string): string[] {
  const found = normaliseDigits(text).match(/\d+(?:[.,]\d+)*/g) ?? [];
  return [...new Set(found.map((n) => n.replace(/,/g, "")))].sort();
}

/**
 * True when every number in an AI-written text comes from the source data (checked values,
 * ranges, dates), so the AI can't invent a measurement. "08" and "8", "12.0" and "12" are equal;
 * small whole numbers up to `maxCount` are allowed as counts ("2 values are high").
 */
export function numbersWithin(text: string, source: string, maxCount = 0): boolean {
  const norm = (n: string) => String(Number(n));
  const allowed = new Set(numbersIn(source).map(norm));
  return numbersIn(text).every((n) => {
    const v = norm(n);
    return allowed.has(v) || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= maxCount);
  });
}

/** The numbers a Doctor Summary paragraph may use: every test name ("Vitamin D (25-OH)"), value, range and date in these reports. */
export function reportNumbersText(
  reports: {
    reportDate: string;
    flaggedCount: number;
    tests: { name: string; value: string; refRangeText: string; refLow: number | null; refHigh: number | null }[];
  }[],
): string {
  return reports
    .map((r) =>
      [r.reportDate, r.flaggedCount, r.tests.length, ...r.tests.map((x) => `${x.name} ${x.value} ${x.refRangeText} ${x.refLow ?? ""} ${x.refHigh ?? ""}`)].join(" "),
    )
    .join(" ");
}

/** True when the translation has exactly the same numbers as the original (none lost, changed or added). */
export function numbersPreserved(original: string, translated: string): boolean {
  const a = numbersIn(original);
  const b = numbersIn(translated);
  return a.length === b.length && a.every((n, i) => n === b[i]);
}
