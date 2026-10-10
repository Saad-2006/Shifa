"use client";

import { useId, useState } from "react";
import { t, urduFont } from "@/lib/i18n";
import { RELATIONS } from "@/lib/relations";
import type { Lang } from "@/lib/types";

export interface NewPerson {
  name: string;
  relation: string;
  age?: number;
}

/** Small inline form: name, relation, age. */
export default function AddPersonForm({
  lang,
  onSubmit,
  onCancel,
}: {
  lang: Lang;
  onSubmit: (p: NewPerson) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [age, setAge] = useState("");

  const ageNum = Number(age);
  const valid = name.trim().length > 0;

  const input =
    "mt-1 block min-h-11 w-full rounded-input border bg-bg px-3 text-base outline-none focus:border-ink/40 focus-visible:outline-2";

  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({
          name: name.trim(),
          relation: relation.trim() || "Family",
          age: age && Number.isFinite(ageNum) && ageNum > 0 && ageNum < 130 ? Math.round(ageNum) : undefined,
        });
      }}
    >
      <label className="block text-sm font-medium">
        <span className={urduFont(lang)}>{t("name", lang)}</span>
        <input
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder", lang)}
          autoFocus
          maxLength={40}
          autoComplete="off"
          dir="auto"
        />
      </label>
      <div className="flex gap-2">
        <label className="block flex-1 text-sm font-medium">
          <span className={urduFont(lang)}>{t("relation", lang)}</span>
          <input
            className={input}
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            placeholder={t("relationPlaceholder", lang)}
            list={`${id}-relations`}
            maxLength={30}
            autoComplete="off"
            dir="auto"
          />
          <datalist id={`${id}-relations`}>
            {RELATIONS.map((r) => (
              <option key={r.value} value={r.value} />
            ))}
          </datalist>
        </label>
        <label className="block w-20 text-sm font-medium">
          <span className={urduFont(lang)}>{t("age", lang)}</span>
          <input
            className={input}
            value={age}
            onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
            placeholder="60"
            autoComplete="off"
          />
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!valid}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-input bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:bg-border disabled:text-muted"
        >
          <span className={urduFont(lang)}>{t("save", lang)}</span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center justify-center rounded-input border px-4 text-sm font-medium hover:bg-surface"
        >
          <span className={urduFont(lang)}>{t("cancel", lang)}</span>
        </button>
      </div>
    </form>
  );
}
