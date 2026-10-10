"use client";

import { useState } from "react";
import { UserCheck, UserPlus, UserRoundSearch, X } from "lucide-react";
import { t, urduFont, type I18nKey } from "@/lib/i18n";
import type { IdentityConflict, Lang, PendingIdentity, Person } from "@/lib/types";
import { findPersonByName } from "@/lib/identity";
import { patientLine } from "./reportUtils";
import type { IdentityChoice } from "./useShifaChat";

function sexWord(sex: string, lang: Lang): string {
  if (sex === "F") return t("sexF", lang);
  if (sex === "M") return t("sexM", lang);
  return sex;
}

const CONFLICT_KEY: Record<IdentityConflict["kind"], I18nKey> = {
  sex: "idConflictSex",
  age: "idConflictAge",
  name: "idConflictName",
};

/**
 * "Is this report for Abbu?" Shown when the name, age or sex on a report doesn't match the
 * family member (decided by code in identity.ts). Nothing is added until the user picks.
 */
export default function IdentityCheckCard({
  pending,
  people,
  lang,
  disabled,
  onResolve,
}: {
  pending: PendingIdentity;
  people: Person[];
  lang: Lang;
  disabled: boolean;
  onResolve: (choice: IdentityChoice) => void;
}) {
  const [showOthersState, setShowOthers] = useState(pending.mode === "move");
  const forPerson = people.find((p) => p.id === pending.forPersonId);
  const forName = forPerson?.name ?? t("familyMember", lang);
  const suggested = pending.suggestedPersonId ? people.find((p) => p.id === pending.suggestedPersonId) : undefined;
  const others = people.filter((p) => p.id !== pending.forPersonId && p.id !== suggested?.id);
  const byName = findPersonByName(others, pending.patient.name);
  const { name, age, sex } = pending.patient;
  const onReport = patientLine({ name, age, sex }, lang);
  const ur = urduFont(lang);
  // A profile with this printed name already exists: offer it, never a duplicate "New profile".
  const existing = findPersonByName(people, name);
  const showOthers = showOthersState || Boolean(byName);

  const btn =
    "flex min-h-12 w-full items-center gap-2.5 rounded-input border px-3.5 text-start font-medium transition-colors disabled:opacity-50";

  return (
    <section
      role="group"
      aria-label={pending.mode === "confirm" ? t("idTitle", lang, { name: forName }) : t("idMoveTitle", lang)}
      className="animate-fade-in rounded-card border border-warn/40 bg-warn-bg p-4"
    >
      <div className="flex items-start gap-3">
        <UserRoundSearch size={24} aria-hidden className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0">
          <h3 className={`text-lg leading-snug font-semibold ${ur}`}>
            {pending.mode === "confirm" ? t("idTitle", lang, { name: forName }) : t("idMoveTitle", lang)}
          </h3>
          {pending.mode === "confirm" && <p className={`mt-1 text-sm ${ur}`}>{t("idBody", lang, { name: forName })}</p>}
        </div>
      </div>

      {onReport && (
        <p className="mt-3 rounded-input bg-bg px-3 py-2 text-sm">
          <span className={`text-muted ${ur}`}>{t("idOnReport", lang)}: </span>
          <bdi className="font-semibold">{onReport}</bdi>
        </p>
      )}

      {pending.conflicts.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {pending.conflicts.map((c, i) => (
            <li key={i} className={`flex gap-2 ${ur}`}>
              <span aria-hidden className="text-warn">
                •
              </span>
              <span>
                {t(CONFLICT_KEY[c.kind], lang, {
                  name: forName,
                  report: c.kind === "sex" ? sexWord(c.report, lang) : c.report,
                  profile: c.kind === "sex" ? sexWord(c.profile, lang) : c.profile,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2">
        {suggested && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onResolve({ kind: "person", personId: suggested.id })}
            className={`${btn} border-accent bg-accent text-white hover:bg-accent-hover`}
          >
            <UserCheck size={18} aria-hidden className="shrink-0" />
            <span className={ur}>{t("idAddTo", lang, { name: suggested.name })}</span>
          </button>
        )}

        {pending.mode === "confirm" && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onResolve({ kind: "person", personId: pending.forPersonId })}
            className={`${btn} bg-bg hover:bg-surface`}
          >
            <UserCheck size={18} aria-hidden className="shrink-0 text-muted" />
            <span className={ur}>{t("idAddAnyway", lang, { name: forName })}</span>
          </button>
        )}

        {showOthers &&
          others.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onResolve({ kind: "person", personId: p.id })}
              className={`${btn} bg-bg hover:bg-surface`}
            >
              <UserCheck size={18} aria-hidden className="shrink-0 text-muted" />
              <span className={ur}>{t("idAddTo", lang, { name: p.name })}</span>
            </button>
          ))}

        {!existing && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onResolve({ kind: "new" })}
            className={`${btn} bg-bg hover:bg-surface`}
          >
            <UserPlus size={18} aria-hidden className="shrink-0 text-muted" />
            <span className={ur}>{name ? t("idNewProfile", lang, { name }) : t("idNewProfilePlain", lang)}</span>
          </button>
        )}

        {!showOthers && others.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowOthers(true)}
            className={`min-h-11 px-1 text-sm text-muted underline underline-offset-4 hover:text-ink ${ur}`}
          >
            {t("idSomeoneElse", lang)}
          </button>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolve({ kind: "cancel" })}
          className={`flex min-h-11 w-full items-center justify-center gap-1.5 text-sm text-muted hover:text-ink disabled:opacity-50 ${ur}`}
        >
          <X size={15} aria-hidden />
          {pending.mode === "confirm" ? t("idCancel", lang) : t("idMoveKeep", lang, { name: forName })}
        </button>
      </div>
    </section>
  );
}
