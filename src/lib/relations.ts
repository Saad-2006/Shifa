// Family relations: stored as plain English words ("Mother"), shown in the user's language.
// One relation per chip (Brother and Sister, not "Brother / Sister"), each with the sex it implies.
import { t, type I18nKey } from "@/lib/i18n";
import type { Lang, Person, Sex } from "@/lib/types";

export interface Relation {
  value: string;
  label: I18nKey;
  sex?: Exclude<Sex, "">;
}

export const RELATIONS: Relation[] = [
  { value: "Self", label: "relSelf" },
  { value: "Mother", label: "relMother", sex: "F" },
  { value: "Father", label: "relFather", sex: "M" },
  { value: "Brother", label: "relBrother", sex: "M" },
  { value: "Sister", label: "relSister", sex: "F" },
  { value: "Husband", label: "relHusband", sex: "M" },
  { value: "Wife", label: "relWife", sex: "F" },
  { value: "Son", label: "relSon", sex: "M" },
  { value: "Daughter", label: "relDaughter", sex: "F" },
  { value: "Dadi", label: "relDadi", sex: "F" },
  { value: "Nani", label: "relNani", sex: "F" },
  { value: "Dada", label: "relDada", sex: "M" },
  { value: "Nana", label: "relNana", sex: "M" },
];

// Values saved before relations were split ("Sibling"), and by the old add form ("Grandmother").
// Still shown in the user's language; with a known sex they read as the specific relation.
const LEGACY: Record<string, { label: I18nKey; M?: string; F?: string }> = {
  sibling: { label: "relSibling", M: "Brother", F: "Sister" },
  spouse: { label: "relSpouse", M: "Husband", F: "Wife" },
  child: { label: "relChild", M: "Son", F: "Daughter" },
  grandparent: { label: "relGrandparent" },
  grandmother: { label: "relGrandmother" },
  grandfather: { label: "relGrandfather" },
};

const findRelation = (value: string) => RELATIONS.find((x) => x.value.toLowerCase() === value.trim().toLowerCase());

/** "Sibling" + Male -> "Brother"; anything else unchanged. */
export function specificRelation(relation: string, sex?: Sex): string {
  const legacy = LEGACY[(relation || "").trim().toLowerCase()];
  return (legacy && sex && legacy[sex]) || relation;
}

/** True for one of the chips or an older saved value (so it isn't treated as typed text). */
export function isKnownRelation(relation: string): boolean {
  return Boolean(findRelation(relation) || LEGACY[(relation || "").trim().toLowerCase()]);
}

/** The sex a relation implies ("Sister" -> "F"); "" for Self or custom text. */
export function relationSex(relation: string): Sex {
  return findRelation(relation)?.sex ?? "";
}

/** "Mother" -> "Ammi" (Roman) / "والدہ" (Urdu); custom text ("Phuppo") is shown as typed. */
export function relationLabel(relation: string, lang: Lang, sex?: Sex): string {
  const r = specificRelation((relation || "").trim(), sex);
  if (!r) return "";
  const known = findRelation(r);
  if (known) return t(known.label, lang);
  const legacy = LEGACY[r.toLowerCase()];
  return legacy ? t(legacy.label, lang) : r;
}

/** Quick chips for "Who is X to you?": Me first, then relations that fit the sex on the report. */
export function quickRelations(sex: Sex | undefined, max = 5): Relation[] {
  const fits = RELATIONS.filter((r) => r.value !== "Self" && (!sex || r.sex === sex));
  return [RELATIONS[0], ...fits].slice(0, sex ? max : 3);
}

/** "Mother · 58 yrs", or just "58 yrs" when no relation is set (no stray dot). */
export function personSubtitle(p: Person, lang: Lang): string {
  return [relationLabel(p.relation, lang, p.sex), p.age ? t("years", lang, { n: p.age }) : ""].filter(Boolean).join(" · ");
}
