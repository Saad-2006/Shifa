// Internal labels from the data the AI sees ("FOCUS", "[Report 1]", "PATIENT DATA", "(main report)").
// The prompt forbids repeating them, but models sometimes do, so CODE removes them from every
// answer before it is saved or shown. Case-sensitive: the ordinary word "focus" is left alone.
export function scrubLabels(text: string): string {
  return (text || "")
    .replace(/\s*\(main report\)/gi, "")
    .replace(/\bFOCUS\b[ \t]*/g, "")
    .replace(/\[Report \d+\][ \t]*/g, "")
    .replace(/PATIENT DATA:?[ \t]*/g, "")
    .replace(/[ \t]{2,}/g, " ");
}
