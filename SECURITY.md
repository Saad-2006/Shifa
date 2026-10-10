# Security & safety

Shifa has **no user accounts and no server database** on purpose: a family's reports live only in their own browser. This page covers what protects the public demo and the people using it.

## Threat model
- **Quota abuse.** Anyone with the public demo URL could script `/api/extract` or `/api/chat` and burn the Gemini quota (or bill).
- **Patient privacy.** Lab reports are health data. The server must not keep, log or leak them.
- **Junk uploads.** Oversized or disguised files sent to the vision model.
- **Missed emergencies.** Someone describing chest pain needs to be told to call 1122, not to read about cholesterol.

## Measures
| Area | What we do | Where |
|---|---|---|
| Same-origin | `POST` requests whose `Origin` host differs from `Host` get 403 `unauthorized` | `src/lib/security.ts` |
| Demo passcode | Optional `SHIFA_ACCESS_CODE`. When set, `/api/extract` and `/api/chat` require header `x-shifa-access` (constant-time SHA-256 + `timingSafeEqual` compare), else 401. After 10 wrong codes a minute from one IP the answer becomes 429 (stops brute force). `/api/health` stays open so the UI can ask whether a code is needed | `security.ts`, `AccessGate.tsx`, `apiClient.ts` |
| Rate limits | Sliding window per client IP (first `x-forwarded-for`, else `x-real-ip`) and route: extract 12/min, chat 30/min, health 60/min. 429 `rate_limited` with `Retry-After` | `security.ts` |
| Upload checks | Base64 only (a `data:` prefix is stripped), ≤ 4 MB decoded (Vercel's body limit is 4.5 MB) → 413, MIME allow-list (JPEG, PNG, WEBP, HEIC/HEIF, PDF) → 415, magic bytes must match the claimed type → 415 | `validateUpload` in `security.ts` |
| Headers | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`, no `X-Powered-By` | `next.config.ts` |
| Urgent card | Instant keyword + fuzzy detector (English, Roman Urdu, Urdu script) for cardiac, breathing, stroke, unconscious, seizure, bleeding, suicide, poisoning, allergy and other emergencies → calm card in the chat with a WhatsApp alert to family and one Call 1122 button. Only code raises it: the server drops an `[[EMERGENCY]]` tag written by the AI alone (`src/lib/streamGuard.ts`). Simple negation ("no chest pain", "dard nahi hai", "risk of stroke") and strict one-word matching ("kidney failing" ≠ "fainting") avoid false alarms | `src/lib/emergency.ts` |

## Privacy
- Report images are sent once to Gemini for reading and are **never stored or logged** by Shifa. Only the extracted values are kept, and only in the user's browser (localStorage).
- No accounts and no server database. Clearing the app's data in the browser removes everything.
- `GEMINI_API_KEY` and `SHIFA_ACCESS_CODE` live only in server environment variables and never reach the browser. The access code a visitor types is kept in their own localStorage (`shifa:access`).

## Known limits
- The rate limiter is **in memory and best-effort**: on serverless each warm instance counts separately and a cold start resets it. A shared store (Upstash/Redis) is the production fix.
- `x-forwarded-for` is trusted as set by the hosting platform (Vercel overwrites it). Behind another proxy it could be spoofed.
- A single shared demo passcode, not user accounts. Anyone who has it has the full demo quota.
- No Content-Security-Policy yet (Next's inline scripts need nonces). This is next on the list.
- The emergency detector is a safety net, not a diagnosis. It favours false alarms over missed emergencies and can't understand every phrasing.
- Gemini's own data handling follows Google's API terms for the key's project.
