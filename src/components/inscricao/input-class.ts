/** Altura/tipografia dos campos da inscrição pública: 44 px e 16 px no mobile (evita o zoom do iOS
 * ao focar), 40 px/14 px no desktop. */
export const INPUT =
  "h-11 rounded-lg border-border bg-muted/30 text-base transition-colors focus-visible:bg-background md:h-11 md:text-sm";

export const inputClass = (invalid?: boolean) =>
  `${INPUT} ${invalid ? "border-destructive focus-visible:ring-destructive" : ""}`;
