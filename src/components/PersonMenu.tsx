"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, UserPlus } from "lucide-react";
import { t, urduFont } from "@/lib/i18n";
import type { Lang, Person } from "@/lib/types";
import AddPersonForm, { type NewPerson } from "./AddPersonForm";
import { initialOf } from "./reportUtils";
import { personSubtitle } from "@/lib/relations";

export function Avatar({ person, size = 28, active = false }: { person: Person | null; size?: number; active?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${
        active ? "bg-ink text-on-ink" : "border bg-surface text-ink"
      }`}
    >
      {initialOf(person)}
    </span>
  );
}

/** Header chip: initial + name + ▾, with the family list and "+ Add family member". */
export default function PersonMenu({
  lang,
  people,
  activeId,
  onSelect,
  onAdd,
}: {
  lang: Lang;
  people: Person[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: (p: NewPerson) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = people.find((p) => p.id === activeId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setAdding(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setAdding(people.length === 0);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("switchPerson", lang)}
        className="inline-flex min-h-11 max-w-full min-w-11 items-center justify-center gap-1.5 rounded-full border bg-bg py-1 ps-1 pe-1 hover:bg-surface min-[420px]:pe-2.5"
      >
        {active ? <Avatar person={active} /> : <UserPlus size={20} aria-hidden className="mx-1.5" />}
        <span
          className={`hidden max-w-[5rem] min-w-0 truncate text-sm font-medium min-[420px]:block sm:max-w-[10rem] ${
            active ? "" : urduFont(lang)
          }`}
        >
          {active ? active.name : t("choosePerson", lang)}
        </span>
        <ChevronDown size={16} aria-hidden className="hidden shrink-0 text-muted sm:block" />
      </button>

      {open && (
        <div className="absolute end-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] animate-fade-in rounded-card border bg-bg p-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          {!adding ? (
            <>
              <ul className="max-h-72 overflow-y-auto">
                {people.map((p) => {
                  const isActive = p.id === activeId;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(p.id);
                          setOpen(false);
                        }}
                        className="flex min-h-11 w-full items-center gap-2.5 rounded-input px-2 text-start hover:bg-surface"
                        aria-current={isActive ? "true" : undefined}
                      >
                        <Avatar person={p} active={isActive} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-muted">{personSubtitle(p, lang)}</span>
                        </span>
                        {isActive && <Check size={18} aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className={`mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-input px-2 text-start font-medium hover:bg-surface ${
                  people.length ? "border-t" : ""
                }`}
              >
                <UserPlus size={20} aria-hidden className="mx-1" />
                <span className={urduFont(lang)}>{t("addFamily", lang)}</span>
              </button>
            </>
          ) : (
            <div className="p-2">
              <p className={`mb-2 font-semibold ${urduFont(lang)}`}>{t("addFamily", lang)}</p>
              <AddPersonForm
                lang={lang}
                onSubmit={(p) => {
                  onAdd(p);
                  setAdding(false);
                  setOpen(false);
                }}
                onCancel={() => {
                  setAdding(false);
                  if (people.length === 0) setOpen(false);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
