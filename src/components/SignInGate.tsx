"use client";

import { HeartPulse, ShieldCheck } from "lucide-react";
import GoogleButton from "@/components/GoogleButton";
import LanguageToggle from "@/components/LanguageToggle";
import { t } from "@/lib/i18n";
import type { useAuth } from "@/lib/useAuth";
import type { Lang } from "@/lib/types";

type Auth = ReturnType<typeof useAuth>;

/** Full-screen sign-in, shown only when the server requires sign-in (SHIFA_REQUIRE_SIGNIN=true). */
export default function SignInGate({ auth, lang, onLangChange }: { auth: Auth; lang: Lang; onLangChange: (l: Lang) => void }) {
  const ur = lang === "ur";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm animate-fade-in rounded-card border bg-bg p-6 text-center">
        <div className="flex items-center justify-center gap-2 text-xl font-semibold">
          <HeartPulse size={24} aria-hidden />
          Shifa
        </div>
        <div className="mt-4 flex justify-center">
          <LanguageToggle lang={lang} onChange={onLangChange} />
        </div>
        <h1 className={`mt-5 text-lg font-semibold ${ur ? "urdu" : ""}`} dir={ur ? "rtl" : undefined}>
          {t("signInRequiredTitle", lang)}
        </h1>
        <p className={`mt-2 text-sm text-muted ${ur ? "urdu" : "leading-relaxed"}`} dir={ur ? "rtl" : undefined}>
          {t("signInRequiredBody", lang)}
        </p>
        <div className="mt-5">
          <GoogleButton label={t("signInGoogle", lang)} onClick={auth.signIn} disabled={!auth.canSignIn} />
        </div>
        {!auth.canSignIn && (
          <p className="mt-3 flex items-start justify-center gap-1.5 text-xs text-muted">
            <ShieldCheck size={14} aria-hidden className="mt-0.5 shrink-0" />
            {t("signInHttpsOnly", lang)}
          </p>
        )}
      </div>
    </main>
  );
}
