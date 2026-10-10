"use client";

import { useEffect, useRef, useState } from "react";
import { Merge, Trash, X } from "lucide-react";
import { t, urduFont } from "@/lib/i18n";
import { RELATIONS, personSubtitle } from "@/lib/relations";
import { shifa } from "@/lib/store";
import type { LabReport, Lang, Person, Sex } from "@/lib/types";

const reportCount = (n: number, lang: Lang) => (n === 1 ? t("reportOne", lang) : t("reportsN", lang, { n }));

/** Edit a family member: name, relation (one-tap chips), age, sex; merge a duplicate; delete. */
export default function PersonEditSheet({
  person,
  people,
  reports,
  lang,
  onClose,
}: {
  person: Person | null;
  people: Person[];
  reports: LabReport[];
  lang: Lang;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [custom, setCustom] = useState(false); // "Other": type a relation that isn't a chip
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<Sex>("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const open = person !== null;

  useEffect(() => {
    if (!person) return;
    setName(person.name);
    setRelation(person.relation);
    setCustom(!!person.relation.trim() && !RELATIONS.some((r) => r.value.toLowerCase() === person.relation.trim().toLowerCase()));
    setAge(typeof person.age === "number" ? String(person.age) : "");
    setSex(person.sex ?? "");
    setConfirmDelete(false);
  }, [person]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!person) return null;
  const ur = urduFont(lang);
  const others = people.filter((p) => p.id !== person.id);
  const myReports = reports.filter((r) => r.personId === person.id).length;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(age);
    shifa.updatePerson(person.id, {
      name: name.trim() || person.name,
      relation: relation.trim(),
      ...(age.trim() && Number.isFinite(n) && n >= 0 && n < 130 ? { age: Math.round(n) } : { age: undefined }),
      sex,
    });
    onClose();
  };

  const chip = (active: boolean) =>
    `min-h-10 rounded-full border px-3 text-sm transition-colors ${active ? "border-ink bg-ink text-on-ink" : "bg-bg hover:bg-surface"}`;
  const input = "h-11 w-full rounded-input border bg-bg px-3 text-[15px] outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-sheet-title"
        className="relative flex max-h-[90dvh] w-full animate-slide-up flex-col rounded-t-card border bg-bg sm:max-w-lg sm:rounded-card"
      >
        <div className="flex items-start gap-3 border-b px-4 pt-3 pb-3">
          <div className="min-w-0 flex-1">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
            <h2 id="person-sheet-title" className={`truncate text-lg font-semibold ${ur}`}>
              {t("editProfile", lang)}
            </h2>
            <p className="truncate text-sm text-muted">
              {person.name}
              {myReports ? ` · ${reportCount(myReports, lang)}` : ""}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("cancel", lang)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-surface"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <form onSubmit={save} className="space-y-4 overflow-y-auto px-4 py-4">
          <label className="block">
            <span className={`mb-1 block text-sm font-medium text-muted ${ur}`}>{t("name", lang)}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} maxLength={60} required />
          </label>

          <fieldset>
            <legend className={`mb-1.5 text-sm font-medium text-muted ${ur}`}>{t("relation", lang)}</legend>
            <div className="flex flex-wrap gap-2">
              {RELATIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={!custom && relation.trim().toLowerCase() === r.value.toLowerCase()}
                  onClick={() => {
                    setCustom(false);
                    setRelation(r.value);
                  }}
                  className={`${chip(!custom && relation.trim().toLowerCase() === r.value.toLowerCase())} ${ur}`}
                >
                  {t(r.label, lang)}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={custom}
                onClick={() => {
                  if (!custom) setRelation("");
                  setCustom(true);
                }}
                className={`${chip(custom)} ${ur}`}
              >
                {t("relOther", lang)}
              </button>
            </div>
            {custom && (
              <input
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                placeholder={t("otherRelation", lang)}
                className={`${input} mt-2`}
                maxLength={30}
                autoFocus
              />
            )}
          </fieldset>

          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <label className="block">
              <span className={`mb-1 block text-sm font-medium text-muted ${ur}`}>{t("age", lang)}</span>
              <input value={age} onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" className={input} maxLength={3} />
            </label>
            <fieldset>
              <legend className={`mb-1 text-sm font-medium text-muted ${ur}`}>{t("sexLabel", lang)}</legend>
              <div className="grid grid-cols-3 gap-1 rounded-input border bg-bg p-1">
                {(["F", "M", ""] as Sex[]).map((v) => (
                  <button
                    key={v || "unset"}
                    type="button"
                    aria-pressed={sex === v}
                    onClick={() => setSex(v)}
                    className={`min-h-9 rounded-[9px] text-sm ${sex === v ? "bg-ink text-on-ink" : "text-muted hover:bg-surface"} ${ur}`}
                  >
                    {v === "F" ? t("sexF", lang) : v === "M" ? t("sexM", lang) : t("sexUnset", lang)}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <button type="submit" className={`min-h-12 w-full rounded-input bg-accent px-4 font-semibold text-white hover:bg-accent-hover ${ur}`}>
            {t("saveChanges", lang)}
          </button>

          {others.length > 0 && (
            <section className="space-y-2 border-t pt-4">
              <h3 className={`text-sm font-semibold ${ur}`}>{t("mergeTitle", lang)}</h3>
              <p className={`text-xs text-muted ${ur}`}>{t("mergeHint", lang, { name: person.name })}</p>
              {others.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    shifa.mergePeople(person.id, p.id);
                    onClose();
                  }}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-input border px-3 text-start text-sm hover:bg-surface"
                >
                  <Merge size={16} aria-hidden className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${ur}`}>{t("mergeInto", lang, { name: p.name })}</span>
                    <span className="block truncate text-xs text-muted">
                      {[personSubtitle(p, lang), reportCount(reports.filter((r) => r.personId === p.id).length, lang)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              ))}
            </section>
          )}

          <section className="border-t pt-4">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className={`flex min-h-11 items-center gap-2 rounded-input px-2 text-sm text-bad hover:bg-bad-bg ${ur}`}
              >
                <Trash size={16} aria-hidden />
                {t("deleteProfile", lang)}
              </button>
            ) : (
              <div role="alertdialog" aria-label={t("deleteProfile", lang)} className="rounded-input border border-bad/40 bg-bad-bg p-3">
                <p className={`text-sm font-medium ${ur}`}>{t("deleteConfirm", lang, { name: person.name, n: myReports })}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      shifa.deletePerson(person.id);
                      onClose();
                    }}
                    className={`min-h-11 flex-1 rounded-input bg-bad px-3 text-sm font-semibold text-white ${ur}`}
                  >
                    {t("deleteYes", lang)}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className={`min-h-11 rounded-input border bg-bg px-3 text-sm ${ur}`}>
                    {t("cancel", lang)}
                  </button>
                </div>
              </div>
            )}
          </section>
        </form>
      </div>
    </div>
  );
}
