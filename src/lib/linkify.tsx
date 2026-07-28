import type { ReactNode } from "react";

const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;

/** Quebra `text` em pedaços, envolvendo qualquer URL http(s) num link clicável. */
export function linkifyText(text: string, keyPrefix = "link"): ReactNode[] {
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    if (part.match(URL_RE)) {
      return (
        <a
          key={`${keyPrefix}-${i}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:opacity-80"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
