/** Altura/tipografia dos campos da inscrição pública: 44 px e 16 px no mobile (evita o zoom do iOS
 * ao focar), 40 px/14 px no desktop. */
export const INPUT = "h-11 text-base md:h-10 md:text-sm";

export const inputClass = (invalid?: boolean) =>
  `${INPUT} ${invalid ? "border-destructive focus-visible:ring-destructive" : ""}`;
