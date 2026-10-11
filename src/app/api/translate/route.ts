import { EMERGENCY_SENTINEL } from "@/lib/emergency";
import { scrubLabels } from "@/lib/outputScrub";
import { GeminiError, generateText, isConfigured } from "@/lib/gemini";
import { requireSignIn } from "@/lib/authGuard";
import { guardRequest } from "@/lib/security";
import { buildTranslateSystem, MAX_TRANSLATE_CHARS, numbersPreserved, scriptFits, speakableDevanagari, type TranslateTarget } from "@/lib/translate";
import type { ApiError, Lang } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LANGS: Lang[] = ["en", "ur", "roman"];
const TARGETS: TranslateTarget[] = [...LANGS, "hi"]; // "hi": Devanagari, only for reading Urdu aloud
const ATTEMPTS = 2; // a second try when a number didn't survive, then give up honestly

function apiError(status: number, code: ApiError["code"], error: string): Response {
  const body: ApiError = { error, code };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** POST { text, from, to } -> { text }: translate one of Shifa's answers (or write it in Devanagari for read-aloud), checked by code. */
export async function POST(req: Request): Promise<Response> {
  const blocked = guardRequest(req, { route: "translate" });
  if (blocked) return blocked;
  const needsSignIn = await requireSignIn();
  if (needsSignIn) return needsSignIn;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(400, "bad_request", "The request body must be JSON.");
  }
  const b = (raw ?? {}) as { text?: unknown; from?: unknown; to?: unknown };
  const text = typeof b.text === "string" ? b.text.split(EMERGENCY_SENTINEL).join("").trim() : "";
  const from = b.from as Lang;
  const to = b.to as TranslateTarget;
  if (!text || text.length > MAX_TRANSLATE_CHARS || !LANGS.includes(from) || !TARGETS.includes(to) || from === to) {
    return apiError(400, "bad_request", "Send { text, from, to } with two different languages (en, ur, roman).");
  }
  if (!isConfigured()) return apiError(503, "ai_error", "Translation needs the AI, which is not available right now.");

  try {
    for (let i = 0; i < ATTEMPTS; i++) {
      const out = await generateText({
        system: buildTranslateSystem(from, to),
        text: `<answer>\n${text}\n</answer>`,
        signal: req.signal,
      });
      const translated = scrubLabels(out.text.replace(/<\/?answer>/g, "").split(EMERGENCY_SENTINEL).join("")).trim();
      // Code checks: same numbers; really in the target script (a "translation" to Urdu that came
      // back in Roman letters is rejected); read-aloud text is all Devanagari.
      const scriptOk = to === "hi" ? speakableDevanagari(translated) : scriptFits(translated, to);
      if (translated && numbersPreserved(text, translated) && scriptOk) {
        return Response.json({ text: translated }, { headers: { "Cache-Control": "no-store", "x-shifa-model": out.model } });
      }
      console.warn(`[translate] check failed (${from} -> ${to}), attempt ${i + 1}`);
    }
    return apiError(422, "translate_unsafe", "The translation changed a number, so it was not shown.");
  } catch (e) {
    const code = e instanceof GeminiError ? e.code : "upstream";
    console.error(`[translate] Gemini ${code}`);
    if (code === "quota") return apiError(429, "rate_limited", "The AI is busy right now. Please try again in a minute.");
    return apiError(502, "ai_error", "The AI could not translate right now. Please try again.");
  }
}
