"use client";

import { Phone, Siren } from "lucide-react";
import { EMERGENCY_CONTACTS } from "@/lib/emergency";
import { t, urduFont } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

// Used only if the emergency module ships no contacts.
const FALLBACK_CONTACTS = [
  { name: "Rescue 1122", number: "1122", note: "Emergency ambulance service" },
  { name: "Edhi Ambulance", number: "115", note: "Nationwide ambulance" },
];

/** Solid red banner pinned to the top of the chat. Triggered by code (keywords / danger values) or the AI flag. */
export default function EmergencyBanner({ lang, onDismiss }: { lang: Lang; onDismiss: () => void }) {
  const contacts = EMERGENCY_CONTACTS.length > 0 ? EMERGENCY_CONTACTS : FALLBACK_CONTACTS;
  return (
    <div role="alert" className="animate-fade-in bg-emergency text-white">
      <div className="mx-auto max-w-[760px] px-4 py-3">
        <div className="flex items-start gap-3">
          <Siren size={28} aria-hidden className="mt-0.5 shrink-0" strokeWidth={2.25} />
          <div className="min-w-0">
            <p className={`text-lg leading-snug font-bold ${lang === "ur" ? "urdu" : ""}`}>{t("emTitle", lang)}</p>
            <p className={`text-sm text-white/90 ${lang === "ur" ? "urdu" : ""}`}>{t("emSub", lang)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {contacts.map((c) => (
            <a
              key={c.number}
              href={`tel:${c.number.replace(/[^\d+]/g, "")}`}
              className="inline-flex min-h-12 flex-1 basis-40 items-center justify-center gap-2 rounded-input bg-white px-4 text-base font-bold text-emergency focus-visible:outline-white"
            >
              <Phone size={20} aria-hidden strokeWidth={2.5} />
              <span className={urduFont(lang)}>{t("emCall", lang, { label: c.name.includes(c.number) ? c.name : `${c.name} ${c.number}` })}</span>
            </a>
          ))}
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-11 rounded-input px-3 text-sm font-medium text-white underline underline-offset-4 hover:bg-white/10 focus-visible:outline-white"
          >
            <span className={urduFont(lang)}>{t("emDismiss", lang)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
