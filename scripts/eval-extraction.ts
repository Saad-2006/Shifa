// Extraction accuracy test: compares /api/extract against hand-labelled real reports.
//
//   npx tsx scripts/eval-extraction.ts                 # BASE_URL defaults to http://localhost:3000
//   BASE_URL=https://shifa.vercel.app SHIFA_ACCESS_CODE=xxxx npx tsx scripts/eval-extraction.ts
//
// For every eval/reports/<name>.{jpg,jpeg,png,webp,pdf} that has eval/labels/<name>.json
// (format: eval/labels/_template.json) it POSTs the file to /api/extract, matches labelled
// tests to extracted ones and writes eval/results/results.json + eval/results/summary.md (with a per-lab table).
// --draft: for reports without labels, write the AI's reading as a draft label to check by hand.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { canonicalKey, checkTest } from "@/lib/labRules";
import type { ExtractedTest, ExtractResponse, TestStatus } from "@/lib/types";

const ROOT = process.cwd();
const REPORTS_DIR = join(ROOT, "eval", "reports");
const LABELS_DIR = join(ROOT, "eval", "labels");
const RESULTS_DIR = join(ROOT, "eval", "results");
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ACCESS = process.env.SHIFA_ACCESS_CODE || "";
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};
const TOL = 1e-6;

interface LabelTest {
  name: string;
  value: string | number;
  unit?: string;
  refLow?: number | null;
  refHigh?: number | null;
  flag?: string; // "H" | "L" | "N" | "high" | "low" | "normal"
}

interface TestResult {
  label: LabelTest;
  matchedName: string | null;
  matchedBy: "key" | "name" | null;
  extractedValue: string | null;
  valueOk: boolean;
  rangeChecked: boolean;
  rangeOk: boolean;
  flagChecked: boolean;
  flagOk: boolean;
  codeStatus: TestStatus | null;
  error?: string;
}

interface Counts {
  labelled: number;
  found: number;
  valueOk: number;
  rangeTotal: number;
  rangeOk: number;
  flagTotal: number;
  flagOk: number;
  extra: number;
}

interface ReportResult extends Counts {
  file: string;
  ms: number;
  model: string | null;
  error?: string;
  notes?: string;
  tests: TestResult[];
}

// ---------------------------------------------------------------- helpers

const normName = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const normText = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function safeKey(name: string): string {
  try {
    return canonicalKey(name) || "";
  } catch {
    return "";
  }
}

function parseNum(x: unknown): number | null {
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x !== "string") return null;
  const t = x.replace(/[,\s]/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function sameNum(a: number | null | undefined, b: number | null | undefined): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null || y === null) return x === y;
  return Math.abs(x - y) <= TOL;
}

function valueMatches(label: LabelTest, t: ExtractedTest): boolean {
  const ln = parseNum(label.value);
  const en = t.numericValue ?? parseNum(t.value);
  if (ln !== null && en !== null) return Math.abs(ln - en) <= TOL;
  return normText(String(label.value)) === normText(t.value);
}

function normFlag(f: string | undefined): TestStatus | null {
  if (f === undefined || f === null) return null;
  const s = String(f).trim().toLowerCase();
  if (!s) return null;
  if (["h", "high", "hi", "↑"].includes(s)) return "high";
  if (["l", "low", "lo", "↓"].includes(s)) return "low";
  if (["n", "normal", "-", "ok"].includes(s)) return "normal";
  return null;
}

function pct(a: number, b: number): string {
  return b ? `${((100 * a) / b).toFixed(1)}%` : "n/a";
}

function emptyCounts(): Counts {
  return { labelled: 0, found: 0, valueOk: 0, rangeTotal: 0, rangeOk: 0, flagTotal: 0, flagOk: 0, extra: 0 };
}

function addCounts(into: Counts, c: Counts): void {
  for (const k of Object.keys(into) as (keyof Counts)[]) into[k] += c[k];
}

// ---------------------------------------------------------------- matching

function evaluate(labels: LabelTest[], extracted: ExtractedTest[]): { tests: TestResult[]; counts: Counts } {
  const used = new Set<number>();
  const exKeys = extracted.map((t) => safeKey(t.name));
  const exNames = extracted.map((t) => normName(t.name));
  const counts = emptyCounts();
  const tests: TestResult[] = [];

  for (const label of labels) {
    counts.labelled++;
    const lk = safeKey(label.name);
    const ln = normName(label.name);
    let idx = -1;
    let by: TestResult["matchedBy"] = null;
    // canonicalKey first (prefer an exact name among same-key candidates), then normalised name.
    const byKey = lk ? extracted.map((_, i) => i).filter((i) => !used.has(i) && exKeys[i] === lk) : [];
    if (byKey.length) {
      idx = byKey.find((i) => exNames[i] === ln) ?? byKey[0];
      by = "key";
    } else {
      idx = extracted.findIndex((_, i) => !used.has(i) && exNames[i] === ln);
      if (idx >= 0) by = "name";
    }

    const r: TestResult = {
      label,
      matchedName: null,
      matchedBy: null,
      extractedValue: null,
      valueOk: false,
      rangeChecked: label.refLow !== undefined || label.refHigh !== undefined,
      rangeOk: false,
      flagChecked: normFlag(label.flag) !== null,
      flagOk: false,
      codeStatus: null,
    };
    if (r.rangeChecked) counts.rangeTotal++;
    if (r.flagChecked) counts.flagTotal++;

    if (idx >= 0) {
      used.add(idx);
      const t = extracted[idx];
      counts.found++;
      r.matchedName = t.name;
      r.matchedBy = by;
      r.extractedValue = [t.value, t.unit].filter(Boolean).join(" ");
      r.valueOk = valueMatches(label, t);
      if (r.valueOk) counts.valueOk++;
      if (r.rangeChecked) {
        r.rangeOk = sameNum(label.refLow, t.refLow) && sameNum(label.refHigh, t.refHigh);
        if (r.rangeOk) counts.rangeOk++;
      }
      if (r.flagChecked) {
        try {
          r.codeStatus = checkTest(t).status;
          r.flagOk = r.codeStatus === normFlag(label.flag);
        } catch (e) {
          r.error = `checkTest failed: ${e instanceof Error ? e.message : String(e)}`;
        }
        if (r.flagOk) counts.flagOk++;
      }
    }
    tests.push(r);
  }
  counts.extra = extracted.length - used.size;
  return { tests, counts };
}

// ---------------------------------------------------------------- run

async function extract(file: string, mimeType: string): Promise<{ res?: ExtractResponse; error?: string; ms: number }> {
  const imageBase64 = readFileSync(file).toString("base64");
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/extract`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(ACCESS ? { "x-shifa-access": ACCESS } : {}) },
      body: JSON.stringify({ imageBase64, mimeType }),
    });
    const ms = Date.now() - t0;
    const json = (await res.json().catch(() => null)) as (ExtractResponse & { error?: string; code?: string }) | null;
    if (!res.ok || !json || !json.report) {
      return { error: `HTTP ${res.status}${json?.code ? ` ${json.code}` : ""}${json?.error ? `: ${json.error}` : ""}`, ms };
    }
    return { res: json, ms };
  } catch (e) {
    return { error: `fetch failed: ${e instanceof Error ? e.message : String(e)} (is the app running at ${BASE_URL}?)`, ms: Date.now() - t0 };
  }
}

function loadLabels(file: string): LabelTest[] {
  const json = JSON.parse(readFileSync(file, "utf8")) as { tests?: unknown };
  if (!Array.isArray(json.tests)) throw new Error(`${basename(file)}: "tests" must be an array`);
  return (json.tests as LabelTest[]).filter((t) => t && typeof t.name === "string" && t.value !== undefined);
}

/** A label file written by --draft that no person has checked yet (still has "_draft": true). */
function isDraft(file: string): boolean {
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { _draft?: unknown })._draft === true;
  } catch {
    return false;
  }
}

// Lab from the file name prefix: "chughtai-01.jpg" -> Chughtai Lab. Used for the per-lab table.
const LAB_NAMES: Record<string, string> = {
  chughtai: "Chughtai Lab",
  minhaj: "Minhaj Lab",
  skm: "Shaukat Khanum",
  shaukat: "Shaukat Khanum",
  excel: "Excel Labs",
  idc: "IDC",
  aku: "Aga Khan",
  agakhan: "Aga Khan",
  essa: "Dr. Essa's Lab",
};
function labOf(file: string): string {
  const prefix = basename(file, extname(file)).toLowerCase().split(/[-_\s\d]/)[0] || "other";
  return LAB_NAMES[prefix] ?? prefix[0].toUpperCase() + prefix.slice(1);
}

/** H / L from the flag the lab printed (what the paper says), else unset. */
function printedFlag(f: string): string | undefined {
  const s = (f || "").trim().toLowerCase();
  if (/^(h|high|\+|↑)/.test(s)) return "H";
  if (/^(l|low|-|↓)/.test(s)) return "L";
  return undefined;
}

/** --draft: write the AI's reading as a label file for a person to check (saves typing every value). */
async function writeDrafts(files: string[]): Promise<void> {
  if (!files.length) {
    console.log("Every report already has a label file. Nothing to draft.");
    return;
  }
  mkdirSync(LABELS_DIR, { recursive: true });
  for (const file of files) {
    process.stdout.write(`- drafting ${file} ... `);
    const { res, error } = await extract(join(REPORTS_DIR, file), MIME[extname(file).toLowerCase()]);
    if (error || !res) {
      console.log(`ERROR ${error}`);
      continue;
    }
    const tests = res.report.tests.map((t) => {
      const flag = printedFlag(t.printedFlag);
      return { name: t.name, value: t.value, unit: t.unit, refLow: t.refLow, refHigh: t.refHigh, ...(flag ? { flag } : {}) };
    });
    const out = {
      _draft: true,
      _help:
        "DRAFT written by the AI. Check EVERY row against the paper report: fix wrong values, units and ranges, add missed rows, delete rows that aren't results, set flag (H/L/N) to what a doctor would mark. Then delete the _draft line so this report counts in the accuracy test.",
      tests,
    };
    writeFileSync(join(LABELS_DIR, `${basename(file, extname(file))}.json`), JSON.stringify(out, null, 2) + "\n");
    console.log(`${tests.length} rows`);
  }
  console.log("\nNow check each draft in eval/labels/ against the paper, then delete its _draft line.");
}

function row(cells: (string | number)[]): string {
  return `| ${cells.join(" | ")} |`;
}

async function main(): Promise<void> {
  if (!existsSync(REPORTS_DIR)) {
    console.error(`No ${REPORTS_DIR}. See eval/README.md.`);
    process.exit(1);
  }
  const files = readdirSync(REPORTS_DIR)
    .filter((f) => MIME[extname(f).toLowerCase()])
    .sort();
  const pairs = files
    .map((f) => ({ file: f, label: join(LABELS_DIR, `${basename(f, extname(f))}.json`) }))
    .filter((p) => existsSync(p.label));
  const unlabelled = files.filter((f) => !pairs.some((p) => p.file === f));
  if (process.argv.includes("--draft")) return writeDrafts(unlabelled);
  if (unlabelled.length) {
    console.log(`Skipping ${unlabelled.length} report(s) without labels: ${unlabelled.join(", ")}`);
    console.log(`  Tip: npm run eval:draft writes AI drafts for them to check.`);
  }
  const drafts = pairs.filter((p) => isDraft(p.label));
  if (drafts.length) {
    console.log(`Skipping ${drafts.length} unchecked draft label(s): ${drafts.map((d) => basename(d.label)).join(", ")}`);
    console.log(`  Check them against the paper report, then delete the "_draft" line.`);
    pairs.splice(0, pairs.length, ...pairs.filter((p) => !isDraft(p.label)));
  }
  if (!pairs.length) {
    console.error("No labelled reports found. Add eval/reports/<name>.jpg and eval/labels/<name>.json (see eval/README.md).");
    process.exit(1);
  }

  console.log(`Evaluating ${pairs.length} report(s) against ${BASE_URL}/api/extract\n`);
  const results: ReportResult[] = [];
  const total = emptyCounts();

  for (const { file, label } of pairs) {
    const path = join(REPORTS_DIR, file);
    const size = statSync(path).size;
    if (size > 4 * 1024 * 1024) console.warn(`  ! ${file} is ${(size / 1048576).toFixed(1)} MB; the API may reject files over ~4 MB`);
    let labels: LabelTest[];
    try {
      labels = loadLabels(label);
    } catch (e) {
      console.error(`  ! ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    process.stdout.write(`- ${file} ... `);
    const { res, error, ms } = await extract(path, MIME[extname(file).toLowerCase()]);
    const extracted = res?.report.tests ?? [];
    const { tests, counts } = evaluate(labels, extracted);
    addCounts(total, counts);
    results.push({ file, ms, model: res?.model ?? null, error, notes: res?.report.notes || undefined, tests, ...counts });
    console.log(error ? `ERROR ${error}` : `${counts.found}/${counts.labelled} found, ${(ms / 1000).toFixed(1)} s`);
    for (const t of tests) {
      if (!t.matchedName) console.log(`    missing: ${t.label.name}`);
      else if (!t.valueOk) console.log(`    value:   ${t.label.name} expected ${t.label.value}, got ${t.extractedValue}`);
      if (t.rangeChecked && t.matchedName && !t.rangeOk) console.log(`    range:   ${t.label.name} expected ${t.label.refLow ?? "null"}-${t.label.refHigh ?? "null"}`);
      if (t.flagChecked && t.matchedName && !t.flagOk) console.log(`    flag:    ${t.label.name} expected ${t.label.flag}, code said ${t.codeStatus ?? t.error ?? "?"}`);
    }
  }

  const header = ["Report", "Tests found", "Value exact", "Range match", "Flag agreement", "Extra rows", "Time"];
  const line = (name: string, c: Counts, time: string) => [
    name,
    `${pct(c.found, c.labelled)} (${c.found}/${c.labelled})`,
    `${pct(c.valueOk, c.labelled)} (${c.valueOk}/${c.labelled})`,
    `${pct(c.rangeOk, c.rangeTotal)} (${c.rangeOk}/${c.rangeTotal})`,
    `${pct(c.flagOk, c.flagTotal)} (${c.flagOk}/${c.flagTotal})`,
    String(c.extra),
    time,
  ];
  const avgMs = results.length ? results.reduce((a, r) => a + r.ms, 0) / results.length : 0;
  // Per lab (from file name prefixes), so we can see which lab's format needs tuning.
  const byLab = new Map<string, { counts: Counts; n: number; ms: number }>();
  for (const r of results) {
    const lab = labOf(r.file);
    const g = byLab.get(lab) ?? { counts: emptyCounts(), n: 0, ms: 0 };
    addCounts(g.counts, r);
    g.n++;
    g.ms += r.ms;
    byLab.set(lab, g);
  }
  const labRows = [...byLab.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lab, g]) => line(`${lab} (${g.n} report${g.n === 1 ? "" : "s"})`, g.counts, `${(g.ms / g.n / 1000).toFixed(1)} s avg`));
  const tableRows = [...results.map((r) => line(r.error ? `${r.file} (error)` : r.file, r, `${(r.ms / 1000).toFixed(1)} s`)), line("**Overall**", total, `${(avgMs / 1000).toFixed(1)} s avg`)];

  console.log("");
  const widths = header.map((h, i) => Math.max(h.length, ...[...tableRows, ...labRows].map((r) => r[i].replace(/\*/g, "").length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.replace(/\*/g, "").padEnd(widths[i])).join("  ");
  console.log(fmt(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of tableRows) console.log(fmt(r));
  if (labRows.length > 1 || (labRows.length === 1 && results.length > 1)) {
    console.log("\nBy lab:");
    for (const r of labRows) console.log(fmt(r));
  }

  const models = [...new Set(results.map((r) => r.model).filter(Boolean))].join(", ") || "n/a";
  const md = [
    `## Extraction accuracy`,
    ``,
    `${results.length} hand-labelled real lab reports, ${total.labelled} labelled tests. Model: ${models}. Run on ${new Date().toISOString().slice(0, 10)}.`,
    ``,
    row(header),
    row(header.map(() => "---")),
    ...tableRows.map(row),
    ``,
    `### By lab`,
    ``,
    row(["Lab", ...header.slice(1)]),
    row(header.map(() => "---")),
    ...labRows.map(row),
    ``,
    `- **Tests found**: labelled rows the AI returned (matched by canonical test key, then by name).`,
    `- **Value exact**: value identical to the label (numbers within 1e-6, text case-insensitive), out of all labelled rows.`,
    `- **Range match**: refLow and refHigh identical to the label, for rows whose label gives a range.`,
    `- **Flag agreement**: Shifa's code (\`checkTest\`) gives the same low/high/normal as the label, for rows whose label gives a flag.`,
    ``,
  ].join("\n");

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(
    join(RESULTS_DIR, "results.json"),
    JSON.stringify({ baseUrl: BASE_URL, runAt: new Date().toISOString(), overall: total, reports: results }, null, 2),
  );
  writeFileSync(join(RESULTS_DIR, "summary.md"), md);
  console.log(`\nWrote eval/results/results.json and eval/results/summary.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
