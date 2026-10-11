"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FileText, HeartPulse, Info, Languages, Paperclip, Square, Volume2 } from "lucide-react";
import { detectEmergency } from "@/lib/emergency";
import { scrubLabels } from "@/lib/outputScrub";
import { LANG_SELF_NAME, t, urduFont } from "@/lib/i18n";
import { canSpeak, onVoicesChanged, primeSpeech, readAloudPlan, speak, stopSpeaking, type VoiceLang } from "@/lib/speech";
import type { AlertContact, ChatMessage, LabReport, Lang, Person } from "@/lib/types";
import IdentityCheckCard from "./IdentityCheckCard";
import Markdown from "./Markdown";
import ReportCard from "./ReportCard";
import ScanProgress, { TypingDots } from "./ScanProgress";
import UrgentCard from "./UrgentCard";
import { keywordAlertText } from "@/lib/whatsapp";
import { translateMessage, type IdentityChoice } from "./useShifaChat";

const LANGS: Lang[] = ["en", "ur", "roman"];

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

/** The user's message this reply answers, when code finds emergency words in it ("Abbu behosh ho gaye"). */
function typedEmergency(messages: ChatMessage[], i: number) {
  for (let j = i - 1; j >= 0; j--) {
    if (messages[j].role !== "user") continue;
    const r = detectEmergency(messages[j].text);
    return r.isEmergency ? r : null;
  }
  return null;
}

export default function ChatThread({
  messages,
  reports,
  lang,
  busyMessageId,
  scan,
  onAsk,
  onOpenReport,
  people,
  onResolveIdentity,
  onWrongPerson,
  contacts,
  onSetRelation,
  onEditPerson,
  footer,
}: {
  contacts: AlertContact[];
  onSetRelation: (personId: string, relation: string) => void;
  onEditPerson: (personId: string) => void;
  messages: ChatMessage[];
  reports: LabReport[];
  lang: Lang;
  busyMessageId: string | null;
  scan: ScanState | null;
  onAsk: (question: string) => void;
  onOpenReport: (reportId: string) => void;
  people: Person[];
  onResolveIdentity: (messageId: string, choice: IdentityChoice) => void;
  onWrongPerson: (messageId: string) => void;
  footer?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const prevCountRef = useRef(0);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [, setVoiceTick] = useState(0);

  // Voices load asynchronously; re-render so the read-aloud plan sees an Urdu or Hindi voice.
  useEffect(() => {
    const off = onVoicesChanged(() => setVoiceTick((n) => n + 1));
    return () => {
      off();
      stopSpeaking();
    };
  }, []);

  const last = messages[messages.length - 1];
  const contentKey = `${messages.length}|${last?.id}|${last?.text.length}|${last?.reportId}|${last?.pendingIdentity?.mode}|${scan?.step}|${footer ? 1 : 0}`;

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

  // Listen. With no Urdu voice on the device, an Urdu answer is read in Devanagari by a Hindi voice
  // (sounds like spoken Urdu), or as Roman Urdu; prepared once on the first tap, then saved.
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [voiceFailedId, setVoiceFailedId] = useState<string | null>(null);
  const [basicInfoId, setBasicInfoId] = useState<string | null>(null); // "Basic answer" explained on tap
  const toggleSpeak = async (m: ChatMessage, text: string, textLang: Lang) => {
    const id = m.id;
    if (speakingId === id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    setVoiceFailedId(null);
    const plan = readAloudPlan(textLang);
    if (!plan) return;
    let sayText: string | null = text;
    let sayLang: VoiceLang = textLang;
    if (plan !== "direct") {
      sayLang = plan;
      sayText = plan === "hi" ? (m.speechHi ?? null) : (m.lang === "roman" ? m.text : (m.translations?.roman ?? null));
      if (!sayText) {
        primeSpeech(); // inside the tap, before waiting: iPhones only start speech from a tap
        setPreparingId(id);
        sayText = await translateMessage(id, plan);
        setPreparingId(null);
        if (!sayText) {
          setVoiceFailedId(id);
          return;
        }
      }
    }
    const ok = speak(sayText, sayLang, () => setSpeakingId((cur) => (cur === id ? null : cur)));
    setSpeakingId(ok ? id : null);
  };

  // "Show in: اردو | Roman" under an answer: translated on tap, saved, display only.
  const [view, setView] = useState<Record<string, Lang>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const showIn = async (m: ChatMessage, to: Lang, original: Lang) => {
    setFailedId(null);
    if (speakingId === m.id) {
      stopSpeaking();
      setSpeakingId(null);
    }
    if (to !== original && !m.translations?.[to]) {
      setTranslatingId(m.id);
      const ok = (await translateMessage(m.id, to)) !== null;
      setTranslatingId(null);
      if (!ok) {
        setFailedId(m.id);
        return;
      }
    }
    setView((v) => ({ ...v, [m.id]: to }));
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 pt-6 pb-8" aria-live="polite" aria-relevant="additions">
        {messages.map((m, i) => {
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
          const personName = people.find((p) => p.id === m.personId)?.name ?? "";
          const wanted = view[m.id];
          const shownLang = wanted && (wanted === msgLang || m.translations?.[wanted]) ? wanted : msgLang;
          const shownText = shownLang === msgLang ? m.text : (m.translations?.[shownLang] ?? m.text);
          // Typed emergency words (checked by code, never the AI alone): calm card, WhatsApp first.
          const typed = m.emergency && !m.reportId ? typedEmergency(messages, i) : null;

          return (
            <div key={m.id} className="flex animate-fade-in gap-2.5">
              <ShifaAvatar />
              <div className="min-w-0 flex-1 space-y-3">
                {m.reportId &&
                  (report ? (
                    <ReportCard
                      report={report}
                      lang={lang}
                      onAsk={busyMessageId ? undefined : onAsk}
                      onOpen={onOpenReport}
                      personName={people.find((p) => p.id === m.personId)?.name}
                      relationMissing={!people.find((p) => p.id === m.personId)?.relation.trim()}
                      personSex={people.find((p) => p.id === m.personId)?.sex}
                      onSetRelation={(rel) => onSetRelation(m.personId, rel)}
                      onEditPerson={() => onEditPerson(m.personId)}
                      onWrongPerson={busyMessageId || m.pendingIdentity ? undefined : () => onWrongPerson(m.id)}
                      contacts={contacts}
                    />
                  ) : (
                    <p className={`text-sm text-muted italic ${urduFont(lang)}`}>{t("reportDeleted", lang)}</p>
                  ))}

                {m.pendingIdentity && (
                  <IdentityCheckCard
                    pending={m.pendingIdentity}
                    people={people}
                    lang={lang}
                    disabled={busyMessageId !== null}
                    onResolve={(choice) => onResolveIdentity(m.id, choice)}
                  />
                )}

                {typed && (
                  <UrgentCard
                    kind="words"
                    personName={personName}
                    alertText={keywordAlertText(typed.category, personName, shownLang)}
                    contacts={contacts}
                    lang={shownLang}
                  />
                )}

                {!hasText && isBusy && (scanning ? <ScanProgress step={scan.step} lang={msgLang} /> : <TypingDots label={t("typing", msgLang)} />)}

                {!hasText && !isBusy && !m.reportId && !m.pendingIdentity && (
                  <p className={`text-muted ${urduFont(msgLang)}`}>{t("errChat", msgLang)}</p>
                )}

                {hasText && (
                  <div
                    lang={shownLang === "ur" ? "ur" : undefined}
                    dir={shownLang === "ur" ? "rtl" : undefined}
                    className={`text-[1.0625rem] ${shownLang === "ur" ? "urdu" : "leading-relaxed"}`}
                  >
                    <Markdown text={scrubLabels(shownText)} />
                  </div>
                )}

                {hasText && shownLang !== msgLang && (
                  <p className={`flex items-center gap-1.5 text-xs text-muted ${urduFont(lang)}`}>
                    <Languages size={13} aria-hidden />
                    {t("translatedFrom", lang, { name: LANG_SELF_NAME[msgLang] })}
                  </p>
                )}

                {hasText && !isBusy && (
                  <div className="flex flex-wrap items-center gap-1">
                    {canSpeak(shownLang) && (
                      <button
                        type="button"
                        onClick={() => void toggleSpeak(m, shownText, shownLang)}
                        disabled={preparingId !== null}
                        aria-pressed={speakingId === m.id}
                        className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-surface hover:text-ink"
                      >
                        {speakingId === m.id ? <Square size={15} aria-hidden /> : <Volume2 size={17} aria-hidden />}
                        <span className={urduFont(lang)}>
                          {preparingId === m.id ? t("preparingVoice", lang) : speakingId === m.id ? t("stop", lang) : t("listen", lang)}
                        </span>
                      </button>
                    )}
                    {m.offline && (
                      <button
                        type="button"
                        onClick={() => setBasicInfoId((cur) => (cur === m.id ? null : m.id))}
                        aria-expanded={basicInfoId === m.id}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border bg-surface px-2.5 text-xs text-muted hover:text-ink"
                      >
                        <Info size={13} aria-hidden />
                        <span className={urduFont(lang)}>{t("offline", lang)}</span>
                      </button>
                    )}
                    <span className="inline-flex flex-wrap items-center gap-0.5 text-sm text-muted">
                      <span className={`px-1 ${urduFont(lang)}`}>{t("showIn", lang)}</span>
                      {translatingId === m.id ? (
                        <span role="status" className={`px-2 ${urduFont(lang)}`}>
                          {t("translating", lang)}
                        </span>
                      ) : (
                        LANGS.filter((l) => l !== shownLang).map((l) => (
                          <button
                            key={l}
                            type="button"
                            onClick={() => void showIn(m, l, msgLang)}
                            disabled={translatingId !== null}
                            className={`inline-flex min-h-11 items-center rounded-full px-2.5 font-medium text-ink underline-offset-4 hover:bg-surface hover:underline disabled:opacity-50 ${l === "ur" ? "text-[1.05em]" : ""}`}
                          >
                            <span dir="auto">{LANG_SELF_NAME[l]}</span>
                          </button>
                        ))
                      )}
                    </span>
                  </div>
                )}

                {failedId === m.id && <p className={`text-sm text-bad ${urduFont(lang)}`}>{t("translateFailed", lang)}</p>}
                {basicInfoId === m.id && m.offline && (
                  <p className={`rounded-input bg-surface px-3 py-2 text-sm text-muted ${urduFont(lang)}`}>{t("offlineHint", lang)}</p>
                )}
                {voiceFailedId === m.id && <p className={`text-sm text-bad ${urduFont(lang)}`}>{t("voiceFailed", lang)}</p>}
              </div>
            </div>
          );
        })}
        {footer}
      </div>
    </div>
  );
}
