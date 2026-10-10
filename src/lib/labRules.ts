// Deterministic lab checks for Shifa. NO AI here: every flag, danger value and
// urgency level is decided by the plain code below.
import type {
  CheckedTest,
  ExtractedReport,
  ExtractedTest,
  LabReport,
  Severity,
  TestStatus,
  Urgency,
} from "@/lib/types";
import { displayName } from "@/lib/identity";

export const URGENCY_RANK: Record<Urgency, number> = { normal: 0, routine: 1, soon: 2, emergency: 3 };
const SEVERITY_RANK: Record<Severity, number> = { none: 0, mild: 1, marked: 2, critical: 3 };

/** Random id that also works outside a secure context (plain-http LAN demo on a phone). */
export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// 1. Canonical test keys
// ---------------------------------------------------------------------------

/** Lowercase, unify spellings, collapse dotted abbreviations (S.G.P.T -> sgpt), keep [a-z0-9 ]. */
function normalise(name: string): string {
  let s = (name || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/\b((?:[a-z]\.){2,}[a-z]?)\.?/g, (m) => m.replace(/\./g, ""));
  s = s.replace(/haem/g, "hem").replace(/leuco/g, "leuko").replace(/[µμ]/g, "u");
  return s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

const PREFIXES = new Set(["s", "sr", "serum", "blood", "plasma", "venous"]);
const FILLERS = new Set([
  "count", "level", "levels", "test", "value", "conc", "quantitative", "ultrasensitive", "ultra",
  "sensitive", "hs", "3rd", "generation", "cholesterol", "c", "total", "estimation",
]);

function stripPrefix(s: string): string {
  const t = s.split(" ");
  while (t.length > 1 && PREFIXES.has(t[0])) t.shift();
  return t.join(" ");
}
function stripFiller(s: string): string {
  const t = s.split(" ").filter((w) => !FILLERS.has(w));
  return t.length ? t.join(" ") : s;
}

interface KeyRule {
  key: string | null; // null = "do not map, use the slug" guard
  exact?: string[]; // short aliases: must equal the whole normalised name
  has?: string[]; // longer phrases: matched as whole words anywhere in the name
  re?: RegExp;
}

// Order matters: specific rules first (hba1c before hemoglobin, mchc before mch before hemoglobin,
// ldl/hdl before cholesterol, glucose_fasting before glucose ...).
const KEY_RULES: KeyRule[] = [
  { key: "hba1c", exact: ["a1c"], re: /\b(?:hb|hgb)?\s?a1c\b|\bglyc(?:at|osyl|o ?hem)/ },
  { key: "inr", exact: ["inr"], has: ["international normalized ratio", "international normalised ratio", "pt inr", "inr value"] },
  // Guards: ratios, widths, urine tests etc. are different analytes; keep them as their own slug.
  { key: null, re: /\b(?:ratio|width|urine|urinary|clearance|index)\b/ },
  { key: "non_hdl_cholesterol", has: ["non hdl"] },
  { key: "vldl", re: /\bvldl\b/ },
  { key: "mpv", exact: ["mpv"], has: ["mean platelet volume"] },
  { key: "mchc", exact: ["mchc"], has: ["mchc"], re: /\bmean (?:corpuscular|cell) (?:hemoglobin|hb) conc/ },
  { key: "mch", exact: ["mch"], re: /\bmean (?:corpuscular|cell) (?:hemoglobin|hb)\b/ },
  { key: "mcv", exact: ["mcv"], has: ["mean corpuscular volume", "mean cell volume"] },
  { key: "hematocrit", exact: ["hct", "pcv"], has: ["hematocrit", "packed cell volume"] },
  { key: "rbc", exact: ["rbc", "rbcs"], has: ["rbc count", "red blood cell", "red cell count", "erythrocyte count", "total rbc", "red blood corpuscle"] },
  { key: "wbc", exact: ["wbc", "wbcs", "tlc"], has: ["wbc count", "tlc count", "total leukocyte count", "leukocyte count", "white blood cell", "white cell count", "total wbc", "white blood corpuscle"] },
  { key: "neutrophils_abs", exact: ["anc"], re: /\babsolute neutrophil/ },
  { key: "lymphocytes_abs", exact: ["alc"], re: /\babsolute lymphocyte/ },
  { key: "neutrophils", exact: ["neut"], has: ["neutrophil", "polymorph", "neutrophils"] },
  { key: "lymphocytes", exact: ["lym", "lymph"], has: ["lymphocyte"] },
  { key: "platelets", exact: ["plt", "plts"], has: ["platelet", "plt count", "thrombocyte"] },
  { key: "hemoglobin", exact: ["hb", "hgb"], has: ["hemoglobin"] },
  {
    key: "glucose_fasting",
    exact: ["fbs", "bsf", "fpg", "fbg", "fbsl"],
    re: /\b(?:glucose|sugar)\b.*\bfasting\b|\bfasting\b.*\b(?:glucose|sugar)\b|\b(?:glucose|sugar) f\b/,
  },
  {
    key: "glucose_random",
    exact: ["rbs", "bsr", "rbg"],
    re: /\brandom\b.*\b(?:glucose|sugar)\b|\b(?:glucose|sugar)\b.*\brandom\b|\b(?:glucose|sugar) r\b/,
  },
  {
    key: "glucose_pp",
    exact: ["ppbs", "bspp", "2hpp", "pp"],
    re: /\bpost ?prandial\b|\b(?:glucose|sugar)\b.*\bpp\b|\bpp\b.*\b(?:glucose|sugar)\b/,
  },
  { key: "glucose", exact: ["bs", "bsl"], has: ["glucose", "blood sugar", "sugar"] },
  { key: "ldl", exact: ["ldl"], has: ["ldl c", "ldl direct", "direct ldl", "low density lipoprotein"] },
  { key: "hdl", exact: ["hdl"], has: ["hdl c", "high density lipoprotein"] },
  { key: "triglycerides", exact: ["tg", "tgs", "trig"], has: ["triglyceride"] },
  { key: "cholesterol_total", exact: ["tc", "chol"], has: ["total cholesterol", "cholesterol total", "cholesterol"] },
  { key: "bun", exact: ["bun"], has: ["urea nitrogen"] },
  { key: "creatinine", exact: ["cr", "creat", "scr"], has: ["creatinine"] },
  { key: "uric_acid", exact: ["ua"], has: ["uric acid", "urate"] },
  { key: "urea", has: ["urea"] },
  { key: "alt", exact: ["alt", "gpt"], has: ["sgpt", "alanine aminotransferase", "alanine transaminase"] },
  { key: "ast", exact: ["ast", "got"], has: ["sgot", "aspartate aminotransferase", "aspartate transaminase"] },
  { key: "alp", exact: ["alp"], has: ["alkaline phosphatase", "alk phos", "alk phosphatase"] },
  { key: "bilirubin_indirect", re: /\b(?:indirect|unconjugated)\b/ },
  { key: "bilirubin_direct", re: /\bbilirubin\b.*\b(?:direct|conjugated)\b|\b(?:direct|conjugated)\b.*\bbilirubin\b/ },
  { key: "bilirubin_total", exact: ["tbil", "tsb"], has: ["total bilirubin", "bilirubin total", "bilirubin"] },
  { key: "tsh", exact: ["tsh"], has: ["thyroid stimulating hormone"] },
  { key: "free_t4", exact: ["ft4"], has: ["free t4", "free thyroxine"] },
  { key: "free_t3", exact: ["ft3"], has: ["free t3", "free triiodothyronine"] },
  { key: "t4", exact: ["t4", "tt4"], has: ["thyroxine", "total t4", "t4 total"] },
  { key: "t3", exact: ["t3", "tt3"], has: ["triiodothyronine", "total t3", "t3 total"] },
  { key: "vitamin_d", has: ["25 oh d", "25 hydroxy", "cholecalciferol", "calcidiol"], re: /\bvit(?:amin)?\s?d\d?\b/ },
  { key: "vitamin_b12", exact: ["b12"], has: ["cobalamin", "cyanocobalamin"], re: /\bvit(?:amin)?\s?b\s?12\b/ },
  { key: "ferritin", has: ["ferritin"] },
  { key: "sodium", exact: ["na"], has: ["sodium"] },
  { key: "potassium", exact: ["k"], has: ["potassium"] },
  { key: "chloride", exact: ["cl"], has: ["chloride"] },
  { key: "calcium_ionized", exact: ["ica"], re: /\bioni[sz]ed\b.*\bcalcium\b|\bcalcium\b.*\bioni[sz]ed\b/ },
  { key: "calcium", exact: ["ca"], has: ["calcium"] },
  { key: "esr", exact: ["esr"], has: ["erythrocyte sedimentation rate", "sed rate"] },
  { key: "crp", exact: ["crp", "hscrp"], has: ["c reactive protein", "hs crp"] },
];

const phraseCache = new Map<string, RegExp>();
function hasPhrase(s: string, phrase: string): boolean {
  let re = phraseCache.get(phrase);
  if (!re) {
    re = new RegExp("\\b" + phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?\\b");
    phraseCache.set(phrase, re);
  }
  return re.test(s);
}

/** Map a printed test name ("S. Creatinine", "TLC", "HbA1c") to a stable key for trends. */
export function canonicalKey(name: string): string {
  const full = normalise(name);
  const noParen = normalise((name || "").replace(/\([^)]*\)|\[[^\]]*\]/g, " "));
  const variants = new Set<string>();
  for (const v of [full, noParen]) {
    if (!v) continue;
    const p = stripPrefix(v);
    variants.add(v);
    variants.add(p);
    variants.add(stripFiller(p));
  }
  const slug = (stripPrefix(noParen || full) || "unknown").replace(/ /g, "_");
  if (!full) return "unknown";

  for (const r of KEY_RULES) {
    const hit =
      (r.exact?.some((a) => variants.has(a)) ?? false) ||
      (r.has?.some((ph) => hasPhrase(full, ph)) ?? false) ||
      (r.re ? r.re.test(full) : false);
    if (hit) return r.key ?? slug;
  }
  return slug;
}

// ---------------------------------------------------------------------------
// 2. Parsing numbers and reference ranges
// ---------------------------------------------------------------------------

const LAKH_RE = /\b(?:lac|lacs|lakh|lakhs)\b/i;

/** "10.6 H" -> 10.6, "<0.5" -> 0.5, "1,50,000" -> 150000, "1.5 lac" -> 150000, "Negative" -> null. */
export function parseNumber(text: string): number | null {
  if (typeof text !== "string") return null;
  let s = text.trim().replace(/[−–]/g, "-");
  if (!s) return null;
  if (/^[-+]?\d+,\d{1,2}$/.test(s)) s = s.replace(",", "."); // decimal comma "10,6"
  s = s.replace(/(\d),(?=\d)/g, "$1"); // lakh / thousand separators
  const m = s.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!m) return null;
  let n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  if (LAKH_RE.test(s)) n *= 100000;
  return n;
}

interface Range {
  low: number | null;
  high: number | null;
}

const NUM = "(\\d+(?:\\.\\d+)?)";
const RANGE_BETWEEN = new RegExp(NUM + "\\s*(?:-|to|~)\\s*" + NUM);
const RANGE_UPPER = new RegExp(
  "(?:<=?|≤|\\bup\\s*to\\b|\\bupto\\b|\\bless\\s+than\\b|\\bbelow\\b|\\bunder\\b|\\bmax(?:imum)?\\b|\\bnot\\s+more\\s+than\\b)\\s*:?\\s*" + NUM,
);
const RANGE_LOWER = new RegExp(
  "(?:>=?|≥|\\bmore\\s+than\\b|\\bgreater\\s+than\\b|\\babove\\b|\\bover\\b|\\bmin(?:imum)?\\b|\\bat\\s+least\\b)\\s*:?\\s*" + NUM,
);

/** "12.0 - 15.5", "12–15.5", "< 200", "Up to 5.0", "> 40", "Desirable: <200, Borderline: 200-239" (first range wins). */
// Category tables ("Normal (<5.7 %) Pre-Diabetes (5.7 - 6.4 %) Diabetes (>6.4 %)",
// "Deficient < 20, Insufficient 20-29, Sufficient 30-100"): the normal category is the range.
const NORMAL_LABEL = /(?:\bnon[\s-]?diabetic|\bnormal|\bdesirable|\boptimal|(?<![a-z])sufficient|\badequate)\b/;
const OTHER_LABEL = /(?:\bpre[\s-]?diabet\w*|(?<!non[\s-]?)\bdiabet\w*|\bborderline|\bhigh\b|\bdeficien\w*|\binsufficien\w*|\btoxic\w*|\bimpaired)/;

function normalCategory(s: string): string | null {
  const m = NORMAL_LABEL.exec(s);
  if (!m || !OTHER_LABEL.test(s)) return null;
  const rest = s.slice(m.index + m[0].length);
  const next = OTHER_LABEL.exec(rest);
  return rest.slice(0, next ? next.index : 40);
}

export function parseRange(text: string, allowLakh = true): Range | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const lower = text.toLowerCase().replace(/[–—‒−]/g, "-");
  const category = normalCategory(lower);
  if (category && category !== lower) {
    const r = parseRange(category, allowLakh);
    if (r) return r;
  }
  const s = text
    .toLowerCase()
    .replace(/[–—‒−]/g, "-")
    .replace(/(\d),(?=\d)/g, "$1");
  const found: { idx: number; r: Range }[] = [];
  const b = RANGE_BETWEEN.exec(s);
  if (b) {
    let lo = Number(b[1]);
    let hi = Number(b[2]);
    if (lo > hi) [lo, hi] = [hi, lo];
    found.push({ idx: b.index, r: { low: lo, high: hi } });
  }
  const u = RANGE_UPPER.exec(s);
  if (u) found.push({ idx: u.index, r: { low: null, high: Number(u[1]) } });
  const l = RANGE_LOWER.exec(s);
  if (l) found.push({ idx: l.index, r: { low: Number(l[1]), high: null } });
  if (!found.length) return null;
  found.sort((a, c) => a.idx - c.idx);
  const r = found[0].r;
  if (allowLakh && LAKH_RE.test(s)) {
    return { low: r.low === null ? null : r.low * 100000, high: r.high === null ? null : r.high * 100000 };
  }
  return r;
}

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// ---------------------------------------------------------------------------
// 3. Danger (panic) values
// ---------------------------------------------------------------------------
// PROTOTYPE LIST of adult panic values, to be reviewed by a clinician before any real use.
// Each rule converts the value to a standard unit first and is skipped when the unit clearly
// doesn't fit (so a misread unit never raises a false emergency).

/** "×10⁹/L" -> "x109/l", "µIU/mL" -> "uiu/ml" */
function unitNorm(u: string): string {
  const sup: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
  return (u || "")
    .toLowerCase()
    .replace(/[⁰¹²³⁴-⁹]/g, (c) => sup[c] ?? c)
    .replace(/[µμ]/g, "u")
    .replace(/×/g, "x")
    .replace(/[\s^*]/g, "");
}
export { unitNorm as normaliseUnit };

interface Conv {
  v: number; // value in the standard unit
  converted: boolean;
}
interface DangerRule {
  keys: (key: string) => boolean;
  label: (t: ExtractedTest, key: string) => string;
  stdUnit: string;
  low?: { at: number; text: string };
  high?: { at: number; text: string };
  /** Convert to the standard unit, or null when the unit clearly doesn't fit. */
  convert: (v: number, unit: string, t: ExtractedTest, range: Range | null) => Conv | null;
}

const COUNT_BAD_UNIT = /%|mg|g\/|mmol|meq|fl$|pg$|iu/;
const GLUCOSE_LABEL: Record<string, string> = {
  glucose_fasting: "Fasting blood sugar",
  glucose_random: "Random blood sugar",
  glucose_pp: "Blood sugar after a meal",
  glucose: "Blood sugar",
};

const DANGER_RULES: DangerRule[] = [
  {
    keys: (k) => k === "hemoglobin",
    label: () => "Haemoglobin",
    stdUnit: "g/dL",
    low: { at: 7, text: "7" },
    high: { at: 20, text: "20" },
    convert: (v, u) => {
      if (u === "g/l" || u === "gm/l") return { v: v / 10, converted: true };
      if (u && !/^(?:g|gm|gms)(?:\/dl|%)$/.test(u)) return null;
      return v > 30 ? { v: v / 10, converted: true } : { v, converted: false };
    },
  },
  {
    keys: (k) => k === "wbc",
    label: () => "White cell count (WBC)",
    stdUnit: "×10⁹/L",
    low: { at: 2, text: "2" },
    high: { at: 30, text: "30" },
    convert: (v, u) => {
      if (COUNT_BAD_UNIT.test(u)) return null;
      return v > 500 ? { v: v / 1000, converted: true } : { v, converted: false };
    },
  },
  {
    keys: (k) => k === "platelets",
    label: () => "Platelets",
    stdUnit: "×10⁹/L",
    low: { at: 20, text: "20" },
    high: { at: 1000, text: "1000" },
    convert: (v, u, t) => {
      if (COUNT_BAD_UNIT.test(u)) return null;
      if (v > 5000) return { v: v / 1000, converted: true };
      const lakhText = LAKH_RE.test(u) || LAKH_RE.test(t.value || "");
      if (lakhText && v < 100) return { v: v * 100, converted: true };
      return { v, converted: false };
    },
  },
  {
    keys: (k) => k === "glucose" || (k.startsWith("glucose_") && k !== "hba1c"),
    label: (_t, k) => GLUCOSE_LABEL[k] ?? "Blood sugar",
    stdUnit: "mg/dL",
    low: { at: 50, text: "50" },
    high: { at: 400, text: "400" },
    convert: (v, u, _t, range) => {
      if (u.includes("mmol")) return { v: v * 18, converted: true };
      if (!u) {
        // No unit printed: a reference range or value this small can only be mmol/L.
        const hint = range?.high ?? v;
        return hint < 35 ? { v: v * 18, converted: true } : { v, converted: false };
      }
      if (/^mg(?:\/dl|%)$/.test(u)) return { v, converted: false };
      return null;
    },
  },
  {
    keys: (k) => k === "potassium",
    label: () => "Potassium",
    stdUnit: "mmol/L",
    low: { at: 2.8, text: "2.8" },
    high: { at: 6.0, text: "6.0" },
    convert: (v, u) => (!u || /^(?:mmol|meq)\/l$/.test(u) ? { v, converted: false } : null),
  },
  {
    keys: (k) => k === "sodium",
    label: () => "Sodium",
    stdUnit: "mmol/L",
    low: { at: 120, text: "120" },
    high: { at: 160, text: "160" },
    convert: (v, u) => (!u || /^(?:mmol|meq)\/l$/.test(u) ? { v, converted: false } : null),
  },
  {
    keys: (k) => k === "calcium",
    label: () => "Calcium",
    stdUnit: "mg/dL",
    low: { at: 6.5, text: "6.5" },
    high: { at: 13, text: "13" },
    convert: (v, u) => {
      if (u.includes("mmol")) return { v: v * 4, converted: true };
      if (!u) return v < 4 ? { v: v * 4, converted: true } : { v, converted: false };
      if (/^mg(?:\/dl|%)$/.test(u)) return { v, converted: false };
      return null;
    },
  },
  {
    keys: (k) => k === "inr",
    label: () => "INR",
    stdUnit: "",
    high: { at: 5, text: "5" },
    convert: (v, u) => (/sec|^s$/.test(u) ? null : { v, converted: false }),
  },
];

function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(Math.abs(n) < 1 ? 3 : 2)));
}
function decimals(n: number): number {
  const s = fmt(n);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}
/** The value as printed when it is a plain number ("4.0", "1,50,000"), else a tidy number. */
function shownValue(t: ExtractedTest, v: number): string {
  const s = (t.value || "").trim();
  return /^[-+]?\d[\d,]*(?:\.\d+)?$/.test(s) ? s : fmt(v);
}
function withUnit(value: string, unit: string): string {
  return unit && unit.trim() ? `${value} ${unit.trim()}` : value;
}
function rangeText(low: number | null, high: number | null): string {
  if (low !== null && high !== null) {
    const d = Math.max(decimals(low), decimals(high));
    return `${low.toFixed(d)}–${high.toFixed(d)}`;
  }
  if (high !== null) return `below ${fmt(high)}`;
  if (low !== null) return `above ${fmt(low)}`;
  return "";
}

function checkDanger(
  t: ExtractedTest,
  key: string,
  v: number,
  range: Range | null,
): { dir: "low" | "high"; reason: string } | null {
  const u = unitNorm(t.unit);
  for (const rule of DANGER_RULES) {
    if (!rule.keys(key)) continue;
    const c = rule.convert(v, u, t, range);
    if (!c) return null;
    const label = rule.label(t, key);
    const shown = withUnit(shownValue(t, v), t.unit);
    const conv = c.converted ? ` (${withUnit(fmt(c.v), rule.stdUnit)})` : "";
    const limitUnit = c.converted && rule.stdUnit ? ` ${rule.stdUnit}` : "";
    if (rule.low && c.v < rule.low.at) {
      return { dir: "low", reason: `${label} ${shown}${conv} is below the danger level of ${rule.low.text}${limitUnit}` };
    }
    if (rule.high && c.v > rule.high.at) {
      return { dir: "high", reason: `${label} ${shown}${conv} is above the danger level of ${rule.high.text}${limitUnit}` };
    }
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. Checking one test
// ---------------------------------------------------------------------------

const NEG_TEXT = /\b(?:negative|non[\s-]?reactive|not\s+detected|nil|absent)\b/i;
const POS_TEXT = /\b(?:positive|reactive|detected)\b/i;
const isNegative = (s: string) => NEG_TEXT.test(s || "");
const isPositive = (s: string) => !isNegative(s) && POS_TEXT.test(s || "");

function flagDirection(t: ExtractedTest): { dir: "low" | "high"; strong: boolean } | null {
  const fromFlag = (t.printedFlag || "").trim().toLowerCase();
  const trailing = (t.value || "").trim().match(/\b(h|l|hh|ll|high|low)\s*$/i)?.[1]?.toLowerCase() ?? "";
  const f = fromFlag || trailing;
  if (!f) return null;
  const strong = /\b(?:hh|ll|crit\w*|panic)\b/.test(f);
  if (/\b(?:h|hh|hi|high)\b|↑/.test(f)) return { dir: "high", strong };
  if (/\b(?:l|ll|lo|low)\b|↓/.test(f)) return { dir: "low", strong };
  return null;
}

/** Internal extras used to order urgency reasons; not part of CheckedTest. */
interface Extra {
  excess: number; // distance beyond the bound in units of the range scale
  qualitative: boolean;
  fromFlag: boolean;
}
const extras = new WeakMap<CheckedTest, Extra>();

// Published guideline ranges, used ONLY when the report prints no usable range (e.g. "See below").
// PROTOTYPE LIST, to be reviewed by a clinician. Units must match or the fallback is skipped.
interface StandardRange {
  low: number | null;
  high: number | null;
  unit: RegExp;
  text: string;
  source: string;
}
const STANDARD_RANGES: Record<string, StandardRange> = {
  hba1c: { low: null, high: 5.6, unit: /^%?$/, text: "< 5.7 %", source: "ADA" },
  vitamin_d: { low: 30, high: 100, unit: /^ng\/ml$/, text: "30 - 100 ng/mL", source: "Endocrine Society" },
  cholesterol_total: { low: null, high: 199, unit: /^mg\/dl$/, text: "< 200 mg/dL", source: "NCEP ATP III" },
  triglycerides: { low: null, high: 149, unit: /^mg\/dl$/, text: "< 150 mg/dL", source: "NCEP ATP III" },
  hdl: { low: 40, high: null, unit: /^mg\/dl$/, text: "> 40 mg/dL", source: "NCEP ATP III" },
};

function standardRange(key: string, unit: string, v: number | null): StandardRange | null {
  const std = STANDARD_RANGES[key];
  if (!std || v === null) return null;
  const u = unitNorm(unit);
  if (!std.unit.test(u)) return null;
  if (key === "hba1c" && v > 25) return null; // mmol/mol (IFCC) values, not %
  return std;
}

export function checkTest(t: ExtractedTest): CheckedTest {
  const name = typeof t.name === "string" ? t.name : "";
  const key = canonicalKey(name);
  const valueText = typeof t.value === "string" ? t.value : String(t.value ?? "");

  // Number: lakh text always re-parsed by code; otherwise trust numericValue, else parse.
  let v: number | null = null;
  if (LAKH_RE.test(valueText)) v = parseNumber(valueText);
  if (v === null && isNum(t.numericValue)) v = t.numericValue;
  if (v === null) v = parseNumber(valueText);

  // Range: refLow/refHigh, else parse the printed text.
  let range: Range | null = null;
  const lakhValue = LAKH_RE.test(valueText);
  if (LAKH_RE.test(t.refRangeText || "") && lakhValue) range = parseRange(t.refRangeText, true);
  if (!range && (isNum(t.refLow) || isNum(t.refHigh))) {
    range = { low: isNum(t.refLow) ? t.refLow : null, high: isNum(t.refHigh) ? t.refHigh : null };
  }
  if (!range) range = parseRange(t.refRangeText, lakhValue);
  let rangeSource: CheckedTest["rangeSource"] = range && (range.low !== null || range.high !== null) ? "report" : undefined;
  let std: StandardRange | null = null;
  if (!rangeSource && !isPositive(valueText) && !isNegative(valueText)) {
    std = standardRange(key, typeof t.unit === "string" ? t.unit : "", v);
    if (std) {
      range = { low: std.low, high: std.high };
      rangeSource = "standard";
    }
  }

  let status: TestStatus = "unknown";
  let severity: Severity = "none";
  const extra: Extra = { excess: 0, qualitative: false, fromFlag: false };

  if (isPositive(valueText) && isNegative(t.refRangeText)) {
    // Qualitative: "Reactive" where the normal is "Non-reactive".
    status = "high";
    severity = "marked";
    extra.qualitative = true;
    extra.excess = 1;
    v = isNum(t.numericValue) ? t.numericValue : null;
    range = null;
  } else if (isNegative(valueText) && isNegative(t.refRangeText)) {
    status = "normal";
    v = isNum(t.numericValue) ? t.numericValue : null;
    range = null;
  } else if (v !== null && range && (range.low !== null || range.high !== null)) {
    const { low, high } = range;
    let dist = 0;
    if (low !== null && v < low) {
      status = "low";
      dist = low - v;
    } else if (high !== null && v > high) {
      status = "high";
      dist = v - high;
    } else {
      status = "normal";
    }
    if (status !== "normal") {
      const width = low !== null && high !== null ? high - low : 0;
      const scale = width > 0 ? width : Math.abs(status === "low" ? (low as number) : (high as number));
      const threshold = 0.2 * scale;
      severity = dist <= threshold + 1e-9 * Math.max(1, threshold) ? "mild" : "marked";
      extra.excess = scale > 0 ? dist / scale : dist;
    }
  } else {
    const f = flagDirection({ ...t, value: valueText });
    if (f) {
      status = f.dir;
      severity = f.strong ? "marked" : "mild";
      extra.fromFlag = true;
      extra.excess = f.strong ? 0.5 : 0.1;
    }
  }

  let critical = false;
  let criticalReason: string | undefined;
  if (v !== null && !extra.qualitative) {
    const d = checkDanger({ ...t, name, value: valueText }, key, v, range);
    if (d) {
      critical = true;
      criticalReason = d.reason;
      severity = "critical";
      status = d.dir;
    }
  }

  const low = range?.low ?? null;
  const high = range?.high ?? null;
  const position = v !== null && low !== null && high !== null && high > low ? (v - low) / (high - low) : null;

  const out: CheckedTest = {
    ...t,
    name,
    value: valueText,
    numericValue: v,
    refLow: low,
    refHigh: high,
    key,
    status,
    severity,
    critical,
    position,
  };
  if (criticalReason) out.criticalReason = criticalReason;
  if (rangeSource && (low !== null || high !== null)) out.rangeSource = rangeSource;
  if (std && rangeSource === "standard") {
    out.refRangeText = std.text;
    out.rangeNote = `Standard range (${std.source}): the report did not print a usable range`;
  }
  extras.set(out, extra);
  return out;
}

// ---------------------------------------------------------------------------
// 5. Checking a whole report
// ---------------------------------------------------------------------------

function isValidYmd(s: string): boolean {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function localYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function reasonFor(t: CheckedTest): string {
  if (t.critical && t.criticalReason) return t.criticalReason;
  const ex = extras.get(t);
  const name = t.name.trim() || "A value";
  if (ex?.qualitative) {
    return `${name} is ${t.value.trim()} (normal: ${t.refRangeText.trim()})`;
  }
  const valueShown = t.numericValue !== null ? withUnit(shownValue(t, t.numericValue), t.unit) : t.value.trim();
  if (ex?.fromFlag || (t.refLow === null && t.refHigh === null)) {
    return `${name} ${valueShown} is marked ${t.status} on the report`;
  }
  const how = t.severity === "mild" ? "slightly" : "well";
  const dir = t.status === "high" ? "above" : "below";
  if (t.rangeSource === "standard") {
    return `${name} ${valueShown} is ${how} ${dir} the standard normal range (${t.refRangeText}; the report printed none)`;
  }
  return `${name} ${valueShown} is ${how} ${dir} the normal range (${rangeText(t.refLow, t.refHigh)})`;
}

function buildReasons(tests: CheckedTest[]): string[] {
  const abnormal = tests
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.status === "low" || t.status === "high" || t.critical)
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.t.severity] - SEVERITY_RANK[a.t.severity] ||
        (extras.get(b.t)?.excess ?? 0) - (extras.get(a.t)?.excess ?? 0) ||
        a.i - b.i,
    )
    .map(({ t }) => t);

  if (!abnormal.length) {
    const normal = tests.filter((t) => t.status === "normal").length;
    if (!tests.length) return ["No test values could be read from this report"];
    if (!normal) return ["None of the values had a normal range to check against"];
    return [normal === 1 ? "The 1 checked value is within the normal range" : `All ${normal} checked values are within the normal range`];
  }
  if (abnormal.length <= 4) return abnormal.map(reasonFor);
  const shown = abnormal.slice(0, 3).map(reasonFor);
  const rest = abnormal.slice(3);
  const allMild = rest.every((t) => t.severity === "mild");
  const n = rest.length;
  shown.push(`${n} other value${n === 1 ? " is" : "s are"} ${allMild ? "slightly" : "also"} outside the normal range`);
  return shown;
}

export function checkReport(
  x: ExtractedReport,
  o: { personId: string; source: LabReport["source"]; id?: string; createdAt?: string },
): LabReport {
  const createdAt = o.createdAt ?? new Date().toISOString();
  const tests = (Array.isArray(x?.tests) ? x.tests : []).map(checkTest);

  let urgency: Urgency = "normal";
  if (tests.some((t) => t.critical)) urgency = "emergency";
  else if (tests.some((t) => t.severity === "marked")) urgency = "soon";
  else if (tests.some((t) => t.severity === "mild")) urgency = "routine";

  const report: LabReport = {
    id: o.id ?? newId(),
    personId: o.personId,
    createdAt,
    reportDate: isValidYmd(x?.reportDate) ? x.reportDate : localYmd(createdAt),
    labName: typeof x?.labName === "string" ? x.labName : "",
    source: o.source,
    tests,
    urgency,
    urgencyReasons: buildReasons(tests),
    flaggedCount: tests.filter((t) => t.status === "low" || t.status === "high").length,
  };
  // Who the report says it's for (shown on the card so families can confirm at a glance).
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const patient = { name: displayName(str(x?.patientName)), age: str(x?.patientAge), sex: str(x?.patientSex) };
  if (patient.name || patient.age || patient.sex) report.patient = patient;
  return report;
}
