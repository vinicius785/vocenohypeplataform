> **Referência técnica secundária** — dados brutos da engenharia reversa do Início. Não é contrato: o contrato está em `../DESIGN-SYSTEM.md`.

# Tokens do Início

Fontes: `src/styles.css` (variáveis CSS + `@theme inline`), `src/lib/design-tokens.ts`, classes reais em `InicioDashboard.tsx` / `components/inicio/*`.
Os nomes abaixo são os **nomes reais** do código. Valores em `oklch` (hex quando o próprio CSS comenta).

## 1. Cores — variáveis CSS (`:root` = claro, `.dark` = escuro) → utilitário Tailwind

### 1.1 Base (shadcn)

| Variável → utilitário | Claro | Escuro | Papel |
|---|---|---|---|
| `--background` → `bg-background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | fundo da página (shell, sidebar, topbar, **página Início**) |
| `--foreground` → `text-foreground` | `oklch(0.129 0.042 264.695)` | `oklch(0.985 0 0)` | texto principal |
| `--card` → `bg-card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | superfície de card (no claro **igual** ao background) |
| `--popover` → `bg-popover` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | menus/popovers |
| `--primary` / `--primary-foreground` | `oklch(0.208 0.042 265.755)` / `oklch(0.984 0.003 247.858)` | `oklch(0.985 0 0)` / `oklch(0.205 0 0)` | botão `default` (`bg-foreground` no Button) |
| `--secondary`, `--muted`, `--accent` | `oklch(0.968 0.007 247.896)` (os três iguais) | `oklch(0.269 0 0)` | fundos neutros: hover, ícones circulares, abas inativas |
| `--muted-foreground` → `text-muted-foreground` | `oklch(0.554 0.046 257.417)` | `oklch(0.708 0 0)` | **texto secundário do Início** |
| `--border` → `border-border` | `oklch(0.929 0.013 255.508)` | `oklch(1 0 0 / 10%)` | bordas |
| `--input` | `oklch(0.929 0.013 255.508)` | `oklch(1 0 0 / 15%)` | borda de inputs |
| `--ring` → `ring-ring` | `oklch(0.704 0.04 256.788)` | `oklch(0.556 0 0)` | foco (usado no Início em linhas/botões de card) |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | botão destrutivo |

### 1.2 Marca e semânticas (bloco "Etapa 2")

| Token → utilitário | Claro | Escuro |
|---|---|---|
| `--brand` → `bg-brand`/`text-brand` | `#6F95FF` | `#6F95FF` |
| `--brand-hover` | `#6183E0` | `#80A1FF` |
| `--brand-subtle` → `bg-brand-subtle` | brand a 12% | brand a 14% |
| `--brand-foreground` | `#0B1020` | `#0B1020` |
| `--brand-foreground-secondary`, `--brand-border` | definidos (ver CSS) | definidos |
| `--success` / `-soft` / `-soft-foreground` / `-border` | `#10B981` | `#34D399` |
| `--warning` … | `#F59E0B` | `#FBBF24` |
| `--danger` … | `#EF4444` | `#F87171` |
| `--info` … | `#3B82F6` | `#60A5FA` |
| `--text-secondary` → `text-text-secondary` | `#4B5563` (`oklch(0.4461 0.0263 256.8)`) | `#9CA3AF` (`oklch(0.7137 0.0192 261.32)`) |

Também existem `--chart-1…5` e `--sidebar-*` (a sidebar real usa `bg-background`/`border-border`, não `--sidebar`).

### 1.3 Uso real de cor no Início (contagem)

| Cor | Ocorrências | Onde |
|---|---|---|
| `text-muted-foreground` (+ `/40 /50 /60 /70`) | 44 (+9) | quase todo texto secundário, ícones de card, rótulos |
| `text-foreground` | 29 | títulos de item, valores |
| `text-brand` | 8 | ações de rodapé, aba ativa, hora da próxima reunião, indicador ativo |
| `text-danger` | 3 | "Atrasadas" > 0, vencido |
| `bg-muted/40` · `bg-muted` · `bg-muted/50` | 6 · 6 · 3 | hover de linha, tiles de valor, círculos de ícone |
| `bg-brand-subtle` | 3 | aba ativa, próxima reunião |
| `bg-brand` · `bg-danger` | 2 · 2 | ponto de comentário não lido; ponto de lembrete vencido |
| `bg-foreground` | 3 | avatar sem foto, indicadores do clima |
| Status de tarefa (`TaskStatusBadge`) | via `TASK_STATUS_TONE` | `bg-sky-500/10`, `bg-amber-500/10`, `bg-orange-500/10`, `bg-emerald-500/10`, `bg-foreground` (Concluído) — **paleta Tailwind direta, não tokens semânticos** |
| Prioridade (`PRIORITY_TONE`) | via `task-status.ts` | cor no ícone de bandeira |

### 1.4 Estados de cor no Início

| Estado | Padrão |
|---|---|
| hover de linha | `hover:bg-muted/40` |
| hover de indicador | `hover:bg-muted/50`; ativo: `bg-brand/10` + número `text-brand` |
| hover de aba pill | `hover:bg-muted hover:text-foreground` |
| ativo (aba pill) | `bg-brand-subtle text-brand` |
| selecionado/destaque (próxima reunião) | `border border-brand/30 bg-brand-subtle` |
| foco | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` (+ `ring-inset` nas linhas clicáveis) |
| desabilitado | `disabled:opacity-50 disabled:cursor-not-allowed` (Button) |
| zero/sem dado | número `text-muted-foreground/50` |
| passado (reunião encerrada) | `opacity-50` |

## 2. Superfícies e bordas

`SURFACE.raised` (`design-tokens.ts`):
```
border border-border/60 bg-card dark:border-0 dark:bg-[oklch(0.17_0_0)]
```
- Claro: card **branco com borda `border-border/60` sobre página branca**.
- Escuro: sem borda; fundo `oklch(0.17 0 0)` (mais escuro que `--card`, que é `0.205`).
- Usado por: `Card` do Início, `ManageCardsMenu`, `HomeHeaderShell`, `PortalSectionCard`, `AppShell`, `ConfiguracoesLayout`, `settings-shared`, `NotificationToast` e telas do portal do cliente.

Outros tokens de elevação (`ELEVATION`): `none` `border border-border bg-card` · `subtle` `+ shadow-sm` · `elevated` `+ shadow-md` · `overlay` `border border-border shadow-lg` — **o Início não usa nenhum** (cards sem sombra). Sombras reais no Início: apenas popovers/menus (`shadow-lg`, `bg-popover`).

Bordas em listas do Início: `divide-y divide-border/70` (listas de card), `border-t border-border/70` (rodapé de card), `border-border/60` (card, faixa de indicadores, `divide-x/y`).

## 3. Raio (`--radius: 0.625rem` = 10px)

`@theme inline`: `--radius-sm = r-4px (6)`, `-md = r-2px (8)`, `-lg = r (10)`, `-xl = r+4 (14)`, `-2xl = r+8 (18)`, `-3xl = r+12 (22)`, `-4xl = r+16 (26)`.

`RADIUS` (design-tokens): `control: rounded-md` · `card: rounded-xl` · `cardMobile: rounded-2xl` · `overlay: rounded-2xl` · `pill: rounded-full`.

**Uso real no Início:** `rounded-2xl` (cards, cabeçalho) 4 · `rounded-xl` (próxima reunião, tiles de jogo, capa do Mural) 4 · `rounded-lg` (linhas clicáveis, tiles de valor, thumbnails) 9 · `rounded-md` 2 · `rounded-full` (abas pill, avatares, pontos, badges) 16.

## 4. Espaçamento (observado — o Início não usa tokens `SPACING`)

`SPACING` existe (`pageX px-4 md:px-8`, `pageY py-6 md:py-8`, `betweenSections space-y-8`, `cardPadding p-5`, `cardPaddingCompact p-4`, `formFieldGap space-y-4`, `gridGap gap-4`, `gridGapCompact gap-3`…) mas **o Início não importa `SPACING`**. Valores reais (Tailwind, escala de 4px):

| Contexto | Valor real |
|---|---|
| Padding da página (`<main>`) | `p-4` → `md:p-8` |
| Entre blocos de 1º nível | `space-y-6` → `md:space-y-8` |
| Gutter entre cards | `gap-4` → `md:gap-6` |
| Cabeçalho do Início | `p-5 md:p-7`; min-height `sm:150 md:170` |
| Célula de indicador | `px-3 py-3` |
| `CardHeader` | `px-4 py-3.5 md:px-5`; ícone↔título `gap-2` |
| Linha de lista | `px-4 py-2.5 md:px-5`; entre colunas `gap-3` |
| Corpo livre / grade interna de card | `p-3 md:p-4`; `gap-3` |
| Lista compacta (Agenda) | container `space-y-0.5 p-3`; item `px-2 py-1.5` (próxima: `px-3 py-2.5`) |
| Rodapé-link de card | `px-4 py-2.5` |
| Label ↔ valor | `mt-0.5` (valor sob o rótulo) |

Frequências (p/px/py): `p-2` 17 · `p-3` 16 · `px-4` 15 · `p-4` 10 · `py-2.5` 9 · `px-5` 7. Gaps: `gap-2` 15 · `gap-1` 9 · `gap-3` 8 · `gap-4` 7 · `gap-1.5` 6.

## 5. Tamanhos de ícone e controles

Ícones: `h-4 w-4` (26) · `h-3.5 w-3.5` (19) · avatar `h-14 w-14 md:h-16 md:w-16` · botão ícone `h-7 w-7` · ícone do clima `h-7 w-7`.
`Button` (`ui/button.tsx`): `default h-9 px-4` · `sm h-8 px-3 text-xs` · `lg h-10 px-8` · `icon h-9 w-9` · `comfortable h-11 px-5 text-sm md:h-10`. Variantes: `default` (`bg-foreground`), `primary` (`bg-brand text-brand-foreground`), `destructive`, `outline`, `secondary`, `ghost`, `link`.

## 6. Movimento (`MOTION`: `fast duration-150`, `base duration-200`, `easing ease-out`, `reduceMotion`)

O Início usa `transition-colors` / `transition-opacity` / `transition-transform` sem durações explícitas (default do Tailwind, 150ms). Explícitos: sidebar `duration-200` (mobile) / `duration-150` (largura). `WeatherHeaderEffect` respeita `prefers-reduced-motion`.

## 7. Z-index e camadas

`sidebar z-50` · backdrop mobile `z-40` · dropdown da busca/popovers `z-50` · conteúdo do cabeçalho do Início `relative z-10` sobre `WeatherHeaderEffect` (`absolute inset-0`). Não há escala de z-index tokenizada.

## 8. Breakpoints

Padrão do Tailwind v4 (sem override): `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. Hook `useIsMobile`: `< 768`.

## 9. Largura de conteúdo

`PageContainer`: `standard max-w-[1280px]` (Início) · `wide max-w-[1600px]` · `full`.
