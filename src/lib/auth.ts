// Google sign-in (NextAuth v4, JWT sessions: no database). Server-only.
// Sign-in is optional unless SHIFA_REQUIRE_SIGNIN=true. Reports still never leave the device:
// the account only separates each person's on-device data and can gate the AI routes.
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export function isAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET);
}

export function signInRequired(): boolean {
  return isAuthConfigured() && /^(1|true|yes)$/i.test((process.env.SHIFA_REQUIRE_SIGNIN ?? "").trim());
}

export const authOptions: NextAuthOptions = {
  providers: isAuthConfigured()
    ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          // Always show the account chooser: families often share one phone.
          authorization: { params: { prompt: "select_account" } },
        }),
      ]
    : [],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { error: "/" },
  callbacks: {
    async session({ session, token }) {
      // Expose the stable Google account id so the client can keep each account's data separate.
      if (session.user && token.sub) (session.user as { id?: string }).id = token.sub;
      return session;
    },
  },
};
