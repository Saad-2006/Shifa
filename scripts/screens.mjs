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
  await page.screenshot({ path: `${OUT}/chat.png` });
  // The hero: the code-built report card, scrolled into view.
  await page.getByText(/Checked by Shifa rules/i).first().evaluate((el) => el.scrollIntoView({ block: "end" }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/report-card.png` });

  await waitForChat(page, async () => {
    await page.locator("textarea").fill("Is this serious? What does HbA1c mean?");
    await page.keyboard.press("Enter");
  });
  await page.screenshot({ path: `${OUT}/follow-up.png` });

  await waitForChat(page, async () => {
    await page.locator("textarea").fill("Ammi ke seenay mein dard ho raha hai aur saans nahi aa rahi");
    await page.keyboard.press("Enter");
  });
  const banner = await page.getByText(/1122/).first().isVisible();
  console.log("emergency banner visible:", banner);
  await page.screenshot({ path: `${OUT}/emergency.png` });

  const personId = await page.evaluate(() => JSON.parse(localStorage.getItem("shifa:v1") ?? "{}").activePersonId);
  const summary = await ctx.newPage();
  watch(summary, "summary");
  await summary.goto(`${BASE}/summary?person=${personId}`, { waitUntil: "networkidle" });
  await summary.waitForTimeout(500);
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

  await page.getByRole("radio", { name: "اردو (Urdu)" }).first().click();
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
  await page.getByRole("radio", { name: "English" }).first().click();
  await waitForChat(page, async () => {
    await page.locator("textarea").fill("Ammi ki sugar kitni zyada hai?");
    await page.keyboard.press("Enter");
  });
  const en = await lastAnswer();
  console.log("english answer is English:", !/[\u0600-\u06FF]/.test(en) && !/\b(hai|hain|mein|ki|aur)\b/i.test(en), "|", en.slice(0, 90).replace(/\n/g, " "));
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
    localStorage.setItem("shifa:v1", JSON.stringify(s));
  }, abbuId);
  await page.reload({ waitUntil: "networkidle" });
  const before = (await state()).reports.length;
  await page.locator('input[type=file][accept="image/*,application/pdf"]').first().setInputFiles("public/samples/sample-report.png");
  await page.getByText(/Is this report for Abbu\?/i).first().waitFor({ timeout: 180_000 });
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
  const page = await ctx.newPage();
  watch(page, "dark");
  await page.addInitScript(() => localStorage.setItem("shifa:theme", "dark"));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const early = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  if (early !== "dark") problems.push(`[dark] theme not applied before first paint (got ${early})`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: "English" }).first().click();
  await page.getByRole("button", { name: /Load demo family/i }).first().click();
  await page.waitForTimeout(500);
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
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n${problems.join("\n")}` : "\nno page or console errors");
