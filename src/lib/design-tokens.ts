/**
 * Fundação do futuro design system (Etapa 2) — documenta em código, não
 * em prosa solta, qual classe Tailwind usar pra cada PAPEL visual. Nada
 * aqui é consumido por telas reais ainda; só pelos componentes novos em
 * `src/components/design-system/` e pela página `/design-system`.
 *
 * A escala do Tailwind (espaçamento em múltiplos de 4px, `text-*`, etc.)
 * já resolve a maior parte — o valor deste arquivo é fixar QUAL opção da
 * escala usar pra cada papel, pra parar de decidir isso de novo em cada
 * arquivo (a causa raiz apontada na auditoria da Etapa 1).
 */

/** Tipografia — escala única, uma entrada por papel. `weight` nunca é
 * "300" pra título: a regra global `h1,h2,h3,h4{font-weight:300}` em
 * `styles.css` é uma dívida da plataforma atual, não o padrão correto —
 * ver `TYPOGRAPHY_MIGRATION_NOTE` abaixo. Os componentes novos usam
 * `<p>`/`<span>` com a classe certa, nunca `<h1>-<h4>` soltos, pra não
 * herdar essa regra por acidente. */
/** Escala aumentada na rodada corretiva — o feedback foi "tipografia e
 * controles pequenos, parece documentação genérica". Mobile-first: cada
 * classe já reduz progressivamente no mobile (breakpoint sem prefixo) e
 * cresce a partir de `md:` — nunca o contrário, então nada quebra em
 * 320px. Pesos sobem de 400 (corpo) até 700 (display/título de página)
 * pra criar hierarquia real — só `text-secondary` (não `muted-foreground`)
 * é usado pro texto secundário/caption, ver `--text-secondary` em
 * `styles.css` (contraste corrigido, ver relatório da rodada corretiva). */
export const TYPOGRAPHY = {
  display: "text-3xl font-bold tracking-tight md:text-5xl break-words",
  pageTitle: "text-2xl font-bold tracking-tight md:text-4xl break-words",
  sectionTitle: "text-xl font-semibold tracking-tight md:text-2xl break-words",
  cardTitle: "text-[15px] font-semibold break-words",
  // `break-words` é defensivo aqui de propósito: texto corrido com termos
  // técnicos entre crases costuma juntar palavras com "/" (ex.
  // "`outline`/`ghost`") — sem quebra, isso forma um único token gigante
  // e sem espaço pra quebrar, causando overflow horizontal real em
  // viewports estreitos (320px). Achado e corrigido ao vivo na Etapa 2.
  body: "text-sm font-normal leading-relaxed md:text-base break-words",
  bodySecondary: "text-sm text-text-secondary break-words",
  label:
    "text-xs font-semibold text-text-secondary uppercase tracking-wide md:text-[13px] break-words",
  caption: "text-xs text-text-secondary break-words",
  numberLarge: "text-3xl font-bold tabular-nums tracking-tight md:text-4xl",
  numberMedium: "text-xl font-semibold tabular-nums md:text-2xl",
} as const;

/** Registrado, não executado: a regra global de peso 300 em h1-h4 deve
 * ser corrigida SÓ na etapa de migração do AppShell/PageHeader — trocá-la
 * agora mudaria o peso visual de todo título de toda tela real de uma vez,
 * sem validação. A página /design-system demonstra o peso correto (600,
 * via `TYPOGRAPHY.pageTitle` etc.) usando elementos que não são h1-h4,
 * exatamente pra não precisar dessa mudança global ainda. */
export const TYPOGRAPHY_MIGRATION_NOTE =
  "styles.css:h1,h2,h3,h4{font-weight:300} deve ser removido ou corrigido " +
  "junto da migração do AppShell e do PageHeader (Etapa 3+), nunca antes — " +
  "afeta todas as telas reais simultaneamente.";

/** Espaçamento — papel → classe. Tudo múltiplo de 4px (escala padrão do
 * Tailwind), só documentando qual usar onde. */
export const SPACING = {
  pageX: "px-4 md:px-8", // já é o padding real de <main> no AppShell
  pageY: "py-6 md:py-8",
  betweenSections: "space-y-8",
  cardPadding: "p-5",
  cardPaddingCompact: "p-4",
  formFieldGap: "space-y-4",
  formRowGap: "gap-3",
  iconTextGap: "gap-2",
  gridGap: "gap-4",
  gridGapCompact: "gap-3",
} as const;

/** Raio — papel → classe, usando a escala `--radius-*` já existente em
 * styles.css (derivada de --radius: 0.625rem). No desktop os cards ficam
 * entre 14-18px: `--radius-xl` = 0.625rem+4px = 14px, bate certo. */
export const RADIUS = {
  control: "rounded-md", // input, button, select
  card: "rounded-xl", // ~14px desktop
  cardMobile: "rounded-2xl", // ~18px — só quando o card ocupa a largura toda no mobile
  overlay: "rounded-2xl", // modal, drawer (canto que aparece, no desktop)
  pill: "rounded-full", // badge, avatar, chip, segmented control
} as const;

/** Elevação — poucos níveis, contraste de superfície > sombra preta,
 * especialmente no escuro (pedido explícito). */
export const ELEVATION = {
  none: "border border-border bg-card",
  subtle: "border border-border bg-card shadow-sm",
  elevated: "border border-border bg-card shadow-md",
  overlay: "border border-border shadow-lg", // Modal/Drawer — Radix já cuida do resto
} as const;

/** Superfície de card "premium" já validada visualmente no Financeiro
 * (`financeiro/PosicaoFinanceira.tsx`'s `SECONDARY_SURFACE`) — promovida
 * aqui pra token reutilizável fora daquele módulo (primeiro consumidor:
 * a Home). Sem sombra pesada; a hierarquia vem do contraste de
 * superfície (branco/cinza muito claro no tema claro com borda discreta,
 * carvão elevado — mais claro que `--background` mas mais escuro que
 * `--card` — no escuro, sem borda). */
export const SURFACE = {
  raised: "border border-border/60 bg-card dark:border-0 dark:bg-[oklch(0.17_0_0)]",
} as const;

/** Movimento — só o que já existe (`tw-animate-css`, já usado em todo
 * `ui/*.tsx` via `data-[state=open]:animate-in` etc.). Nenhuma lib nova. */
export const MOTION = {
  fast: "duration-150",
  base: "duration-200",
  easing: "ease-out",
  /** Qualquer transição/animação nova deve respeitar isso — Tailwind não
   * gera `motion-reduce:` por padrão pra classes de duração custom, então
   * os componentes novos aplicam essa classe explicitamente quando
   * animam algo além do que o Radix/tw-animate-css já trata sozinho. */
  reduceMotion: "motion-reduce:transition-none motion-reduce:animate-none",
} as const;

export type SemanticTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

/** Mapa único tom→classes, pra parar de reimplementar isso por módulo
 * (a auditoria encontrou 6+ helpers de tom diferentes: `statusTone` do
 * Financeiro, `TASK_STATUS_DOT`, `OPPORTUNITY_STAGE_TONE`, etc.). Os
 * componentes novos (Badge, Alert, MetricCard) usam este mapa; os
 * helpers antigos continuam intocados até a migração de cada módulo. */
export const TONE_SOFT_BG: Record<SemanticTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand-subtle text-brand",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
};

export const TONE_SOLID: Record<SemanticTone, string> = {
  neutral: "bg-foreground text-background",
  brand: "bg-brand text-brand-foreground",
  success: "bg-success text-brand-foreground",
  warning: "bg-warning text-brand-foreground",
  danger: "bg-danger text-brand-foreground",
  info: "bg-info text-brand-foreground",
};

export const TONE_BORDER: Record<SemanticTone, string> = {
  neutral: "border-border",
  brand: "border-brand/30",
  success: "border-success-border",
  warning: "border-warning-border",
  danger: "border-danger-border",
  info: "border-info-border",
};
