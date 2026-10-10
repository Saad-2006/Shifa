// UI strings for Shifa in English, Urdu (Nastaliq script) and Roman Urdu.
//
// NOTE FOR THE TEAM: the Urdu and Roman Urdu strings below were drafted quickly.
// Native speakers (Eman / Talha) should review every `ur` and `roman` entry
// before the demo, especially the emergency and error messages.
//
// Usage: t("scanReport", lang) or t("seeAll", lang, { n: 24 }).

import type { Lang } from "@/lib/types";

type Entry = Record<Lang, string>;

const dict = {
  // App chrome
  appName: { en: "Shifa", ur: "شفا", roman: "Shifa" },
  openMenu: { en: "Open menu", ur: "مینو کھولیں", roman: "Menu kholein" },
  closeMenu: { en: "Close menu", ur: "مینو بند کریں", roman: "Menu band karein" },
  language: { en: "Language", ur: "زبان", roman: "Zabaan" },
  disclaimer: {
    en: "Shifa explains reports; it does not replace a doctor.",
    ur: "شفا رپورٹ سمجھاتی ہے، یہ ڈاکٹر کا متبادل نہیں ہے۔",
    roman: "Shifa report samjhati hai, ye doctor ka mutabadil nahi hai.",
  },
  loading: { en: "Loading…", ur: "لوڈ ہو رہا ہے…", roman: "Load ho raha hai…" },

  // Welcome
  greeting: { en: "Assalam o Alaikum! 👋", ur: "السلام علیکم! 👋", roman: "Assalam o Alaikum! 👋" },
  welcomeLine: {
    en: "Send a photo of any lab report. I will check every value and explain it in simple words.",
    ur: "کسی بھی لیب رپورٹ کی تصویر بھیجیں۔ میں ہر ویلیو چیک کر کے آسان الفاظ میں سمجھاؤں گی۔",
    roman: "Kisi bhi lab report ki photo bhejein. Main har value check kar ke asaan alfaaz mein samjhaun gi.",
  },
  whoFor: { en: "Who is this for?", ur: "یہ کس کے لیے ہے؟", roman: "Ye kis ke liye hai?" },
  add: { en: "Add", ur: "شامل کریں", roman: "Add karein" },
  scanReport: { en: "Scan a report", ur: "رپورٹ اسکین کریں", roman: "Report scan karein" },
  scanReportHint: { en: "Photo or PDF", ur: "تصویر یا PDF", roman: "Photo ya PDF" },
  askQuestion: { en: "Ask a question", ur: "سوال پوچھیں", roman: "Sawal poochein" },
  askQuestionHint: { en: "Type or speak", ur: "لکھیں یا بولیں", roman: "Likhein ya bolein" },
  trySample: { en: "Try a sample report", ur: "نمونہ رپورٹ آزمائیں", roman: "Sample report try karein" },
  trySampleHint: { en: "See how Shifa works", ur: "دیکھیں شفا کیسے کام کرتی ہے", roman: "Dekhein Shifa kaise kaam karti hai" },
  loadDemo: { en: "Load demo family", ur: "ڈیمو فیملی لوڈ کریں", roman: "Demo family load karein" },

  // People
  addFamily: { en: "Add family member", ur: "خاندان کا فرد شامل کریں", roman: "Family member add karein" },
  switchPerson: { en: "Switch family member", ur: "فرد تبدیل کریں", roman: "Family member badlein" },
  choosePerson: { en: "Choose person", ur: "فرد منتخب کریں", roman: "Shakhs chunein" },
  name: { en: "Name", ur: "نام", roman: "Naam" },
  namePlaceholder: { en: "e.g. Ammi", ur: "مثلاً امی", roman: "Maslan Ammi" },
  relation: { en: "Relation", ur: "رشتہ", roman: "Rishta" },
  relationPlaceholder: { en: "e.g. Mother", ur: "مثلاً والدہ", roman: "Maslan Mother" },
  age: { en: "Age", ur: "عمر", roman: "Umar" },
  save: { en: "Add", ur: "شامل کریں", roman: "Add karein" },
  cancel: { en: "Cancel", ur: "منسوخ", roman: "Cancel" },
  years: { en: "{n} yrs", ur: "{n} سال", roman: "{n} saal" },

  // Sidebar
  family: { en: "Family", ur: "خاندان", roman: "Khandan" },
  reports: { en: "Reports", ur: "رپورٹس", roman: "Reports" },
  noReports: {
    en: "No reports yet. Scan one in the chat.",
    ur: "ابھی کوئی رپورٹ نہیں۔ چیٹ میں اسکین کریں۔",
    roman: "Abhi koi report nahi. Chat mein scan karein.",
  },
  trends: { en: "Trends", ur: "رجحانات", roman: "Trends" },
  noTrends: {
    en: "Trends appear once two reports share a test.",
    ur: "دو رپورٹس میں ایک ہی ٹیسٹ ہو تو رجحان نظر آئے گا۔",
    roman: "Do reports mein same test ho to trend nazar aayega.",
  },
  doctorSummary: { en: "Doctor Summary", ur: "ڈاکٹر کے لیے خلاصہ", roman: "Doctor Summary" },
  doctorSummaryHint: {
    en: "One printable page for the doctor",
    ur: "ڈاکٹر کے لیے ایک پرنٹ ہونے والا صفحہ",
    roman: "Doctor ke liye aik printable page",
  },
  clearChat: { en: "Clear this chat", ur: "یہ چیٹ صاف کریں", roman: "Ye chat saaf karein" },
  resetAll: { en: "Reset all", ur: "سب کچھ مٹائیں", roman: "Sab reset karein" },
  resetConfirm: {
    en: "Delete all people, reports and chats on this device?",
    ur: "اس فون سے تمام افراد، رپورٹس اور چیٹس مٹا دیں؟",
    roman: "Is phone se tamam log, reports aur chats mita dein?",
  },
  yesReset: { en: "Yes, delete all", ur: "ہاں، سب مٹائیں", roman: "Haan, sab mitayein" },
  flaggedN: { en: "{n} flagged", ur: "{n} پر توجہ", roman: "{n} flagged" },
  allNormalShort: { en: "All normal", ur: "سب نارمل", roman: "Sab normal" },

  // Composer
  placeholder: {
    en: "Ask anything about the report…",
    ur: "رپورٹ کے بارے میں کچھ بھی پوچھیں…",
    roman: "Report ke baare mein kuch bhi poochein…",
  },
  camera: { en: "Take a photo of a report", ur: "رپورٹ کی تصویر لیں", roman: "Report ki photo lein" },
  attach: { en: "Attach a photo or PDF", ur: "تصویر یا PDF لگائیں", roman: "Photo ya PDF lagayein" },
  mic: { en: "Speak your question", ur: "اپنا سوال بولیں", roman: "Apna sawal bolein" },
  micStop: { en: "Stop listening", ur: "سننا بند کریں", roman: "Sunna band karein" },
  listening: { en: "Listening…", ur: "سن رہی ہوں…", roman: "Sun rahi hoon…" },
  send: { en: "Send", ur: "بھیجیں", roman: "Bhejein" },

  // Chat thread
  you: { en: "You", ur: "آپ", roman: "Aap" },
  offline: { en: "offline", ur: "آف لائن", roman: "offline" },
  offlineHint: {
    en: "Answered by Shifa's offline rules, not live AI",
    ur: "یہ جواب شفا کے آف لائن اصولوں سے ہے، لائیو AI سے نہیں",
    roman: "Ye jawab Shifa ke offline rules se hai, live AI se nahi",
  },
  listen: { en: "Listen", ur: "سنیں", roman: "Sunein" },
  stop: { en: "Stop", ur: "روکیں", roman: "Rokein" },
  typing: { en: "Shifa is writing", ur: "شفا لکھ رہی ہے", roman: "Shifa likh rahi hai" },
  reportDeleted: { en: "This report was deleted.", ur: "یہ رپورٹ مٹا دی گئی ہے۔", roman: "Ye report mita di gayi hai." },
  emergencyInline: {
    en: "Possible emergency. Call 1122 now.",
    ur: "ممکنہ ایمرجنسی۔ ابھی 1122 پر کال کریں۔",
    roman: "Mumkina emergency. Abhi 1122 par call karein.",
  },
  suggested: { en: "Suggested questions", ur: "تجویز کردہ سوالات", roman: "Mashwara sawalat" },

  // Follow-up chips
  fuSerious: { en: "Is this serious?", ur: "کیا یہ سنجیدہ ہے؟", roman: "Kya ye serious hai?" },
  fuDoctor: { en: "What should I ask the doctor?", ur: "ڈاکٹر سے کیا پوچھیں؟", roman: "Doctor se kya poochein?" },
  fuCompare: {
    en: "Compare with the previous report",
    ur: "پچھلی رپورٹ سے موازنہ کریں",
    roman: "Pichli report se compare karo",
  },
  fuSimple: { en: "Explain in simpler words", ur: "آسان الفاظ میں سمجھائیں", roman: "Asaan alfaaz mein samjhao" },

  // Scan progress
  stepReading: { en: "Reading report", ur: "رپورٹ پڑھی جا رہی ہے", roman: "Report parh rahi hoon" },
  stepChecking: { en: "Checking every value", ur: "ہر ویلیو چیک ہو رہی ہے", roman: "Har value check kar rahi hoon" },
  stepExplaining: { en: "Explaining", ur: "وضاحت لکھی جا رہی ہے", roman: "Samjha rahi hoon" },

  // Errors (assistant messages)
  errNoKey: {
    en: "The AI reader is not set up on this server yet. You can still tap **Try a sample report** or **Load demo family** to see how Shifa works.",
    ur: "اس سرور پر ابھی AI ریڈر سیٹ نہیں ہے۔ آپ **نمونہ رپورٹ آزمائیں** یا **ڈیمو فیملی لوڈ کریں** سے دیکھ سکتے ہیں کہ شفا کیسے کام کرتی ہے۔",
    roman: "Is server par abhi AI reader set nahi hai. Aap **Sample report try karein** ya **Demo family load karein** se dekh sakte hain ke Shifa kaise kaam karti hai.",
  },
  errNotReport: {
    en: "This does not look like a lab report, or the photo is unclear. Please retake it:\n- the full page in the frame\n- paper flat, in good light\n- no shadow or glare",
    ur: "یہ لیب رپورٹ نہیں لگتی، یا تصویر صاف نہیں ہے۔ براہِ کرم دوبارہ تصویر لیں:\n- پورا صفحہ فریم میں ہو\n- کاغذ سیدھا ہو اور روشنی اچھی ہو\n- سایہ یا چمک نہ ہو",
    roman: "Ye lab report nahi lagti, ya photo saaf nahi hai. Dobara photo lein:\n- poora page frame mein ho\n- kaghaz seedha ho, roshni achhi ho\n- saya ya chamak na ho",
  },
  errRateLimited: {
    en: "Too many requests right now. Please wait a minute and try again.",
    ur: "اس وقت بہت زیادہ درخواستیں ہیں۔ ایک منٹ رک کر دوبارہ کوشش کریں۔",
    roman: "Is waqt bohat zyada requests hain. Aik minute ruk kar dobara koshish karein.",
  },
  errBadUpload: {
    en: "I could not open this file. Please send a JPG or PNG photo, or a PDF under 4 MB.",
    ur: "یہ فائل نہیں کھل سکی۔ براہِ کرم JPG یا PNG تصویر، یا 4 MB سے چھوٹی PDF بھیجیں۔",
    roman: "Ye file nahi khul saki. JPG ya PNG photo, ya 4 MB se chhoti PDF bhejein.",
  },
  errTooLarge: {
    en: "This file is too large. Please send a photo instead, or a PDF under 4 MB.",
    ur: "یہ فائل بہت بڑی ہے۔ تصویر بھیجیں، یا 4 MB سے چھوٹی PDF۔",
    roman: "Ye file bohat bari hai. Photo bhejein, ya 4 MB se chhoti PDF.",
  },
  errUnauthorized: {
    en: "Please enter the access code to continue.",
    ur: "جاری رکھنے کے لیے رسائی کوڈ درج کریں۔",
    roman: "Jaari rakhne ke liye access code darj karein.",
  },
  errNetwork: {
    en: "I could not reach Shifa's server. Please check your internet and try again.",
    ur: "شفا کے سرور سے رابطہ نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔",
    roman: "Shifa ke server se rabta nahi ho saka. Internet check kar ke dobara koshish karein.",
  },
  errOther: {
    en: "Something went wrong while reading the report. Please try again.",
    ur: "رپورٹ پڑھتے ہوئے کچھ گڑبڑ ہو گئی۔ براہِ کرم دوبارہ کوشش کریں۔",
    roman: "Report parhte hue kuch garbar ho gayi. Dobara koshish karein.",
  },
  errChat: {
    en: "I could not answer right now. Please try again in a moment.",
    ur: "میں ابھی جواب نہیں دے سکی۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔",
    roman: "Main abhi jawab nahi de saki. Thori der baad dobara koshish karein.",
  },
  errExplain: {
    en: "The values above were checked by Shifa's rules, but I could not write the explanation right now. Ask me again in a moment.",
    ur: "اوپر کی ویلیوز شفا کے اصولوں سے چیک ہو چکی ہیں، مگر ابھی وضاحت نہیں لکھ سکی۔ تھوڑی دیر بعد دوبارہ پوچھیں۔",
    roman: "Upar ki values Shifa ke rules se check ho chuki hain, magar abhi wazahat nahi likh saki. Thori der baad dobara poochein.",
  },

  // Urgency
  urgEmergency: { en: "Emergency", ur: "ایمرجنسی", roman: "Emergency" },
  urgSoon: { en: "See a doctor soon", ur: "جلد ڈاکٹر کو دکھائیں", roman: "Jald doctor ko dikhayein" },
  // Short form for small badges (report lists), so the pill never overflows on a phone.
  urgSoonShort: { en: "Doctor soon", ur: "جلد ڈاکٹر", roman: "Jald doctor" },
  urgRoutine: { en: "Not urgent", ur: "فوری نہیں", roman: "Fori nahi" },
  urgNormal: { en: "Normal", ur: "نارمل", roman: "Normal" },
  actEmergency: {
    en: "Go to emergency / call 1122 now",
    ur: "ابھی ایمرجنسی جائیں / 1122 پر کال کریں",
    roman: "Abhi emergency jayein / 1122 par call karein",
  },
  actSoon: { en: "See a doctor this week", ur: "اس ہفتے ڈاکٹر کو دکھائیں", roman: "Is hafte doctor ko dikhayein" },
  actRoutine: {
    en: "Mention it at your next visit",
    ur: "اگلی بار ڈاکٹر کے پاس جائیں تو بتائیں",
    roman: "Agli visit par doctor ko batayein",
  },
  actNormal: {
    en: "All values are in the normal range",
    ur: "تمام ویلیوز نارمل حد میں ہیں",
    roman: "Tamam values normal had mein hain",
  },

  // Report card
  labReport: { en: "Lab report", ur: "لیب رپورٹ", roman: "Lab report" },
  needCare: {
    en: "{n} of {total} values need attention",
    ur: "{total} میں سے {n} ویلیوز پر توجہ درکار ہے",
    roman: "{total} mein se {n} values par tawajjo chahiye",
  },
  allInRange: {
    en: "All {total} values are in the normal range",
    ur: "تمام {total} ویلیوز نارمل حد میں ہیں",
    roman: "Tamam {total} values normal had mein hain",
  },
  moreFlagged: { en: "+{n} more need attention", ur: "مزید {n} پر توجہ", roman: "+{n} aur par tawajjo" },
  seeAll: { en: "See all {n} values", ur: "تمام {n} ویلیوز دیکھیں", roman: "Tamam {n} values dekhein" },
  checkedByRules: {
    en: "Checked by Shifa rules, not AI",
    ur: "یہ جانچ شفا کے اصولوں نے کی، AI نے نہیں",
    roman: "Ye check Shifa ke rules ne kiya, AI ne nahi",
  },
  askAbout: { en: "Ask about {name}", ur: "{name} کے بارے میں پوچھیں", roman: "{name} ke baare mein poochein" },
  askValue: {
    en: "What does my {name} of {value} mean?",
    ur: "{name} {value} کا کیا مطلب ہے؟",
    roman: "{name} {value} ka kya matlab hai?",
  },

  // Value status
  statusLow: { en: "Low", ur: "کم", roman: "Kam" },
  statusHigh: { en: "High", ur: "زیادہ", roman: "Zyada" },
  statusNormal: { en: "Normal", ur: "نارمل", roman: "Normal" },
  statusAbnormal: { en: "Abnormal", ur: "غیر معمولی", roman: "Ghair mamooli" },
  statusUnknown: { en: "Not checked", ur: "چیک نہیں ہوا", roman: "Check nahi hua" },
  danger: { en: "Danger level", ur: "خطرناک حد", roman: "Khatarnak had" },
  normalRange: { en: "Normal: {range}", ur: "نارمل: {range}", roman: "Normal: {range}" },
  noRange: { en: "No range printed", ur: "حد درج نہیں", roman: "Range likhi nahi" },

  // Report sheet
  allValues: { en: "All values", ur: "تمام ویلیوز", roman: "Tamam values" },
  close: { en: "Close", ur: "بند کریں", roman: "Band karein" },
  deleteReport: { en: "Delete report", ur: "رپورٹ مٹائیں", roman: "Report mitayein" },
  confirmDelete: { en: "Delete this report?", ur: "یہ رپورٹ مٹا دیں؟", roman: "Ye report mita dein?" },
  yesDelete: { en: "Yes, delete", ur: "ہاں، مٹائیں", roman: "Haan, mitayein" },
  whyUrgency: { en: "Why this urgency", ur: "فوری ہونے کی وجہ", roman: "Urgency ki wajah" },
  otherTests: { en: "Other tests", ur: "دیگر ٹیسٹ", roman: "Doosre tests" },

  // Emergency banner
  emTitle: {
    en: "This could be an emergency. Call 1122 now.",
    ur: "یہ ایمرجنسی ہو سکتی ہے۔ ابھی 1122 پر کال کریں۔",
    roman: "Ye emergency ho sakti hai. Abhi 1122 par call karein.",
  },
  emSub: {
    en: "Do not wait for a reply here. Go to the nearest hospital emergency.",
    ur: "یہاں جواب کا انتظار نہ کریں۔ قریبی ہسپتال کی ایمرجنسی جائیں۔",
    roman: "Yahan jawab ka intezar na karein. Qareebi hospital ki emergency jayein.",
  },
  emCall: { en: "Call {label}", ur: "{label} کو کال کریں", roman: "{label} ko call karein" },
  emDismiss: { en: "I'm safe, dismiss", ur: "میں محفوظ ہوں، بند کریں", roman: "Main mehfooz hoon, band karein" },

  // Account (Google sign-in)
  account: { en: "Account", ur: "اکاؤنٹ", roman: "Account" },
  signInGoogle: { en: "Sign in with Google", ur: "گوگل سے سائن اِن کریں", roman: "Google se sign in karein" },
  signOut: { en: "Sign out", ur: "سائن آؤٹ", roman: "Sign out karein" },
  signInHint: {
    en: "Optional. Keeps your family's reports private to your Google account on this device.",
    ur: "اختیاری۔ اس فون پر آپ کی فیملی کی رپورٹس صرف آپ کے گوگل اکاؤنٹ کے ساتھ رہیں گی۔",
    roman: "Optional hai. Is phone par aap ki family ki reports sirf aap ke Google account ke saath rahengi.",
  },
  signInHttpsOnly: {
    en: "Google sign-in works on the live site (https) or on localhost.",
    ur: "گوگل سائن اِن لائیو ویب سائٹ (https) یا localhost پر کام کرتا ہے۔",
    roman: "Google sign-in live website (https) ya localhost par chalta hai.",
  },
  signInRequiredTitle: {
    en: "Sign in to use Shifa",
    ur: "شفا استعمال کرنے کے لیے سائن اِن کریں",
    roman: "Shifa use karne ke liye sign in karein",
  },
  signInRequiredBody: {
    en: "Your reports stay on this device. Signing in keeps each family member's data separate and private.",
    ur: "آپ کی رپورٹس اسی فون پر رہتی ہیں۔ سائن اِن سے ہر فرد کا ڈیٹا الگ اور محفوظ رہتا ہے۔",
    roman: "Aap ki reports isi phone par rehti hain. Sign in se har family member ka data alag aur mehfooz rehta hai.",
  },
  errSignIn: {
    en: "Please sign in with Google to continue. Open the menu and tap **Sign in with Google**.",
    ur: "جاری رکھنے کے لیے گوگل سے سائن اِن کریں۔ مینو کھول کر **گوگل سے سائن اِن کریں** دبائیں۔",
    roman: "Aage barhne ke liye Google se sign in karein. Menu khol kar **Google se sign in karein** dabayein.",
  },

  // Backup / Restore
  yourData: { en: "Your data", ur: "آپ کا ڈیٹا", roman: "Aap ka data" },
  backup: { en: "Back up to a file", ur: "فائل میں بیک اپ کریں", roman: "File mein backup karein" },
  restore: { en: "Restore from a backup file", ur: "بیک اپ فائل سے واپس لائیں", roman: "Backup file se wapas layein" },
  backupHint: {
    en: "Reports are saved only on this phone. Back up now and then (and before changing phones). The file has health information, so keep it private.",
    ur: "رپورٹس صرف اسی فون پر محفوظ ہیں۔ وقتاً فوقتاً (اور فون بدلنے سے پہلے) بیک اپ کریں۔ فائل میں صحت کی معلومات ہیں، اسے کسی سے شیئر نہ کریں۔",
    roman: "Reports sirf isi phone par save hain. Waqtan fawaqtan (aur phone badalne se pehle) backup karein. File mein sehat ki maloomat hain, ise kisi se share na karein.",
  },
  backupDone: {
    en: "Backup saved. Keep the file somewhere safe and private.",
    ur: "بیک اپ محفوظ ہو گیا۔ فائل کو محفوظ اور نجی جگہ پر رکھیں۔",
    roman: "Backup save ho gaya. File ko mehfooz aur private jagah par rakhein.",
  },
  restoreDone: {
    en: "Restored {p} people, {r} reports and {m} messages.",
    ur: "{p} افراد، {r} رپورٹس اور {m} پیغامات واپس آ گئے۔",
    roman: "{p} log, {r} reports aur {m} messages wapas aa gaye.",
  },
  restoreNothing: {
    en: "Nothing new to restore: everything in this backup is already on this phone.",
    ur: "واپس لانے کو کچھ نیا نہیں: اس بیک اپ کی ہر چیز پہلے سے اس فون پر ہے۔",
    roman: "Wapas lane ko kuch naya nahi: is backup ki har cheez pehle se is phone par hai.",
  },
  restoreBad: {
    en: "This file isn't a Shifa backup. Choose the .json file you saved from Shifa.",
    ur: "یہ شفا کی بیک اپ فائل نہیں ہے۔ شفا سے محفوظ کی گئی .json فائل منتخب کریں۔",
    roman: "Ye Shifa ki backup file nahi hai. Shifa se save ki hui .json file chunein.",
  },

  // Patient identity check (whose report is this?)
  idTitle: { en: "Is this report for {name}?", ur: "کیا یہ رپورٹ {name} کی ہے؟", roman: "Kya ye report {name} ki hai?" },
  idBody: {
    en: "The details on the report don't match {name}. Nothing has been added yet.",
    ur: "رپورٹ پر لکھی تفصیل {name} سے نہیں ملتی۔ ابھی کچھ شامل نہیں کیا گیا۔",
    roman: "Report par likhi tafseel {name} se nahi milti. Abhi kuch add nahi kiya gaya.",
  },
  idOnReport: { en: "On the report", ur: "رپورٹ پر", roman: "Report par" },
  idConflictSex: {
    en: "Report says {report}, but {name} is {profile}",
    ur: "رپورٹ پر {report} لکھا ہے، مگر {name} {profile} ہیں",
    roman: "Report par {report} likha hai, magar {name} {profile} hain",
  },
  idConflictAge: {
    en: "Report says age {report}, but {name} is {profile}",
    ur: "رپورٹ پر عمر {report} ہے، مگر {name} کی عمر {profile} ہے",
    roman: "Report par umar {report} hai, magar {name} ki umar {profile} hai",
  },
  idConflictName: {
    en: "Name on report is {report}; {name}'s reports say {profile}",
    ur: "رپورٹ پر نام {report} ہے؛ {name} کی رپورٹس پر {profile} لکھا ہوتا ہے",
    roman: "Report par naam {report} hai; {name} ki reports par {profile} likha hota hai",
  },
  idAddTo: { en: "Add to {name}", ur: "{name} میں شامل کریں", roman: "{name} mein add karein" },
  idAddAnyway: { en: "Add to {name} anyway", ur: "پھر بھی {name} میں شامل کریں", roman: "Phir bhi {name} mein add karein" },
  idNewProfile: { en: "New profile: {name}", ur: "نئی پروفائل: {name}", roman: "Nayi profile: {name}" },
  idNewProfilePlain: { en: "New family member", ur: "نیا فرد", roman: "Naya family member" },
  idSomeoneElse: { en: "Someone else", ur: "کوئی اور", roman: "Koi aur" },
  idCancel: { en: "Cancel, don't add it", ur: "منسوخ، شامل نہ کریں", roman: "Cancel, add na karein" },
  idCancelled: { en: "Report not added.", ur: "رپورٹ شامل نہیں کی گئی۔", roman: "Report add nahi ki gayi." },
  idMoveTitle: { en: "Whose report is this?", ur: "یہ رپورٹ کس کی ہے؟", roman: "Ye report kis ki hai?" },
  idMoveKeep: { en: "Keep it with {name}", ur: "{name} کے پاس رہنے دیں", roman: "{name} ke paas rehne dein" },
  patientOnReport: { en: "On report", ur: "رپورٹ پر", roman: "Report par" },
  notPerson: { en: "Not {name}?", ur: "{name} نہیں؟", roman: "{name} nahi?" },
  familyMember: { en: "Family member", ur: "خاندان کا فرد", roman: "Family member" },
  sexF: { en: "Female", ur: "خاتون", roman: "Female" },
  sexM: { en: "Male", ur: "مرد", roman: "Male" },
} satisfies Record<string, Entry>;

export type I18nKey = keyof typeof dict;

/** Translate a UI string. `{name}` placeholders are filled from `vars`. */
export function t(key: I18nKey, lang: Lang, vars?: Record<string, string | number>): string {
  const entry: Entry = dict[key];
  let s = entry[lang] ?? entry.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/** CSS class for Urdu labels inside left-to-right UI. */
export function urduFont(lang: Lang): string {
  return lang === "ur" ? "urdu-font" : "";
}

/** Parse "YYYY-MM-DD" (or an ISO string) as a local date. */
export function parseDate(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "10 Oct 2026" (English / Roman) or the Urdu month name. */
export function formatDate(s: string, lang: Lang = "en"): string {
  const d = parseDate(s);
  if (!d) return s;
  const locale = lang === "ur" ? "ur-PK" : "en-GB";
  try {
    return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
}

/** "Mar 26" for chart axes. */
export function formatMonthShort(s: string): string {
  const d = parseDate(s);
  if (!d) return s;
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
