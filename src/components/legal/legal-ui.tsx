import type { ReactNode } from "react";

/** Marcador visível para dado jurídico ainda não fornecido (nunca um valor inventado). */
export function Pending({ children }: { children: string }) {
  return (
    <mark className="rounded bg-amber-500/15 px-1 font-medium text-amber-700 dark:text-amber-300">
      [A PREENCHER: {children}]
    </mark>
  );
}

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-20 space-y-3">
      <h2 id={`${id}-t`} className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export const P = ({ children }: { children: ReactNode }) => (
  <p className="text-[15px] leading-relaxed text-foreground/90">{children}</p>
);
export const UL = ({ children }: { children: ReactNode }) => (
  <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-foreground/90">
    {children}
  </ul>
);
export const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="font-medium text-foreground underline underline-offset-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
  >
    {children}
  </a>
);
