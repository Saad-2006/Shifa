# PROJECT.md: Shifa (AI lab-report companion)

Read this before writing code.

## What we are building (Phase 1)
A chat-first web app for Pakistani families. The user attaches a lab report (photo or PDF) in the chat.
1. **AI reads it** (`/api/extract`, Gemini vision → `ExtractedReport` JSON)
2. **Code checks it** (`labRules.checkReport`, no AI): status per test, danger values, urgency
3. **Code renders a report card**
4. **AI explains it** (`/api/chat`, streaming) in English, Urdu (RTL) or Roman Urdu, grounded only in this person's reports

Follow-up questions use the same chat. An emergency detector (code only: keywords, or danger values on a report) shows a calm card in the chat with a WhatsApp alert to family first; typed emergencies also get one Call 1122 button.

**Never let the AI decide** a flag, an urgency level or a number: those come from code.

Out of scope for Phase 1: medicines, SMS, user accounts, a server database, landing page.

## Stack
- Next.js 15.5 App Router, React 19, TypeScript strict, Tailwind v4
- Libraries: fuse.js, recharts, lucide-react (v1.x: check icon names in node_modules), tsx (scripts)
- Gemini through its REST API with `fetch` (no SDK). Env vars:
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL` (optional, default `gemini-flash-latest`)
  - `SHIFA_ACCESS_CODE` (optional demo passcode)
- Storage: browser localStorage only (`store.ts`). Images are never stored, only the extracted values.
- Import alias `@/` = `src/`. Shared types: `src/lib/types.ts` (FROZEN, do not edit).

## File ownership (only edit files you own)
| Area | Owner | Files |
|---|---|---|
| Shared contracts | lead | `src/lib/types.ts`, `PROJECT.md`, `package.json`, `.gitignore`, `README.md`, `docs/` |
| Data layer | data agent | `src/lib/labRules.ts`, `src/lib/trends.ts`, `src/lib/store.ts`, `src/lib/demoData.ts`, `public/samples/*`, `scripts/selftest.ts` |
| Backend APIs | backend agent | `src/lib/gemini.ts`, `src/lib/prompts.ts`, `src/lib/fallback.ts`, `src/app/api/**`, `scripts/check-models.mjs`, `scripts/eval-extraction.mjs`, `eval/README.md`, `eval/labels/_template.json`, `.env.example` |
| Access & safety ("auth") | security agent | `src/lib/security.ts`, `src/lib/emergency.ts`, `src/lib/apiClient.ts`, `src/components/AccessGate.tsx`, `next.config.ts`, `scripts/selftest-safety.ts`, `SECURITY.md` |
| Frontend | frontend agent | `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/summary/**`, `src/components/**` (except AccessGate.tsx), `src/lib/image.ts`, `src/lib/i18n.ts`, `src/lib/speech.ts` |

**Rules for every agent:**
- Do **not** run `npm install`, `next dev` or `next build`; the lead does integration.
- Check your own files with `npx tsc --noEmit`, and ignore errors in files you don't own.
- Unit-test logic with `npx tsx <script>`.

## Module contracts (signatures are binding)

### Data layer
- `labRules.ts`
  - `canonicalKey(name: string): string`
  - `checkTest(t: ExtractedTest): CheckedTest`
  - `checkReport(x: ExtractedReport, o: { personId: string; source: LabReport["source"]; id?: string; createdAt?: string }): LabReport`
  - `URGENCY_RANK: Record<Urgency, number>`
- `trends.ts`
  - `buildTrends(reports: LabReport[], personId?: string): Trend[]`: only keys with ≥2 numeric points
- `store.ts` (client): `useShifa(): ShifaState`, `useHydrated(): boolean`, and a `shifa` actions object:
  - setup: `getState`, `setLang`, `completeOnboarding`
  - people: `addPerson`, `setActivePerson`
  - reports: `addReport`, `deleteReport`
  - chat: `addMessage`, `updateMessage`, `clearChat`
  - demo and reset: `loadDemoFamily`, `resetAll`

  Where `ShifaState = { version: 1; onboarded: boolean; lang: Lang; people: Person[]; activePersonId: string | null; reports: LabReport[]; messages: ChatMessage[] }`
- `demoData.ts`
  - `SAMPLE_EXTRACTION: ExtractedReport` (matches `public/samples/sample-report.png`)
  - `buildDemoFamily(now?: Date): { people; reports; messages; activePersonId }`

### Access & safety
- `emergency.ts` (runs on client and server)
  - `detectEmergency(text): { isEmergency: boolean; category: EmergencyCategory | null; matched: string[] }`
  - `EMERGENCY_CONTACTS: { name; number; note }[]`
  - `EMERGENCY_SENTINEL = "[[EMERGENCY]]"`
- `security.ts` (server)
  - `guardRequest(req: Request, o: { route: "extract" | "chat" | "health" }): Response | null` (null = allowed)
  - `validateUpload(i: { imageBase64: unknown; mimeType: unknown }): { ok: true; mimeType: string; bytes: number } | { ok: false; status: number; error: string }`
  - `accessRequired(): boolean`
- `apiClient.ts` (client)
  - `apiFetch(path, init?): Promise<Response>`: adds the `x-shifa-access` header. On a 401 it fires `window` event `shifa:access-required`
  - `getAccessCode()`, `setAccessCode(code)`
- `AccessGate.tsx`
  - `export default function AccessGate({ children })`: shows a passcode screen only when `/api/health` says `accessRequired` and no valid code is stored

### Backend APIs (types in `types.ts`)
- `GET /api/health` → `HealthResponse`
- `POST /api/extract` takes `ExtractRequest` and returns `ExtractResponse`, or `ApiError` on failure
  - `sample: true` with no key, or with a failing AI call: returns `SAMPLE_EXTRACTION` with `offline: true`
  - `isLabReport` false: 422 `not_a_report`
- `POST /api/chat` takes `ChatRequest` and returns a `text/plain` stream
  - If the AI judges an emergency, the stream starts with `EMERGENCY_SENTINEL + "\n"`
  - No key: streams a deterministic offline answer built from the report data (`fallback.ts`), with header `x-shifa-offline: 1`
  - Errors return `ApiError` JSON with a 4xx/5xx status

## Design tokens (light theme only)
- **Colour:**
  - Base:
    - bg `#FFFFFF`
    - surface `#F7F7F8`
    - border `#E4E4E7`
    - text `#18181B`
    - muted `#71717A`
  - Accent (buttons only): `#1A40FF`
  - Status (health meaning only):
    - Normal: green `#15803D` on `#F0FDF4`
    - Attention: amber `#B45309` on `#FFFBEB`
    - Urgent: red `#B91C1C` on `#FEF2F2`
    - Urgent badge (danger values): solid `#DC2626` with white text; the urgent card itself is amber
- **Shape:** radius 16px for cards, 12px for inputs, full for chips. 1px borders, no heavy shadows.
- **Type:**
  - Geist (already set up), 17px base. Urdu uses Noto Nastaliq Urdu with `dir="rtl"` and a generous line-height.
  - Tap targets at least 44px. Status always shows an icon and a word, never colour alone.
- **Motion:** subtle (fade or slide-in of cards, range bar transition, typing dots). Respect `prefers-reduced-motion`.
