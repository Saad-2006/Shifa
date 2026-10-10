// Server-only: refuse guests on the AI routes when SHIFA_REQUIRE_SIGNIN=true.
import { getServerSession } from "next-auth";
import { authOptions, signInRequired } from "@/lib/auth";
import type { ApiError } from "@/lib/types";

/** null = allowed. 403 (not 401) so the demo-passcode gate never mistakes it for a wrong code. */
export async function requireSignIn(): Promise<Response | null> {
  if (!signInRequired()) return null;
  try {
    const session = await getServerSession(authOptions);
    if (session?.user) return null;
  } catch {
    // fall through: treat an unreadable session as signed out
  }
  const body: ApiError = { error: "Please sign in with Google to use Shifa.", code: "sign_in_required" };
  return Response.json(body, { status: 403, headers: { "Cache-Control": "no-store" } });
}
