"use client";

import { SessionProvider } from "next-auth/react";

/** Client-side providers. The session check is a cheap call; it answers "guest" when sign-in isn't configured. */
export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
