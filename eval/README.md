# Extraction accuracy test

Measures how well `/api/extract` (Gemini vision) transcribes real Pakistani lab reports,
and whether Shifa's deterministic code then flags each value the same way a person would.

## 1. Add reports

Put report photos or PDFs in `eval/reports/`:

```
eval/reports/chughtai-cbc-01.jpg
eval/reports/excel-lipid-02.pdf
```

Supported: `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf` (keep files under about 4 MB; shrink big phone photos first).
Aim for variety: Chughtai, Excel Labs, Shaukat Khanum, IDC, Dr. Essa, Aga Khan, and small local labs;
clean scans and tilted phone photos.

## 2. Label them

For each report create `eval/labels/<same base name>.json`, starting from
[`labels/_template.json`](labels/_template.json):

```json
{
  "tests": [
    { "name": "Haemoglobin", "value": "10.6", "unit": "g/dL", "refLow": 12.0, "refHigh": 15.5, "flag": "L" },
    { "name": "HbA1c", "value": 7.4, "unit": "%", "refLow": null, "refHigh": 5.7, "flag": "H" }
  ]
}
```

- `name`: as printed (matching is by Shifa's canonical test key, then by name, so small spelling differences are fine).
- `value`: exactly as printed (`"1,50,000"`, `"Negative"`, `"<0.5"`) or a number.
- `refLow` / `refHigh` (optional): the printed range as numbers; `null` for an open side (`< 200` → `null`, `200`). Leave both out to skip range scoring for that row.
- `flag` (optional): `H`, `L` or `N`, i.e. what the value really is compared with the printed range. Scored against Shifa's `checkTest`.
- `unit` (optional): for reference only, not scored.

Label every result row you can read; rows you leave out are simply not scored.

## 3. Run

Start the app with a `GEMINI_API_KEY` (`npm run dev`), then:

```bash
npx tsx scripts/eval-extraction.ts
# against a deployment (add the passcode if SHIFA_ACCESS_CODE is set there):
BASE_URL=https://your-app.vercel.app SHIFA_ACCESS_CODE=1234 npx tsx scripts/eval-extraction.ts
```

It prints each mismatch, a per-report table and an overall row, and writes:

- `eval/results/results.json`: every labelled test with what was extracted
- `eval/results/summary.md`: a markdown table to paste into the README and proposal

| Metric | Meaning |
|---|---|
| Tests found | labelled rows the AI returned |
| Value exact | value identical to the label (numbers within 1e-6, text case-insensitive), out of all labelled rows |
| Range match | `refLow` and `refHigh` identical, for rows whose label gives a range |
| Flag agreement | Shifa's code gives the same low/high/normal as the label |

## Privacy

- Real reports are personal health data. `eval/reports/*`, `eval/labels/*` (except the template) and
  `eval/results/` are **gitignored**: never force-add them.
- Blur or crop out the patient name, MR number, phone number and address before adding a photo.
- Get the family's permission before using anyone's report, and delete the files after the competition.
