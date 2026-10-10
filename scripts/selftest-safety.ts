// Self-test for the access & safety layer. Run: npx tsx scripts/selftest-safety.ts
import assert from "node:assert/strict";
import {
  detectEmergency,
  EMERGENCY_SENTINEL,
  RESCUE_NUMBER,
  type EmergencyCategory,
  type EmergencyKind,
} from "../src/lib/emergency";
import { guardOutput } from "../src/lib/streamGuard";
import { buildChatSystem } from "../src/lib/prompts";
import { offlineAnswer } from "../src/lib/fallback";
import { checkReport } from "../src/lib/labRules";
import type { ChatRequest, ExtractedReport, Person } from "../src/lib/types";
import { accessRequired, guardRequest, resetRateLimits, validateUpload } from "../src/lib/security";

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message.split("\n")[0]}`);
  }
}

// ---------------------------------------------------------------- emergency
const POSITIVES: [string, EmergencyCategory][] = [
  // English
  ["My father has severe chest pain since 20 minutes", "cardiac"],
  ["I think she is having a heart attack", "cardiac"],
  ["he can't breathe properly", "breathing"],
  ["short of breath and dizzy", "breathing"],
  ["her face drooping and slurred speech", "stroke"],
  ["mom fainted in the kitchen", "unconscious"],
  ["my son is having a seizure", "seizure"],
  ["vomiting blood since morning", "bleeding"],
  ["I want to kill myself", "suicide"],
  ["he took an overdose of his tablets", "poisoning"],
  ["throat swelling after the injection", "allergy"],
  ["snake bite on the leg", "other"],
  // Roman Urdu, including misspellings
  ["abbu ke seenay me dard ho raha hai", "cardiac"],
  ["seene mein bohat shadeed dard hai", "cardiac"],
  ["dil ka dora para hai shayad", "cardiac"],
  ["ammi ko sans ni aa rahi", "breathing"],
  ["saans lene mein takleef ho rahi hai", "breathing"],
  ["nani behosh ho gayi", "unconscious"],
  ["dada ko falij ho gaya", "stroke"],
  ["bachay ko jhatke lag rahe hain", "seizure"],
  ["khoon ki ulti aayi hai", "bleeding"],
  ["usne zehar kha liya", "poisoning"],
  ["main marna chahti hun", "suicide"],
  ["gala band ho raha hai", "allergy"],
  ["saanp ne kaata hai", "other"],
  // Fuzzy typos
  ["chest pian", "cardiac"],
  ["hart attack", "cardiac"],
  ["dificulty breathing", "breathing"],
  ["he is unconcious", "unconscious"],
  ["having a siezure", "seizure"],
  // Urdu script (incl. Arabic letter variants and missing spaces)
  ["ابو کے سینے میں درد ہو رہا ہے", "cardiac"],
  ["مجھے لگتا ہے دل کا دورہ ہے", "cardiac"],
  ["امی کو سانس نہیں آ رہی", "breathing"],
  ["وہ بے ہوش ہو گئی ہیں", "unconscious"],
  ["بےہوش", "unconscious"],
  ["دادا کو فالج ہوا ہے", "stroke"],
  ["اس نے زہر کھا لیا", "poisoning"],
  ["خودکشی کا سوچ رہا ہوں", "suicide"],
  ["سينے ميں درد", "cardiac"], // Arabic yeh (ي) instead of Urdu yeh
];

const NEGATIVES = [
  "Hb kam hai kya ye serious hai",
  "sugar zyada hai kya karun",
  "pet mein dard hai",
  "sar dard",
  "sar mein dard hai",
  "dard ki dawai kaunsi lun",
  "cholesterol high hai",
  "what does chest x-ray mean",
  "no chest pain",
  "not having chest pain",
  "seenay mein dard nahi hai",
  "no breathing problem",
  "kamar mein dard rehta hai",
  "kya cholesterol se heart attack ka khatra hai",
  "what is my risk of stroke",
  "is troponin a heart attack test",
  "mujhe bohat khoon ki kami hai",
  "I don't want to die from diabetes, what should I eat",
  "benefits of vitamin D",
  "my report is normal, thank you",
  "پیٹ میں درد ہے",
  "سر میں درد ہے",
  // Everyday questions about a report must never open the urgent card.
  "is my kidney failing",
  "has his kidney failed",
  "creatinine high means kidney failure?",
  "is this dangerous",
  "kya ye khatarnak hai",
  "is it an emergency",
  "emergency hai kya",
  "kya mujhe ER jana chahiye",
  "can this cause a heart attack in future?",
  "uric acid zyada hai, joron mein dard hai",
  "saans phoolti hai seerhiyan chadhte hue",
  "Is this serious?",
  "Kya ye serious hai?",
  "",
];

async function main() {
await test("emergency constants", () => {
  assert.equal(EMERGENCY_SENTINEL, "[[EMERGENCY]]");
  assert.equal(RESCUE_NUMBER, "1122");
});

// Only code raises the urgent card: the model's own tag is dropped unless code flagged it.
async function guarded(chunks: string[], kind: EmergencyKind | null): Promise<string> {
  async function* src() {
    for (const c of chunks) yield c;
  }
  let out = "";
  for await (const piece of guardOutput(src(), kind, "en")) out += piece;
  return out;
}
const S = EMERGENCY_SENTINEL;
await test("stream guard: the AI alone can't raise an emergency", async () => {
  const out = await guarded(["[[EMER", "GENCY]]\nCall 1122 now. ", "Hb is low."], null);
  assert.ok(!out.includes(S), out);
  assert.ok(out.startsWith("Call 1122 now."), out);
});
await test("stream guard: code-flagged reply always starts with the tag", async () => {
  assert.ok((await guarded(["Hb is low."], "report")).startsWith(`${S}\nHb is low.`));
  assert.ok((await guarded([`${S}\n`, "Please go to the ER."], "words")).startsWith(`${S}\nPlease go to the ER.`));
});
await test("stream guard: empty answers fall back calmly by kind", async () => {
  const report = await guarded([], "report");
  assert.ok(report.includes("doctor today") && !report.includes("1122"), report);
  assert.ok((await guarded([], "words")).includes("1122"));
  assert.ok(!(await guarded([], null)).includes(S));
});

// Report danger values are calm (doctor today / ER); only typed emergencies mention 1122.
const person = { id: "p", name: "Imran Qureshi", relation: "Brother", createdAt: "" } as Person;
const k = (value: string): ExtractedReport => ({
  isLabReport: true, labName: "Chughtai Lab", reportDate: "2026-10-09", patientName: "Imran Qureshi", patientAge: "38", patientSex: "M", notes: "",
  tests: [{ panel: "", name: "Potassium", value, numericValue: Number(value), unit: "mmol/L", refRangeText: "3.5 - 5.1", refLow: 3.5, refHigh: 5.1, printedFlag: "" }],
});
const danger = checkReport(k("6.9"), { personId: "p", source: "scan" });
await test("danger report is code-flagged emergency (fixture check)", () => assert.equal(danger.urgency, "emergency"));
const chatReq = (task: ChatRequest["task"], text = ""): ChatRequest => ({
  lang: "en", person, reports: [danger], task, focusReportId: danger.id,
  messages: text ? [{ role: "user", text }] : [],
});
await test("prompt: explaining a danger report is calm, no 1122", () => {
  const sys = buildChatSystem({ ...chatReq("explain_report"), emergencyDetected: false });
  assert.ok(sys.includes("MUST start with the") && sys.includes("checked by a doctor today"));
  assert.ok(!/IMPORTANT:[^\n]*1122/.test(sys), "report IMPORTANT line mentions 1122");
});
await test("prompt: follow-up on a danger report doesn't re-raise the card", () => {
  const sys = buildChatSystem({ ...chatReq("chat", "what should he eat?"), emergencyDetected: false });
  assert.ok(!sys.includes("IMPORTANT:"), "follow-up still forced the emergency tag");
});
await test("prompt: typed emergency keeps 1122", () => {
  const sys = buildChatSystem({ ...chatReq("chat", "he fainted"), emergencyDetected: true });
  assert.ok(/IMPORTANT:[^\n]*1122/.test(sys));
});
await test("offline: danger report is calm (no 1122), typed emergency has 1122", () => {
  const explain = offlineAnswer(chatReq("explain_report"));
  assert.ok(explain.startsWith(S) && !explain.includes("1122") && explain.includes("today"), explain);
  const followUp = offlineAnswer(chatReq("chat", "what should he eat?"));
  assert.ok(!followUp.includes(S) && !followUp.includes("1122"), followUp);
  const typed = offlineAnswer(chatReq("chat", "Abbu behosh ho gaye"));
  assert.ok(typed.startsWith(S) && typed.includes("1122"), typed);
});

for (const [text, category] of POSITIVES) {
  await test(`positive: ${text}`, () => {
    const r = detectEmergency(text);
    assert.equal(r.isEmergency, true, "not detected");
    assert.equal(r.category, category, `category ${r.category}`);
    assert.ok(r.matched.length > 0, "no matched phrase");
  });
}

for (const text of NEGATIVES) {
  await test(`negative: ${text}`, () => {
    const r = detectEmergency(text);
    assert.equal(r.isEmergency, false, `false positive (${r.category}: ${r.matched.join(", ")})`);
    assert.equal(r.category, null);
    assert.deepEqual(r.matched, []);
  });
}

await test("most severe category wins", () => {
  assert.equal(detectEmergency("chest pain and I want to end my life").category, "suicide");
  assert.equal(detectEmergency("behosh ho gaye aur jhatke aa rahe hain").category, "unconscious");
  assert.equal(detectEmergency("heavy bleeding and chest pain").category, "cardiac");
});

await test("negation stays inside its clause", () => {
  assert.equal(detectEmergency("I don't know, chest pain since morning").isEmergency, true);
  assert.equal(detectEmergency("no fever. but now chest pain").isEmergency, true);
});

await test("detector is fast enough for every message", () => {
  const long = "mere abbu ki report mein Hb kam hai aur sugar zyada hai, kya karun ".repeat(20);
  const t0 = performance.now();
  detectEmergency(long);
  assert.ok(performance.now() - t0 < 500, "too slow");
});

// ---------------------------------------------------------------- uploads
const b64 = (bytes: number[] | Uint8Array | string) =>
  Buffer.from(typeof bytes === "string" ? Buffer.from(bytes, "latin1") : Uint8Array.from(bytes)).toString("base64");
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1];
const PDF = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n";
const WEBP = "RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00";
const HEIC = "\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic";

await test("upload: valid PNG", () => {
  const r = validateUpload({ imageBase64: b64(PNG), mimeType: "image/png" });
  assert.ok(r.ok);
  assert.equal(r.mimeType, "image/png");
  assert.equal(r.bytes, PNG.length);
});
await test("upload: valid JPEG (image/jpg alias normalised)", () => {
  const r = validateUpload({ imageBase64: b64(JPEG), mimeType: "image/jpg" });
  assert.ok(r.ok);
  assert.equal(r.mimeType, "image/jpeg");
  assert.equal(r.bytes, JPEG.length);
});
await test("upload: valid PDF", () => {
  const r = validateUpload({ imageBase64: b64(PDF), mimeType: "application/pdf" });
  assert.ok(r.ok);
  assert.equal(r.bytes, PDF.length);
});
await test("upload: valid WEBP and HEIC", () => {
  assert.ok(validateUpload({ imageBase64: b64(WEBP), mimeType: "image/webp" }).ok);
  assert.ok(validateUpload({ imageBase64: b64(HEIC), mimeType: "image/heic" }).ok);
  assert.ok(validateUpload({ imageBase64: b64(HEIC), mimeType: "image/heif" }).ok);
});
await test("upload: data: prefix is stripped", () => {
  const r = validateUpload({ imageBase64: `data:image/png;base64,${b64(PNG)}`, mimeType: "image/png" });
  assert.ok(r.ok);
  assert.equal(r.bytes, PNG.length);
  assert.equal(r.base64, b64(PNG));
});
await test("upload: spoofed type is rejected (415)", () => {
  for (const [data, mime] of [
    [b64(PNG), "image/jpeg"],
    [b64(PDF), "image/png"],
    [b64("<html><script>alert(1)</script></html>"), "application/pdf"],
    [b64(JPEG), "image/webp"],
  ] as const) {
    const r = validateUpload({ imageBase64: data, mimeType: mime });
    assert.equal(r.ok, false, `${mime} accepted`);
    if (!r.ok) assert.equal(r.status, 415);
  }
});
await test("upload: too big (413)", () => {
  const big = new Uint8Array(4 * 1024 * 1024 + 1);
  big.set(PNG);
  const r = validateUpload({ imageBase64: Buffer.from(big).toString("base64"), mimeType: "image/png" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 413);
  const exact = new Uint8Array(4 * 1024 * 1024);
  exact.set(PNG);
  assert.ok(validateUpload({ imageBase64: Buffer.from(exact).toString("base64"), mimeType: "image/png" }).ok);
});
await test("upload: bad mime (415)", () => {
  for (const mime of ["image/gif", "text/html", "image/svg+xml", ""]) {
    const r = validateUpload({ imageBase64: b64("GIF89a\x01\x00\x01\x00"), mimeType: mime });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 415, mime);
  }
});
await test("upload: missing / malformed input (400)", () => {
  for (const input of [
    { imageBase64: undefined, mimeType: "image/png" },
    { imageBase64: b64(PNG), mimeType: 42 },
    { imageBase64: "", mimeType: "image/png" },
    { imageBase64: "not base64 at all!!", mimeType: "image/png" },
  ]) {
    const r = validateUpload(input);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 400);
  }
});

// ---------------------------------------------------------------- guard
const req = (route: string, headers: Record<string, string> = {}, method = "POST") =>
  new Request(`http://localhost/api/${route}`, { method, headers: { host: "localhost", ...headers } });

await test("same-origin: foreign Origin on POST is 403", async () => {
  delete process.env.SHIFA_ACCESS_CODE;
  resetRateLimits();
  const r = guardRequest(req("chat", { origin: "https://evil.example", "x-forwarded-for": "198.51.100.1" }), { route: "chat" });
  assert.ok(r);
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: "Requests from other websites are not allowed.", code: "unauthorized" });
  const nul = guardRequest(req("chat", { origin: "null", "x-forwarded-for": "198.51.100.1" }), { route: "chat" });
  assert.equal(nul?.status, 403);
  assert.equal(guardRequest(req("chat", { origin: "http://localhost", "x-forwarded-for": "198.51.100.1" }), { route: "chat" }), null);
  assert.equal(guardRequest(req("health", { origin: "https://evil.example" }, "GET"), { route: "health" }), null);
});

await test("rate limit: 13th extract in a minute is 429", async () => {
  delete process.env.SHIFA_ACCESS_CODE;
  resetRateLimits();
  const h = { "x-forwarded-for": "203.0.113.7, 10.0.0.1", origin: "http://localhost" };
  for (let i = 1; i <= 12; i++) assert.equal(guardRequest(req("extract", h), { route: "extract" }), null, `call ${i}`);
  const r = guardRequest(req("extract", h), { route: "extract" });
  assert.ok(r);
  assert.equal(r.status, 429);
  assert.equal(((await r.json()) as { code: string }).code, "rate_limited");
  const retry = Number(r.headers.get("retry-after"));
  assert.ok(retry >= 1 && retry <= 60, `retry-after ${retry}`);
  // Other clients and other routes are unaffected.
  assert.equal(guardRequest(req("extract", { "x-forwarded-for": "203.0.113.8" }), { route: "extract" }), null);
  assert.equal(guardRequest(req("chat", h), { route: "chat" }), null);
  // x-real-ip fallback is keyed separately.
  assert.equal(guardRequest(req("extract", { "x-real-ip": "203.0.113.9" }), { route: "extract" }), null);
});

await test("access code: not required", () => {
  delete process.env.SHIFA_ACCESS_CODE;
  resetRateLimits();
  assert.equal(accessRequired(), false);
  assert.equal(guardRequest(req("chat", { "x-forwarded-for": "192.0.2.1" }), { route: "chat" }), null);
});

await test("access code: wrong / missing is 401, right passes, health stays open", async () => {
  process.env.SHIFA_ACCESS_CODE = "shifa-2026";
  resetRateLimits();
  assert.equal(accessRequired(), true);
  const ip = { "x-forwarded-for": "192.0.2.2" };
  const missing = guardRequest(req("chat", ip), { route: "chat" });
  assert.equal(missing?.status, 401);
  assert.equal(((await missing!.json()) as { code: string }).code, "unauthorized");
  assert.equal(guardRequest(req("extract", { ...ip, "x-shifa-access": "wrong" }), { route: "extract" })?.status, 401);
  assert.equal(guardRequest(req("extract", { ...ip, "x-shifa-access": "shifa-2026x" }), { route: "extract" })?.status, 401);
  assert.equal(guardRequest(req("chat", { ...ip, "x-shifa-access": "shifa-2026" }), { route: "chat" }), null);
  assert.equal(guardRequest(req("health", ip, "GET"), { route: "health" }), null);
});

await test("access code: brute force is throttled", () => {
  process.env.SHIFA_ACCESS_CODE = "shifa-2026";
  resetRateLimits();
  const h = { "x-forwarded-for": "192.0.2.3", "x-shifa-access": "guess" };
  for (let i = 0; i < 10; i++) assert.equal(guardRequest(req("chat", h), { route: "chat" })?.status, 401);
  assert.equal(guardRequest(req("chat", h), { route: "chat" })?.status, 429);
  delete process.env.SHIFA_ACCESS_CODE;
});

// ---------------------------------------------------------------- summary
const total = passed + failures.length;
console.log(
  `safety selftest: ${passed}/${total} passed ` +
    `(${POSITIVES.length} emergency positives, ${NEGATIVES.length} negatives, uploads, rate limit, access code)`,
);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
