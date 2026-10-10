// Family relations: stored as plain English words ("Mother"), shown in the user's language.
import { t, type I18nKey } from "@/lib/i18n";
import type { Lang, Person } from "@/lib/types";

export const RELATIONS: { value: string; label: I18nKey }[] = [
  { value: "Self", label: "relSelf" },
  { value: "Mother", label: "relMother" },
  { value: "Father", label: "relFather" },
  { value: "Spouse", label: "relSpouse" },
  { value: "Child", label: "relChild" },
  { value: "Sibling", label: "relSibling" },
  { value: "Grandparent", label: "relGrandparent" },
];

/** "Mother" -> "Ammi" (Roman) / "والدہ" (Urdu); custom text ("Nani") is shown as typed. */
export function relationLabel(relation: string, lang: Lang): string {
  const r = (relation || "").trim();
  if (!r) return "";
  const known = RELATIONS.find((x) => x.value.toLowerCase() === r.toLowerCase());
  return known ? t(known.label, lang) : r;
}

/** "Mother · 58 yrs", or just "58 yrs" when no relation is set (no stray dot). */
export function personSubtitle(p: Person, lang: Lang): string {
  return [relationLabel(p.relation, lang), p.age ? t("years", lang, { n: p.age }) : ""].filter(Boolean).join(" · ");
}
