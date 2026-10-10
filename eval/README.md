# Extraction accuracy test ("training" on real labs)

This measures two things on real Pakistani lab reports:
1. How well `/api/extract` (Gemini vision) reads them.
2. Whether Shifa's fixed rules then flag each value the way a person would.

We don't retrain Gemini. We **tune with this loop**:
1. Collect reports from each lab.
2. Measure accuracy.
3. Fix what it misreads, with prompt hints in `src/lib/prompts.ts` and rules in `src/lib/labRules.ts`.
4. Add a regression test in `scripts/selftest.ts`.

The per-lab table this produces is the accuracy claim for the pitch.

**Target labs:**
- Chughtai Lab
- Minhaj Lab
- Shaukat Khanum (SKM)

Excel Labs, IDC and Aga Khan also work if families have those.

---

## 1. Add reports (name them by lab)

Put photos or PDFs in `eval/reports/`. **Start each file name with the lab**, so results group per lab:

```
eval/reports/chughtai-01.jpg
eval/reports/chughtai-02.jpg
eval/reports/minhaj-01.png
eval/reports/skm-01.pdf
```

| Prefix | Lab |
|---|---|
| `chughtai` | Chughtai Lab |
| `minhaj` | Minhaj Lab |
| `skm` or `shaukat` | Shaukat Khanum |
| `excel` | Excel Labs |
| `idc` | IDC |
| `aku` or `agakhan` | Aga Khan |
| `essa` | Dr. Essa's Lab |

- **File types:** `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`, under about 4 MB.
- **Aim for 5–10 per lab.** Mix clean scans with real phone photos (tilted, shadows), and include some multi-test reports and "See below" category tables (HbA1c, Vitamin D, lipids).

## 2. Label them: draft first, then check

You don't need to type every value. Let the AI write a **draft**, then correct it against the paper:

```bash
npm run dev          # in one terminal (needs GEMINI_API_KEY)
npm run eval:draft   # in another: writes eval/labels/<name>.json for each new report
```

Open each draft in `eval/labels/` with the paper report next to it:
- Fix any wrong `value`, `unit`, `refLow` / `refHigh`.
- Add rows the AI missed. Delete rows that aren't test results.
- Set `flag` to what the value really is versus the printed range: `H`, `L` or `N`.
- **Delete the `"_draft": true` line.** Until you do, the report isn't counted, so unchecked AI output can never inflate the score.

Label format (also in [`labels/_template.json`](labels/_template.json)):

```json
{
  "tests": [
    { "name": "Haemoglobin", "value": "10.6", "unit": "g/dL", "refLow": 12.0, "refHigh": 15.5, "flag": "L" },
    { "name": "HbA1c", "value": 7.2, "unit": "%", "refLow": null, "refHigh": 5.7, "flag": "H" }
  ]
}
```

| Field | What to put |
|---|---|
| `name` | As printed. Small spelling differences are fine; matching uses Shifa's test keys |
| `value` | Exactly as printed (`"1,50,000"`, `"Negative"`, `"<0.5"`), or a number |
| `refLow` / `refHigh` | The printed range as numbers; `null` for an open side (`< 200` → `null`, `200`). For category tables, use the **Normal** row |
| `flag` | `H`, `L` or `N`: what a doctor would mark |
| `unit` | Reference only, not scored |

## 3. Run

```bash
npm run eval
# against the live site (add the passcode if one is set there):
BASE_URL=https://shifa-silk.vercel.app npm run eval
```

It prints every mismatch, a per-report table, an **overall** row and a **by-lab** table, and writes:
- `eval/results/results.json`: every labelled test next to what was read
- `eval/results/summary.md`: markdown tables to paste into the README and the proposal

| Metric | Meaning |
|---|---|
| Tests found | Labelled rows the AI returned |
| Value exact | Value identical to the label (numbers within 1e-6, text case-insensitive) |
| Range match | `refLow` and `refHigh` identical, for rows whose label gives a range |
| Flag agreement | Shifa's code gives the same low/high/normal as the label |

## 4. Fix what fails, and lock it in

For each miss:
1. **The AI misread the layout:** add a short hint to `EXTRACTION_SYSTEM` in `src/lib/prompts.ts`. Example: the "See below" rule, added after the Minhaj HbA1c report.
2. **The rules misjudged a value:** fix `src/lib/labRules.ts` (name aliases, units, range parsing).
3. **Lock it in:** add a test with the exact printed text to `scripts/selftest.ts`, so the fix can't silently break later.

## Privacy

- **These files are personal health data.** `eval/reports/*`, `eval/labels/*` (except the template) and `eval/results/` are **gitignored**: never force-add them.
- **Before adding a photo:** blur or crop out the patient name, MR number, phone number and address.
- **Permission and clean-up:** ask the family before using anyone's report, and delete the files after the competition.
