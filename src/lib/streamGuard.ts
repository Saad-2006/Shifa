// Server-side guard on the streamed AI answer. Only CODE decides an emergency (see route.ts):
// the model can't raise the in-app urgent card by itself, and a cut-off answer still ends cleanly.
import { EMERGENCY_SENTINEL, type EmergencyKind } from "@/lib/emergency";
import { GeminiError } from "@/lib/gemini";
import type { Lang } from "@/lib/types";

export const CUT_OFF: Record<Lang, string> = {
  en: "(Sorry, the answer was cut off. Please try asking again.)",
  roman: "(Maazrat, jawab beech mein ruk gaya. Meherbani karke dobara poochein.)",
  ur: "(معذرت، جواب درمیان میں رک گیا۔ براہ کرم دوبارہ پوچھیں۔)",
};
export const EMPTY: Record<Lang, string> = {
  en: "Sorry, I couldn't prepare an answer right now. Please try again.",
  roman: "Maazrat, main abhi jawab tayyar nahi kar saki. Meherbani karke dobara koshish karein.",
  ur: "معذرت، میں ابھی جواب تیار نہیں کر سکی۔ براہ کرم دوبارہ کوشش کریں۔",
};
// Used when the model wrote nothing after the emergency line. Calm, matching the in-app card:
// typed emergency words -> 1122 / ER; danger values on a report -> doctor today / ER.
export const EMERGENCY_LINE: Record<EmergencyKind, Record<Lang, string>> = {
  words: {
    en: "This could be serious. If it is happening now, call 1122 or go to the nearest hospital emergency.",
    roman: "Ye serious ho sakta hai. Agar abhi ho raha hai to 1122 par call karein ya qareebi hospital ki emergency mein jaein.",
    ur: "یہ سنجیدہ ہو سکتا ہے۔ اگر ابھی ہو رہا ہے تو 1122 پر کال کریں یا قریبی ہسپتال کی ایمرجنسی میں جائیں۔",
  },
  report: {
    en: "Some values on this report are at a danger level. Please get them checked by a doctor today, or go to the ER if they feel unwell.",
    roman: "Is report ki kuch values khatarnak level par hain. Aaj hi doctor se check karwayein, ya tabiyat kharab ho to ER le jaein.",
    ur: "اس رپورٹ کی کچھ ویلیوز خطرناک حد پر ہیں۔ آج ہی ڈاکٹر سے چیک کروائیں، یا طبیعت خراب ہو تو ای آر لے جائیں۔",
  },
};

/**
 * Normalise the start of the model output. Only CODE decides an emergency: when `kind` is set the
 * reply starts with exactly SENTINEL + "\n" (added if the model left it out); when it isn't, a
 * sentinel written by the model alone is dropped. Buffers only until the start can be compared.
 */
export async function* guardOutput(stream: AsyncIterable<string>, kind: EmergencyKind | null, lang: Lang): AsyncGenerator<string> {
  const mustFlag = kind !== null;
  const S = EMERGENCY_SENTINEL;
  let buf = "";
  let decided = false;
  let sentContent = false; // some visible text after the sentinel has been emitted

  const start = (): string => {
    decided = true;
    let t = buf.replace(/^\s+/, "");
    if (t.startsWith(S)) t = t.slice(S.length).replace(/^\s+/, ""); // the model's own tag never counts
    if (t) sentContent = true;
    return mustFlag ? `${S}\n${t}` : t;
  };

  try {
    for await (const piece of stream) {
      if (!piece) continue;
      if (decided) {
        if (sentContent) yield piece;
        else if (piece.trim()) {
          sentContent = true;
          yield piece.replace(/^\s+/, "");
        }
        continue;
      }
      buf += piece;
      const t = buf.replace(/^\s+/, "");
      if (t.length < S.length && S.startsWith(t)) continue; // could still become the sentinel
      yield start();
    }
    if (!decided) {
      const out = start();
      if (out) yield out;
    }
    if (!sentContent) yield kind ? EMERGENCY_LINE[kind][lang] : EMPTY[lang]; // the model produced nothing usable
  } catch (e) {
    if (e instanceof GeminiError) console.error(`[chat] stream ${e.code} (${e.status})`);
    else console.error("[chat] stream error", e instanceof Error ? e.name : typeof e);
    if (!decided) {
      const out = start();
      if (out) yield out;
    }
    if (sentContent) yield `\n\n${CUT_OFF[lang]}`;
    else yield kind ? `${EMERGENCY_LINE[kind][lang]}\n\n${CUT_OFF[lang]}` : CUT_OFF[lang];
  }
}
