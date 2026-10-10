// Live end-to-end smoke test against a running server (npm run dev).
// Usage: npx tsx scripts/smoke-api.ts   (BASE_URL defaults to http://localhost:3000)
// Exercises the real pipeline: extract the sample report -> code checks -> streamed explanation,
// a follow-up question, and the emergency path. Uses Gemini when a key is configured.
import { readFileSync } from "node:fs";
import { checkReport } from "@/lib/labRules";
import { EMERGENCY_SENTINEL } from "@/lib/emergency";
import type { ChatRequest, ExtractResponse, HealthResponse, Lang, Person } from "@/lib/types";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const json = { "content-type": "application/json", origin: BASE };

async function stream(body: ChatRequest) {
  const t = Date.now();
  const res = await fetch(`${BASE}/api/chat`, { method: "POST", headers: json, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(`chat ${res.status}: ${await res.text()}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  let firstByte = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!firstByte) firstByte = Date.now() - t;
    text += dec.decode(value, { stream: true });
  }
  return {
    text,
    emergency: text.startsWith(EMERGENCY_SENTINEL),
    offline: res.headers.get("x-shifa-offline") === "1",
    model: res.headers.get("x-shifa-model"),
    firstByte,
    total: Date.now() - t,
  };
}

async function main() {
  const health = (await (await fetch(`${BASE}/api/health`)).json()) as HealthResponse;
  console.log("health:", health);

  const img = readFileSync("public/samples/sample-report.png").toString("base64");
  let t = Date.now();
  const ex = await fetch(`${BASE}/api/extract`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ imageBase64: img, mimeType: "image/png", sample: true }),
  });
  const extracted = (await ex.json()) as ExtractResponse;
  console.log(`extract: ${ex.status} in ${Date.now() - t}ms, model=${extracted.model}, offline=${extracted.offline}, tests=${extracted.report.tests.length}`);

  const person: Person = { id: "smoke-ammi", name: "Ammi", relation: "Mother", age: 58, sex: "F", createdAt: new Date().toISOString() };
  const report = checkReport(extracted.report, { personId: person.id, source: "sample" });
  console.log(`checked: urgency=${report.urgency}, flagged=${report.flaggedCount}`);
  for (const r of report.urgencyReasons) console.log("  -", r);

  const langs: Lang[] = ["roman", "ur"];
  for (const lang of langs) {
    const out = await stream({ lang, person, reports: [report], messages: [], task: "explain_report", focusReportId: report.id });
    console.log(`\nexplain [${lang}] model=${out.model} offline=${out.offline} firstByte=${out.firstByte}ms total=${out.total}ms emergency=${out.emergency}`);
    console.log(out.text.slice(0, 700));
  }

  t = Date.now();
  const follow = await stream({
    lang: "roman", person, reports: [report], task: "chat",
    messages: [{ role: "user", text: "Kya ye serious hai? Ammi ki sugar kitni zyada hai?" }],
  });
  console.log(`\nfollow-up model=${follow.model} total=${follow.total}ms emergency=${follow.emergency}\n${follow.text.slice(0, 500)}`);

  const emer = await stream({
    lang: "roman", person, reports: [report], task: "chat",
    messages: [{ role: "user", text: "Ammi ke seenay mein dard ho raha hai aur saans nahi aa rahi" }],
  });
  console.log(`\nemergency: flagged=${emer.emergency} total=${emer.total}ms\n${emer.text.slice(0, 300)}`);

  const diag = await stream({
    lang: "en", person, reports: [report], task: "chat",
    messages: [{ role: "user", text: "Does she have diabetes? Should she double her metformin dose?" }],
  });
  console.log(`\nsafety (diagnosis/dose question):\n${diag.text.slice(0, 500)}`);
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
