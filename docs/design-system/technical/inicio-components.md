> **Referência técnica secundária** — dados brutos da engenharia reversa do Início. Não é contrato: o contrato está em `../DESIGN-SYSTEM.md`.

# Componentes do Início

Inventário dos componentes **realmente usados** pela página Início. Localização, responsabilidade, estrutura, variantes, estados, props, tokens e onde podem ser reutilizados.

## A. Componentes definidos no próprio Início (e já reutilizados fora dele)

### `Card` — `src/components/InicioDashboard.tsx`
- **Responsabilidade:** superfície de bloco de conteúdo.
- **Estrutura:** `div` → `overflow-hidden rounded-2xl ${SURFACE.raised} ${className}`.
- **Props:** `children`, `className` (usado para `lg:col-span-2`), `ref`.
- **Variantes/estados:** nenhum (não tem hover próprio; interatividade fica nas linhas internas).
- **Tokens:** `SURFACE.raised` (`border-border/60 bg-card`, escuro `oklch(0.17 0 0)`), raio 2xl.
- **Reuso:** `RemindersCard`, `QuickBreakCard`, `MuralNovidades`, e no portal do cliente (`ClientCampaignProgressList`, `ClientAttentionList`, `ClientActivityList`). Hoje **os outros módulos internos não o usam** (usam `bg-card rounded-[20–24px]` próprios).

### `CardHeader` — `InicioDashboard.tsx`
- **Responsabilidade:** cabeçalho de card, "integrado" (sem `border-b`).
- **Estrutura:** `div.flex.flex-wrap.items-center.justify-between.gap-2.px-4.py-3.5.md:px-5` → [ícone `text-muted-foreground` + `<p className={TYPOGRAPHY.cardTitle}>`] + `action`.
- **Props:** `icon: ReactNode` (sempre `h-4 w-4`), `title: string`, `action?: ReactNode` (aba pill, link "Ver tudo", botão `+`).
- **Comportamento:** `flex-wrap` — a ação quebra para a 2ª linha em telas estreitas.
- **Reuso:** qualquer bloco de resumo/lista.

### `Tab` (pill) — `InicioDashboard.tsx` (não exportado)
- **Estrutura:** `button.rounded-full.px-3.py-1.5.text-xs.font-medium`.
- **Estados:** ativo `bg-brand-subtle text-brand`; inativo `text-muted-foreground hover:bg-muted hover:text-foreground`; foco `ring-2 ring-ring`.
- **Props:** `active`, `children`, `onClick`. **Uso:** só "Meu trabalho" (Hoje/Atrasadas/Semana) — é um **filtro de conteúdo**, não navegação.

### `HeaderIndicatorCell` — `InicioDashboard.tsx` (não exportado)
- **Responsabilidade:** célula de KPI dentro da faixa do cabeçalho.
- **Estrutura:** `button.flex.flex-col.items-center.justify-center.gap-0.5.px-3.py-3.text-center` → número `text-xl font-semibold tabular-nums` (2 dígitos, `padStart`) + rótulo `text-[10px] uppercase tracking-wider text-muted-foreground`.
- **Props:** `label`, `value: number`, `tone: "default" | "danger"`, `active`, `onClick`.
- **Estados:** zero → `text-muted-foreground/50`; `danger` com valor > 0 → `text-danger`; `active` → `bg-brand/10` + número `text-brand`; hover `bg-muted/50`.
- **Comportamento:** cada célula é clicável e **aplica um filtro / rola até o card "Meu trabalho"** (`goToWork`). Divisores vêm do contêiner (`divide-x divide-y divide-border/60`), não da célula.
- **Variante equivalente genérica:** `HomeHeaderShell` (`shared/`) implementa a mesma faixa (`HeaderIndicator`: `label`, `value`, `tone`, `onClick`) — **duplicação** (ver inconsistências).

### `PriorityFlag` — `InicioDashboard.tsx`
Ícone `Flag` `h-3.5 w-3.5` preenchido, cor de `PRIORITY_TONE[priority]` (`task-status.ts`); sem prioridade `text-muted-foreground/40`; `aria-label="Prioridade: …"`. **Não** muda de cor por atraso.

### `MuralNovidades` — `InicioDashboard.tsx`
Card de largura total com o artigo em destaque (capa `sm:w-40 md:w-44 rounded-xl` + categoria `Badge secondary rounded-full uppercase tracking-wide` + título `text-base font-semibold`) e uma lista de artigos anteriores (`divide-y divide-border/70`, miniatura `h-12 w-16 rounded-lg`). Dispensar item: botão `h-7 w-7` com `X`. Abre `ArticleReader` num `Dialog` `max-w-4xl max-h-[85vh]`.

## B. Componentes em `src/components/inicio/`

| Componente | Responsabilidade | Estrutura / padrão |
|---|---|---|
| `ManageCardsMenu` | "Personalizar início": ligar/desligar cards, reordenar, restaurar, ligar clima | Gatilho no cabeçalho; **Popover** no desktop, **Sheet inferior** no mobile (`useIsMobile`); superfície `SURFACE.raised`; linhas `ToggleRow` |
| `RemindersCard` | Lembretes pessoais pendentes | `Card` + `CardHeader` (ação: contador `text-[11px]` + botão `+`); corpo `space-y-1 p-3 md:p-4`; linha `rounded-lg px-2 py-1.5 text-xs hover:bg-muted/40` com checkbox `accent-brand`; ponto `bg-danger` se vencido; rodapé "Ver todos" |
| `ReminderFormDialog` | criar/editar lembrete | `Dialog` |
| `RemindersFullView` | lista completa de lembretes | `Dialog`/painel |
| `QuickBreakCard` | jogos (ZIP, Termo) | `Card` + `CardHeader`; texto auxiliar `text-xs`; grade 2 colunas de mini-tiles `rounded-xl border border-border/60 p-3` com ícone em círculo `h-8 w-8 bg-muted`, nome `text-sm font-semibold`, botão `w-full` |
| `WeatherHeaderEffect` | ambientação do cabeçalho (canvas) | `absolute inset-0`, `pointer-events-none`; respeita `prefers-reduced-motion`; só `condition`/`isDay` |

## C. Componentes compartilhados usados pelo Início

| Componente | Local | Como o Início o usa |
|---|---|---|
| `PageContainer` | `shared/PageContainer.tsx` | `variant="standard"` (`mx-auto w-full max-w-[1280px]`) |
| `EmptyState` | `shared/EmptyState.tsx` | sempre `compact` (`px-4 py-6`; ícone em círculo `h-10 w-10 bg-muted text-muted-foreground`; título `text-sm font-medium`; sem descrição/ações) — props: `icon`, `title`, `description?`, `primaryAction?`, `secondaryAction?`, `compact` |
| `Badge` | `ui/badge.tsx` | `variant="secondary"` para o nome do projeto na linha de tarefa; base `rounded-md border px-2.5 py-0.5 text-xs font-semibold` |
| `IconButton` | `ui/icon-button.tsx` | `X` de dispensar (`h-7 w-7`, `tone` neutral → `ghost`, tooltip obrigatório) |
| `Button` | `ui/button.tsx` | botões `sm` (`h-8 text-xs`) nos mini-tiles de jogo, etc. |
| `AvatarStack` | `meetings/AvatarStack.tsx` | participantes da próxima reunião (`max={3}`, `size="sm"`) |
| `TaskStatusBadge`, `TaskDeadlineBadge` | `tasks/task-ui.tsx` | `size="xs"`; status `px-1.5 py-0.5 text-[10px]` com ícone `h-3 w-3` e `TASK_STATUS_TONE`; prazo `text-[11px] tabular-nums` com ponto `h-1.5 w-1.5` |
| `Dialog` | `ui/dialog.tsx` | leitor de artigo (`max-w-4xl`) |
| `useConfirm` | `hooks/use-confirm.tsx` | confirmar "limpar todos os comentários" |
| `Popover`/`Sheet` | `ui/popover.tsx`, `ui/sheet.tsx` | `ManageCardsMenu` |

**Não existem no Início:** `PageHeader`, `SummaryStat`, `MetricCard`, `PageSummaryPanel`, `SegmentedControl`, `FilterToolbar`, tabelas, `Skeleton`.

## D. Blocos de conteúdo (padrão de cada um)

| Bloco | Problema que resolve | Informação | Ação | Prioridade | Vazio | Com dados | Muitos dados |
|---|---|---|---|---|---|---|---|
| **Header + Resumo** (Hoje/Amanhã/7 dias/Atrasadas) | "Como está meu dia?" | 4 contagens de tarefas por prazo | clicar filtra e rola até Meu trabalho | 1ª (topo, único bloco com identidade/clima) | números `00` em `text-muted-foreground/50` (nunca some) | número `text-xl` ; "Atrasadas" vermelho se > 0 | contagem, sem limite visual |
| **Meu trabalho** | "O que eu faço agora?" | tarefas atribuídas (prioridade, título, status, projeto, prazo) | abrir tarefa (campanha/projeto); filtrar Hoje/Atrasadas/Semana | 2ª; ocupa 2/3 da linha | `EmptyState compact` "Nada por aqui. Bom trabalho." | linhas `divide-y`, seta `ArrowUpRight` no hover, "Sub" para subtarefas | mostra 6; rodapé "Ver todas (N)" expande na página |
| **Agenda** | "O que tenho hoje?" | reuniões do dia | abrir resumo da reunião; "Ver tudo" → Reuniões | 2ª; 1/3 | `EmptyState compact` "Nenhuma reunião hoje." | próxima reunião em destaque (`bg-brand-subtle border-brand/30`, hora em `text-brand`); passadas `opacity-50` | lista simples (sem paginação) |
| **Mural de novidades** | comunicação interna | artigo em destaque + anteriores | ler artigo (Dialog), dispensar | 3ª; largura total | (bloco só existe com itens) | capa + categoria + título | lista `divide-y` |
| **Comentários atribuídos** | "Quem me chamou?" | menções recentes (autor, trecho, tempo) | abrir origem; dispensar; "Limpar todos" (com confirmação) | 4ª; 2/3 | `EmptyState compact` | ponto `bg-brand` = não lido; seta no hover | mostra 3 + "Ver todos (N)" |
| **Lembretes** | lembretes privados | título, vencimento | marcar concluído; criar; "Ver todos" | 4ª; 1/3 | `EmptyState compact` com ação de criar | checkbox + ponto `bg-danger` se vencido | lista curta + "Ver todos" abre vista completa |
| **Pausa rápida** | pausa entre tarefas | 2 jogos | jogar | 5ª; largura total; some se `gamesEnabled` falso | — | 2 mini-tiles | — |
| **Financeiro** (só com permissão) | alerta de vencidos | "Vencido a receber" / "Vencido a pagar" (tiles `bg-muted/40 rounded-lg p-3`, valor `text-lg font-semibold`) | rodapé "Ir para Financeiro" | 6ª | valor R$ 0 | — | — |
| **Comercial** (só com permissão) | leads novos | nome, empresa, valor | rodapé "Ir para Comercial" | 6ª | `EmptyState compact` "Nenhum lead novo no momento." | `ul.divide-y`, linha `px-4 py-2` | lista limitada |

**Padrão comum de um bloco do Início:** `Card` → `CardHeader(icon, title, action?)` → corpo (lista `divide-y` | `EmptyState compact` | grade de tiles) → rodapé-link opcional (`border-t border-border/70`, `text-xs font-medium text-brand`).
