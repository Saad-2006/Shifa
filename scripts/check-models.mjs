#!/usr/bin/env node
// Lists the Gemini models your key can call with generateContent, shows which entries of the
// GEMINI_MODEL chain are available, and what last-resort discovery would add.
//
//   node scripts/check-models.mjs          # list + chain check
//   node scripts/check-models.mjs --ping   # also time a tiny prompt on each chain model (mirrors Shifa's thinking config)
//
// Reads GEMINI_API_KEY / GEMINI_MODEL from the environment, else from .env.local / .env.
// The key is never printed.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
// Keep in sync with src/lib/gemini.ts
const DEFAULT_MODEL_CHAIN = ["gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-flash-latest"];
const MIN_AUTO_MAJOR = 3;
const MAX_AUTO_VERSION = [3, 6];
const DISCOVERY_RE = /^models\/gemini-(\d+)(?:\.(\d+))?-flash(-lite)?$/;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Tiny .env parser: KEY=value, optional quotes, # comments. */
function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

const fileEnv = { ...readEnvFile(join(root, ".env")), ...readEnvFile(join(root, ".env.local")) };
const env = (k) => (process.env[k] ?? fileEnv[k] ?? "").trim();
const key = env("GEMINI_API_KEY");
const chainFromEnv = env("GEMINI_MODEL")
  .split(",")
  .map((m) => m.trim().replace(/^models\//, ""))
  .filter(Boolean);
const chain = [...new Set(chainFromEnv.length ? chainFromEnv : DEFAULT_MODEL_CHAIN)];

if (!key) {
  console.error("No GEMINI_API_KEY found (env, .env.local or .env). Get one at https://aistudio.google.com/apikey");
  process.exit(1);
}

function thinkingConfigFor(model) {
  const m = model.toLowerCase();
  if (m.includes("lite")) return undefined;
  if (m.includes("2.5-flash")) return { thinkingBudget: 0 };
  const v = /gemini-(\d+)/.exec(m);
  if ((v && Number(v[1]) >= 3) || m.endsWith("-latest")) return { thinkingLevel: "low" };
  return undefined;
}

async function listModels() {
  const all = [];
  let pageToken = "";
  for (let page = 0; page < 5; page++) {
    const url = `${BASE_URL}/models?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url, { headers: { "x-goog-api-key": key } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ListModels failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    all.push(...(json.models ?? []));
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return all;
}

function discoveryCandidates(models) {
  const found = [];
  for (const m of models) {
    if (!m.supportedGenerationMethods?.includes("generateContent")) continue;
    const r = DISCOVERY_RE.exec(m.name ?? "");
    if (!r) continue;
    const major = Number(r[1]);
    const minor = Number(r[2] ?? 0);
    if (major < MIN_AUTO_MAJOR) continue;
    if (major > MAX_AUTO_VERSION[0] || (major === MAX_AUTO_VERSION[0] && minor > MAX_AUTO_VERSION[1])) continue;
    found.push({ id: m.name.replace(/^models\//, ""), major, minor, lite: !!r[3] });
  }
  found.sort((a, b) => Number(a.lite) - Number(b.lite) || b.major - a.major || b.minor - a.minor);
  return found.map((f) => f.id);
}

async function ping(model) {
  const body = {
    contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
    generationConfig: { temperature: 0, ...(thinkingConfigFor(model) ? { thinkingConfig: thinkingConfigFor(model) } : {}) },
  };
  const t0 = Date.now();
  let res = await fetch(`${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  let note = "";
  if (res.status === 400 && /thinking/i.test(await res.clone().text())) {
    delete body.generationConfig.thinkingConfig;
    note = " (thinkingConfig rejected, retried without it)";
    res = await fetch(`${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
  }
  const json = await res.json().catch(() => ({}));
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!res.ok) console.log(`Ping ${model}: HTTP ${res.status} ${json.error?.message ?? ""}`);
  else console.log(`Ping ${model}: "${text}" in ${Date.now() - t0} ms${note}`);
  return res.ok;
}

try {
  const models = await listModels();
  const usable = models.filter((m) => m.supportedGenerationMethods?.includes("generateContent"));
  console.log(`Models supporting generateContent (${usable.length} of ${models.length}):\n`);
  const rows = usable
    .map((m) => ({
      id: (m.name ?? "").replace(/^models\//, ""),
      in: m.inputTokenLimit ?? "",
      out: m.outputTokenLimit ?? "",
      thinking: m.thinking ? "yes" : "",
      flash: chain.includes((m.name ?? "").replace(/^models\//, "")) ? "chain" : "",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const w = Math.max(10, ...rows.map((r) => r.id.length));
  console.log(`${"model".padEnd(w)}  ${"input".padStart(8)}  ${"output".padStart(7)}  think  in chain`);
  for (const r of rows) {
    console.log(`${r.id.padEnd(w)}  ${String(r.in).padStart(8)}  ${String(r.out).padStart(7)}  ${r.thinking.padEnd(5)}  ${r.flash}`);
  }

  const ids = new Set(usable.map((m) => (m.name ?? "").replace(/^models\//, "")));
  console.log(`\nGEMINI_MODEL chain${chainFromEnv.length ? "" : " (default; GEMINI_MODEL unset)"}, tried in this order:`);
  chain.forEach((m, i) => {
    const think = JSON.stringify(thinkingConfigFor(m) ?? null);
    console.log(`  ${i + 1}. ${m.padEnd(30)} ${ids.has(m) ? "available" : "NOT LISTED (may 404)"}   thinkingConfig ${think}`);
  });
  const firstAvailable = chain.find((m) => ids.has(m));
  console.log(firstAvailable ? `\nShifa will most likely use: ${firstAvailable}` : "\nNo chain entry is listed: Shifa will fall back to discovery.");
  const discovered = discoveryCandidates(models).filter((m) => !chain.includes(m)).slice(0, 3);
  console.log(`Last-resort discovery (only if the whole chain fails; versions 3.0-3.6 only): ${discovered.join(", ") || "(none)"}`);

  if (process.argv.includes("--ping")) {
    console.log("");
    for (const m of chain) await ping(m);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
