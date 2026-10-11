"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FileText, MessageCircleQuestionMark, Plus, ScanLine, Users } from "lucide-react";
import { t, urduFont } from "@/lib/i18n";
import type { Lang, Person } from "@/lib/types";
import AddPersonForm, { type NewPerson } from "./AddPersonForm";
import LanguageToggle from "./LanguageToggle";
import { Avatar } from "./PersonMenu";
import { ShifaAvatar } from "./ChatThread";
import { ACTION_TILE } from "./BackupRestore";

function BigButton({
  Icon,
  title,
  hint,
  onClick,
  primary,
  disabled,
  lang,
}: {
  Icon: LucideIcon;
  title: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  lang: Lang;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[4.5rem] w-full items-center gap-3 rounded-card border px-4 py-3 text-start transition-colors disabled:opacity-50 sm:flex-col sm:items-start sm:py-4 ${
        primary
          ? "border-ink bg-ink text-on-ink hover:bg-ink/90"
          : "bg-bg text-ink hover:border-ink/25 hover:bg-surface"
      }`}
    >
      <Icon size={26} aria-hidden className="shrink-0" />
      <span className="min-w-0">
        <span className={`block text-[1.0625rem] font-semibold ${urduFont(lang)}`}>{title}</span>
        <span className={`block text-sm ${primary ? "text-on-ink/75" : "text-muted"} ${urduFont(lang)}`}>{hint}</span>
      </span>
    </button>
  );
}

/** First screen: greeting, who is this for, language, and three big choices. */
export default function WelcomeState({
  lang,
  people,
  activeId,
  busy,
  onSelectPerson,
  onAddPerson,
  onLangChange,
  onScan,
  onAsk,
  onSample,
  onLoadDemo,
  restoreLink,
  footer,
}: {
  lang: Lang;
  people: Person[];
  activeId: string | null;
  busy: boolean;
  onSelectPerson: (id: string) => void;
  onAddPerson: (p: NewPerson) => void;
  onLangChange: (l: Lang) => void;
  onScan: () => void;
  onAsk: () => void;
  onSample: () => void;
  onLoadDemo: () => void;
  /** "Restore a backup" link, shown on one line with "Load demo family". */
  restoreLink?: React.ReactNode;
  /** Optional block under the main choices (e.g. Google sign-in). */
  footer?: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const ur = lang === "ur";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[760px] animate-fade-in px-4 pt-8 pb-10 sm:pt-12">
        <div className="flex items-start gap-3">
          <ShifaAvatar />
          <div className="min-w-0" dir={ur ? "rtl" : undefined}>
            <h1 className={`text-2xl font-semibold ${ur ? "urdu" : ""}`}>{t("greeting", lang)}</h1>
            <p className={`mt-1 text-muted ${ur ? "urdu" : "leading-relaxed"}`}>{t("welcomeLine", lang)}</p>
          </div>
        </div>

        <section className="mt-8">
          <h2 className={`text-sm font-semibold text-muted ${urduFont(lang)}`}>{t("whoFor", lang)}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {people.map((p) => {
              const isActive = p.id === activeId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectPerson(p.id)}
                  aria-pressed={isActive}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border py-1 ps-1 pe-4 transition-colors ${
                    isActive ? "border-ink bg-ink text-on-ink" : "bg-bg hover:bg-surface"
                  }`}
                >
                  <Avatar person={p} active={!isActive} size={30} />
                  <span className="font-medium">{p.name}</span>
                </button>
              );
            })}
            {!adding && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed px-4 text-muted transition-colors hover:border-ink/30 hover:text-ink"
              >
                <Plus size={18} aria-hidden />
                <span className={urduFont(lang)}>{t("addFamily", lang)}</span>
              </button>
            )}
          </div>
          {adding && (
            <div className="mt-3 max-w-md rounded-card border p-4">
              <AddPersonForm
                lang={lang}
                onSubmit={(p) => {
                  onAddPerson(p);
                  setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}
        </section>

        <section className="mt-6">
          <h2 className={`mb-2 text-sm font-semibold text-muted ${urduFont(lang)}`}>{t("language", lang)}</h2>
          <LanguageToggle lang={lang} onChange={onLangChange} size="lg" />
        </section>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <BigButton
            Icon={ScanLine}
            title={t("scanReport", lang)}
            hint={t("scanReportHint", lang)}
            onClick={onScan}
            disabled={busy}
            primary
            lang={lang}
          />
          <BigButton
            Icon={MessageCircleQuestionMark}
            title={t("askQuestion", lang)}
            hint={t("askQuestionHint", lang)}
            onClick={onAsk}
            disabled={busy}
            lang={lang}
          />
          <BigButton
            Icon={FileText}
            title={t("trySample", lang)}
            hint={t("trySampleHint", lang)}
            onClick={onSample}
            disabled={busy}
            lang={lang}
          />
        </div>

        {/* Two secondary actions side by side, same look. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-md">
          <button type="button" onClick={onLoadDemo} disabled={busy} className={ACTION_TILE}>
            <Users size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" />
            <span className="min-w-0">
              <span className={`block font-medium ${urduFont(lang)}`}>{t("loadDemo", lang)}</span>
              <span className={`block text-xs text-muted ${urduFont(lang)}`}>{t("loadDemoHint", lang)}</span>
            </span>
          </button>
          {restoreLink}
        </div>

        {footer && <div className="mt-6 max-w-sm">{footer}</div>}
      </div>
    </div>
  );
}
