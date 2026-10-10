// Emergency detector: keyword + fuzzy matching in English, Roman Urdu and Urdu script.
// Pure and isomorphic (browser and Node). No network, no AI: only this detector (typed words) and
// labRules (danger values) can raise the in-app urgent card; the AI alone never can.
//
// Design bias: a missed emergency is far worse than an extra urgent card, so negation
// handling is deliberately narrow ("no chest pain", "... dard nahi hai", "risk of stroke").
import Fuse from "fuse.js";

export type EmergencyCategory =
  | "cardiac"
  | "breathing"
  | "stroke"
  | "bleeding"
  | "unconscious"
  | "seizure"
  | "suicide"
  | "poisoning"
  | "allergy"
  | "other";

export interface EmergencyResult {
  isEmergency: boolean;
  category: EmergencyCategory | null;
  matched: string[];
}

export const EMERGENCY_SENTINEL = "[[EMERGENCY]]";

/** Why the urgent card shows: emergency words typed in the chat, or danger values on a report. */
export type EmergencyKind = "words" | "report";

/** The one number shown, and only for typed emergencies ("Abbu behosh ho gaye"). */
export const RESCUE_NUMBER = "1122";

/** Most severe first. When several categories match, the earliest one wins. */
const SEVERITY: EmergencyCategory[] = [
  "suicide",
  "cardiac",
  "breathing",
  "stroke",
  "unconscious",
  "seizure",
  "bleeding",
  "poisoning",
  "allergy",
  "other",
];

// ---------------------------------------------------------------------------
// Phrase lists. Written naturally; they go through the same normaliser as the input,
// so "seene me dard" and "seenay mein dard" end up identical.
// ---------------------------------------------------------------------------
const PHRASES: Record<EmergencyCategory, string[]> = {
  cardiac: [
    "chest pain", "chest pains", "pain in chest", "pain in my chest", "chest tightness",
    "tightness in chest", "chest pressure", "crushing chest", "heart attack", "cardiac arrest",
    "seenay mein dard", "seene mein dard", "sine mein dard", "seenay dard", "seenay par dard",
    "seenay pe dard", "chhati mein dard", "chhati par dard", "dil ka daura", "dil ka dora",
    "سینے میں درد", "سینہ میں درد", "سینے پر درد", "چھاتی میں درد", "دل کا دورہ",
  ],
  breathing: [
    "can't breathe", "cannot breathe", "can not breathe", "unable to breathe", "not able to breathe",
    "difficulty breathing", "difficulty in breathing", "trouble breathing", "hard to breathe",
    "short of breath", "shortness of breath", "not breathing", "stopped breathing",
    "breathing problem", "breathing difficulty", "gasping for air", "choking",
    "saans nahi aa rahi", "sans ni aa rahi", "saans lene mein takleef", "saans lene mein mushkil",
    "saans lene mein dushwari", "saans ki takleef", "saans ruk", "saans band", "dam ghut",
    "سانس نہیں آ رہی", "سانس لینے میں تکلیف", "سانس لینے میں دشواری", "سانس رک", "سانس بند", "دم گھٹ",
  ],
  stroke: [
    "stroke", "face drooping", "drooping face", "face droop", "slurred speech", "speech slurred",
    "one side weak", "one side numb", "weakness on one side", "numbness on one side",
    "one sided weakness", "sudden severe headache", "worst headache", "paralysis", "paralysed",
    "paralyzed", "falij", "faalij", "lakwa", "laqwa", "munh tehra", "zuban larkhara",
    "aik taraf kamzori", "aik taraf sun", "achanak shadeed sar dard",
    "فالج", "لقوہ", "منہ ٹیڑھا", "زبان لڑکھڑا", "اچانک شدید سر درد",
  ],
  unconscious: [
    "unconscious", "fainted", "fainting", "passed out", "unresponsive", "not waking up",
    "won't wake up", "lost consciousness", "collapsed", "behosh", "be hosh", "bay hosh",
    "hosh nahi", "hosh mein nahi", "hosh kho",
    "بے ہوش", "بیہوش", "ہوش نہیں", "ہوش میں نہیں",
  ],
  seizure: [
    "seizure", "seizures", "fits", "convulsion", "convulsions", "convulsing",
    "mirgi ka daura", "mirgi ka dora", "jhatke",
    "مرگی", "مرگی کا دورہ", "جھٹکے",
  ],
  bleeding: [
    "heavy bleeding", "bleeding heavily", "bleeding won't stop", "bleeding will not stop",
    "bleeding not stopping", "can't stop bleeding", "vomiting blood", "blood in vomit",
    "coughing blood", "coughing up blood", "blood vomit",
    "khoon ki ulti", "khoon ki ultiyan", "khoon nahi ruk raha", "khoon band nahi ho raha", "bohat khoon",
    "خون کی الٹی", "خون نہیں رک رہا", "بہت خون",
  ],
  suicide: [
    "suicide", "suicidal", "kill myself", "end my life", "want to die", "wanna die",
    "take my own life", "don't want to live", "better off dead", "hang myself",
    "khudkushi", "khud kushi", "marna chahta hoon", "marna chahti hoon", "mar jana chahta",
    "jeena nahi chahta", "zindagi khatam karna", "khud ko maar", "apne aap ko maar",
    "خودکشی", "خود کشی", "مرنا چاہتا", "مرنا چاہتی", "جینا نہیں چاہتا",
  ],
  poisoning: [
    "overdose", "overdosed", "poisoning", "swallowed poison", "drank poison", "took poison",
    "ate poison", "took too many pills", "swallowed pills", "drank bleach",
    "zeher kha liya", "zehar kha liya", "zeher pee liya", "bohat saari goliyan kha li",
    "zyada goliyan kha li", "poori patti kha li", "keeray maar dawai", "tezab pee liya",
    "زہر", "زہر کھا لیا", "زہر پی لیا",
  ],
  allergy: [
    "throat swelling", "throat is swelling", "swollen throat", "throat closing", "can't swallow",
    "cannot swallow", "anaphylaxis", "anaphylactic", "swollen lips", "lips swelling",
    "tongue swelling", "gala band ho raha", "hont sooj gaya", "chehra sooj gaya",
    "zuban sooj gayi", "nigla nahi ja raha",
    "گلا بند", "ہونٹ سوج گئے", "چہرہ سوج گیا",
  ],
  other: [
    "snake bite", "snakebite", "bitten by a snake", "severe burn", "severe burns", "badly burned",
    "electric shock", "saanp ne kaata", "saanp ka kaata", "buri tarah jal", "current lag gaya",
    "سانپ نے کاٹا", "سانپ نے کاٹ لیا", "بری طرح جل",
  ],
};

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Arabic-script letter variants folded to one Urdu form. */
const CHAR_MAP: Record<string, string> = {
  "ي": "ی", "ى": "ی", "ئ": "ی", "ے": "ی", "ۓ": "ی", // yeh variants (incl. bari yeh)
  "ك": "ک", // kaf
  "ه": "ہ", "ھ": "ہ", "ۀ": "ہ", "ة": "ہ", "ە": "ہ", // heh variants (incl. do-chashmi)
  "آ": "ا", "أ": "ا", "إ": "ا", "ٱ": "ا", // alef variants
  "ؤ": "و",
};
const CHAR_RE = new RegExp(`[${Object.keys(CHAR_MAP).join("")}]`, "g");

// Zero-width / bidi controls / soft hyphen / BOM.
const INVISIBLE_RE = /[­؜​-‏‪-‮⁠-⁤﻿]/g;
// Combining marks: Latin accents and Arabic harakat, tanween, superscript alef, Quranic marks.
const DIACRITIC_RE = /[̀-ͯؐ-ًؚ-ٰٟۖ-ۭ]/g;
// Apostrophes are dropped (can't -> cant); every other non letter/number becomes a space.
const APOSTROPHE_RE = /['’‘`´]/g;
const NON_WORD_RE = /[^\p{L}\p{N}\s]+/gu;

/** Roman Urdu spelling variants (and a few English contractions) folded per word. */
const WORD_MAP: Record<string, string> = {};
function fold(target: string, variants: string[]) {
  for (const v of [target, ...variants]) WORD_MAP[v] = target;
}
fold("mein", ["me", "main", "mai", "mei", "mien", "mn", "mai"]);
fold("nahi", ["nai", "ni", "nahin", "nhi", "nahee", "nahien", "nhin", "nahii", "nahi"]);
fold("saans", ["sans", "saanss", "sanss", "saas"]);
fold("seenay", ["seene", "sine", "seena", "seeney", "seeny", "sene", "sinay", "seenai", "sena", "seenah", "seeni"]);
fold("chhati", ["chati", "chaati", "chhaati", "chhatti", "chatti"]);
fold("dard", ["drd", "dardd"]);
fold("daura", ["dora", "dorah", "daurah", "dauraa", "doura", "dhora", "daora"]);
fold("rahi", ["rhi", "rahee", "rahy", "raha", "rha", "rahe", "rhe", "rahay", "rhay", "rai"]);
fold("gaya", ["gya", "gayi", "gai", "gyi", "gayee", "gaye", "gye", "gae"]);
fold("liya", ["lia", "li", "lee", "leya", "liye", "lya"]);
fold("aa", ["a", "aah", "aaa"]);
fold("takleef", ["taklif", "taqleef", "tkleef", "takleff", "takleeef", "takliff"]);
fold("lene", ["lainay", "lenay", "leny", "laine", "lainey"]);
fold("ulti", ["ultee", "ulty", "ultiyan", "ultiyaan", "ultian", "ultiya", "ultyan"]);
fold("khoon", ["khun", "khoun", "khoonn"]);
fold("zeher", ["zehar", "zahar", "zaher", "zehr", "zahr", "zeher"]);
fold("behosh", ["behos", "beyhosh", "bayhosh", "behoosh", "baihosh", "behosh"]);
fold("hosh", ["hoosh"]);
fold("falij", ["faalij", "falej", "falaj", "faalaj", "phalij"]);
fold("lakwa", ["laqwa", "laqwah", "lakwah", "luqwa", "laqwaa"]);
fold("munh", ["moonh", "muh", "mun", "mooh", "muhn", "moun"]);
fold("tehra", ["terha", "tedha", "teda", "tehda", "tera", "terrha"]);
fold("zuban", ["zaban", "zubaan", "zabaan", "zbaan", "zban"]);
fold("larkhara", ["larkhada", "ladkhada", "larkhra", "larkharahi", "larkharai", "larkharana", "larkharaa"]);
fold("mirgi", ["mirghi", "mirgee", "mergi"]);
fold("jhatke", ["jhatkay", "jhatky", "jhatka", "jatke", "jhatkey", "jhatkon"]);
fold("khudkushi", ["khudkashi", "khudkhushi", "khudkushee", "khudkhushee", "khudkushi"]);
fold("chahta", ["chahti", "chahtee", "chahty", "chahte", "chahata", "chahati", "chahtaa", "chahtay"]);
fold("hoon", ["hun", "hu", "hoo", "hn"]);
fold("saanp", ["sanp", "saamp", "samp", "saap"]);
fold("kaata", ["kata", "kaat", "katta", "kaatta"]);
fold("gala", ["galla", "gla"]);
fold("hont", ["honth", "honht", "hoont", "hount"]);
fold("chehra", ["chehrah", "chera", "chehara", "chihra"]);
fold("sooj", ["suj", "sooja", "soojh", "sujh", "suja", "sooj"]);
fold("bohat", ["bohot", "bahut", "bht", "bohut", "buhat", "bhot", "bahot", "bhut", "bohat"]);
fold("saari", ["sari", "sary", "saary", "saare", "sare"]);
fold("goliyan", ["goliyaan", "golian", "goliya", "golyan", "goliyon"]);
fold("ruk", ["rook", "rukk"]);
fold("ghut", ["ghutt", "ghot"]);
fold("dam", ["dum"]);
fold("aik", ["ek", "ik", "aek"]);
fold("achanak", ["achanak", "achaanak", "achank"]);
fold("shadeed", ["shadid", "shaded", "shdeed"]);
fold("zyada", ["ziada", "zayada", "ziyada", "zada", "zyda", "zeyada"]);
fold("cant", ["cnt", "cannt"]);
fold("wont", ["wnt"]);
fold("dont", ["dnt"]);

/** Lowercase, strip punctuation/diacritics/zero-width, unify letter and Roman spelling variants. */
export function normalizeEmergencyText(text: string): string {
  return clausesOf(text).map((c) => c.join(" ")).filter(Boolean).join(" ");
}

/** Splits into clauses (negation never crosses a full stop, comma, question mark or newline). */
function clausesOf(text: string): string[][] {
  let s = (text || "").normalize("NFKC").toLowerCase();
  s = s.replace(INVISIBLE_RE, "").replace(CHAR_RE, (ch) => CHAR_MAP[ch] ?? ch);
  s = s.normalize("NFD").replace(DIACRITIC_RE, "").normalize("NFC");
  s = s.replace(CHAR_RE, (ch) => CHAR_MAP[ch] ?? ch); // NFD can surface ي / ے again
  s = s.replace(APOSTROPHE_RE, "");
  return s
    .split(/[.,;:!?\n\r،؛؟۔|()[\]{}]+/u)
    .map((clause) =>
      clause
        .replace(NON_WORD_RE, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => WORD_MAP[w] ?? w),
    )
    .filter((c) => c.length > 0);
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
interface Phrase {
  category: EmergencyCategory;
  display: string;
  tokens: string[];
  text: string;
}

/** Word lists go through the same normaliser as the input, so variant spellings line up. */
function normSet(words: string[]): Set<string> {
  return new Set(words.flatMap((w) => normalizeEmergencyText(w).split(" ")).filter(Boolean));
}

/** Input words that may sit inside a phrase without breaking it ("seenay mein bohat dard"). */
const FILLERS = normSet([
  "bohat", "shadeed", "sakht", "tez", "zyada", "kafi", "bara", "bari", "halka", "ajeeb",
  "very", "really", "so", "severe", "bad", "terrible", "sharp", "intense", "my", "the", "aa",
  "mere", "meri", "mera", "is", "am", "are", "was", "and", "of", "his", "her",
  "بہت", "شدید", "سخت", "تیز", "زیادہ", "میرے", "میری",
]);
const MAX_FILLERS = 2;

/** Words before a match that cancel it ("no chest pain", "risk of stroke"). Same clause, ≤3 words. */
const NEG_BEFORE = normSet([
  "no", "not", "never", "without", "dont", "doesnt", "didnt", "isnt", "arent", "wasnt", "werent",
  "havent", "hasnt", "nor", "denies", "denied", "bina", "baghair",
  "risk", "risks", "chance", "chances", "prevent", "prevents", "avoid", "cause", "causes", "history",
  "نہ", "بغیر", "بنا",
]);
const BEFORE_WINDOW = 3;
/** Words after a match that cancel it ("seenay mein dard nahi hai", "heart attack ka khatra"). ≤3 words. */
const NEG_AFTER = normSet([
  "nahi", "نہیں", "نہ", "بغیر", "baghair",
  "khatra", "khatrah", "khatre", "risk", "risks", "chance", "chances", "kami", "history",
  "test", "tests", "report", "reports", "level", "levels", "volume", "خطرہ", "خطری", "کمی", "ٹیسٹ",
]);
const AFTER_WINDOW = 3;

const MIN_FUZZY_LEN = 7; // phrases shorter than this (e.g. "fits", "stroke", "زہر") only match exactly
const FUZZY_THRESHOLD = 0.3; // Fuse counts a transposition as 2 edits; the word guard below is the real filter
const MAX_WINDOW_WORDS = 5;
const MAX_TOKENS = 400; // chat messages are short; cap work on pasted walls of text

let cache: { phrases: Phrase[]; fuseByWords: Map<number, Fuse<Phrase>> } | null = null;

function index() {
  if (cache) return cache;
  const phrases: Phrase[] = [];
  const seen = new Set<string>();
  for (const category of SEVERITY) {
    for (const display of PHRASES[category]) {
      const tokens = normalizeEmergencyText(display).split(" ").filter(Boolean);
      const text = tokens.join(" ");
      if (!text || seen.has(`${category}|${text}`)) continue;
      seen.add(`${category}|${text}`);
      phrases.push({ category, display, tokens, text });
    }
  }
  const fuseByWords = new Map<number, Fuse<Phrase>>();
  for (let n = 1; n <= MAX_WINDOW_WORDS; n++) {
    const list = phrases.filter((p) => p.tokens.length === n && p.text.length >= MIN_FUZZY_LEN);
    if (!list.length) continue;
    fuseByWords.set(
      n,
      new Fuse(list, {
        keys: ["text"],
        includeScore: true,
        threshold: FUZZY_THRESHOLD,
        ignoreLocation: true,
        ignoreFieldNorm: true,
        isCaseSensitive: true, // already lowercased; keeps Urdu untouched
        minMatchCharLength: 3,
        shouldSort: true,
      }),
    );
  }
  cache = { phrases, fuseByWords };
  return cache;
}

/** Exact token match with up to MAX_FILLERS filler words skipped. Returns end index or -1. */
function matchAt(words: string[], start: number, p: string[]): number {
  if (words[start] !== p[0]) return -1;
  let i = start + 1;
  let skipped = 0;
  for (let k = 1; k < p.length; k++) {
    while (i < words.length && words[i] !== p[k] && FILLERS.has(words[i]) && skipped < MAX_FILLERS) {
      i++;
      skipped++;
    }
    if (words[i] !== p[k]) return -1;
    i++;
  }
  return i;
}

/** Optimal-string-alignment distance (Levenshtein + adjacent transposition), capped. */
function osa(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Word-by-word guard on a fuzzy candidate: same first letter, ≤3-letter words exact,
 * 1 typo for 4–6 letters, 2 for longer, at most 2 typos overall (1 for a one-word phrase).
 * Stops "pet mein dard" (stomach) matching "seenay mein dard", "no breathing" matching
 * "not breathing", and "kidney failing" matching "fainting".
 */
function wordsAgree(win: string[], phrase: string[]): boolean {
  if (win.length !== phrase.length) return false;
  let total = 0;
  for (let k = 0; k < phrase.length; k++) {
    const w = win[k];
    const p = phrase[k];
    if (w === p) continue;
    if (p.length <= 3 || w[0] !== p[0]) return false;
    const allowed = p.length <= 6 ? 1 : 2;
    const dist = osa(w, p);
    if (dist > allowed) return false;
    total += dist;
  }
  return total > 0 && total <= (phrase.length === 1 ? 1 : 2);
}

function isNegated(words: string[], start: number, end: number): boolean {
  for (let i = Math.max(0, start - BEFORE_WINDOW); i < start; i++) {
    if (NEG_BEFORE.has(words[i])) return true;
  }
  for (let i = end; i < Math.min(words.length, end + AFTER_WINDOW); i++) {
    if (NEG_AFTER.has(words[i])) return true;
  }
  return false;
}

export function detectEmergency(text: string): EmergencyResult {
  const none: EmergencyResult = { isEmergency: false, category: null, matched: [] };
  if (typeof text !== "string" || !text.trim()) return none;

  const { phrases, fuseByWords } = index();
  const hits = new Map<string, EmergencyCategory>(); // display phrase -> category
  let budget = MAX_TOKENS;

  for (const all of clausesOf(text.slice(0, 4000))) {
    if (budget <= 0) break;
    const words = all.slice(0, budget);
    budget -= words.length;

    // 1. Exact (normalised, word-bounded, fillers tolerated).
    const exactSpans = new Set<string>();
    for (let s = 0; s < words.length; s++) {
      for (const p of phrases) {
        const end = matchAt(words, s, p.tokens);
        if (end < 0) continue;
        exactSpans.add(`${s}:${end}`);
        if (!isNegated(words, s, end)) hits.set(p.display, p.category);
      }
    }

    // 2. Fuzzy: fuse.js over 1–5 word windows against phrases with the same word count.
    for (let n = 1; n <= MAX_WINDOW_WORDS; n++) {
      const fuse = fuseByWords.get(n);
      if (!fuse) continue;
      for (let s = 0; s + n <= words.length; s++) {
        if (exactSpans.has(`${s}:${s + n}`)) continue;
        const win = words.slice(s, s + n);
        const query = win.join(" ");
        if (query.length < MIN_FUZZY_LEN - 1) continue;
        for (const r of fuse.search(query)) {
          if ((r.score ?? 1) > FUZZY_THRESHOLD) continue;
          const p = r.item;
          const ratio = query.length / p.text.length;
          if (ratio < 0.8 || ratio > 1.25) continue;
          if (!wordsAgree(win, p.tokens)) continue;
          if (isNegated(words, s, s + n)) continue;
          if (!hits.has(p.display)) hits.set(p.display, p.category);
        }
      }
    }
  }

  if (!hits.size) return none;
  const ranked = [...hits.entries()].sort((a, b) => SEVERITY.indexOf(a[1]) - SEVERITY.indexOf(b[1]));
  return { isEmergency: true, category: ranked[0][1], matched: ranked.map(([d]) => d) };
}
