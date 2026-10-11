// Data-layer self-test: npx tsx scripts/selftest.ts
import { formatPhone, keywordAlertText, normalisePhone, reportAlertText, waLink } from "@/lib/whatsapp";
import { detectEmergency } from "@/lib/emergency";
import { ageNow, compareIdentity, findPersonByName, isRealName, latestReportAge, namesMatch, parseAge, parseSex } from "@/lib/identity";
import { personSubtitle, quickRelations, relationLabel, relationSex, RELATIONS } from "@/lib/relations";
import { patientLine } from "@/components/reportUtils";
import { buildTranslateSystem, normaliseDigits, numbersIn, numbersPreserved } from "@/lib/translate";
import assert from "node:assert/strict";
import type { Person, ExtractedTest, ExtractedReport } from "@/lib/types";
import { canonicalKey, checkTest, checkReport, parseNumber, parseRange, URGENCY_RANK } from "@/lib/labRules";
import { buildTrends } from "@/lib/trends";
import { SAMPLE_EXTRACTION, buildDemoFamily } from "@/lib/demoData";

let passed = 0;
const failures: string[] = [];
function check(label: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${label}: ${(e as Error).message.split("\n")[0]}`);
  }
}
const eq = (label: string, actual: unknown, expected: unknown) => check(label, () => assert.deepEqual(actual, expected));
const ok = (label: string, cond: boolean) => check(label, () => assert.ok(cond));

function T(name: string, value: string, unit = "", refRangeText = "", extra: Partial<ExtractedTest> = {}): ExtractedTest {
  return { panel: "", name, value, numericValue: null, unit, refRangeText, refLow: null, refHigh: null, printedFlag: "", ...extra };
}
function report(tests: ExtractedTest[], reportDate = "2026-10-01"): ExtractedReport {
  return { isLabReport: true, labName: "Test Lab", reportDate, patientName: "", patientAge: "", patientSex: "", tests, notes: "" };
}

// ---- 1. Aliases ----------------------------------------------------------
const aliasCases: [string, string][] = [
  ["HbA1c", "hba1c"],
  ["Glycosylated Haemoglobin", "hba1c"],
  ["Glycated Hemoglobin (HbA1c)", "hba1c"],
  ["Hb A1c", "hba1c"],
  ["Haemoglobin", "hemoglobin"],
  ["Hb", "hemoglobin"],
  ["Hgb", "hemoglobin"],
  ["Haemoglobin (Hb)", "hemoglobin"],
  ["TLC", "wbc"],
  ["Total Leucocyte Count", "wbc"],
  ["Total Leucocyte Count (TLC)", "wbc"],
  ["WBC Count", "wbc"],
  ["Platelet Count", "platelets"],
  ["PLT", "platelets"],
  ["BSF", "glucose_fasting"],
  ["FBS", "glucose_fasting"],
  ["Fasting Blood Sugar", "glucose_fasting"],
  ["Glucose Fasting", "glucose_fasting"],
  ["BSR", "glucose_random"],
  ["RBS", "glucose_random"],
  ["Random Blood Sugar", "glucose_random"],
  ["Blood Glucose", "glucose"],
  ["SGPT", "alt"],
  ["ALT (SGPT)", "alt"],
  ["S.G.P.T", "alt"],
  ["SGOT", "ast"],
  ["25-OH Vitamin D", "vitamin_d"],
  ["Vit D", "vitamin_d"],
  ["Vitamin B12", "vitamin_b12"],
  ["S. Creatinine", "creatinine"],
  ["Serum Creatinine", "creatinine"],
  ["Blood Urea", "urea"],
  ["Uric Acid", "uric_acid"],
  ["MCHC", "mchc"],
  ["Mean Corpuscular Haemoglobin", "mch"],
  ["LDL Cholesterol", "ldl"],
  ["HDL Cholesterol", "hdl"],
  ["Total Cholesterol", "cholesterol_total"],
  ["Cholesterol/HDL Ratio", "cholesterol_hdl_ratio"],
  ["K", "potassium"],
  ["Na", "sodium"],
  ["Serum Potassium", "potassium"],
  ["TSH", "tsh"],
  ["PT INR", "inr"],
  ["ESR", "esr"],
  ["C-Reactive Protein", "crp"],
  ["Bilirubin Total", "bilirubin_total"],
  ["Alkaline Phosphatase", "alp"],
];
for (const [name, key] of aliasCases) eq(`alias "${name}"`, canonicalKey(name), key);
// Short aliases must match the whole name only.
ok('"HBsAg" is not hemoglobin', canonicalKey("HBsAg") !== "hemoglobin");
ok('"CA 125" is not calcium', canonicalKey("CA 125") !== "calcium");
ok('"CK" is not potassium', canonicalKey("CK") !== "potassium");
eq("unknown name -> slug", canonicalKey("Serum Albumin"), "albumin");

// ---- 2. Parsing ----------------------------------------------------------
eq("parse '10.6 H'", parseNumber("10.6 H"), 10.6);
eq("parse '<0.5'", parseNumber("<0.5"), 0.5);
eq("parse '>100'", parseNumber(">100"), 100);
eq("parse lakh comma '1,50,000'", parseNumber("1,50,000"), 150000);
eq("parse '1.5 lac'", parseNumber("1.5 lac"), 150000);
eq("parse 'Negative'", parseNumber("Negative"), null);
eq("range '12.0 - 15.5'", parseRange("12.0 - 15.5"), { low: 12, high: 15.5 });
eq("range '12–15.5'", parseRange("12–15.5"), { low: 12, high: 15.5 });
eq("range '< 200'", parseRange("< 200"), { low: null, high: 200 });
eq("range 'Up to 5.0'", parseRange("Up to 5.0"), { low: null, high: 5 });
eq("range '> 40'", parseRange("> 40"), { low: 40, high: null });
eq("range 'Desirable: <200'", parseRange("Desirable: <200"), { low: null, high: 200 });
eq("range multi (first wins)", parseRange("Desirable: <200, Borderline: 200-239, High: >240"), { low: null, high: 200 });
eq("range multi sex", parseRange("Male: 13.0-17.0 Female: 12.0-15.5"), { low: 13, high: 17 });
eq("range lakh", parseRange("1,50,000 - 4,50,000"), { low: 150000, high: 450000 });

// ---- 3. Status, severity, position ---------------------------------------
{
  const t = checkTest(T("Haemoglobin", "10.6 H", "g/dL", "12.0 - 15.5"));
  eq("value text '10.6 H' parsed", t.numericValue, 10.6);
  eq("hb 10.6 low", t.status, "low");
  eq("hb 10.6 marked (1.4 > 0.7)", t.severity, "marked");
  ok("position < 0", t.position !== null && Math.abs(t.position - -0.4) < 1e-9);
}
eq("mild: MCV 76 vs 80-100", checkTest(T("MCV", "76", "fL", "80 - 100")).severity, "mild");
eq("mild one-sided: chol 212 vs <200", checkTest(T("Total Cholesterol", "212", "mg/dL", "< 200")).severity, "mild");
eq("marked one-sided: chol 260 vs <200", checkTest(T("Total Cholesterol", "260", "mg/dL", "< 200")).severity, "marked");
eq("one-sided position null", checkTest(T("Total Cholesterol", "212", "mg/dL", "< 200")).position, null);
eq("Up to 5.0 normal", checkTest(T("CRP", "3.1", "mg/L", "Up to 5.0")).status, "normal");
eq("normal severity none", checkTest(T("TSH", "2.1", "uIU/mL", "0.4 - 4.0")).severity, "none");
eq("lakh platelets normal", checkTest(T("Platelet Count", "2,45,000", "/cmm", "1,50,000 - 4,50,000")).status, "normal");
eq("flag fallback H", checkTest(T("Ferritin", "520", "ng/mL", "", { printedFlag: "H" })).status, "high");
eq("no range, no flag -> unknown", checkTest(T("Ferritin", "120", "ng/mL", "")).status, "unknown");
{
  const q = checkTest(T("HBsAg", "Reactive", "", "Non-Reactive"));
  eq("qualitative reactive high", q.status, "high");
  eq("qualitative reactive marked", q.severity, "marked");
  eq("qualitative non-reactive normal", checkTest(T("HBsAg", "Non-Reactive", "", "Non-Reactive")).status, "normal");
  eq("qualitative 'Detected' vs 'Not Detected'", checkTest(T("Dengue NS1", "Detected", "", "Not Detected")).status, "high");
}

// ---- 4. Danger rules and unit conversions --------------------------------
const crit = (t: ExtractedTest) => checkTest(t).critical;
ok("K 6.8 critical", crit(T("Potassium", "6.8", "mmol/L", "3.5 - 5.1")));
eq(
  "K 6.8 reason",
  checkTest(T("Potassium", "6.8", "mmol/L", "3.5 - 5.1")).criticalReason,
  "Potassium 6.8 mmol/L is above the danger level of 6.0",
);
ok("K 2.5 critical", crit(T("K", "2.5", "mmol/L", "3.5 - 5.1")));
ok("K 5.8 not critical", !crit(T("K", "5.8", "mmol/L", "3.5 - 5.1")));
ok("K in mg/dL skipped", !crit(T("Potassium", "18", "mg/dL", "")));
ok("Na 118 critical", crit(T("Sodium", "118", "mmol/L", "135 - 145")));
ok("Na 162 critical", crit(T("Sodium", "162", "mEq/L", "135 - 145")));
ok("Hb 6.2 critical", crit(T("Hb", "6.2", "g/dL", "12 - 15.5")));
ok("Hb 62 g/L -> 6.2 critical", crit(T("Hb", "62", "g/L", "120 - 155")));
ok("Hb 105 (no unit, >30 => g/L) not critical", !crit(T("Hb", "105", "", "")));
ok("Hb 21 critical high", crit(T("Hb", "21", "g/dL", "")));
ok("WBC 1.5 critical", crit(T("TLC", "1.5", "x10^9/L", "4 - 11")));
ok("WBC 35000/uL -> 35 critical", crit(T("TLC", "35000", "/cumm", "4000 - 11000")));
ok("WBC 7200/uL not critical", !crit(T("TLC", "7200", "/cumm", "4000 - 11000")));
ok("PLT 15 critical", crit(T("Platelets", "15", "x10^9/L", "150 - 450")));
ok("PLT 15,000/uL -> 15 critical", crit(T("Platelet Count", "15,000", "/cumm", "1,50,000 - 4,50,000")));
ok("PLT 0.15 lac/uL -> 15 critical", crit(T("Platelet Count", "0.15", "lac/cumm", "1.5 - 4.5")));
ok("PLT 1.5 lac (value text) not critical", !crit(T("Platelet Count", "1.5 lac", "/cumm", "1.5 - 4.5 lac")));
ok("PLT 1200 critical high", crit(T("PLT", "1200", "x10^9/L", "150 - 450")));
ok("Glucose 45 mg/dL critical", crit(T("BSR", "45", "mg/dL", "70 - 140")));
ok("Glucose 450 mg/dL critical", crit(T("Random Blood Sugar", "450", "mg/dL", "70 - 140")));
ok("Glucose 25 mmol/L -> 450 critical", crit(T("Glucose", "25", "mmol/L", "3.9 - 7.8")));
ok("Glucose 6.0 mmol/L not critical", !crit(T("Glucose", "6.0", "mmol/L", "3.9 - 7.8")));
ok("HbA1c 13 never uses glucose rule", !crit(T("HbA1c", "13", "%", "4.0 - 5.6")));
ok("Calcium 6.0 mg/dL critical", crit(T("Calcium", "6.0", "mg/dL", "8.5 - 10.5")));
ok("Calcium 3.5 mmol/L -> 14 critical", crit(T("Calcium", "3.5", "mmol/L", "2.1 - 2.6")));
ok("Calcium 2.3 mmol/L not critical", !crit(T("Calcium", "2.3", "mmol/L", "2.1 - 2.6")));
ok("Ionised calcium 1.2 mmol/L not critical", !crit(T("Ionized Calcium", "1.2", "mmol/L", "1.1 - 1.3")));
ok("INR 5.5 critical", crit(T("INR", "5.5", "", "0.8 - 1.2")));
ok("INR 3.0 not critical", !crit(T("INR", "3.0", "", "2.0 - 3.0")));
{
  const t = checkTest(T("Potassium", "6.5", "mmol/L", "3.5 - 7.0"));
  eq("danger overrides lab range: status high", t.status, "high");
  eq("danger severity critical", t.severity, "critical");
}

// ---- 5. Urgency tiers ----------------------------------------------------
const urg = (tests: ExtractedTest[]) => checkReport(report(tests), { personId: "p", source: "scan" }).urgency;
eq("urgency normal", urg([T("TSH", "2.1", "uIU/mL", "0.4 - 4.0")]), "normal");
eq("urgency routine (mild only)", urg([T("MCV", "76", "fL", "80 - 100")]), "routine");
eq("urgency soon (marked)", urg([T("HbA1c", "7.4", "%", "4.0 - 5.6")]), "soon");
eq("urgency emergency (critical)", urg([T("TSH", "2.1", "", "0.4 - 4.0"), T("K", "6.8", "mmol/L", "3.5 - 5.1")]), "emergency");
ok("URGENCY_RANK order", URGENCY_RANK.emergency > URGENCY_RANK.soon && URGENCY_RANK.soon > URGENCY_RANK.routine && URGENCY_RANK.routine > URGENCY_RANK.normal);
{
  const r = checkReport(report([T("K", "6.8", "mmol/L", "3.5 - 5.1"), T("MCV", "76", "fL", "80 - 100")], "bad-date"), {
    personId: "p",
    source: "scan",
    id: "r1",
    createdAt: "2026-10-10T08:00:00.000Z",
  });
  eq("id passthrough", r.id, "r1");
  eq("invalid reportDate falls back to createdAt date", r.reportDate, "2026-10-10");
  eq("critical reason first", r.urgencyReasons[0], "Potassium 6.8 mmol/L is above the danger level of 6.0");
  eq("flaggedCount", r.flaggedCount, 2);
}

// ---- 6. Sample report ----------------------------------------------------
const sample = checkReport(SAMPLE_EXTRACTION, { personId: "p", source: "sample", createdAt: "2026-10-10T08:00:00.000Z" });
eq("sample urgency soon", sample.urgency, "soon");
ok("sample nothing critical", sample.tests.every((t) => !t.critical));
{
  const a1c = sample.tests.find((t) => t.key === "hba1c");
  ok("sample HbA1c found", !!a1c);
  eq("sample HbA1c high", a1c?.status, "high");
  eq("sample HbA1c marked", a1c?.severity, "marked");
  eq("sample Hb key is hemoglobin (not hba1c)", sample.tests[0].key, "hemoglobin");
  eq("sample flaggedCount", sample.flaggedCount, 7);
  ok("sample reasons <= 4", sample.urgencyReasons.length <= 4 && sample.urgencyReasons.length > 0);
  ok("sample reasons mention HbA1c", sample.urgencyReasons.some((s) => s.startsWith("HbA1c 7.4 % is well above the normal range (4.0–5.6)")));
  // Code flags agree with the flags printed on the sample report.
  for (const t of sample.tests) {
    const printed = t.printedFlag === "H" ? "high" : t.printedFlag === "L" ? "low" : "normal";
    eq(`sample flag matches print: ${t.name}`, t.status, printed);
  }
}

// ---- 7. Demo family and trends -------------------------------------------
const fam = buildDemoFamily(new Date("2026-10-10T08:00:00.000Z"));
eq("demo people", fam.people.map((p) => p.name), ["Ammi", "Abbu", "Me"]);
ok("demo ids prefixed", [...fam.people, ...fam.reports, ...fam.messages].every((x) => x.id.startsWith("demo-")));
ok("demo reports source demo", fam.reports.every((r) => r.source === "demo"));
eq("demo active is Ammi", fam.people.find((p) => p.id === fam.activePersonId)?.name, "Ammi");
eq("demo message points to Ammi's latest report", fam.messages[0].reportId, fam.reports.find((r) => r.reportDate === "2026-10-08")?.id);
const abbu = fam.reports.find((r) => r.personId === "demo-abbu");
eq("Abbu urgency soon (LDL marked)", abbu?.urgency, "soon");
eq("Abbu flagged count", abbu?.flaggedCount, 3);
const ammiTrends = buildTrends(fam.reports, fam.activePersonId);
const a1cTrend = ammiTrends.find((t) => t.key === "hba1c");
ok("Ammi HbA1c trend exists", !!a1cTrend);
eq("Ammi HbA1c rising", a1cTrend?.direction, "up");
eq("Ammi HbA1c points", a1cTrend?.points.map((p) => p.value), [6.1, 7.4]);
eq("Ammi HbA1c summary", a1cTrend?.summary, "HbA1c rose from 6.1 % (Mar 2026) to 7.4 % (Oct 2026)");
ok("trends latest-abnormal first", ammiTrends.findIndex((t) => t.latestStatus === "normal") > ammiTrends.findIndex((t) => t.key === "hba1c"));
eq("Abbu has no trends (1 report)", buildTrends(fam.reports, "demo-abbu").length, 0);
eq("trend flat", buildTrends([
  checkReport(report([T("TSH", "2.0", "uIU/mL", "0.4 - 4.0")], "2026-01-05"), { personId: "x", source: "scan" }),
  checkReport(report([T("TSH", "2.05", "uIU/mL", "0.4 - 4.0")], "2026-06-05"), { personId: "x", source: "scan" }),
])[0]?.direction, "flat");

// ---- 7b. "See below" category tables and standard fallback ranges --------
{
  const seeBelow = checkTest(T("HbA1C (Glycosylated Hemoglobin)", "7.2", "%", "(See Below)"));
  eq("See below: HbA1c still checked (standard range)", seeBelow.status, "high");
  eq("See below: range marked standard", seeBelow.rangeSource, "standard");
  ok("See below: standard text shown", seeBelow.refRangeText.includes("5.7") && !!seeBelow.rangeNote);
  const table = checkTest(T("HbA1c", "7.2", "%", "Normal (<5.7 %) Pre-Diabetes (=5.7 - 6.4 %) Diabetes (>6.4 %)"));
  eq("category table: normal band used", table.refHigh, 5.7);
  eq("category table: from report, not standard", table.rangeSource, "report");
  eq("category table: 7.2 is high", table.status, "high");
  eq("category table: 5.2 is normal", checkTest(T("HbA1c", "5.2", "%", "Normal (<5.7 %) Pre-Diabetes (=5.7 - 6.4 %) Diabetes (>6.4 %)")).status, "normal");
  const vitd = checkTest(T("Vitamin D (25-OH)", "25", "ng/mL", "Deficient: < 20, Insufficient: 20 - 29, Sufficient: 30 - 100"));
  eq("vit D table: 'Sufficient' band (not 'Insufficient')", vitd.refLow, 30);
  eq("vit D table: 25 is low", vitd.status, "low");
  eq("cholesterol table: desirable band", checkTest(T("Total Cholesterol", "212", "mg/dL", "Desirable < 200; Borderline 200-239; High >= 240")).refHigh, 200);
  eq("no range + unknown test stays unknown", checkTest(T("Some Rare Marker", "3.1", "U/L", "")).status, "unknown");
  eq("standard range skipped for wrong unit", checkTest(T("HbA1c", "55", "mmol/mol", "")).status, "unknown");
  const minhaj = checkReport(report([T("HbA1C (Glycosylated Hemoglobin)", "7.2", "%", "(See Below)"), T("URIC ACID (SERUM)", "4.9", "mg/dL", "2.4 - 5.7")]), { personId: "x", source: "scan" });
  eq("Minhaj report: urgency soon (not normal)", minhaj.urgency, "soon");
  eq("Minhaj report: 1 flagged", minhaj.flaggedCount, 1);
}

const minhajLike = { ...report([T("HbA1c", "7.2", "%", "<5.7")], "2026-10-09"), patientName: "SHAZIA BANO", patientAge: "53 Year(s)", patientSex: "Female" };

// ---- 7b2. Translating an answer on tap: code checks no number changed ------
{
  const en = "Your Haemoglobin (HGB) is 8.3 g/dL (normal 12-16). 3 more are slightly outside: MCV 76 fL. Platelets 1,50,000.";
  const ur = "آپ کا ہیموگلوبن (HGB) 8.3 g/dL ہے (نارمل 12-16)۔ 3 مزید تھوڑی باہر ہیں: MCV 76 fL۔ پلیٹلیٹس 1,50,000۔";
  eq("numbers found (thousands commas ignored)", numbersIn(en), ["12", "150000", "16", "3", "76", "8.3"]);
  ok("faithful Urdu translation passes", numbersPreserved(en, ur));
  ok("Urdu digits count as the same number", numbersPreserved("Hb 8.3, normal 12-16", "ہیموگلوبن ۸٫۳، نارمل ۱۲-۱۶"));
  eq("Urdu digits normalised", normaliseDigits("۸٫۳"), "8.3");
  ok("a changed value is rejected", !numbersPreserved(en, ur.replace("8.3", "3.8")));
  ok("a dropped value is rejected", !numbersPreserved(en, ur.replace("MCV 76 fL۔ ", "")));
  ok("an added number is rejected", !numbersPreserved(en, `${ur} 1122 پر کال کریں۔`));
  ok("a number written as a word is rejected", !numbersPreserved(en, ur.replace("3 مزید", "تین مزید")));
  const sys = buildTranslateSystem("en", "ur");
  ok("translate prompt: translate only, keep numbers, text is data", /Translate only/.test(sys) && /Keep every number/.test(sys) && /not instructions/.test(sys));
}

// ---- 7c. Patient identity check (whose report is this?) -------------------
{
  ok("names: same person, extra surname", namesMatch("SHAZIA BANO", "Shazia"));
  ok("names: titles ignored", namesMatch("Mrs. Shazia Bano", "shazia bano"));
  ok("names: Muhammad/Mohammad spelling", namesMatch("Mohammad Ashraf", "Muhammad Ashraf"));
  ok("names: 'w/o husband' ignored", namesMatch("Shazia w/o Ahmed Ali", "Shazia Bano"));
  ok("names: shared common part is not a match", !namesMatch("Shazia Bano", "Nasreen Bano"));
  ok("names: different first names", !namesMatch("Muhammad Ashraf", "Muhammad Akram"));
  ok("names: relation words aren't real names", !isRealName("Ammi") && !isRealName("Me") && isRealName("Shazia"));
  eq("age: '53 Year(s)'", parseAge("53 Year(s)"), 53);
  eq("age: '58 Y'", parseAge("58 Y"), 58);
  eq("age: '5 Months'", Math.round((parseAge("5 Months") ?? 0) * 12), 5);
  eq("age: '10 Days' < 1 year", (parseAge("10 Days") ?? 9) < 0.1, true);
  eq("age: plain '62'", parseAge("62"), 62);
  // Chughtai prints the unit in brackets ("35 (Y)"), which used to leave the profile's age empty.
  eq("age: Chughtai '35 (Y)'", parseAge("35 (Y)"), 35);
  eq("age: '35(Y)'", parseAge("35(Y)"), 35);
  eq("age: '35 Yrs.'", parseAge("35 Yrs."), 35);
  eq("age: '35-Years'", parseAge("35-Years"), 35);
  eq("age: Chughtai baby '5 (M)' is months", Math.round((parseAge("5 (M)") ?? 0) * 12), 5);
  eq("age: '35/M' (age/sex together)", parseAge("35/M"), 35);
  eq("age: '35 / Female'", parseAge("35 / Female"), 35);
  eq("age: nothing readable", parseAge("N/A"), null);
  const oct26 = new Date("2026-10-11T12:00:00Z");
  eq("age now: 35 on a Dec 2023 report -> 38", ageNow(35, "2023-12-19", oct26), 38);
  eq("age now: same-week report unchanged", ageNow(35, "2026-10-09", oct26), 35);
  eq("age now: unreadable report date unchanged", ageNow(35, "", oct26), 35);
  const imranReports = [
    { personId: "e", reportDate: "2023-12-19", patient: { name: "IMRAN QURESHI .", age: "35 (Y)", sex: "M" } },
    { personId: "e", reportDate: "2022-01-05", patient: { name: "Imran Qureshi", age: "33 Y", sex: "M" } },
    { personId: "x", reportDate: "2026-10-01", patient: { name: "Other", age: "70", sex: "F" } },
  ];
  eq("newest report age for the edit sheet", latestReportAge(imranReports, "e", oct26), { printed: 35, now: 38, reportDate: "2023-12-19" });
  eq("no report age -> null", latestReportAge(imranReports, "nobody", oct26), null);
  eq("card line cleans name and age", patientLine({ name: "IMRAN QURESHI .", age: "35 (Y)", sex: "M" }, "en"), "Imran Qureshi · 35 yrs · Male");
  eq("card line keeps unreadable age as printed", patientLine({ name: "", age: "N/A", sex: "" }, "en"), "N/A");

  // One relation per chip (Brother and Sister, not "Brother / Sister").
  ok("relations: Brother and Sister are separate", RELATIONS.some((r) => r.value === "Brother") && RELATIONS.some((r) => r.value === "Sister"));
  ok("relations: no combined chips", RELATIONS.every((r) => !relationLabel(r.value, "en").includes("/")));
  eq("relation labels in Roman", [relationLabel("Brother", "roman"), relationLabel("Sister", "roman")], ["Bhai", "Behan"]);
  eq("relation implies sex", [relationSex("Sister"), relationSex("Brother"), relationSex("Self"), relationSex("Phuppo")], ["F", "M", "", ""]);
  eq("old 'Sibling' + Male reads as Brother", relationLabel("Sibling", "en", "M"), "Brother");
  eq("old 'Sibling' without sex still shown", relationLabel("Sibling", "en"), "Brother / Sister");
  eq("custom relation shown as typed", relationLabel("Phuppo", "en"), "Phuppo");
  eq("quick chips for a man", quickRelations("M").map((r) => r.value), ["Self", "Father", "Brother", "Husband", "Son"]);
  eq("quick chips, sex unknown", quickRelations("").map((r) => r.value), ["Self", "Mother", "Father"]);
  eq("subtitle: Brother · 38 yrs", personSubtitle({ id: "e", name: "Imran Qureshi", relation: "Brother", age: 38, sex: "M", createdAt: "" }, "en"), "Brother · 38 yrs");
  eq("sex: 'Female'", parseSex("Female"), "F");
  eq("sex: 'M'", parseSex("M"), "M");
  eq("sex: Urdu", parseSex("خاتون"), "F");

  const now = new Date("2026-10-10T12:00:00Z");
  const P = (id: string, name: string, age?: number, sex?: "M" | "F", reportNames?: string[]) =>
    ({ id, name, relation: "", age, sex, createdAt: "", reportNames }) as Person;
  const ammi = P("a", "Ammi", 58, "F");
  const abbu = P("b", "Abbu", 62, "M");
  const me = P("m", "Me");
  const fam = [ammi, abbu, me];
  const minhaj = { ...report([T("HbA1c", "7.2", "%", "<5.7")], "2026-10-09"), patientName: "SHAZIA BANO", patientAge: "53 Year(s)", patientSex: "Female" };
  const onAbbu = compareIdentity(minhaj, abbu, fam, now);
  eq("Abbu active + Female 53 report -> mismatch", onAbbu.status, "mismatch");
  ok("mismatch lists sex and age", onAbbu.conflicts.some((c) => c.kind === "sex") && onAbbu.conflicts.some((c) => c.kind === "age"));
  eq("Ammi (58 F) is 5 years off -> no suggestion", onAbbu.suggestedPersonId, undefined);
  const sample = { ...report([T("Hb", "10.6", "g/dL", "12-15.5")], "2026-10-08"), patientName: "Sample Patient", patientAge: "58 Years", patientSex: "F" };
  eq("Abbu active + sample (58 F) -> suggests Ammi", compareIdentity(sample, abbu, fam, now).suggestedPersonId, "a");
  eq("Ammi active + sample (58 F) -> ok", compareIdentity(sample, ammi, fam, now).status, "ok");
  eq("old report: age adjusted for report date", compareIdentity({ ...sample, reportDate: "2022-10-08", patientAge: "54 Y" }, ammi, fam, now).status, "ok");
  eq("no patient details -> unknown", compareIdentity({ ...sample, patientName: "", patientAge: "", patientSex: "" }, abbu, fam, now).status, "unknown");
  const known = P("a", "Ammi", undefined, "F", ["Shazia Bano"]);
  eq("known name matches -> ok", compareIdentity(minhaj, known, [known, abbu], now).status, "ok");
  const other = { ...minhaj, patientName: "Nasreen Akhtar" };
  ok("known name differs -> name conflict", compareIdentity(other, known, [known, abbu], now).conflicts.some((c) => c.kind === "name"));
  eq("profile with no details -> ok (nothing to contradict)", compareIdentity(minhaj, me, fam, now).status, "ok");
  const withPatient = checkReport(minhaj, { personId: "a", source: "scan" });
  eq("checkReport keeps the cleaned patient name for the card", withPatient.patient?.name, "Shazia Bano");
}

// ---- 7d. WhatsApp alerts (code-built text, phone formats) ----------------
{
  eq("phone: 0300-1234567", normalisePhone("0300-1234567"), "923001234567");
  eq("phone: +92 300 1234567", normalisePhone("+92 300 1234567"), "923001234567");
  eq("phone: 0092...", normalisePhone("00923001234567"), "923001234567");
  eq("phone: 3001234567", normalisePhone("3001234567"), "923001234567");
  eq("phone: +92 0300 typed with trunk zero", normalisePhone("+92 0300 1234567"), "923001234567");
  eq("phone: international", normalisePhone("+1 415 555 1234"), "14155551234");
  eq("phone: 1122 is not a WhatsApp number", normalisePhone("1122"), null);
  eq("phone: too-short Pakistani number", normalisePhone("0300 12345"), null);
  eq("phone: display", formatPhone("923001234567"), "+92 300 1234567");
  eq("link: chosen contact", waLink("hi there", "923001234567"), "https://wa.me/923001234567?text=hi%20there");
  eq("link: pick a chat", waLink("a&b"), "https://wa.me/?text=a%26b");
  const danger = checkReport(report([T("Potassium", "6.8", "mmol/L", "3.5 - 5.1"), T("Hb", "12.5", "g/dL", "12-15.5")], "2026-10-09"), { personId: "x", source: "scan" });
  eq("danger value -> emergency", danger.urgency, "emergency");
  const en = reportAlertText(danger, "Ammi", "en");
  ok("alert names the person", en.includes("Ammi"));
  ok("alert has the danger value from code", en.includes("Potassium 6.8") && en.includes("6.0"));
  ok("alert is calm: urgent check-up or ER", en.includes("checked on an urgent basis") && en.includes("ER"));
  ok("alert to a relative has no 1122/115 call order", !en.includes("1122") && !en.includes("115"));
  ok("alert says it's not a diagnosis", /not a diagnosis/i.test(en));
  ok("alert lists only danger values (not normal Hb)", !en.includes("Hb 12.5"));
  ok("Roman alert", reportAlertText(danger, "Ammi", "roman").includes("jald az jald doctor ko dikhayein"));
  ok("Urdu alert", reportAlertText(danger, "امی", "ur").includes("ایمرجنسی (ER)"));
  const kw = keywordAlertText(detectEmergency("Ammi ke seenay mein dard ho raha hai").category, "Ammi", "roman");
  ok("keyword alert names the signs, calmly", kw.includes("seenay mein dard") && kw.includes("ER") && !kw.includes("1122"));
}

// ---- 8. Store (Node with a fake window/localStorage) ---------------------
async function storeTests(): Promise<void> {
  const mem = new Map<string, string>();
  let quotaLimit = Infinity;
  const fakeStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > quotaLimit) {
        const e = new Error("quota");
        e.name = "QuotaExceededError";
        throw e;
      }
      mem.set(k, v);
    },
    removeItem: (k: string) => void mem.delete(k),
  };
  (globalThis as Record<string, unknown>).window = {
    localStorage: fakeStorage,
    addEventListener() {},
    removeEventListener() {},
  };
  const { shifa } = await import("@/lib/store");
  eq("store default lang roman", shifa.getState().lang, "roman");
  const p = shifa.addPerson({ name: "Nani", relation: "Grandmother", age: 80, sex: "F" });
  eq("addPerson makes first person active", shifa.getState().activePersonId, p.id);
  shifa.addPerson({ name: "Me", relation: "Self" });
  eq("second person does not steal active", shifa.getState().activePersonId, p.id);
  const m = shifa.addMessage({ personId: p.id, role: "user", text: "hi" });
  ok("addMessage fills id/createdAt", !!m.id && !!m.createdAt);
  shifa.updateMessage(m.id, { text: "hello" });
  eq("updateMessage patches", shifa.getState().messages.find((x) => x.id === m.id)?.text, "hello");
  shifa.updateMessage(m.id, { translations: { ur: "ہیلو" } });
  eq("translation saved with the message", shifa.getState().messages.find((x) => x.id === m.id)?.translations?.ur, "ہیلو");
  eq("translation kept on a translations-only patch", shifa.getState().messages.find((x) => x.id === m.id)?.text, "hello");
  shifa.updateMessage(m.id, { text: "re-explained" });
  eq("new text clears stale translations", shifa.getState().messages.find((x) => x.id === m.id)?.translations, undefined);
  for (let i = 0; i < 210; i++) shifa.addMessage({ personId: p.id, role: "assistant", text: "x" + i });
  eq("history capped at 200 per person", shifa.getState().messages.filter((x) => x.personId === p.id).length, 200);
  ok("persisted to shifa:v1", (mem.get("shifa:v1") ?? "").includes("Nani"));
  shifa.loadDemoFamily();
  shifa.loadDemoFamily();
  const s = shifa.getState();
  eq("demo loaded once (no duplicates)", s.people.filter((x) => x.id.startsWith("demo-")).length, 3);
  eq("demo reports once", s.reports.filter((r) => r.source === "demo").length, 3);
  eq("demo Ammi active", s.people.find((x) => x.id === s.activePersonId)?.name, "Ammi");
  ok("demo sets onboarded", s.onboarded);
  quotaLimit = (mem.get("shifa:v1") ?? "").length - 500;
  shifa.addMessage({ personId: p.id, role: "user", text: "after quota" });
  ok("quota error drops oldest messages and still saves", (mem.get("shifa:v1") ?? "").includes("after quota"));
  quotaLimit = Infinity;
  shifa.resetAll();
  eq("resetAll clears", shifa.getState().people.length, 0);
  ok("resetAll removes storage", !mem.has("shifa:v1"));

  // Google accounts: guest data moves into the first account; accounts stay separate on one device.
  shifa.setLang("ur");
  shifa.addPerson({ name: "Me", relation: "Self" });
  shifa.addPerson({ name: "Ammi", relation: "Mother" });
  shifa.switchAccount("google-111", { displayName: "Saad Mehmood" });
  eq("sign-in: account active", shifa.getAccount(), "google-111");
  eq("sign-in: guest data moved into account", shifa.getState().people.length, 2);
  ok("sign-in: guest storage cleared", !mem.has("shifa:v1"));
  ok("sign-in: 'Me' renamed to Google first name", shifa.getState().people.some((x) => x.relation === "Self" && x.name === "Saad"));
  eq("sign-in: language kept", shifa.getState().lang, "ur");
  shifa.switchAccount(null);
  eq("sign-out: guest space is empty", shifa.getState().people.length, 0);
  shifa.switchAccount("google-222", { displayName: "Eman" });
  eq("second account starts empty", shifa.getState().people.length, 0);
  shifa.addPerson({ name: "Abbu", relation: "Father" });
  shifa.switchAccount("google-111");
  eq("first account still has its own data", shifa.getState().people.map((x) => x.name).sort().join(","), "Ammi,Saad");
  shifa.switchAccount("google-222");
  eq("second account kept its data", shifa.getState().people[0]?.name, "Abbu");
  shifa.switchAccount(null);

  // Backup / Restore: round trip, idempotent merge, junk rejected, tampered records dropped.
  shifa.loadDemoFamily();
  const before = shifa.getState();
  const file = shifa.exportBackup();
  ok("backup is a Shifa file", JSON.parse(file).app === "shifa" && JSON.parse(file).kind === "backup");
  shifa.resetAll();
  const r1 = shifa.importBackup(file);
  ok("restore succeeds", r1.ok);
  eq("restore brings back every person", shifa.getState().people.length, before.people.length);
  eq("restore brings back every report", shifa.getState().reports.length, before.reports.length);
  eq("restore brings back every message", shifa.getState().messages.length, before.messages.length);
  const r2 = shifa.importBackup(file);
  ok("restoring twice adds nothing", r2.ok && r2.people + r2.reports + r2.messages === 0);
  shifa.addPerson({ name: "Phuppo", relation: "Aunt" });
  shifa.importBackup(file);
  ok("restore merges, never overwrites", shifa.getState().people.some((x) => x.name === "Phuppo"));
  ok("junk text rejected", !shifa.importBackup("not json").ok);
  ok("other JSON rejected", !shifa.importBackup(JSON.stringify({ hello: 1 })).ok);
  shifa.resetAll();
  const bad = JSON.parse(file);
  bad.data.reports[0].urgency = "launch-missiles";
  bad.data.messages.push({ id: "x1", personId: "nobody", role: "assistant", text: "orphan", createdAt: "2026-10-10" });
  const r3 = shifa.importBackup(JSON.stringify(bad));
  ok("tampered report dropped", r3.ok && r3.reports === before.reports.length - 1);
  ok("orphan message dropped", !shifa.getState().messages.some((m) => m.id === "x1"));
  shifa.resetAll();

  // Family alert numbers
  ok("add alert number", !!shifa.addContact({ name: "Bhai", phone: "923001234567" }));
  ok("same number not added twice", shifa.addContact({ name: "Bhai 2", phone: "923001234567" }) === null);
  shifa.addContact({ name: "Baji", phone: "923211234567" });
  shifa.addContact({ name: "Abbu", phone: "923331234567" });
  ok("max 3 numbers", shifa.addContact({ name: "Extra", phone: "923451234567" }) === null);
  ok("bad number rejected", shifa.addContact({ name: "X", phone: "1122" }) === null);
  shifa.removeContact(shifa.getState().contacts[0].id);
  eq("remove alert number", shifa.getState().contacts.length, 2);
  shifa.resetAll();

  // Family profiles: duplicate merged, profile deleted, name lookup blocks duplicates
  const b1 = shifa.addPerson({ name: "Shazia Bano", relation: "", age: 53, sex: "F" });
  shifa.rememberReportName(b1.id, "SHAZIA BANO");
  const b2 = shifa.addPerson({ name: "Shazia Bano", relation: "Mother" });
  shifa.addReport({ ...checkReport(minhajLike, { personId: b2.id, source: "scan" }), id: "r-dup" });
  shifa.addMessage({ personId: b2.id, role: "assistant", text: "explained", reportId: "r-dup" });
  ok("name lookup finds the existing profile", findPersonByName(shifa.getState().people, "Mrs. Shazia Bano")?.id === b1.id);
  shifa.mergePeople(b2.id, b1.id);
  const st = shifa.getState();
  eq("merge: one profile left", st.people.length, 1);
  eq("merge: report moved", st.reports.find((r) => r.id === "r-dup")?.personId, b1.id);
  ok("merge: chat moved", st.messages.every((m) => m.personId === b1.id));
  eq("merge: relation filled from the duplicate", st.people[0].relation, "Mother");
  eq("merge: age kept", st.people[0].age, 53);
  shifa.deletePerson(b1.id);
  eq("delete: profile gone", shifa.getState().people.length, 0);
  eq("delete: their reports gone", shifa.getState().reports.length, 0);
  eq("delete: their chat gone", shifa.getState().messages.length, 0);
  shifa.resetAll();
}

storeTests()
  .catch((e) => failures.push("store: " + (e as Error).message))
  .finally(() => {
    console.log("\nSample report:", sample.urgency, "|", sample.urgencyReasons.join(" / "));
    for (const r of fam.reports) console.log(`Demo ${r.id}: ${r.urgency}, ${r.flaggedCount} flagged | ${r.urgencyReasons.join(" / ")}`);
    console.log("Ammi trends:", ammiTrends.map((t) => t.summary).join(" | "));
    if (failures.length) {
      console.error(`\nFAILED ${failures.length} of ${passed + failures.length} checks:`);
      for (const f of failures) console.error("  - " + f);
      process.exit(1);
    }
    console.log(`\nselftest: all ${passed} checks passed`);
  });
