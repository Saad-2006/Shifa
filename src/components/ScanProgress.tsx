import { CircleCheck, LoaderCircle } from "lucide-react";
import { t, urduFont, type I18nKey } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

const STEPS: I18nKey[] = ["stepReading", "stepChecking", "stepExplaining"];

/** Reading report → Checking every value → Explaining. `step` is the active step (0–2). */
export default function ScanProgress({ step, lang }: { step: number; lang: Lang }) {
  return (
    <ol className="space-y-2 py-1" aria-live="polite">
      {STEPS.map((key, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li
            key={key}
            className={`flex items-center gap-2.5 text-[0.95rem] ${done || active ? "text-ink" : "text-muted/70"}`}
            aria-current={active ? "step" : undefined}
          >
            {done ? (
              <CircleCheck size={20} aria-hidden className="shrink-0 text-ink" />
            ) : active ? (
              <LoaderCircle size={20} aria-hidden className="shrink-0 animate-spin text-ink" />
            ) : (
              <span aria-hidden className="mx-[3px] h-3.5 w-3.5 shrink-0 rounded-full border-2 border-border" />
            )}
            <span className={`${active ? "font-medium" : ""} ${urduFont(lang)}`}>{t(key, lang)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function TypingDots({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 py-2" role="status" aria-label={label}>
      <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
      <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
      <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
    </span>
  );
}
