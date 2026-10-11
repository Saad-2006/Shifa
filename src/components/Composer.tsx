"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ArrowUp, Camera, FileText, Mic, MicOff, Paperclip, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { canListen, startListening } from "@/lib/speech";
import type { Lang } from "@/lib/types";

export interface ComposerHandle {
  focus: () => void;
  /** Opens the file picker (photo or PDF; on phones this also offers the camera). */
  openFilePicker: () => void;
  openCamera: () => void;
}

const MAX_HEIGHT = 168;

/** Photos and PDFs can be scanned; anything else (pasted text files etc.) is ignored. */
const isReportFile = (f: File) => f.type.startsWith("image/") || f.type === "application/pdf";

export default function Composer({
  lang,
  busy,
  onSend,
  onFile,
  ref,
}: {
  lang: Lang;
  busy: boolean;
  onSend: (text: string) => void;
  /** A report to scan, with the optional question typed next to it. */
  onFile: (file: File, note: string) => void;
  ref?: Ref<ComposerHandle>;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  // An attached report waits here (with a preview) until Send, so a question can be added.
  const [staged, setStaged] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!staged || !staged.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(staged);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [staged]);
  const stage = (file: File | undefined | null) => {
    if (!file || !isReportFile(file)) return;
    setStaged(file);
    textareaRef.current?.focus();
  };

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
      openFilePicker: () => fileRef.current?.click(),
      openCamera: () => cameraRef.current?.click(),
    }),
    [],
  );

  // Feature-detect after mount so server and client markup match.
  useEffect(() => {
    setMicSupported(canListen());
    return () => stopRef.current?.();
  }, []);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [text, resize]);

  const submit = () => {
    const value = text.trim();
    if (busy || (!value && !staged)) return;
    stopRef.current?.();
    if (staged) onFile(staged, value);
    else onSend(value);
    setText("");
    setStaged(null);
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    stage(file);
  };

  const toggleMic = () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setListening(true);
    const before = text.trim();
    stopRef.current = startListening(
      lang,
      (heard) => setText(before ? `${before} ${heard}` : heard),
      () => {
        setListening(false);
        stopRef.current = null;
        textareaRef.current?.focus();
      },
    );
  };

  const iconBtn =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent";
  const canSend = (text.trim().length > 0 || staged !== null) && !busy;

  return (
    <div
      className={`rounded-[20px] border bg-bg p-1.5 focus-within:border-ink/30 ${dragging ? "border-accent bg-surface" : ""}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        stage(Array.from(e.dataTransfer.files).find(isReportFile));
      }}
    >
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={pick}
        tabIndex={-1}
        aria-hidden
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={pick}
        tabIndex={-1}
        aria-hidden
      />
      {staged && (
        <div className="flex items-center gap-2.5 px-1.5 pt-1 pb-1.5">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the user's own file
            <img src={preview} alt="" className="h-12 w-12 shrink-0 rounded-lg border object-cover" />
          ) : (
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted">
              <FileText size={22} aria-hidden />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{staged.name || t("attachedReport", lang)}</span>
            <span className={`block text-xs text-muted ${lang === "ur" ? "urdu-font" : ""}`}>{t("attachedHint", lang)}</span>
          </span>
          <button
            type="button"
            onClick={() => setStaged(null)}
            aria-label={t("removeAttachment", lang)}
            title={t("removeAttachment", lang)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      )}
      <label htmlFor="shifa-composer" className="sr-only">
        {t("placeholder", lang)}
      </label>
      <textarea
        id="shifa-composer"
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          // A pasted screenshot or photo becomes the attachment (text pastes as usual).
          const file = Array.from(e.clipboardData?.files ?? []).find(isReportFile);
          if (!file) return;
          e.preventDefault();
          stage(file);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        maxLength={2000}
        disabled={busy}
        dir={lang === "ur" ? "rtl" : "auto"}
        placeholder={listening ? t("listening", lang) : staged ? t("placeholderWithFile", lang) : t("placeholder", lang)}
        className={`block max-h-[168px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[1.0625rem] leading-relaxed outline-none placeholder:text-muted focus-visible:outline-none disabled:opacity-60 ${
          lang === "ur" ? "urdu-font" : ""
        }`}
      />
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={iconBtn}
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          aria-label={t("camera", lang)}
          title={t("camera", lang)}
        >
          <Camera size={22} aria-hidden />
        </button>
        <button
          type="button"
          className={iconBtn}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label={t("attach", lang)}
          title={t("attach", lang)}
        >
          <Paperclip size={22} aria-hidden />
        </button>
        <div className="flex-1" />
        {micSupported && (
          <button
            type="button"
            className={`${iconBtn} ${listening ? "bg-ink text-on-ink hover:bg-ink hover:text-on-ink" : ""}`}
            onClick={toggleMic}
            disabled={busy}
            aria-pressed={listening}
            aria-label={listening ? t("micStop", lang) : t("mic", lang)}
            title={listening ? t("micStop", lang) : t("mic", lang)}
          >
            {listening ? <MicOff size={22} aria-hidden /> : <Mic size={22} aria-hidden />}
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label={t("send", lang)}
          title={t("send", lang)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:bg-border disabled:text-muted"
        >
          <ArrowUp size={22} aria-hidden strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
