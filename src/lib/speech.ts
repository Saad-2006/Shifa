// Best-effort voice input and read-aloud using the browser's built-in speech APIs.
// Everything here is client-only and fails soft: callers hide buttons when unsupported.

import type { Lang } from "@/lib/types";

/* ---------- Speech recognition (mic) ---------- */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  results: { length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return getRecognition() !== null;
}

/**
 * Start listening. `onText` receives the running transcript (interim results too,
 * `final` is true for the last result). `onEnd` fires exactly once.
 * Returns a function that stops listening.
 */
export function startListening(
  lang: Lang,
  onText: (text: string, final: boolean) => void,
  onEnd: () => void,
): () => void {
  const Ctor = getRecognition();
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    onEnd();
  };
  if (!Ctor) {
    end();
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = lang === "en" ? "en-US" : "ur-PK";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let text = "";
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      text += r[0]?.transcript ?? "";
      final = r.isFinal;
    }
    onText(text.trim(), final);
  };
  rec.onerror = () => end();
  rec.onend = () => end();
  try {
    rec.start();
  } catch {
    end();
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  };
}

/* ---------- Speech synthesis (Listen) ---------- */

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

function norm(l: string): string {
  return l.toLowerCase().replace("_", "-");
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const voices = s.getVoices();
  const find = (pred: (l: string) => boolean) => voices.find((v) => pred(norm(v.lang))) ?? null;
  if (lang === "ur") return find((l) => l.startsWith("ur"));
  if (lang === "roman") return find((l) => l === "en-in") ?? find((l) => l.startsWith("en"));
  return find((l) => l === "en-us") ?? find((l) => l === "en-gb") ?? find((l) => l.startsWith("en"));
}

/** Urdu needs an installed ur-* voice; English and Roman fall back to the default voice. */
export function canSpeak(lang: Lang): boolean {
  if (!synth()) return false;
  if (lang === "ur") return pickVoice("ur") !== null;
  return true;
}

/** Re-check `canSpeak` when the browser finishes loading voices. Returns an unsubscribe. */
export function onVoicesChanged(cb: () => void): () => void {
  const s = synth();
  if (!s) return () => {};
  s.addEventListener("voiceschanged", cb);
  return () => s.removeEventListener("voiceschanged", cb);
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/\[\[EMERGENCY\]\]/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\n{2,}/g, ".\n")
    .trim();
}

/** Split into chunks under ~200 chars: Chrome cuts off long utterances. */
function chunk(text: string): string[] {
  const parts = (text.match(/[^.!?۔؟\n]+[.!?۔؟\n]*/g) ?? []).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).length > 200 && cur) {
      out.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + " " + p : p;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Read text aloud. Returns false if speech is unavailable. `onEnd` fires when done or stopped. */
export function speak(text: string, lang: Lang, onEnd?: () => void): boolean {
  const s = synth();
  if (!s || !canSpeak(lang)) return false;
  s.cancel();
  const voice = pickVoice(lang);
  const chunks = chunk(stripMarkdown(text));
  if (chunks.length === 0) return false;
  const fallbackLang = lang === "ur" ? "ur-PK" : lang === "roman" ? "en-IN" : "en-US";
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd?.();
  };
  chunks.forEach((c, i) => {
    const u = new SpeechSynthesisUtterance(c);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? fallbackLang;
    u.rate = 0.95;
    if (i === chunks.length - 1) u.onend = finish;
    u.onerror = finish;
    s.speak(u);
  });
  return true;
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
