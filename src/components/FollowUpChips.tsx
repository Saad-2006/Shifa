import { t, urduFont, type I18nKey } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

/** Tap-to-ask questions after the latest answer, so nobody faces an empty box. */
export default function FollowUpChips({
  lang,
  canCompare,
  onPick,
}: {
  lang: Lang;
  canCompare: boolean;
  onPick: (text: string) => void;
}) {
  const keys: I18nKey[] = ["fuSerious", "fuDoctor", ...(canCompare ? (["fuCompare"] as I18nKey[]) : []), "fuSimple"];
  return (
    <div
      role="group"
      aria-label={t("suggested", lang)}
      className="flex animate-fade-in flex-wrap gap-2 ps-10"
    >
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onPick(t(k, lang))}
          className={`inline-flex min-h-11 items-center rounded-full border bg-bg px-4 text-[0.95rem] transition-colors hover:border-ink/30 hover:bg-surface ${urduFont(lang)}`}
        >
          {t(k, lang)}
        </button>
      ))}
    </div>
  );
}
