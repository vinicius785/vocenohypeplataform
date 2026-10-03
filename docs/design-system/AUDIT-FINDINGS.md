# Achados da auditoria (diagnóstico)

> Diagnóstico — **não** é Design System e **não** corrige nada. Cada item remete ao arquivo onde foi observado. Decisões estruturais derivadas estão em [`DECISIONS.md`](./DECISIONS.md).

## 1. Internas do Início

| # | Achado | Evidência |
|---|---|---|
| I1 | Reordenar cards salva `order`, mas o corpo tem ordem fixa; `order` só ordena a lista do menu "Personalizar" | `InicioDashboard.tsx` (uso único de `order` ~l.391) |
| I2 | `HomeHeaderShell` reimplementa a faixa de indicadores com valores diferentes e um `getGreeting` com limites diferentes | `shared/HomeHeaderShell.tsx` × `InicioDashboard.tsx` l.115 |
| I3 | Três receitas de "célula de KPI" (`HeaderIndicatorCell`, `HeaderIndicator` do shell, tiles do card Financeiro) | idem |
| I4 | Cores de status de tarefa vêm da paleta Tailwind direta (sky/amber/orange/emerald), não dos tokens semânticos | `lib/task-status.ts` `TASK_STATUS_TONE` |
| I5 | Anel de foco: `ring-ring` (Início) × `ring-brand` (sidebar/módulos) | `InicioDashboard.tsx` × `AppShell.tsx` |
| I6 | Tokens `SPACING`, `RADIUS`, `MOTION` e a maioria de `TYPOGRAPHY` existem e não são usados pelo Início (só `cardTitle` e `SURFACE.raised`) | `design-tokens.ts` |
| I7 | Ação de cabeçalho de card em `text-muted-foreground`, de rodapé em `text-brand` — intencional, sem componente/token | `CardHeader.action` |
| I8 | `Card`/`CardHeader` (componente-base) vivem dentro de uma página e são importados por `inicio/*` e pelo portal do cliente | `import … from "@/components/InicioDashboard"` |
| I9 | Sem estado de loading/erro por card (só `Suspense` global) | `time.tsx` |
| I10 | Micro-texto recorrente (`text-[10px]`, `text-[9px]`) e zeros em `text-muted-foreground/50` com contraste baixo | contagens em `technical/typography-detail.md` |

## 2. Início × restante da plataforma

| # | Achado | Evidência |
|---|---|---|
| P1 | Título de página: Início = saudação 26px/600; módulos = `pageHeading` 36/42px/700 via `PageHeader`. O token `pageHeading` foi criado a partir dos módulos | `shared/PageHeader.tsx`, `design-tokens.ts` |
| P2 | Fundo de página: Início sobre `bg-background`; 10 telas de módulos sobre `bg-muted` (`PageCanvas`) | `shared/PageContainer.tsx` |
| P3 | Texto secundário: Início `text-muted-foreground` (44 usos); plataforma `text-text-secondary` em 138 arquivos e `text-muted-foreground` em 226 | `styles.css` |
| P4 | Card: Início `rounded-2xl` + `SURFACE.raised`; módulos `rounded-[20/22/24/28px]` + `bg-card` (16/10/20/4 usos); `RADIUS.card` = `rounded-xl` | grep `rounded-[Npx]` |
| P5 | Título de seção dentro de página: `CardHeader` (Início) × `<p>` uppercase `text-xs tracking-widest` (boards) × `text-[15px]` × `text-sm font-semibold` × `TYPOGRAPHY.sectionTitle` | `TaskBoard.tsx`, `InfluencerBoard.tsx`, Metas/Projeto |
| P6 | KPIs: faixa no cabeçalho (Início), `SummaryStat`, `PageSummaryPanel` (card com borda azul), linhas inline (Metas/Financeiro), `PipelineSummary`, `MetricCard` | `shared/*` |
| P7 | Filtros: abas pill no card (Início) × cinco barras próprias de busca + "Filtros" (Clientes, Campanhas, Projetos, Influenciadores, Financeiro) × `FilterToolbar` novo (parcial, não commitado) | `*FiltersBar.tsx` |
| P8 | Foco `ring-ring` × `ring-brand` | ver I5 |
| P9 | Nenhuma fonte web carregada — aparência varia por SO (toda a plataforma) | `styles.css`, `__root.tsx` |
| P10 | O Início não usa `h1–h4`; vários módulos usam. A regra global (`@layer base`, 600) afeta esses módulos, não o Início | `styles.css` |

## 3. Componentes duplicados / sobrepostos

| Função | Implementações encontradas |
|---|---|
| Card | `InicioDashboard.tsx` `Card` · `ui/card.tsx` `Card` (5 variantes, `rounded-xl shadow`) · `bg-card rounded-[…]` inline em módulos · `PortalSectionCard` |
| Cabeçalho de página | `PageHeader` · `SectionHeader` (delega a `PageHeader`) · cabeçalho do Início · `HomeHeaderShell` · blocos de título à mão que restam em telas de detalhe |
| KPI / resumo | `SummaryStat` · `PageSummaryPanel` (+ `SummaryPrimaryMetric`, `SummaryMetric`) · `MetricCard` · `HeaderIndicatorCell` · `HomeHeaderShell.indicators` · `PipelineSummary` |
| Tabs / seleção | `ui/tabs.tsx` · `ui/segmented-control.tsx` · `Tab` pill do Início · abas sublinhadas por módulo · navegação por âncora do Projeto |
| Filtros | 5 `*FiltersBar` + `AdvancedFilterBar` + `FilterToolbar` (novo) |
| Empty state | `shared/EmptyState` · `ChartEmptyState` (financeiro) · `EmptyState` local em `projeto.$id.tsx` · `<p>` soltos |
| Confirmação | `useConfirm` (padrão) · `window.confirm` restantes (3: portal do cliente, `TaskBoard`, `RespostaDrawer`) |
| Saudação | dois `getGreeting` (I2) |

## 4. Tokens não utilizados / subutilizados

`SPACING`, `RADIUS`, `MOTION`, `ELEVATION` (Início não usa); `TYPOGRAPHY.display/pageTitle/body/bodySecondary/label/caption` (Início não usa); `--sidebar-*` (sidebar real usa `bg-background`/`border-border`); `--chart-*` (uso restrito a gráficos).

## 5. Problemas de arquitetura

1. Componentes-base dentro de páginas (I8).
2. Dois sistemas de "tom" de estado: tokens semânticos (`TONE_*`, `Badge`) × paletas Tailwind por módulo (I4).
3. Três escalas de KPI (`text-xl`, `text-[32/36px]`, `text-4xl md:text-5xl`).
4. Duas escalas de título de página (P1) e duas de fundo (P2).
5. Preferência persistida sem efeito visível (I1).

## 6. Evidências da investigação (etapa de fechamento)

**Fonte tipográfica.** Nenhuma fonte carregada: sem dependência de fonte, sem `@font-face`, sem link de fonte no documento raiz; `public/` só tem ícones, logo e sons. `font-mono` em ~9 pontos (código, IDs, campos de e-mail/JSON). Tamanhos mais usados na plataforma: `text-xs` 1545 · `text-sm` 886 · `text-lg` 49 · `text-base` 49 · `text-2xl` 32 · `text-xl` 31 · `text-3xl` 13 · `text-4xl` 6; arbitrários: `[11px]` 578 · `[10px]` 239 · `[9px]` 26 · `[15px]` 24 · `[13px]` 9 · `[28px]` 7. Pesos: `font-medium` 1238 · `font-semibold` 602 · `font-bold` 53 · `font-normal` 28 · `font-light` 10.

**Componentes (arquivos que usam, fora de `ui/` e da página interna do design system).**
SegmentedControl 20 · Tabs 3 (todos em overlay) · select do sistema 5 × `<select>` nativo 50 · `<table>` cru 11 × primitivo de tabela 3 × componente de tabela de dados 0 · Alert 1 · EmptyState 32 · Skeleton 8 (+3 composições) · `animate-pulse` 16 · Loader2 42 · Dialog 43 · Sheet 25 · AlertDialog 7 · Popover 30 · DropdownMenu 36 · PageHeader 11 · SectionHeader 3 · SummaryStat 5 · PageSummaryPanel 3 · MetricCard 1 · Badge 40 · Card do sistema (`ui/card`) 2 × Card do Início 6 · toast 30.

**KPIs hoje:** faixa embutida no cabeçalho (Início), faixa de células (detalhes de campanha/projeto), painel com número principal (listas), linhas inline (Metas, Financeiro), cards de pipeline (Comercial), cards de resultado (AEO), painel de score (Time), cabeçalhos do portal do cliente. O código declara um card de KPI "canônico" que "substitui as 8 implementações" e tem 1 consumidor.

**Cores de estado.** Paleta direta em 82 arquivos (âmbar 245 · esmeralda 171 · rosa 64 · céu 59 · vermelho 38 · laranja 26 · violeta 24 · demais ≤ 9) × tokens semânticos em 64 arquivos. Mapas de tom: tarefa, entrega, perfil, oportunidade, campanha de e-mail, saúde, prazo, score, prioridade. Comercial usa 9 matizes por etapa, deliberadamente.

**Contraste medido** (luminância relativa, WCAG): tema claro — `muted-foreground` 4.77:1 em `background`, 4.35:1 em `muted`; com opacidade 70/60/50% ≈ 2.2/1.9/1.7:1 (uso: `/70` 25×, `/60` 11×, `/50` 7×, `/40` 7×); `text-secondary` 7.56:1 e 6.89:1; `brand` 2.83:1; `brand-hover` 3.60:1; `danger` 3.76:1; `info` 3.68:1; `success` 2.54:1; `warning` 2.15:1; textos `-soft-foreground` 8.6–10.2:1. Tema escuro — `muted-foreground` 6.9–7.6:1; `text-secondary` 7.1–7.8:1; `brand` 6.3–7.0:1; `danger` 6.5:1.

**Sistema de design no código (já existente, usado como fonte).** Tokens de tipografia, espaçamento, raio, elevação, superfície, movimento e tom; página interna de design system com seções (shell, formulários, superfícies, dados, overlays, acessibilidade, responsividade); componentes declarados canônicos: PageHeader, botão de ícone, linha de lista, card de KPI, estado vazio, badge; componente de tabela de dados sem consumidores (estratégia mobile registrada "para confirmação").

**Rolagem aninhada.** 46 arquivos combinam `max-h` com `overflow-y-auto` (popovers, listas internas, drawers); não foi classificado quais são scroll aninhado indevido — é item da auditoria global.
