"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Info, Upload, XCircle } from "lucide-react";
import { t, urduFont } from "@/lib/i18n";
import { shifa } from "@/lib/store";
import type { Lang } from "@/lib/types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Status = { tone: "ok" | "info" | "bad"; text: string } | null;

/**
 * Backup = download everything on this device as a .json file; Restore = merge such a file back in.
 * "full" is the drawer section; "link" is a single restore link for the welcome screen (new device).
 */
/** Small secondary action on the welcome screen (same look for "Load demo family" and "Restore"). */
export const ACTION_TILE =
  "flex min-h-14 w-full items-start gap-2.5 rounded-input border bg-bg px-3 py-2.5 text-start text-sm transition-colors hover:bg-surface disabled:opacity-50";

export default function BackupRestore({
  lang,
  busy = false,
  hasData = true,
  variant = "full",
}: {
  lang: Lang;
  busy?: boolean;
  hasData?: boolean;
  variant?: "full" | "link";
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!status) return;
    const id = setTimeout(() => setStatus(null), 7000);
    return () => clearTimeout(id);
  }, [status]);

  const backup = () => {
    const blob = new Blob([shifa.exportBackup()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shifa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus({ tone: "ok", text: t("backupDone", lang) });
  };

  const restore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setStatus({ tone: "bad", text: t("restoreBad", lang) });
      return;
    }
    const r = shifa.importBackup(await file.text());
    if (!r.ok) setStatus({ tone: "bad", text: t("restoreBad", lang) });
    else if (r.people + r.reports + r.messages === 0) setStatus({ tone: "info", text: t("restoreNothing", lang) });
    else setStatus({ tone: "ok", text: t("restoreDone", lang, { p: r.people, r: r.reports, m: r.messages }) });
  };

  const input = (
    <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void restore(e)} />
  );

  const message = status && (
    <p
      role="status"
      className={`mt-2 flex items-start gap-1.5 text-xs leading-snug ${
        status.tone === "ok" ? "text-ok" : status.tone === "bad" ? "text-bad" : "text-muted"
      } ${urduFont(lang)}`}
    >
      {status.tone === "ok" ? (
        <CheckCircle2 size={14} aria-hidden className="mt-0.5 shrink-0" />
      ) : status.tone === "bad" ? (
        <XCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
      ) : (
        <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
      )}
      <span>{status.text}</span>
    </p>
  );

  if (variant === "link") {
    return (
      <div className="min-w-0">
        {input}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={ACTION_TILE}>
          <Upload size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" />
          <span className="min-w-0">
            <span className={`block font-medium ${urduFont(lang)}`}>{t("restoreShort", lang)}</span>
            <span className={`block text-xs text-muted ${urduFont(lang)}`}>{t("restoreWhat", lang)}</span>
          </span>
        </button>
        {message}
      </div>
    );
  }

  const rowBtn = "flex min-h-11 w-full items-center gap-2.5 rounded-input px-2 text-start text-sm transition-colors hover:bg-bg disabled:opacity-50";
  return (
    <div>
      {input}
      <button type="button" onClick={backup} disabled={busy || !hasData} className={rowBtn}>
        <Download size={18} aria-hidden className="mx-1 shrink-0" />
        <span className={urduFont(lang)}>{t("backup", lang)}</span>
      </button>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={rowBtn}>
        <Upload size={18} aria-hidden className="mx-1 shrink-0" />
        <span className={urduFont(lang)}>{t("restore", lang)}</span>
      </button>
      <p className={`mt-1 px-2 text-xs leading-snug text-muted ${urduFont(lang)}`}>{t("backupHint", lang)}</p>
      <div className="px-2">{message}</div>
    </div>
  );
}
