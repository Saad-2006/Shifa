import { t, urduFont } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

/** Always-visible one-line safety note under the composer. */
export default function Disclaimer({ lang }: { lang: Lang }) {
  return (
    <p className={`px-2 pt-1 text-center text-xs text-muted ${urduFont(lang)}`} dir={lang === "ur" ? "rtl" : undefined}>
      {t("disclaimer", lang)}
    </p>
  );
}
