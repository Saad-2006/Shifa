"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FileText, HeartPulse, Paperclip, Phone, Siren, Square, Volume2, WifiOff } from "lucide-react";
import { t, urduFont } from "@/lib/i18n";
import { canSpeak, onVoicesChanged, speak, stopSpeaking } from "@/lib/speech";
import type { ChatMessage, LabReport, Lang } from "@/lib/types";
import Markdown from "./Markdown";
import ReportCard from "./ReportCard";
import ScanProgress, { TypingDots } from "./ScanProgress";

export interface ScanState {
  messageId: string;
  step: number; // 0 reading, 1 checking, 2 explaining
}

export function ShifaAvatar() {
  return (
    <span
      aria-hidden
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-surface text-ink"
    >
      <HeartPulse size={17} strokeWidth={2.25} />
    </span>
  );
}

function AttachmentChip({ name }: { name: string }) {
  const isPdf = /\.pdf$/i.test(name);
  const Icon = isPdf ? FileText : Paperclip;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-bg px-3 py-1 text-sm text-ink">
      <Icon size={15} aria-hidden className="shrink-0 text-muted" />
      <span className="truncate">{name}</span>
    </span>
  );
}

function EmergencyCallout({ lang }: { lang: Lang }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-input border border-bad/30 bg-bad-bg px-3 py-2 text-bad">
      <Siren size={18} aria-hidden className="shrink-0" />
      <span className={`flex-1 text-sm font-semibold ${urduFont(lang)}`}>{t("emergencyInline", lang)}</span>
      <a
        href="tel:1122"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-input bg-emergency px-3 text-sm font-bold text-white"
      >
        <Phone size={16} aria-hidden /> 1122
      </a>
    </div>
  );
}

export default function ChatThread({
  messages,
  reports,
  lang,
  busyMessageId,
  scan,
  onAsk,
  onOpenReport,
  footer,
}: {
  messages: ChatMessage[];
  reports: LabReport[];
  lang: Lang;
  busyMessageId: string | null;
  scan: ScanState | null;
  onAsk: (question: string) => void;
  onOpenReport: (reportId: string) => void;
  footer?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const prevCountRef = useRef(0);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [, setVoiceTick] = useState(0);

  // Voices load asynchronously; re-render so canSpeak("ur") can become true.
  useEffect(() => {
    const off = onVoicesChanged(() => setVoiceTick((n) => n + 1));
    return () => {
      off();
      stopSpeaking();
    };
  }, []);

  const last = messages[messages.length - 1];
  const contentKey = `${messages.length}|${last?.id}|${last?.text.length}|${last?.reportId}|${scan?.step}|${footer ? 1 : 0}`;

  // Auto-scroll on new content, unless the user has scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (messages.length > prevCountRef.current) stickRef.current = true;
    prevCountRef.current = messages.length;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [contentKey, messages.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  };

  const toggleSpeak = (m: ChatMessage, msgLang: Lang) => {
    if (speakingId === m.id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    const ok = speak(m.text, msgLang, () => setSpeakingId((cur) => (cur === m.id ? null : cur)));
    setSpeakingId(ok ? m.id : null);
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 pt-6 pb-8" aria-live="polite" aria-relevant="additions">
        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex animate-fade-in justify-end">
                <div className="flex max-w-[85%] flex-col items-end gap-1.5">
                  {m.attachmentName && <AttachmentChip name={m.attachmentName} />}
                  {m.text.trim() && (
                    <div
                      dir="auto"
                      className="rounded-[20px] rounded-ee-md bg-surface px-4 py-2.5 break-words whitespace-pre-wrap"
                    >
                      {m.text}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          const msgLang = m.lang ?? lang;
          const isBusy = busyMessageId === m.id;
          const report = m.reportId ? reports.find((r) => r.id === m.reportId) : undefined;
          const hasText = m.text.trim().length > 0;
          const scanning = isBusy && scan?.messageId === m.id;

          return (
            <div key={m.id} className="flex animate-fade-in gap-2.5">
              <ShifaAvatar />
              <div className="min-w-0 flex-1 space-y-3">
                {m.reportId &&
                  (report ? (
                    <ReportCard report={report} lang={lang} onAsk={busyMessageId ? undefined : onAsk} onOpen={onOpenReport} />
                  ) : (
                    <p className={`text-sm text-muted italic ${urduFont(lang)}`}>{t("reportDeleted", lang)}</p>
                  ))}

                {m.emergency && <EmergencyCallout lang={msgLang} />}

                {!hasText && isBusy && (scanning ? <ScanProgress step={scan.step} lang={msgLang} /> : <TypingDots label={t("typing", msgLang)} />)}

                {!hasText && !isBusy && !m.reportId && (
                  <p className={`text-muted ${urduFont(msgLang)}`}>{t("errChat", msgLang)}</p>
                )}

                {hasText && (
                  <div
                    lang={msgLang === "ur" ? "ur" : undefined}
                    dir={msgLang === "ur" ? "rtl" : undefined}
                    className={`text-[1.0625rem] ${msgLang === "ur" ? "urdu" : "leading-relaxed"}`}
                  >
                    <Markdown text={m.text} />
                  </div>
                )}

                {hasText && !isBusy && (m.offline || canSpeak(msgLang)) && (
                  <div className="flex flex-wrap items-center gap-1">
                    {canSpeak(msgLang) && (
                      <button
                        type="button"
                        onClick={() => toggleSpeak(m, msgLang)}
                        aria-pressed={speakingId === m.id}
                        className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-surface hover:text-ink"
                      >
                        {speakingId === m.id ? <Square size={15} aria-hidden /> : <Volume2 size={17} aria-hidden />}
                        <span className={urduFont(lang)}>{speakingId === m.id ? t("stop", lang) : t("listen", lang)}</span>
                      </button>
                    )}
                    {m.offline && (
                      <span
                        title={t("offlineHint", lang)}
                        className="inline-flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-xs text-muted"
                      >
                        <WifiOff size={12} aria-hidden />
                        <span className={urduFont(lang)}>{t("offline", lang)}</span>
                        <span className="sr-only">: {t("offlineHint", lang)}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {footer}
      </div>
    </div>
  );
}
