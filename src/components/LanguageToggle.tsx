"use client";

import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

const OPTIONS: { value: Lang; label: string; full: string; className?: string }[] = [
  { value: "en", label: "EN", full: "English" },
  // System Arabic font (not Nastaliq) here: Nastaliq's tall metrics push the label off-centre.
  { value: "ur", label: "اردو", full: "اردو (Urdu)", className: "text-[1.05em]" },
  { value: "roman", label: "Roman", full: "Roman Urdu" },
];

/** EN | اردو | Roman segmented control ("block": full width, for the sidebar setting). */
export default function LanguageToggle({
  lang,
  onChange,
  size = "sm",
  label,
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
  size?: "sm" | "lg" | "block";
  /** Accessible name of the group (defaults to "Language"). */
  label?: string;
}) {
  if (size === "block") {
    return (
      <div role="radiogroup" aria-label={label ?? t("language", lang)} className="grid grid-cols-3 gap-1 rounded-input border bg-bg p-1">
        {OPTIONS.map((o) => {
          const active = o.value === lang;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={o.full}
              onClick={() => onChange(o.value)}
              className={`min-h-11 rounded-[9px] px-1 text-sm font-medium transition-colors ${
                active ? "bg-ink text-on-ink" : "text-muted hover:bg-surface hover:text-ink"
              } ${o.className ?? ""}`}
            >
              <span dir="auto">{o.value === "en" ? "English" : o.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  const big = size === "lg";
  return (
    <div
      role="radiogroup"
      aria-label={label ?? t("language", lang)}
      className={`inline-flex shrink-0 items-center rounded-full border bg-surface p-0.5 ${big ? "text-base" : "text-sm"}`}
    >
      {OPTIONS.map((o) => {
        const active = o.value === lang;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.full}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-11 items-center justify-center rounded-full font-medium leading-none transition-colors ${
              big ? "w-20" : "w-16"
            } ${active ? "bg-ink text-on-ink" : "text-muted hover:text-ink"} ${o.className ?? ""}`}
          >
            <span dir="auto" className="block leading-none">
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
