"use client";

import { LogOut, ShieldCheck } from "lucide-react";
import GoogleButton from "@/components/GoogleButton";
import { t, urduFont } from "@/lib/i18n";
import type { useAuth } from "@/lib/useAuth";
import type { Lang } from "@/lib/types";

type Auth = ReturnType<typeof useAuth>;

/** Account block at the top of the sidebar / drawer. Renders nothing when sign-in isn't configured. */
export default function AccountCard({ auth, lang, compact = false }: { auth: Auth; lang: Lang; compact?: boolean }) {
  if (!auth.enabled) return null;

  if (!auth.ready) {
    return <div className="mx-3 mt-3 h-14 animate-pulse rounded-card bg-bg" aria-busy="true" />;
  }

  if (auth.user) {
    const u = auth.user;
    return (
      <div className="mx-3 mt-3 flex items-center gap-3 rounded-card border bg-bg p-3">
        {u.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny Google avatar; next/image would need remote config
          <img src={u.image} alt="" width={36} height={36} referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full" />
        ) : (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
            {(u.name || u.email || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{u.name || u.email}</p>
          <p className="truncate text-xs text-muted">{u.email}</p>
        </div>
        <button
          type="button"
          onClick={auth.signOut}
          aria-label={t("signOut", lang)}
          title={t("signOut", lang)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink"
        >
          <LogOut size={18} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className={`mx-3 mt-3 rounded-card border bg-bg p-3 ${compact ? "" : "space-y-2"}`}>
      <GoogleButton label={t("signInGoogle", lang)} onClick={auth.signIn} disabled={!auth.canSignIn} />
      <p className={`flex items-start gap-1.5 text-xs leading-snug text-muted ${urduFont(lang)}`}>
        <ShieldCheck size={14} aria-hidden className="mt-0.5 shrink-0" />
        <span>{auth.canSignIn ? t("signInHint", lang) : t("signInHttpsOnly", lang)}</span>
      </p>
    </div>
  );
}
