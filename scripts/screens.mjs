// Browser end-to-end check + README screenshots, using the locally installed Google Chrome.
// Usage: npm run dev   (in another terminal), then: node scripts/screens.mjs
// Writes PNGs to docs/screenshots/ and prints any page/console errors.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/screenshots";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(OUT, { recursive: true });

const problems = [];
function watch(page, label) {
  page.on("pageerror", (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[${label}] console: ${m.text().slice(0, 200)}`);
  });
}

/** Wait for the next /api/chat stream to finish completely. */
async function waitForChat(page, action) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/chat"), { timeout: 180_000 }),
    action(),
  ]);
  // The composer is disabled while Shifa is busy; it re-enables when the answer is complete.
  await page.waitForFunction(
    () => {
      const t = document.querySelector("textarea");
      return t && !t.disabled;
    },
    null,
    { timeout: 180_000 },
  );
  await page.waitForTimeout(800); // let the throttled store flush and animations settle
  return res;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// ---------- Desktop, English: sample report end to end ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page, "desktop");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "English" }).first().click();
  await page.screenshot({ path: `${OUT}/welcome.png` });

  const t = Date.now();
  await waitForChat(page, () => page.getByRole("button", { name: /Try a sample report/i }).first().click());
  console.log(`sample flow (extract + check + explain): ${Date.now() - t}ms`);
  // "Basic answer" only when the answer itself came from the built-in rules (not because the
  // sample used its built-in data).
  const sampleMsg = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("shifa:v1") ?? "{}");
    return (s.messages ?? []).filter((m) => m.role === "assistant" && m.reportId).at(-1) ?? {};
  });
  const builtIn = /Basic answer|Basic jawab|سادہ جواب/.test(sampleMsg.text ?? "");
  console.log("sample answer badge matches its source:", Boolean(sampleMsg.offline) === builtIn);
  if (Boolean(sampleMsg.offline) !== builtIn) problems.push(`[badge] sample marked offline=${Boolean(sampleMsg.offline)} but built-in answer=${builtIn}`);
  await page.screenshot({ path: `${OUT}/chat.png` });
  // The hero: the code-built report card, scrolled into view.
  await page.getByText(/Checked by Shifa rules/i).first().evaluate((el) => el.scrollIntoView({ block: "end" }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/report-card.png` });

  await waitForChat(page, async () => {
    await page.locator("textarea").fill("Is this serious? What does HbA1c mean?");
    await page.keyboard.press("Enter");
  });
  // An everyday question (and a "see a doctor soon" report) must not open the urgent card.
  const calmBefore = await page.getByText(/This could be serious/i).count();
  console.log("no urgent card for an everyday question:", calmBefore === 0);
  if (calmBefore) problems.push("[urgent] card shown for an everyday question");
  await page.screenshot({ path: `${OUT}/follow-up.png` });

  await waitForChat(page, async () => {
    await page.locator("textarea").fill("Ammi ke seenay mein dard ho raha hai aur saans nahi aa rahi");
    await page.keyboard.press("Enter");
  });
  // Typed emergency: calm card in the chat, WhatsApp first, exactly one 1122 button, no Edhi, no popup.
  const card = await page.getByText(/This could be serious/i).first().isVisible();
  const calls = await page.locator('a[href^="tel:"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  const wa = await page.getByRole("link", { name: /Tell family on WhatsApp/i }).count();
  const urgentOk = card && wa > 0 && calls.length === 1 && calls[0] === "tel:1122";
  console.log("urgent card: WhatsApp first + single 1122 button:", urgentOk, calls);
  if (!urgentOk) problems.push(`[urgent] typed emergency card wrong (card ${card}, whatsapp ${wa}, calls ${calls.join(",")})`);
  // (Next.js keeps an empty role="alert" route announcer on every page, so only count alerts with text.)
  const alerts = await page.getByRole("alert").filter({ hasText: /\S/ }).allInnerTexts();
  if (alerts.length) problems.push(`[urgent] a popup/alert banner is still shown: ${alerts.join(" | ").slice(0, 120)}`);
  await page.getByText(/This could be serious/i).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/emergency.png` });

  // Drag the sidebar edge wider: it must grow, and double-click puts it back.
  const sep = page.getByRole("separator", { name: /sidebar wider/i });
  const box = await sep.boundingBox();
  const sideWidth = () => page.evaluate(() => document.querySelector("aside")?.getBoundingClientRect().width ?? 0);
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 220, box.y + 200, { steps: 8 });
    await page.mouse.up();
  }
  const wide = await sideWidth();
  console.log("sidebar dragged wider:", Math.round(wide));
  if (!(wide > 450)) problems.push(`[sidebar] drag did not widen the sidebar (${wide}px)`);
  await page.screenshot({ path: `${OUT}/wide-sidebar.png` });
  await sep.dblclick();
  await page.waitForTimeout(200);
  if (Math.round(await sideWidth()) !== 300) problems.push("[sidebar] double-click did not reset the width");

  const personId = await page.evaluate(() => JSON.parse(localStorage.getItem("shifa:v1") ?? "{}").activePersonId);
  const summary = await ctx.newPage();
  watch(summary, "summary");
  await summary.goto(`${BASE}/summary?person=${personId}`, { waitUntil: "networkidle" });
  // "In simple words": one AI paragraph, numbers checked by code, saved with the report.
  await summary.getByText(/Written by AI from the checked values above/).waitFor({ timeout: 120_000 }).catch(() => {});
  const aiPara = await summary.getByText(/Written by AI from the checked values above/).count();
  const savedSummary = await summary.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("shifa:v1") ?? "{}");
    return (s.reports ?? []).some((r) => r.aiSummary && r.aiSummary.en);
  });
  console.log("Doctor Summary has the AI paragraph (checked + saved):", aiPara > 0 && savedSummary);
  if (!(aiPara > 0 && savedSummary)) problems.push("[summary] no checked AI paragraph on the Doctor Summary");
  await summary.waitForTimeout(300);
  await summary.screenshot({ path: `${OUT}/summary.png`, fullPage: true });
  await ctx.close();
}

// ---------- Mobile, Roman Urdu + Urdu: demo family, drawer, trends ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  watch(page, "mobile");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/mobile-welcome.png` });
  await page.getByRole("button", { name: /demo family/i }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/mobile-demo-chat.png` });

  await page.getByRole("button", { name: /menu/i }).first().click();
  await page.waitForTimeout(2000); // let the trend lines finish their draw animation
  await page.screenshot({ path: `${OUT}/mobile-drawer.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const closeBtn = page.getByRole("button", { name: /close/i }).first();
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();

  // Preferred language is set in the menu now (the header toggle is gone), with a short notice.
  const setLang = async (name) => {
    await page.getByRole("button", { name: /menu|مینو|Menu/i }).first().click();
    await page.waitForTimeout(300);
    await page.getByRole("radio", { name }).first().click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const close = page.getByRole("button", { name: /close menu|مینو بند|Menu band/i }).first();
    if (await close.isVisible().catch(() => false)) await close.click();
  };
  await setLang("اردو (Urdu)");
  const notice = await page.getByRole("status").filter({ hasText: /اردو/ }).count();
  console.log("language notice shown after changing it in the menu:", notice > 0);
  if (!notice) problems.push("[language] no notice after changing the preferred language");
  await page.screenshot({ path: `${OUT}/mobile-language-notice.png` });
  await waitForChat(page, async () => {
    await page.locator("textarea").fill("کیا امی کی رپورٹ میں کوئی خطرے کی بات ہے؟");
    await page.keyboard.press("Enter");
  });
  await page.screenshot({ path: `${OUT}/mobile-urdu.png` });
  // Regression check: after a Roman Urdu chat, switching to Urdu/English must change the answer language.
  const lastAnswer = () =>
    page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("shifa:v1") ?? "{}");
      const mine = (s.messages ?? []).filter((m) => m.personId === s.activePersonId && m.role === "assistant");
      return mine.at(-1)?.text ?? "";
    });
  const urdu = await lastAnswer();
  console.log("urdu answer uses Urdu script:", /[\u0600-\u06FF]/.test(urdu) && !/\b(hai|mein|ki)\b/.test(urdu));
  await setLang("English");
  await waitForChat(page, async () => {
    await page.locator("textarea").fill("Ammi ki sugar kitni zyada hai?");
    await page.keyboard.press("Enter");
  });
  const en = await lastAnswer();
  console.log("english answer is English:", !/[\u0600-\u06FF]/.test(en) && !/\b(hai|hain|mein|ki|aur)\b/i.test(en), "|", en.slice(0, 90).replace(/\n/g, " "));

  // "Show in: اردو" under that English answer: translated on tap (checked by code), then back.
  await page.getByRole("button", { name: "اردو" }).last().click();
  await page.getByText(/Translated from English/i).last().waitFor({ timeout: 120_000 }).catch(() => {});
  const shownUrdu = await page.getByText(/Translated from English/i).count();
  const saved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("shifa:v1") ?? "{}");
    const mine = (s.messages ?? []).filter((m) => m.personId === s.activePersonId && m.role === "assistant");
    return mine.at(-1)?.translations?.ur ?? "";
  });
  const translatedOk = shownUrdu > 0 && /[\u0600-\u06FF]/.test(saved);
  console.log("answer translated to Urdu on tap and saved:", translatedOk);
  if (!translatedOk) problems.push("[language] tapping اردو under an answer did not show a saved Urdu translation");
  await page.screenshot({ path: `${OUT}/mobile-translated-answer.png` });
  await page.getByRole("button", { name: "English" }).last().click();
  await page.waitForTimeout(300);
  if (await page.getByText(/Translated from English/i).count()) problems.push("[language] could not switch back to the original answer");
  await ctx.close();
}

// ---------- Mobile, English: patient identity check (wrong person -> ask before adding) ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  watch(page, "identity");
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("shifa:v1") ?? "{}"));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "English" }).first().click();
  await page.getByRole("button", { name: /Load demo family/i }).first().click();
  await page.waitForTimeout(400);
  const abbuId = (await state()).people.find((p) => p.name === "Abbu").id;
  await page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem("shifa:v1"));
    s.activePersonId = id;
    // Show Abbu's demo report in his chat (LDL "< 130", HDL "> 40": one-sided ranges).
    s.messages.push({ id: "demo-msg-abbu-test", personId: id, role: "assistant", lang: "en", createdAt: new Date().toISOString(),
      text: "Abbu's September report.", reportId: "demo-report-abbu-2026-09" });
    localStorage.setItem("shifa:v1", JSON.stringify(s));
  }, abbuId);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // Abbu's demo report has "below 130" (LDL) and "above 40" (HDL): every value gets a bar now.
  const abbuCard = page.locator("section").filter({ has: page.getByText(/Checked by Shifa rules/) }).first();
  const rows = await abbuCard.getByRole("button", { name: /Ask about/i }).count();
  const bars = await abbuCard.locator(".range-marker").count();
  console.log(`range bars on one-sided ranges: ${bars} bars for ${rows} values`);
  if (rows === 0 || bars !== rows) problems.push(`[bars] ${bars} bars for ${rows} values on Abbu's report`);

  // "Not Abbu?" opens the options below the card: they must scroll into view.
  await page.getByRole("button", { name: /Not Abbu\?/ }).first().click();
  await page.waitForTimeout(900);
  const optBox = await page.getByRole("group", { name: /Whose report is this/i }).first().boundingBox();
  const inView = !!optBox && optBox.y < 844 && optBox.y + optBox.height > 0;
  console.log("'Not Abbu?' options scrolled into view:", inView);
  if (!inView) problems.push("[identity] options after 'Not Abbu?' are off screen");
  await page.getByRole("button", { name: /Keep it with Abbu/i }).first().click();
  await page.waitForTimeout(300);

  // Pasting a screenshot attaches it (nothing is sent until Send).
  await page.locator("textarea").evaluate(async (el) => {
    const blob = await (await fetch("/samples/sample-report.png")).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "image.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
  const pasted = await page.getByText(/Ready: press Send/).count();
  console.log("pasted image waits in the composer:", pasted > 0);
  if (!pasted) problems.push("[composer] pasting an image did not attach it");
  await page.getByRole("button", { name: /Remove attachment/i }).click();

  // Attach, type a question, then Send: the report is checked and the question goes with it.
  const before = (await state()).reports.length;
  const msgsBefore = (await state()).messages.length;
  await page.locator('input[type=file][accept="image/*,application/pdf"]').first().setInputFiles("public/samples/sample-report.png");
  await page.waitForTimeout(400);
  const notSentYet = (await state()).messages.length === msgsBefore && (await page.getByText(/Ready: press Send/).count()) > 0;
  console.log("attached report waits for Send (question can be added):", notSentYet);
  if (!notSentYet) problems.push("[composer] attaching a file sent it right away");
  await page.locator("textarea").fill("Is the sugar okay?");
  await page.keyboard.press("Enter");
  await page.getByText(/Is this report for Abbu\?/i).first().waitFor({ timeout: 180_000 });
  const withNote = (await state()).messages.some((m) => m.role === "user" && m.attachmentName && m.text === "Is the sugar okay?");
  if (!withNote) problems.push("[composer] the question typed with the report was not sent with it");
  const addedEarly = (await state()).reports.length - before;
  console.log("identity: card shown for Abbu, reports added before choosing:", addedEarly);
  if (addedEarly !== 0) problems.push("[identity] a report was added before the user chose who it's for");
  await page.screenshot({ path: `${OUT}/identity-check.png` });
  await page.getByRole("button", { name: /Add to Ammi/i }).first().click();
  await page.waitForFunction(() => document.querySelector("textarea") && !document.querySelector("textarea").disabled, null, { timeout: 180_000 });
  const s = await state();
  const owner = s.people.find((p) => p.id === s.reports.at(-1).personId)?.name;
  console.log("identity: after 'Add to Ammi' the report belongs to", owner);
  if (owner !== "Ammi") problems.push(`[identity] report went to ${owner}, expected Ammi`);
  await ctx.close();
}

// ---------- Mobile: dark mode + WhatsApp alert ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  let page = await ctx.newPage();
  watch(page, "dark");
  await page.addInitScript(() => localStorage.setItem("shifa:theme", "dark"));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const early = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  if (early !== "dark") problems.push(`[dark] theme not applied before first paint (got ${early})`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: "English" }).first().click();
  await page.getByRole("button", { name: /Load demo family/i }).first().click();
  await page.waitForTimeout(500);
  // Demo family loaded in English must answer in English (it used to be stuck in Roman Urdu).
  const demoEn = await page.getByText(/In Ammi's October report/).count();
  console.log("demo answer follows English:", demoEn > 0);
  if (!demoEn) problems.push("[language] demo family answer is not in English when English is preferred");
  await page.getByText(/Checked by Shifa rules/i).first().evaluate((el) => el.scrollIntoView({ block: "end" }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/dark-report-card.png` });

  // WhatsApp: save a family number, then a code-detected emergency offers a one-tap alert to it
  await page.getByRole("button", { name: /menu/i }).first().click();
  await page.getByRole("button", { name: /Add number/i }).first().click();
  await page.getByPlaceholder("e.g. Bhai").fill("Bhai");
  await page.getByPlaceholder("0300 1234567").fill("0300-1234567");
  await page.getByRole("button", { name: /^Add number$/ }).last().click();
  await page.keyboard.press("Escape");
  const close = page.getByRole("button", { name: /close menu/i }).first();
  if (await close.isVisible().catch(() => false)) await close.click();
  await waitForChat(page, async () => {
    await page.locator("textarea").fill("Ammi ke seenay mein dard ho raha hai");
    await page.keyboard.press("Enter");
  });
  const href = decodeURIComponent((await page.getByRole("link", { name: /WhatsApp Bhai/i }).first().getAttribute("href")) ?? "");
  const waOk = href.startsWith("https://wa.me/923001234567?text=") && href.includes("ER") && !href.includes("1122");
  console.log("whatsapp: calm alert link to the saved number (urgent check-up / ER):", waOk);
  if (!waOk) problems.push(`[whatsapp] unexpected alert link: ${href.slice(0, 80)}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/dark-emergency-whatsapp.png` });

  // Danger value on a report: calm "checked today / ER" card with WhatsApp, and no 1122 at all.
  // Seed it from a fresh tab, so the old tab can't save its own state over the seeded data.
  await page.close();
  page = await ctx.newPage();
  watch(page, "dark-danger");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("shifa:v1"));
    const now = new Date().toISOString();
    const personId = s.activePersonId;
    s.reports.push({
      id: "r-danger", personId, createdAt: now, reportDate: now.slice(0, 10), labName: "Chughtai Lab", source: "scan",
      urgency: "emergency", urgencyReasons: ["Potassium 6.9 mmol/L is at a danger level (above 6.0)"], flaggedCount: 1,
      tests: [{ panel: "", name: "Potassium", value: "6.9", numericValue: 6.9, unit: "mmol/L", refRangeText: "3.5 - 5.1", refLow: 3.5, refHigh: 5.1,
        printedFlag: "H", key: "potassium", displayName: "Potassium", status: "high", severity: "critical", critical: true,
        criticalReason: "Potassium 6.9 mmol/L is at a danger level (above 6.0)" }],
    });
    s.messages.push({ id: "m-danger", personId, role: "assistant", text: "Potassium is at a danger level.", createdAt: now, reportId: "r-danger", emergency: true });
    localStorage.setItem("shifa:v1", JSON.stringify(s));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const dangerCard = page.locator("section[aria-label*='Chughtai']").last();
  const reportWa = await dangerCard.getByRole("link", { name: /WhatsApp Bhai/i }).count();
  const reportCalls = await dangerCard.locator('a[href^="tel:"]').count();
  const reportOk = reportWa > 0 && reportCalls === 0 && (await dangerCard.getByText(/checked by a doctor today/i).count()) > 0;
  console.log("danger report: calm card with WhatsApp, no 1122:", reportOk);
  if (!reportOk) problems.push(`[urgent] danger report card wrong (whatsapp ${reportWa}, calls ${reportCalls})`);
  await dangerCard.screenshot({ path: `${OUT}/dark-danger-report.png` });
  await ctx.close();
}

// ---------- iPhone-like voices (English + Hindi, no Urdu): Urdu Listen uses the Hindi voice ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    const voices = [
      { lang: "en-US", name: "Samantha", default: true, localService: true, voiceURI: "Samantha" },
      { lang: "hi-IN", name: "Lekha", default: false, localService: true, voiceURI: "Lekha" },
    ];
    window.__said = [];
    const fake = {
      getVoices: () => voices,
      speak: (u) => {
        window.__said.push({ text: u.text, lang: u.lang });
        setTimeout(() => u.onend && u.onend(), 50);
      },
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      speaking: false,
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    // Real utterances only accept real voices, so the fake voices need a fake utterance too.
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.voice = null;
      }
    };
  });
  const page = await ctx.newPage();
  watch(page, "voice");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "اردو (Urdu)" }).first().click();
  await page.getByRole("button", { name: /ڈیمو/ }).first().click();
  await page.waitForTimeout(600);
  const listen = page.getByRole("button", { name: /سنیں/ }).first();
  const listenShown = await listen.isVisible().catch(() => false);
  console.log("Urdu Listen button shown without an Urdu voice:", listenShown);
  if (!listenShown) problems.push("[voice] Listen button hidden in Urdu on a device without an Urdu voice");
  if (listenShown) {
    await listen.click();
    await page.waitForFunction(() => window.__said.some((u) => u.lang === "hi-IN" && /[\u0900-\u097F]/.test(u.text)), null, { timeout: 120_000 }).catch(() => {});
    const said = await page.evaluate(() => window.__said);
    const hindiOk = said.some((u) => u.lang === "hi-IN" && /[\u0900-\u097F]/.test(u.text));
    console.log("Urdu answer read in Devanagari with the Hindi voice:", hindiOk, (said.find((u) => u.lang === "hi-IN")?.text ?? "").slice(0, 60));
    if (!hindiOk) problems.push("[voice] Urdu answer was not read with the Hindi voice");
  }
  await ctx.close();
}

// ---------- Urdu: demo answer and Doctor Summary questions follow the preferred language ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page, "urdu-summary");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "اردو (Urdu)" }).first().click();
  await page.getByRole("button", { name: /demo|ڈیمو/i }).first().click();
  await page.waitForTimeout(600);
  const demoUr = await page.getByText(/امی کی اکتوبر کی رپورٹ/).count();
  console.log("demo answer follows Urdu:", demoUr > 0);
  if (!demoUr) problems.push("[language] demo family answer is not in Urdu when Urdu is preferred");
  await page.goto(`${BASE}/summary?person=demo-ammi`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const urTitle = await page.getByText("ڈاکٹر سے پوچھنے کے سوالات").count();
  const enLine = await page.getByText(/What does this mean for Ammi/).count();
  console.log("summary questions in Urdu with English underneath:", urTitle > 0 && enLine > 0);
  if (!(urTitle > 0 && enLine > 0)) problems.push("[language] Doctor Summary questions are not in Urdu + English");
  await page.screenshot({ path: `${OUT}/summary-urdu.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n${problems.join("\n")}` : "\nno page or console errors");
