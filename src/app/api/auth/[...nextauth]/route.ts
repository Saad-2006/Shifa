import NextAuth from "next-auth";
import { authOptions, isAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);

type Ctx = { params: Promise<{ nextauth: string[] }> };

// When Google sign-in isn't configured, answer like "nobody is signed in" instead of erroring,
// so the client's session check stays quiet and the app runs in guest mode.
async function notConfigured(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (path.endsWith("/session")) return Response.json({}, { headers: { "Cache-Control": "no-store" } });
  if (path.endsWith("/providers")) return Response.json({});
  if (path.endsWith("/csrf")) return Response.json({ csrfToken: "" });
  return Response.json({ error: "Google sign-in is not configured" }, { status: 404 });
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return isAuthConfigured() ? handler(req, ctx) : notConfigured(req);
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return isAuthConfigured() ? handler(req, ctx) : notConfigured(req);
}
