"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { t, urduFont, type I18nKey } from "@/lib/i18n";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";
import type { Lang } from "@/lib/types";

const OPTIONS: { value: ThemePref; label: I18nKey; Icon: typeof Sun }[] = [
  { value: "system", label: "themeSystem", Icon: Monitor },
  { value: "light", label: "themeLight", Icon: Sun },
  { value: "dark", label: "themeDark", Icon: Moon },
];

/** System / Light / Dark, each with an icon and a word (recognition over recall). */
export default function ThemeToggle({ lang }: { lang: Lang }) {
  const pref = useThemePref();
  return (
    <div role="radiogroup" aria-label={t("appearance", lang)} className="grid grid-cols-3 gap-1 rounded-input border bg-bg p-1">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setThemePref(value)}
            className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[9px] px-1 text-xs font-medium transition-colors ${
              active ? "bg-ink text-on-ink" : "text-muted hover:bg-surface hover:text-ink"
            }`}
          >
            <Icon size={16} aria-hidden />
            <span className={urduFont(lang)}>{t(label, lang)}</span>
          </button>
        );
      })}
    </div>
  );
}
