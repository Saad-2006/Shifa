"use client";

// Google sign-in state for the UI: NextAuth's session plus whether this server has sign-in
// configured (and whether it is required), read once from /api/health.
import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { apiFetch } from "@/lib/apiClient";
import type { HealthResponse } from "@/lib/types";

type AuthConfig = Pick<HealthResponse, "authEnabled" | "signInRequired">;

let configPromise: Promise<AuthConfig> | null = null;
function loadConfig(): Promise<AuthConfig> {
  configPromise ??= apiFetch("/api/health")
    .then((r) => (r.ok ? (r.json() as Promise<HealthResponse>) : null))
    .then((h) => ({ authEnabled: Boolean(h?.authEnabled), signInRequired: Boolean(h?.signInRequired) }))
    .catch(() => ({ authEnabled: false, signInRequired: false }));
  return configPromise;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export function useAuth() {
  const { data, status } = useSession();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  // Google only allows sign-in from https origins or localhost (not a LAN IP like 192.168.x.x).
  const [canSignIn, setCanSignIn] = useState(true);

  useEffect(() => {
    let alive = true;
    void loadConfig().then((c) => {
      if (alive) setConfig(c);
    });
    const { protocol, hostname } = window.location;
    setCanSignIn(protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1");
    return () => {
      alive = false;
    };
  }, []);

  const u = data?.user as { id?: string; name?: string | null; email?: string | null; image?: string | null } | undefined;
  const user: AuthUser | null = u?.id ? { id: u.id, name: u.name ?? "", email: u.email ?? "", image: u.image ?? null } : null;

  return {
    /** Config loaded and the session check finished. */
    ready: config !== null && status !== "loading",
    enabled: config?.authEnabled ?? false,
    required: config?.signInRequired ?? false,
    status,
    user,
    canSignIn,
    signIn: () => void signIn("google"),
    signOut: () => void signOut({ redirect: false }),
  };
}
