import { Fragment, type ReactNode } from "react";

// Minimal, safe markdown: **bold**, "- " / "• " / "* " bullets, numbered lines,
// "#" headings shown as bold lines, paragraphs and line breaks.
// No HTML is ever injected; everything renders as React text nodes.

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[]; start: number }
  | { kind: "h"; text: string };

const BULLET = /^\s*(?:[-•*])\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  const last = () => blocks[blocks.length - 1];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] }); // paragraph break marker
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = HEADING.exec(line))) {
      blocks.push({ kind: "h", text: m[1] });
    } else if ((m = BULLET.exec(line))) {
      const b = last();
      if (b?.kind === "ul") b.items.push(m[1]);
      else blocks.push({ kind: "ul", items: [m[1]] });
    } else if ((m = NUMBERED.exec(line))) {
      const b = last();
      if (b?.kind === "ol") b.items.push(m[2]);
      else blocks.push({ kind: "ol", items: [m[2]], start: Number(m[1]) || 1 });
    } else {
      const b = last();
      if (b?.kind === "p" && b.lines.length > 0) b.lines.push(line);
      else blocks.push({ kind: "p", lines: [line] });
    }
  }
  return blocks.filter((b) => b.kind !== "p" || b.lines.length > 0);
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index));
    out.push(
      <strong key={i++} className="font-semibold">
        {m[1]}
      </strong>,
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <div className="space-y-2.5 break-words">
      {blocks.map((b, i) => {
        if (b.kind === "h") {
          return (
            <p key={i} className="font-semibold">
              {inline(b.text.replace(/\*\*/g, ""))}
            </p>
          );
        }
        if (b.kind === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 ps-5 marker:text-muted">
              {b.items.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.kind === "ol") {
          return (
            <ol key={i} start={b.start} className="list-decimal space-y-1 ps-6 marker:text-muted">
              {b.items.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
