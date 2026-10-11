// Deterministic answers used when Gemini is not configured (or unreachable in an emergency).
// Built only from the report data that labRules already checked: no AI, no guessing.

import { detectEmergency, EMERGENCY_SENTINEL } from "@/lib/emergency";
import { canonicalKey } from "@/lib/labRules";
import { isFlagged, pickFocusReport, rangeText } from "@/lib/prompts";
import type { ChatRequest, CheckedTest, Lang, LabReport, Person, TestStatus, Urgency } from "@/lib/types";

interface Templates {
  reportOf: (p: Person) => string; // "Ammi's report"
  urgency: Record<Urgency, (report: string) => string>;
  next: Record<Urgency, string>;
  attention: string;
  noneFlagged: string;
  questionsHeader: string;
  causeQuestion: (t: CheckedTest) => string;
  repeatQuestion: string;
  generalQuestions: [string, string];
  status: Record<TestStatus, string>;
  normal: string;
  danger: string;
  andMore: (n: number) => string;
  offline: string;
  emergency: string;
  noReports: (p: Person) => string;
  testAnswer: (o: { report: string; date: string; lab: string; name: string; value: string; range: string; status: string }) => string;
  earlier: (items: string) => string;
  checkedByCode: string;
  summary: (o: { report: string; date: string; flagged: number; total: number; names: string }) => string;
  allNormalSummary: (o: { report: string; date: string; total: number }) => string;
  aiOffline: (example: string) => string;
  on: string;
}

const isSelf = (p: Person) => /^(self|me|myself|khud|خود)$/i.test((p.relation ?? "").trim());

const EN: Templates = {
  reportOf: (p) => (isSelf(p) || !p.name ? "Your report" : `${p.name}'s report`),
  urgency: {
    emergency: (r) => `${r} has at least one value at a danger level. It needs a doctor's attention today.`,
    soon: (r) => `${r} has values that need a doctor's attention this week.`,
    routine: (r) => `${r} has a few values slightly outside the normal range. Nothing urgent.`,
    normal: (r) => `${r} looks normal: all checked values are within the normal range.`,
  },
  next: {
    emergency: "Please get checked by a doctor today, or go to the ER if they feel unwell.",
    soon: "Please see a doctor within this week and take this report with you.",
    routine: "Show this report to the doctor at the next regular visit.",
    normal: "Nothing urgent. Keep up regular check-ups.",
  },
  attention: "Values that need attention:",
  noneFlagged: "No values are outside the normal range.",
  questionsHeader: "Questions to ask the doctor:",
  causeQuestion: (t) => `What could be the reason for the ${t.status === "low" ? "low" : "high"} ${t.name}?`,
  repeatQuestion: "Do we need to repeat this test, and when?",
  generalQuestions: ["Are any follow-up tests needed?", "When should these tests be repeated?"],
  status: { low: "low", high: "high", normal: "normal", unknown: "no normal range printed" },
  normal: "normal",
  danger: "DANGER LEVEL",
  andMore: (n) => `- and ${n} more`,
  offline: "(Basic answer: the live AI wasn't available)",
  emergency: "This could be serious. If it is happening now, call 1122 or go to the nearest hospital emergency. Don't wait for an online answer.",
  noReports: (p) => `There are no reports for ${p.name || "this person"} yet. Attach a lab report photo or PDF and Shifa will check it.`,
  testAnswer: (o) => `In ${o.report.toLowerCase().startsWith("your") ? "your report" : o.report} of ${o.date}${o.lab ? ` (${o.lab})` : ""}, ${o.name} is ${o.value}${o.range ? ` (normal: ${o.range})` : ""}, which is ${o.status}.`,
  earlier: (items) => `Earlier: ${items}.`,
  checkedByCode: "This was checked by Shifa's rules. Please discuss it with the doctor.",
  summary: (o) => `${o.report} of ${o.date}: ${o.flagged} of ${o.total} values need attention (${o.names}).`,
  allNormalSummary: (o) => `${o.report} of ${o.date}: all ${o.total} checked values are within the normal range.`,
  aiOffline: (ex) => `The AI assistant is offline right now, so I can't answer that question. You can ask about a test by name${ex ? `, e.g. "${ex}"` : ""}.`,
  on: "on",
};

const ROMAN: Templates = {
  reportOf: (p) => (isSelf(p) || !p.name ? "Aap ki report" : `${p.name} ki report`),
  urgency: {
    emergency: (r) => `${r} mein kam az kam aik value khatarnak level par hai. Aaj hi doctor ki tawajjo chahiye.`,
    soon: (r) => `${r} mein kuch values aisi hain jin par is hafte doctor ki tawajjo chahiye.`,
    routine: (r) => `${r} mein kuch values normal range se thori bahar hain. Koi jaldi wali baat nahi.`,
    normal: (r) => `${r} normal hai: sab check ki gayi values normal range mein hain.`,
  },
  next: {
    emergency: "Aaj hi doctor se check karwayein, ya tabiyat kharab ho to ER le jaein.",
    soon: "Is hafte doctor ko zaroor dikhaein aur ye report saath le kar jaein.",
    routine: "Agli regular visit par doctor ko ye report dikha dein.",
    normal: "Koi jaldi wali baat nahi. Regular check-up karwate rahein.",
  },
  attention: "Jin values par dhyan dena hai:",
  noneFlagged: "Koi value normal range se bahar nahi hai.",
  questionsHeader: "Doctor se ye sawal poochein:",
  causeQuestion: (t) => `${t.name} ${t.status === "low" ? "kam" : "zyada"} hone ki kya wajah ho sakti hai?`,
  repeatQuestion: "Kya ye test dobara karwana hai, aur kab?",
  generalQuestions: ["Kya koi aur test karwana chahiye?", "Ye tests dobara kab karwane hain?"],
  status: { low: "kam (low)", high: "zyada (high)", normal: "normal", unknown: "normal range print nahi hai" },
  normal: "normal",
  danger: "KHATARNAK LEVEL",
  andMore: (n) => `- aur ${n} values`,
  offline: "(Basic jawab: live AI dastyab nahi tha)",
  emergency: "Ye serious ho sakta hai. Agar abhi ho raha hai to 1122 par call karein ya qareebi hospital ki emergency mein jaein. Online jawab ka intezar na karein.",
  noReports: (p) => `${p.name || "Is shakhs"} ki abhi koi report nahi hai. Lab report ki photo ya PDF attach karein, Shifa check kar degi.`,
  testAnswer: (o) => `${o.report} (${o.date}${o.lab ? `, ${o.lab}` : ""}) mein ${o.name} ${o.value} hai${o.range ? ` (normal: ${o.range})` : ""}, yani ${o.status}.`,
  earlier: (items) => `Pehle: ${items}.`,
  checkedByCode: "Ye Shifa ke rules ne check kiya hai. Is bare mein doctor se zaroor baat karein.",
  summary: (o) => `${o.report} (${o.date}): ${o.total} mein se ${o.flagged} values par dhyan dena hai (${o.names}).`,
  allNormalSummary: (o) => `${o.report} (${o.date}): sab ${o.total} values normal range mein hain.`,
  aiOffline: (ex) => `AI assistant abhi offline hai, is liye main ye sawal ka jawab nahi de sakti. Aap kisi test ka naam le kar pooch sakte hain${ex ? `, jaise "${ex}"` : ""}.`,
  on: "",
};

const UR: Templates = {
  reportOf: (p) => (isSelf(p) || !p.name ? "آپ کی رپورٹ" : `${p.name} کی رپورٹ`),
  urgency: {
    emergency: (r) => `${r} میں کم از کم ایک ویلیو خطرناک حد پر ہے۔ آج ہی ڈاکٹر کی توجہ چاہیے۔`,
    soon: (r) => `${r} میں کچھ ویلیوز ایسی ہیں جن پر اس ہفتے ڈاکٹر کی توجہ چاہیے۔`,
    routine: (r) => `${r} میں کچھ ویلیوز نارمل رینج سے تھوڑی باہر ہیں۔ کوئی جلدی والی بات نہیں۔`,
    normal: (r) => `${r} نارمل ہے: تمام چیک کی گئی ویلیوز نارمل رینج میں ہیں۔`,
  },
  next: {
    emergency: "آج ہی ڈاکٹر سے چیک کروائیں، یا طبیعت خراب ہو تو ای آر لے جائیں۔",
    soon: "اس ہفتے ڈاکٹر کو ضرور دکھائیں اور یہ رپورٹ ساتھ لے جائیں۔",
    routine: "اگلی باقاعدہ ملاقات پر ڈاکٹر کو یہ رپورٹ دکھا دیں۔",
    normal: "کوئی جلدی والی بات نہیں۔ باقاعدہ چیک اپ کرواتے رہیں۔",
  },
  attention: "جن ویلیوز پر توجہ دینی ہے:",
  noneFlagged: "کوئی ویلیو نارمل رینج سے باہر نہیں ہے۔",
  questionsHeader: "ڈاکٹر سے یہ سوال پوچھیں:",
  causeQuestion: (t) => `${t.name} ${t.status === "low" ? "کم" : "زیادہ"} ہونے کی کیا وجہ ہو سکتی ہے؟`,
  repeatQuestion: "کیا یہ ٹیسٹ دوبارہ کروانا ہے، اور کب؟",
  generalQuestions: ["کیا کوئی اور ٹیسٹ کروانا چاہیے؟", "یہ ٹیسٹ دوبارہ کب کروانے ہیں؟"],
  status: { low: "کم (low)", high: "زیادہ (high)", normal: "نارمل", unknown: "نارمل رینج درج نہیں" },
  normal: "نارمل",
  danger: "خطرناک حد",
  andMore: (n) => `- اور ${n} ویلیوز`,
  offline: "(سادہ جواب: لائیو AI دستیاب نہیں تھا)",
  emergency: "یہ سنجیدہ ہو سکتا ہے۔ اگر ابھی ہو رہا ہے تو 1122 پر کال کریں یا قریبی ہسپتال کی ایمرجنسی میں جائیں۔ آن لائن جواب کا انتظار نہ کریں۔",
  noReports: (p) => `${p.name || "اس فرد"} کی ابھی کوئی رپورٹ نہیں ہے۔ لیب رپورٹ کی تصویر یا PDF لگائیں، شفا اسے چیک کر دے گی۔`,
  testAnswer: (o) => `${o.report} (${o.date}${o.lab ? `، ${o.lab}` : ""}) میں ${o.name} ${o.value} ہے${o.range ? ` (نارمل: ${o.range})` : ""}، یعنی ${o.status}۔`,
  earlier: (items) => `پہلے: ${items}۔`,
  checkedByCode: "یہ شفا کے اصولوں نے چیک کیا ہے۔ اس بارے میں ڈاکٹر سے ضرور بات کریں۔",
  summary: (o) => `${o.report} (${o.date}): ${o.total} میں سے ${o.flagged} ویلیوز پر توجہ دینی ہے (${o.names})۔`,
  allNormalSummary: (o) => `${o.report} (${o.date}): تمام ${o.total} ویلیوز نارمل رینج میں ہیں۔`,
  aiOffline: (ex) => `AI اسسٹنٹ ابھی آف لائن ہے، اس لیے میں اس سوال کا جواب نہیں دے سکتی۔ آپ کسی ٹیسٹ کا نام لے کر پوچھ سکتے ہیں${ex ? `، جیسے "${ex}"` : ""}۔`,
  on: "",
};

const TEMPLATES: Record<Lang, Templates> = { en: EN, roman: ROMAN, ur: UR };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function prettyDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
  if (!m) return d || "?";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

function valueWithUnit(t: CheckedTest): string {
  const v = (t.value || (t.numericValue !== null && t.numericValue !== undefined ? String(t.numericValue) : "")).trim();
  return [v || "?", (t.unit || "").trim()].filter(Boolean).join(" ");
}

const SEVERITY_RANK: Record<string, number> = { critical: 3, marked: 2, mild: 1, none: 0 };

function sortFlagged(tests: CheckedTest[]): CheckedTest[] {
  return tests
    .filter(isFlagged)
    .sort((a, b) => Number(b.critical) - Number(a.critical) || (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));
}

function testsOf(r: LabReport): CheckedTest[] {
  return Array.isArray(r.tests) ? r.tests : [];
}

function flaggedLine(t: CheckedTest, T: Templates): string {
  const range = rangeText(t);
  const status = t.status === "low" || t.status === "high" ? T.status[t.status] : "";
  const tail = [status, t.critical ? T.danger : ""].filter(Boolean).join(", ");
  return `- ${t.name}: ${valueWithUnit(t)}${range ? ` (${T.normal}: ${range})` : ""}${tail ? ` — ${tail}` : ""}`;
}

function explainReport(req: ChatRequest, T: Templates): string {
  const focus = pickFocusReport(req.reports, req.focusReportId);
  if (!focus) return T.noReports(req.person);
  const report = T.reportOf(req.person);
  const flagged = sortFlagged(testsOf(focus));
  const out: string[] = [T.urgency[focus.urgency]?.(report) ?? T.urgency.routine(report), ""];

  if (flagged.length) {
    out.push(T.attention);
    const shown = flagged.slice(0, 8);
    for (const t of shown) out.push(flaggedLine(t, T));
    if (flagged.length > shown.length) out.push(T.andMore(flagged.length - shown.length));
  } else {
    out.push(T.noneFlagged);
  }
  out.push("", T.next[focus.urgency] ?? T.next.routine, "", T.questionsHeader);
  const qs = flagged.length ? [T.causeQuestion(flagged[0]), T.repeatQuestion] : T.generalQuestions;
  for (const q of qs) out.push(`- ${q}`);
  out.push("", T.offline);
  return out.join("\n");
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function safeKey(name: string): string {
  try {
    return canonicalKey(name) || "";
  } catch {
    return "";
  }
}

/** Find the test key the question is about: n-grams of the question mapped through canonicalKey, or a name substring. */
export function findMentionedKey(question: string, reports: LabReport[]): string | null {
  const keyOf = (t: CheckedTest) => t.key || safeKey(t.name);
  const known = new Map<string, CheckedTest>();
  for (const r of [...reports]) for (const t of testsOf(r)) {
    const k = keyOf(t);
    if (k && !known.has(k)) known.set(k, t);
  }
  if (!known.size) return null;

  const q = normName(question);
  if (!q) return null;
  // 1) A printed test name (or its key) appears in the question; prefer the longest name.
  let best: { key: string; len: number } | null = null;
  for (const r of reports) for (const t of testsOf(r)) {
    for (const n of [normName(t.name), normName(keyOf(t).replace(/_/g, " "))]) {
      if (n.length < 2) continue;
      if (` ${q} `.includes(` ${n} `) && (!best || n.length > best.len)) best = { key: keyOf(t), len: n.length };
    }
  }
  if (best) return best.key;
  // 2) n-grams (longest first) through canonicalKey, to catch aliases like "sugar" or "hb".
  const words = q.split(" ").filter(Boolean);
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n).join(" ");
      if (gram.length < 2) continue;
      const k = safeKey(gram);
      if (k && known.has(k)) return k;
    }
  }
  return null;
}

function chatAnswer(req: ChatRequest, question: string, T: Templates): string {
  const reports = [...req.reports].sort(
    (a, b) => (b.reportDate || "").localeCompare(a.reportDate || "") || (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
  if (!reports.length) return `${T.noReports(req.person)}\n\n${T.offline}`;
  const report = T.reportOf(req.person);
  const key = findMentionedKey(question, reports);

  if (key) {
    const hits: { r: LabReport; t: CheckedTest }[] = [];
    for (const r of reports) {
      const t = testsOf(r).find((x) => (x.key || safeKey(x.name)) === key);
      if (t) hits.push({ r, t });
    }
    if (hits.length) {
      const [{ r, t }, ...older] = hits;
      const status = T.status[t.status] ?? t.status;
      const out = [
        T.testAnswer({
          report,
          date: prettyDate(r.reportDate),
          lab: r.labName,
          name: t.name,
          value: valueWithUnit(t),
          range: rangeText(t),
          status: t.critical ? `${status}, ${T.danger}` : status,
        }),
      ];
      if (t.critical && t.criticalReason) out.push(t.criticalReason);
      if (older.length) {
        const items = older
          .slice(0, 3)
          .map(({ r: o, t: x }) => `${valueWithUnit(x)}${T.on ? ` ${T.on}` : ""} ${prettyDate(o.reportDate)}`)
          .join("; ");
        out.push(T.earlier(items));
      }
      out.push(T.checkedByCode);
      return `${out.join(" ")}\n\n${T.offline}`;
    }
  }

  const focus = pickFocusReport(reports, req.focusReportId) ?? reports[0];
  const tests = testsOf(focus);
  const flagged = sortFlagged(tests);
  const summary = flagged.length
    ? T.summary({
        report,
        date: prettyDate(focus.reportDate),
        flagged: flagged.length,
        total: tests.length,
        names: flagged.slice(0, 4).map((t) => t.name).join(", ") + (flagged.length > 4 ? ", …" : ""),
      })
    : T.allNormalSummary({ report, date: prettyDate(focus.reportDate), total: tests.length });
  const example = (flagged[0] ?? tests[0])?.name ?? "";
  return [summary, T.next[focus.urgency] ?? "", "", T.aiOffline(example), "", T.offline].join("\n").replace(/\n{3,}/g, "\n\n");
}

function lastUserText(req: ChatRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    if (req.messages[i].role === "user") return req.messages[i].text ?? "";
  }
  return "";
}

/**
 * Deterministic answer for when there is no AI. Starts with EMERGENCY_SENTINEL + "\n" when code
 * flags it, the same way as the chat route: typed emergency words (with the calm 1122 line), or
 * explaining a report with danger values (its own "doctor today / ER" line is in the body).
 */
export function offlineAnswer(req: ChatRequest): string {
  const T = TEMPLATES[req.lang] ?? EN;
  const question = lastUserText(req);
  const focus = pickFocusReport(req.reports, req.focusReportId);
  const detected = detectEmergency(question).isEmergency;

  let body: string;
  if (req.task === "explain_report") body = explainReport(req, T);
  else if (detected) body = T.offline; // keep an emergency reply short
  else body = chatAnswer(req, question, T);

  if (detected) return `${EMERGENCY_SENTINEL}\n${T.emergency}\n\n${body}`;
  if (req.task === "explain_report" && focus?.urgency === "emergency") return `${EMERGENCY_SENTINEL}\n${body}`;
  return body;
}
