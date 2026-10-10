import { isAuthConfigured, signInRequired } from "@/lib/auth";
import { getConfiguredModel, isConfigured } from "@/lib/gemini";
import { accessRequired, guardRequest } from "@/lib/security";
import type { HealthResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const blocked = guardRequest(req, { route: "health" });
  if (blocked) return blocked;
  const configured = isConfigured();
  // No network call: report the first model of the GEMINI_MODEL chain.
  const body: HealthResponse = {
    ok: true,
    aiConfigured: configured,
    model: configured ? getConfiguredModel() : null,
    accessRequired: accessRequired(),
    authEnabled: isAuthConfigured(),
    signInRequired: signInRequired(),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
