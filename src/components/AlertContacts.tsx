"use client";

import { useState } from "react";
import { MessageCircle, Plus, X } from "lucide-react";
import { t, urduFont } from "@/lib/i18n";
import { shifa } from "@/lib/store";
import type { AlertContact, Lang } from "@/lib/types";
import { formatPhone, normalisePhone } from "@/lib/whatsapp";

const MAX = 3;

/** Up to 3 family WhatsApp numbers for one-tap emergency alerts (saved only on this phone). */
export default function AlertContacts({ contacts, lang }: { contacts: AlertContact[]; lang: Lang }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState(false);
  const ur = urduFont(lang);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = normalisePhone(phone);
    if (!digits) return setError(true);
    shifa.addContact({ name, phone: digits });
    setName("");
    setPhone("");
    setError(false);
    setAdding(false);
  };

  const input = "h-11 w-full rounded-input border bg-bg px-3 text-[15px] outline-none focus:border-ink/50";

  return (
    <div className="space-y-2">
      {contacts.map((c) => (
        <div key={c.id} className="flex min-h-11 items-center gap-2.5 rounded-input border bg-bg px-3">
          <MessageCircle size={17} aria-hidden className="shrink-0 text-ok" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{c.name}</span>
            <span className="block text-xs text-muted" dir="ltr">
              {formatPhone(c.phone)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => shifa.removeContact(c.id)}
            aria-label={t("contactRemove", lang, { name: c.name })}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ))}

      {adding ? (
        <form onSubmit={save} className="space-y-2 rounded-input border bg-bg p-3">
          <label className="block">
            <span className={`mb-1 block text-xs font-medium text-muted ${ur}`}>{t("contactName", lang)}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("contactNamePlaceholder", lang)} className={input} maxLength={40} />
          </label>
          <label className="block">
            <span className={`mb-1 block text-xs font-medium text-muted ${ur}`}>{t("contactPhone", lang)}</span>
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError(false);
              }}
              placeholder="0300 1234567"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              aria-invalid={error}
              className={input}
              maxLength={20}
              required
            />
          </label>
          {error && (
            <p role="alert" className={`text-xs text-bad ${ur}`}>
              {t("contactBadPhone", lang)}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" className={`min-h-11 flex-1 rounded-input bg-ink px-3 text-sm font-medium text-on-ink hover:bg-ink/90 ${ur}`}>
              {t("contactAdd", lang)}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(false);
              }}
              className={`min-h-11 rounded-input border px-3 text-sm hover:bg-surface ${ur}`}
            >
              {t("cancel", lang)}
            </button>
          </div>
        </form>
      ) : (
        contacts.length < MAX && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-input px-2 text-start text-sm transition-colors hover:bg-bg"
          >
            <Plus size={18} aria-hidden className="mx-1 shrink-0" />
            <span className={ur}>{t("contactAdd", lang)}</span>
          </button>
        )
      )}
      <p className={`px-2 text-xs leading-snug text-muted ${ur}`}>{t("alertContactsHint", lang)}</p>
    </div>
  );
}
