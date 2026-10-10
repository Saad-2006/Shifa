"use client";

import { MessageCircle } from "lucide-react";
import { t, urduFont } from "@/lib/i18n";
import type { AlertContact, Lang } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

/**
 * One-tap WhatsApp alert with a message written by code. One button per saved family number,
 * or one button that lets the user pick a chat in WhatsApp. The user always taps Send there.
 */
export default function WhatsAppAlertButtons({
  text,
  contacts,
  lang,
  onRed = false,
}: {
  text: string;
  contacts: AlertContact[];
  lang: Lang;
  /** Inside the red emergency banner (white buttons). */
  onRed?: boolean;
}) {
  const cls = onRed
    ? "bg-white/15 text-white ring-1 ring-white/60 hover:bg-white/25"
    : "border border-ok/40 bg-ok-bg text-ok hover:bg-ok/15";
  const targets = contacts.length ? contacts.map((c) => ({ key: c.id, label: t("waSendTo", lang, { name: c.name }), href: waLink(text, c.phone) })) : [{ key: "pick", label: t("waSend", lang), href: waLink(text) }];
  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((x) => (
        <a
          key={x.key}
          href={x.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-11 flex-1 basis-40 items-center justify-center gap-2 rounded-input px-4 text-sm font-semibold ${cls}`}
        >
          <MessageCircle size={18} aria-hidden />
          <span className={urduFont(lang)}>{x.label}</span>
        </a>
      ))}
    </div>
  );
}
