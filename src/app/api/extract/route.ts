import { SAMPLE_EXTRACTION } from "@/lib/demoData";
import { GeminiError, generateJSON, isConfigured } from "@/lib/gemini";
import { coerceExtraction, EXTRACTION_SCHEMA, EXTRACTION_SYSTEM, EXTRACTION_USER_INSTRUCTION } from "@/lib/prompts";
import { requireSignIn } from "@/lib/authGuard";
import { guardRequest, validateUpload } from "@/lib/security";
import type { ApiError, ExtractResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

function apiError(status: number, code: ApiError["code"], error: string): Response {
  const body: ApiError = { error, code };
  return Response.json(body, { status, headers: NO_STORE });
}

function ok(body: ExtractResponse): Response {
  return Response.json(body, { headers: NO_STORE });
}

function sampleResponse(): Response {
  return ok({ report: SAMPLE_EXTRACTION, model: null, offline: true });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guardRequest(req, { route: "extract" });
  if (blocked) return blocked;
  const needsSignIn = await requireSignIn();
  if (needsSignIn) return needsSignIn;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError(400, "bad_request", "The request must be a JSON object with imageBase64 and mimeType.");
  }
  const sample = body.sample === true;

  const upload = validateUpload({ imageBase64: body.imageBase64, mimeType: body.mimeType });
  if (!upload.ok) {
    // The sample flow is the demo safety net: never fail it on the upload itself.
    if (sample) return sampleResponse();
    return apiError(upload.status || 400, "bad_upload", upload.error);
  }

  if (!isConfigured()) {
    if (sample) return sampleResponse();
    return apiError(
      503,
      "no_key",
      "Report reading is not available right now because the AI key is not set up. You can still try the sample report.",
    );
  }

  try {
    const { data, model } = await generateJSON<unknown>({
      system: EXTRACTION_SYSTEM,
      schema: EXTRACTION_SCHEMA,
      parts: [
        { inlineData: { mimeType: upload.mimeType, data: upload.base64 } }, // cleaned by validateUpload
        { text: EXTRACTION_USER_INSTRUCTION },
      ],
      timeoutMs: 50000, // whole chain; each model gets up to 25 s (fits maxDuration 60)
      attemptTimeoutMs: 25000,
      signal: req.signal,
    });
    const report = coerceExtraction(data);
    if (!report.isLabReport) {
      return apiError(
        422,
        "not_a_report",
        "This doesn't look like a lab test report. Please attach a photo or PDF of blood, urine or other lab test results.",
      );
    }
    if (report.tests.length === 0) {
      return apiError(
        422,
        "not_a_report",
        "I couldn't read any test results in this file. Please retake the photo flat, in good light, with the whole table visible.",
      );
    }
    return ok({ report, model, offline: false });
  } catch (e) {
    if (sample) return sampleResponse();
    if (e instanceof GeminiError) {
      console.error(`[extract] Gemini ${e.code} (${e.status})`);
      switch (e.code) {
        case "quota":
          return apiError(429, "rate_limited", "The AI is busy right now (usage limit reached). Please try again in a minute.");
        case "timeout":
          return apiError(504, "ai_error", "Reading the report took too long. Please try again, or use a smaller, clearer photo.");
        case "blocked":
          return apiError(502, "ai_error", "The AI could not process this file. Please try a different photo of the report.");
        case "no_key":
          return apiError(503, "no_key", "Report reading is not available right now because the AI key is not set up.");
        default:
          return apiError(502, "ai_error", "The AI could not read this report right now. Please try again.");
      }
    }
    console.error("[extract] unexpected error", e instanceof Error ? e.name : typeof e);
    return apiError(500, "ai_error", "Something went wrong while reading the report. Please try again.");
  }
}
