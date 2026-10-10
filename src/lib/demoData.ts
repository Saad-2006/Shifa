// Demo family and the sample report. Everything here is FICTIONAL.
// Flags and urgency are never hard-coded: every report goes through labRules.checkReport.
import type { ChatMessage, ExtractedReport, ExtractedTest, LabReport, Person } from "@/lib/types";
import { checkReport } from "@/lib/labRules";

/** Compact test builder: [panel, name, value, unit, refRangeText, refLow, refHigh, flag]. */
type Row = [string, string, string, string, string, number | null, number | null, string];
function tests(rows: Row[]): ExtractedTest[] {
  return rows.map(([panel, name, value, unit, refRangeText, refLow, refHigh, printedFlag]) => ({
    panel,
    name,
    value,
    numericValue: Number.isFinite(Number(value)) ? Number(value) : null,
    unit,
    refRangeText,
    refLow,
    refHigh,
    printedFlag,
  }));
}

const CBC = "Complete Blood Count (CBC)";
const SUGAR = "Diabetes Profile";
const RENAL_LIVER = "Kidney & Liver Function";
const THYROID = "Thyroid Function";
const LIPID = "Lipid Profile";
const VITAMIN = "Vitamins";
const X9 = "×10⁹/L"; // ×10⁹/L
const X12 = "×10¹²/L"; // ×10¹²/L

/** Exactly what is printed on public/samples/sample-report.png (rendered from scripts/sample-report.html). */
export const SAMPLE_EXTRACTION: ExtractedReport = {
  isLabReport: true,
  labName: "Shifa Demo Diagnostics (sample)",
  reportDate: "2026-10-08",
  patientName: "Sample Patient",
  patientAge: "58",
  patientSex: "F",
  tests: tests([
    [CBC, "Haemoglobin (Hb)", "10.6", "g/dL", "12.0 - 15.5", 12.0, 15.5, "L"],
    [CBC, "Total Leucocyte Count (TLC)", "7.2", X9, "4.0 - 11.0", 4.0, 11.0, ""],
    [CBC, "Platelet Count", "245", X9, "150 - 450", 150, 450, ""],
    [CBC, "RBC Count", "4.0", X12, "4.2 - 5.4", 4.2, 5.4, "L"],
    [CBC, "MCV", "76", "fL", "80 - 100", 80, 100, "L"],
    [SUGAR, "Glucose Fasting", "156", "mg/dL", "70 - 100", 70, 100, "H"],
    [SUGAR, "HbA1c", "7.4", "%", "4.0 - 5.6", 4.0, 5.6, "H"],
    [RENAL_LIVER, "Serum Creatinine", "1.0", "mg/dL", "0.6 - 1.1", 0.6, 1.1, ""],
    [RENAL_LIVER, "ALT (SGPT)", "28", "U/L", "0 - 35", 0, 35, ""],
    [THYROID, "TSH", "2.1", "µIU/mL", "0.4 - 4.0", 0.4, 4.0, ""],
    [LIPID, "Total Cholesterol", "212", "mg/dL", "< 200", null, 200, "H"],
    [VITAMIN, "Vitamin D (25-OH)", "14", "ng/mL", "30 - 100", 30, 100, "L"],
  ]),
  notes: "",
};

// Ammi's older report, from a different (fictional) lab that prints names differently:
// the alias table maps "Glycosylated Haemoglobin", "FBS", "Hb", "TLC", "Platelets" to the same keys.
const AMMI_MARCH: ExtractedReport = {
  isLabReport: true,
  labName: "Demo Community Lab (fictional)",
  reportDate: "2026-03-12",
  patientName: "Ammi",
  patientAge: "57",
  patientSex: "F",
  tests: tests([
    ["Haematology", "Hb", "11.2", "g/dL", "12.0 - 15.5", 12.0, 15.5, "L"],
    ["Haematology", "TLC", "6.8", X9, "4.0 - 11.0", 4.0, 11.0, ""],
    ["Haematology", "Platelets", "262", X9, "150 - 450", 150, 450, ""],
    ["Haematology", "RBC", "4.3", X12, "4.2 - 5.4", 4.2, 5.4, ""],
    ["Haematology", "MCV", "81", "fL", "80 - 100", 80, 100, ""],
    ["Chemistry", "Fasting Blood Sugar (FBS)", "118", "mg/dL", "70 - 100", 70, 100, "H"],
    ["Chemistry", "Glycosylated Haemoglobin (HbA1c)", "6.1", "%", "4.0 - 5.6", 4.0, 5.6, "H"],
    ["Chemistry", "S. Cholesterol", "198", "mg/dL", "< 200", null, 200, ""],
    ["Chemistry", "25-OH Vitamin D", "18", "ng/mL", "30 - 100", 30, 100, "L"],
  ]),
  notes: "",
};

const ABBU_SEPT: ExtractedReport = {
  isLabReport: true,
  labName: "Demo Community Lab (fictional)",
  reportDate: "2026-09-20",
  patientName: "Abbu",
  patientAge: "62",
  patientSex: "M",
  tests: tests([
    [LIPID, "LDL Cholesterol", "165", "mg/dL", "< 130", null, 130, "H"],
    [LIPID, "HDL Cholesterol", "38", "mg/dL", "> 40", 40, null, "L"],
    ["Renal Function", "Serum Creatinine", "1.3", "mg/dL", "0.7 - 1.2", 0.7, 1.2, "H"],
    ["Renal Function", "Blood Urea", "38", "mg/dL", "15 - 45", 15, 45, ""],
    ["Electrolytes", "Serum Potassium", "4.6", "mmol/L", "3.5 - 5.1", 3.5, 5.1, ""],
  ]),
  notes: "",
};

export const DEMO_IDS = {
  ammi: "demo-ammi",
  abbu: "demo-abbu",
  me: "demo-me",
  ammiMarch: "demo-report-ammi-2026-03",
  ammiOct: "demo-report-ammi-2026-10",
  abbuSept: "demo-report-abbu-2026-09",
  ammiMsg: "demo-msg-ammi-1",
} as const;

export function buildDemoFamily(now: Date = new Date()): {
  people: Person[];
  reports: LabReport[];
  messages: ChatMessage[];
  activePersonId: string;
} {
  const nowIso = now.toISOString();
  const people: Person[] = [
    { id: DEMO_IDS.ammi, name: "Ammi", relation: "Mother", age: 58, sex: "F", createdAt: nowIso },
    { id: DEMO_IDS.abbu, name: "Abbu", relation: "Father", age: 62, sex: "M", createdAt: nowIso },
    { id: DEMO_IDS.me, name: "Me", relation: "Self", createdAt: nowIso },
  ];

  const reports: LabReport[] = [
    checkReport(AMMI_MARCH, { personId: DEMO_IDS.ammi, source: "demo", id: DEMO_IDS.ammiMarch, createdAt: "2026-03-12T12:00:00.000Z" }),
    checkReport(
      { ...SAMPLE_EXTRACTION, patientName: "Ammi" },
      { personId: DEMO_IDS.ammi, source: "demo", id: DEMO_IDS.ammiOct, createdAt: "2026-10-08T12:00:00.000Z" },
    ),
    checkReport(ABBU_SEPT, { personId: DEMO_IDS.abbu, source: "demo", id: DEMO_IDS.abbuSept, createdAt: "2026-09-20T12:00:00.000Z" }),
  ];

  const messages: ChatMessage[] = [
    {
      id: DEMO_IDS.ammiMsg,
      personId: DEMO_IDS.ammi,
      role: "assistant",
      reportId: DEMO_IDS.ammiOct,
      lang: "roman",
      createdAt: nowIso,
      text:
        "Ammi ki October ki report mein sugar (HbA1c 7.4%) aur fasting sugar (156) zyada hain, aur March (6.1%) se barh gaye hain. " +
        "Khoon (Hb 10.6) thora kam hai aur Vitamin D bhi kam hai. Koi khatarnaak value nahi hai, lekin is hafte doctor ko zaroor dikhayein. " +
        "Yeh tashkhees (diagnosis) nahi hai; neeche har value ki tafseel hai.",
    },
  ];

  return { people, reports, messages, activePersonId: DEMO_IDS.ammi };
}
