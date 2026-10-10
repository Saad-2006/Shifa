"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ArrowUp, Camera, Mic, MicOff, Paperclip } from "lucide-react";
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
  onFile: (file: File) => void;
  ref?: Ref<ComposerHandle>;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

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
    if (!value || busy) return;
    stopRef.current?.();
    onSend(value);
    setText("");
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (file && !busy) onFile(file);
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
  const canSend = text.trim().length > 0 && !busy;

  return (
    <div className="rounded-[20px] border bg-bg p-1.5 focus-within:border-ink/30">
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
      <label htmlFor="shifa-composer" className="sr-only">
        {t("placeholder", lang)}
      </label>
      <textarea
        id="shifa-composer"
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
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
        placeholder={listening ? t("listening", lang) : t("placeholder", lang)}
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
