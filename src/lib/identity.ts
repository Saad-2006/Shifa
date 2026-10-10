// Patient identity check: is the person on the report the family member it's being added to?
// Pure and deterministic (no AI), so a scary result never lands on the wrong person.
import type { ExtractedReport, IdentityConflict, PatientOnReport, Person, Sex } from "@/lib/types";

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "master", "mst", "mstr", "baby", "madam"]);

// Common name parts that don't identify anyone on their own ("Muhammad", "Bano", "Syed"...).
const WEAK = new Set([
  "muhammad", "mohammad", "muhammed", "mohammed", "mohamed", "mohd", "md", "m",
  "syed", "syeda", "sayed", "sheikh", "shaikh", "hafiz", "malik", "ch", "chaudhry", "chaudhary",
  "rana", "mian", "mirza", "khawaja", "khwaja", "raja", "bibi", "bano", "begum", "khatoon",
  "khatun", "bi", "sahib", "sb", "sahiba",
]);

// Profile names that are relations, not real names, so they can't be compared with a report.
const RELATION_WORDS = new Set([
  "me", "myself", "self", "ammi", "ami", "amma", "ammu", "abbu", "abu", "abba", "abbaji", "papa",
  "mama", "mummy", "mom", "mum", "dad", "daddy", "nani", "nana", "dadi", "dada", "khala", "khalu",
  "phuppo", "phupho", "phuphi", "chachu", "chacha", "chachi", "mamu", "mamoo", "mami", "taya",
  "tayi", "bhai", "bhaiya", "behan", "baji", "apa", "api", "bhabhi", "beta", "beti", "son",
  "daughter", "mother", "father", "wife", "husband", "sister", "brother", "grandma", "grandpa",
  "grandmother", "grandfather", "uncle", "aunt", "aunty", "auntie", "jaan",
]);

/** "Mrs. SHAZIA BANO w/o Ahmed" -> "shazia bano" */
export function normaliseName(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/\b[wds]\s*\/\s*o\b.*$/, "")
    .replace(/\b(?:wife|daughter|son)\s+of\b.*$/, "")
    .replace(/[^a-z؀-ۿ\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !TITLES.has(t))
    .join(" ");
}

/** "SHAZIA BANO" -> "Shazia Bano" (Urdu script is kept as is). */
export function displayName(name: string): string {
  return normaliseName(name)
    .split(" ")
    .filter(Boolean)
    .map((t) => (/^[a-z]/.test(t) ? t[0].toUpperCase() + t.slice(1) : t))
    .join(" ");
}

function lev(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** Same name part, allowing small spelling differences (Ashraf/Ashrif) but not different names. */
function similarToken(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  return 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.75;
}

/** True when two printed names plausibly belong to the same person. */
export function namesMatch(a: string, b: string): boolean {
  const ta = normaliseName(a).split(" ").filter(Boolean);
  const tb = normaliseName(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return false;
  const strongA = ta.filter((t) => !WEAK.has(t));
  const strongB = tb.filter((t) => !WEAK.has(t));
  const A = strongA.length ? strongA : ta;
  const B = strongB.length ? strongB : tb;
  const hits = A.filter((x) => B.some((y) => similarToken(x, y))).length;
  return hits >= Math.max(1, Math.ceil(Math.min(A.length, B.length) / 2));
}

/** A profile name that is a real name ("Shazia"), not a relation ("Ammi", "Me"). */
export function isRealName(name: string): boolean {
  const tokens = normaliseName(name).split(" ").filter(Boolean);
  return tokens.length > 0 && !tokens.every((t) => RELATION_WORDS.has(t));
}

/** Age in years from "53 Year(s)", "58 Y", "53Y 4M", "5 Months", "10 Days", "53". */
export function parseAge(text: string): number | null {
  const t = (text || "").toLowerCase();
  const y = /(\d+(?:\.\d+)?)\s*(?:y(?:ears?|rs?)?|sal|saal)(?![a-z])/.exec(t);
  if (y) {
    let v = Number(y[1]);
    const m = /(\d+)\s*m(?:onths?|on|o)?(?![a-z])/.exec(t.slice(y.index + y[0].length));
    if (m) v += Number(m[1]) / 12;
    return v;
  }
  const mo = /(\d+)\s*(?:months?|mons?|mo|m)(?![a-z])/.exec(t);
  if (mo) return Number(mo[1]) / 12;
  const d = /(\d+)\s*(?:days?|d)(?![a-z])/.exec(t);
  if (d) return Number(d[1]) / 365;
  const plain = /^\s*(\d{1,3})\s*$/.exec(t);
  return plain ? Number(plain[1]) : null;
}

/** "Female" / "F" / "Mrs" / "خاتون" -> "F"; "Male" / "M" / "مرد" -> "M"; otherwise "". */
export function parseSex(text: string): Sex {
  const t = (text || "").trim().toLowerCase();
  if (/^(?:f|female|woman|girl|mrs|ms|miss)\b/.test(t) || /عورت|خاتون|زنانہ/.test(t)) return "F";
  if (/^(?:m|male|man|boy|mr)\b/.test(t) || /مرد|مردانہ/.test(t)) return "M";
  return "";
}

interface ReadPatient {
  name: string; // display name, "" if none
  age: number | null;
  sex: Sex;
  shown: PatientOnReport; // for the UI, as printed
}

export function readPatient(x: Pick<ExtractedReport, "patientName" | "patientAge" | "patientSex">): ReadPatient {
  const name = displayName(x.patientName || "");
  const age = parseAge(x.patientAge || "");
  const sex = parseSex(x.patientSex || "");
  return {
    name,
    age,
    sex,
    shown: { name, age: (x.patientAge || "").trim(), sex: sex || (x.patientSex || "").trim() },
  };
}

const yearsSince = (ymd: string, now: Date): number => {
  const t = Date.parse(ymd);
  return Number.isNaN(t) ? 0 : Math.max(0, (now.getTime() - t) / (365.25 * 864e5));
};

/** Names this person is known by on reports (plus their profile name if it's a real name). */
function knownNames(p: Person): string[] {
  const names = [...(p.reportNames ?? [])];
  if (isRealName(p.name)) names.push(p.name);
  return names;
}

const AGE_TOLERANCE = 3;

/** Everything about the report's patient that contradicts this family member. */
export function personConflicts(p: Person, rp: ReadPatient, reportDate: string, now: Date): IdentityConflict[] {
  const out: IdentityConflict[] = [];
  if (rp.sex && p.sex && rp.sex !== p.sex) out.push({ kind: "sex", report: rp.sex, profile: p.sex });
  if (rp.age !== null && typeof p.age === "number") {
    const expected = p.age - yearsSince(reportDate, now); // the report may be from an earlier year
    if (Math.abs(rp.age - expected) > AGE_TOLERANCE) out.push({ kind: "age", report: String(Math.round(rp.age)), profile: String(p.age) });
  }
  const names = knownNames(p);
  if (rp.name && names.length && !names.some((n) => namesMatch(rp.name, n))) {
    out.push({ kind: "name", report: rp.name, profile: names[0] });
  }
  return out;
}

export interface IdentityVerdict {
  status: "ok" | "mismatch" | "unknown";
  patient: PatientOnReport;
  conflicts: IdentityConflict[];
  suggestedPersonId?: string;
}

/**
 * Compare the report's patient with the active family member.
 * mismatch = at least one conflict (name, sex or age); then suggest another family member
 * only when exactly one fits clearly (name match, or same sex and age, with no conflicts).
 */
export function compareIdentity(
  x: ExtractedReport,
  active: Person,
  people: Person[],
  now: Date = new Date(),
): IdentityVerdict {
  const rp = readPatient(x);
  if (!rp.name && rp.age === null && !rp.sex) return { status: "unknown", patient: rp.shown, conflicts: [] };
  const conflicts = personConflicts(active, rp, x.reportDate, now);
  if (!conflicts.length) return { status: "ok", patient: rp.shown, conflicts };

  const others = people.filter((p) => p.id !== active.id && personConflicts(p, rp, x.reportDate, now).length === 0);
  const byName = others.filter((p) => rp.name && knownNames(p).some((n) => namesMatch(rp.name, n)));
  const bySexAge = others.filter(
    (p) =>
      rp.sex && p.sex === rp.sex && rp.age !== null && typeof p.age === "number" &&
      Math.abs(rp.age - (p.age - yearsSince(x.reportDate, now))) <= AGE_TOLERANCE,
  );
  const pick = byName.length === 1 ? byName[0] : byName.length === 0 && bySexAge.length === 1 ? bySexAge[0] : undefined;
  return { status: "mismatch", patient: rp.shown, conflicts, ...(pick ? { suggestedPersonId: pick.id } : {}) };
}
