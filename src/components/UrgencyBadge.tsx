import { t, urduFont } from "@/lib/i18n";
import type { Lang, Urgency } from "@/lib/types";
import { TONE_CLASSES, URGENCY_META } from "./reportUtils";

/** Urgency decided by code (labRules), shown with an icon and words, never colour alone. */
export default function UrgencyBadge({
  urgency,
  lang,
  size = "sm",
}: {
  urgency: Urgency;
  lang: Lang;
  size?: "sm" | "lg";
}) {
  const meta = URGENCY_META[urgency];
  const { Icon } = meta;

  if (size === "sm") {
    return (
      <span
        title={t(meta.label, lang)}
        className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[meta.tone]}`}
      >
        <Icon size={13} aria-hidden strokeWidth={2.25} className="shrink-0" />
        <span className={`truncate ${urduFont(lang)}`}>{t(meta.short, lang)}</span>
      </span>
    );
  }

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-[12px] border px-3.5 py-3 ${TONE_CLASSES[meta.tone]}`}
    >
      <Icon size={28} aria-hidden strokeWidth={2.25} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className={`text-xs font-semibold tracking-wide uppercase ${urduFont(lang)}`}>{t(meta.label, lang)}</div>
        <div className={`text-lg leading-snug font-semibold ${urduFont(lang)}`}>{t(meta.action, lang)}</div>
      </div>
    </div>
  );
}
