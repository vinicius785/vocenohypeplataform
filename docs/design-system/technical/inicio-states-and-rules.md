> **Referência técnica secundária** — dados brutos da engenharia reversa do Início. Não é contrato: o contrato está em `../DESIGN-SYSTEM.md`.

# Estados, responsividade, navegação e regras do Início

Fontes: `InicioDashboard.tsx`, `components/inicio/*`, `shared/EmptyState.tsx`, `ui/button.tsx`, `AppShell.tsx`, `time.tsx`.

## 1. Estados — como o Início comunica estado

| Estado | Como aparece (padrão real) |
|---|---|
| **Normal** | texto `text-foreground` / `text-muted-foreground`, fundo do card `SURFACE.raised` |
| **Hover** (linha clicável) | `hover:bg-muted/40`; título ganha `group-hover:underline`; seta `ArrowUpRight` passa de `opacity-0` a visível (`group-hover:opacity-100`) |
| **Hover** (indicador) | `hover:bg-muted/50` |
| **Hover** (aba pill) | `hover:bg-muted hover:text-foreground` |
| **Hover** (ação de texto) | cabeçalho de card: `text-muted-foreground → text-foreground`; rodapé: `hover:underline` |
| **Ativo/selecionado** | aba: `bg-brand-subtle text-brand`; indicador: `bg-brand/10` + número `text-brand`; próxima reunião: `border-brand/30 bg-brand-subtle` |
| **Foco (teclado)** | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`, nas linhas clicáveis com `ring-inset`; linhas são `role="button" tabIndex={0}` com Enter/Espaço |
| **Desabilitado** | `Button`: `disabled:pointer-events-none disabled:opacity-50`; sidebar sem permissão: `text-muted-foreground/40` + cadeado |
| **Vazio** | `EmptyState compact` (ícone circular + 1 linha `text-sm font-medium`), sem descrição e sem botão na maioria; indicadores zerados continuam visíveis em cinza |
| **Loading** | **Não há skeleton no Início.** Enquanto a seção carrega: `Suspense fallback` do `time.tsx` = `Loader2` `h-5 w-5 animate-spin text-muted-foreground` centralizado (`h-[50vh]`). Dados internos (tarefas, comentários) aparecem quando chegam; não há estado de carregamento por card |
| **Erro** | O Início não tem componente de erro por card. Falhas de rede de clima somem silenciosamente (o bloco do clima não renderiza e o fundo cai em `"unknown"`); mutações de lembrete usam o mecanismo de toast global |
| **Sucesso** | sem banner; atualização otimista + o item some/muda (concluir lembrete); toasts globais fora do Início |
| **Warning/atenção** | ponto `bg-danger` (lembrete vencido); número `text-danger` ("Atrasadas" > 0); `TaskDeadlineBadge` com ponto/texto semântico por estado (`atrasada`, `vence_hoje`…) |
| **Passado** | `opacity-50` (reunião já encerrada) |
| **Não lido** | ponto `h-1.5 w-1.5 rounded-full bg-brand` à esquerda do comentário |

## 2. Responsividade (resumo; detalhes em `inicio-architecture.md`)

- `<768`: sidebar em drawer, grids 1 coluna, indicadores 2×2, `ManageCardsMenu` em Sheet.
- `≥768`: sidebar fixa, indicadores 4 colunas, gutters 24px.
- `≥1024`: layouts 2/3 + 1/3 e 1/2 + 1/2.
- Componentes que somem no mobile: selo de status e chip de projeto nas linhas de tarefa (`hidden sm:inline-flex`).
- Scroll: apenas vertical, no `<main>`; **sem scroll horizontal** nas áreas do Início.

## 3. Navegação ligada ao Início

Estrutura: sidebar global (grupos Geral/Operação/Gestão/Comunicação + rodapé Configurações/Problemas) → item ativo com barra `bg-brand` + `bg-muted`. Sem breadcrumb. Cada bloco do Início navega para o módulo dono do dado ("Ver tudo", "Ir para …", clique na linha).

## 4. Regras reutilizáveis (todas comprovadas pela implementação atual)

> Escritas como "o Início faz X". São regras do **sistema real**, não recomendações.

**Layout e página**
1. Conteúdo de página vive dentro de `PageContainer` (`max-w-[1280px]` no padrão) dentro do `<main p-4 md:p-8>` do `AppShell`; a página não soma padding horizontal.
2. Blocos de primeiro nível separados por `space-y-6 md:space-y-8`.
3. Linhas de cards usam `grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3` (2/3 + 1/3) ou `lg:grid-cols-2`.
4. O Início não usa fundo de canvas: cards `SURFACE.raised` sobre `bg-background`.

**Cabeçalho**
5. O cabeçalho do Início é uma superfície única (`rounded-2xl`) com identidade em cima e uma faixa de KPIs embutida embaixo (`grid-cols-2 md:grid-cols-4`, divisores `border-border/60`).
6. Título do cabeçalho: `text-2xl md:text-[26px] font-semibold tracking-tight`; subtítulo `text-sm text-muted-foreground`.

**Cards**
7. Todo bloco é `Card` (`rounded-2xl SURFACE.raised overflow-hidden`) com `CardHeader` (ícone `h-4 w-4 text-muted-foreground` + `TYPOGRAPHY.cardTitle`), sem `border-b` entre header e corpo.
8. Listas em card usam `divide-y divide-border/70`; linha: `px-4 py-2.5 md:px-5`.
9. Rodapé de card é um link `border-t border-border/70 px-4 py-2.5 text-xs font-medium text-brand hover:underline` ("Ver todas (N)", "Ir para …").
10. Listas longas mostram N itens (6 / 3) e expandem inline; não há paginação nem scroll interno.

**KPIs**
11. KPIs do Início: número `text-xl font-semibold tabular-nums`, rótulo `text-[10px] uppercase tracking-wider text-muted-foreground`, valor 0 em `text-muted-foreground/50`; vermelho só quando `tone="danger"` **e** valor > 0.
12. Só 4 números ganham destaque de KPI; o resto da página usa texto comum.

**Cor**
13. `text-brand` = ação/seleção (links, aba ativa, hora da próxima reunião); `bg-brand-subtle` = fundo de seleção; `text-danger`/`bg-danger` = problema real.
14. Texto secundário e ícones de cabeçalho usam `text-muted-foreground`.
15. Superfícies neutras de interação: `bg-muted/40` (hover/tiles), `bg-muted` (círculos de ícone).

**Controles**
16. Filtros de conteúdo dentro de um card são **abas pill** no `CardHeader.action`, não selects.
17. Botões de ícone usam `IconButton` (`label` obrigatório → tooltip + aria-label); botões de texto pequenos usam `Button size="sm"`.
18. Linhas inteiras clicáveis têm `role="button"`, `tabIndex={0}`, Enter/Espaço e foco `ring-inset`.
19. Estado vazio sempre `EmptyState compact` com frase curta e amigável.

**Permissões**
20. Cards ligados a uma seção com permissão só aparecem se `hasPermission(access, SECTION_PERMISSION[...])`, **revalidado no render** (a preferência salva não basta).
