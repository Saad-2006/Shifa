"use client";

import { MessageCircle } from "lucide-react";
import { t, urduFont } from "@/lib/i18n";
import type { AlertContact, Lang } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

/**
 * One-tap WhatsApp alert with a message written by code: the main action of the urgent card.
 * One button per saved family number, or one button that lets the user pick a chat in WhatsApp.
 * The user always taps Send there.
 */
export default function WhatsAppAlertButtons({
  text,
  contacts,
  lang,
}: {
  text: string;
  contacts: AlertContact[];
  lang: Lang;
}) {
  const targets = contacts.length ? contacts.map((c) => ({ key: c.id, label: t("waSendTo", lang, { name: c.name }), href: waLink(text, c.phone) })) : [{ key: "pick", label: t("waSend", lang), href: waLink(text) }];
  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((x) => (
        <a
          key={x.key}
          href={x.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 flex-1 basis-40 items-center justify-center gap-2 rounded-input bg-ok px-4 font-semibold text-on-ink hover:bg-ok/90"
        >
          <MessageCircle size={20} aria-hidden />
          <span className={urduFont(lang)}>{x.label}</span>
        </a>
      ))}
    </div>
  );
}
