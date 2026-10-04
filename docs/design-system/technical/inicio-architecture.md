> **Referência técnica secundária** — dados brutos da engenharia reversa do Início. Não é contrato: o contrato está em `../DESIGN-SYSTEM.md`.

# Arquitetura da página Início

Fonte: `src/routes/_authenticated/time.tsx`, `src/components/AppShell.tsx`, `src/components/InicioDashboard.tsx`, `src/components/shared/PageContainer.tsx`.

## 1. Hierarquia global

```
APP (rota autenticada /time?section=inicio)
└── AppShell                       div.flex.h-screen.w-full.overflow-hidden.bg-background.text-foreground
    ├── (overlays globais) BomDiaDialog · MeetingReminderToast · ReportProblemSheet · backdrop mobile
    ├── SIDEBAR  <aside>
    ├── COLUNA PRINCIPAL  div.flex.h-screen.min-h-0.min-w-0.flex-1.flex-col.overflow-hidden
    │   ├── TOPBAR  <header>  h-16 · border-b border-border · px-6
    │   └── CONTENT <main>    min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-8      ← único elemento que rola
    │       └── Suspense(fallback=SectionFallback)
    │           └── InicioDashboard
    └── TaskModalStack
```

- A página **não** rola: o `body`/shell são `h-screen overflow-hidden`; só o `<main>` tem `overflow-auto`.
- O `<main>` é a única fonte de padding de página: **`p-4` (16px) e `md:p-8` (32px)**. Nenhum componente de página soma padding horizontal por cima (comentário explícito em `PageContainer.tsx`).

### 1.1 Sidebar (`AppShell.tsx`, linhas ~366–520)

| Aspecto | Valor real |
|---|---|
| Posicionamento | `fixed inset-y-0 left-0 z-50` no mobile; `md:sticky md:top-0 md:z-auto` no desktop |
| Largura | `w-64` (256px); recolhida: `md:w-[68px]`; transição `md:transition-[width] md:duration-150` |
| Visual | `border-r border-border bg-background` (mesmo fundo da página, separada por borda) |
| Mobile | fora da tela por padrão (`-translate-x-full`), abre com `translate-x-0`; backdrop `fixed inset-0 z-40 bg-black/40 md:hidden`; o resto do app recebe `inert` |
| Cabeçalho da sidebar | logo `h-10 w-10 rounded-xl bg-foreground text-background` + nome do workspace `text-sm font-semibold` + `text-xs text-muted-foreground` |
| Navegação | `<nav>` com `overflow-y-auto px-3 pb-4`, grupos com título `text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70` |
| Item ativo | `bg-muted font-medium text-foreground` + barra esquerda `absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand` |
| Item inativo | `text-muted-foreground hover:bg-muted/60 hover:text-foreground` |
| Item desabilitado (sem permissão) | `text-muted-foreground/40`, `cursor-not-allowed`, ícone de cadeado |
| Foco | `focus-visible:ring-2 ring-brand ring-offset-1` |
| Altura do item | `h-9`, `rounded-md`, `px-2.5`, `gap-3`, `text-sm` |

**Agrupamento real da navegação** (constante `groups`):

| Grupo | Itens |
|---|---|
| Geral | Início |
| Operação | Clientes, Campanhas, Projetos, Reuniões |
| Gestão | Comercial, Financeiro, Time, Influenciadores, Metas |
| Comunicação | Chat |

Rodapé da sidebar (fora dos grupos, `border-t border-border`): `SidebarProfile` (só expandida), **Configurações** e **Problemas**.

> Regra comentada no código: *"Sidebar = navegação GLOBAL. Funcionalidades internas de cada módulo … vivem dentro do próprio módulo, nunca como item aqui."*

### 1.2 Topbar (`AppShell.tsx`, linhas ~529–560)

`h-16 border-b border-border px-6 gap-3`, da esquerda para a direita:
1. botão menu (mobile, `md:hidden`) · botão alternar sidebar (desktop, `hidden md:inline-flex`) — ambos `rounded-md p-2 text-muted-foreground hover:bg-muted`
2. `GlobalSearch`
3. `ml-auto`: `ActiveTimerIndicator` · botão de tema · `NotificationsBell`

A topbar **não contém título de página nem breadcrumb**.

## 2. Container do conteúdo

`InicioDashboard` retorna `<PageContainer className="space-y-6 md:space-y-8">`:

- `PageContainer` variante **`standard`** (default) = `mx-auto w-full max-w-[1280px]`
- **espaçamento vertical entre blocos de primeiro nível:** `space-y-6` (24px) → `md:space-y-8` (32px)
- sem fundo próprio: o Início fica sobre o `bg-background` do shell (**não** usa o canvas `bg-muted`).

## 3. Árvore real da página

```
INÍCIO  PageContainer (max-w-[1280px], space-y-6 md:space-y-8)
├── Header (bloco único)                 <header relative overflow-hidden rounded-2xl>
│   ├── [camada] WeatherHeaderEffect     canvas atrás do conteúdo (só se "clima" ligado)
│   ├── Linha 1                          p-5 md:p-7 · sm:min-h-[150px] md:min-h-[170px]
│   │   ├── esquerda: avatar (h-14 w-14 md:h-16 md:w-16 rounded-full) + saudação + data
│   │   └── direita:  clima (ícone + temperatura + condição) + ManageCardsMenu ("Personalizar")
│   └── Faixa de indicadores             grid-cols-2 md:grid-cols-4 · divide-x/y border-border/60 · border-t · bg-background/90
│       └── Hoje · Amanhã · Próximos 7 dias · Atrasadas   (HeaderIndicatorCell)        [visible.stats]
├── Linha operacional principal          grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3     [visible.work || visible.agenda]
│   ├── Card "Meu trabalho"              lg:col-span-2     [visible.work]
│   └── Card "Agenda"                    1 coluna          [visible.agenda]
├── MuralNovidades                        Card de largura total (artigos do Marketing)
├── Linha comentários/lembretes          grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3     [visible.comments || visible.reminders]
│   ├── Card "Comentários atribuídos"    lg:col-span-2
│   └── RemindersCard "Lembretes"        1 coluna
└── Linha financeiro/comercial           grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2     [(financeiro && canFinanceiro) || (comercial && canComercial)]
    ├── Card "Financeiro"                só com permissão `financeiro`
    └── Card "Comercial"                 só com permissão `comercial`
```

Detalhes verificados no código:

- **A ordem do corpo é fixa no JSX.** A preferência `order` (reordenar cards) é salva e lida, mas só é aplicada à lista exibida no menu "Personalizar" (`visibleCardDefs`, linha ~391), **não** à ordem dos blocos no corpo (ver [achados da auditoria](../AUDIT-FINDINGS.md)).
- **Visibilidade** de cada card vem de `dashboardPrefs.visible` (persistida em localStorage `inicio.dashboardPrefs.cache` e no servidor `data.dashboard_prefs`); `financeiro`/`comercial` são **sempre revalidados contra a permissão atual** no render.
- Cards: `stats` (Resumo), `work`, `agenda`, `comments`, `reminders`, `financeiro`, `comercial` (`CARD_DEFS`).

## 4. Grid e gutters

| Nível | Valor |
|---|---|
| Colunas | 1 (mobile) → `lg:grid-cols-3` (linhas operacional e comentários/lembretes: 2/3 + 1/3) → `lg:grid-cols-2` (financeiro/comercial) |
| Gutter entre colunas/linhas de cards | `gap-4` (16px) → `md:gap-6` (24px) |
| Entre blocos de primeiro nível | `space-y-6` → `md:space-y-8` |
| Padding interno típico de card | cabeçalho `px-4 py-3.5 md:px-5`; linhas `px-4 py-2.5 md:px-5`; corpo livre `p-3 md:p-4` |

## 5. Elementos fixos × roláveis

- **Fixos:** sidebar (sticky no desktop), topbar. O cabeçalho do Início **não** é sticky — rola com o conteúdo.
- **Rolável:** `<main>` inteiro.
- **Listas "Meu trabalho"/"Comentários"** não têm scroll interno: mostram os primeiros N itens (`WORK_PAGE_SIZE = 6`, `COMMENTS_PAGE_SIZE = 3`) e um rodapé "Ver todas (N)" que expande **na própria página**.

## 6. Comportamento responsivo (breakpoints do Tailwind: `sm 640 · md 768 · lg 1024 · xl 1280`)

| Largura | Mudança observada |
|---|---|
| `< md` (<768) | sidebar vira drawer (`md:` controla `sticky`/largura); `<main>` com `p-4`; grids em 1 coluna; faixa de indicadores em **2×2** (`grid-cols-2 divide-y`); espaçamento entre blocos 24px; gutter de cards 16px |
| `md` (≥768) | sidebar fixa 256/68px; `<main>` `p-8`; indicadores em 4 colunas sem divisor vertical-entre-linhas (`md:divide-y-0`); gutter 24px; entre blocos 32px; avatar 64px |
| `lg` (≥1024) | linhas viram 2/3 + 1/3 (ou 1/2 + 1/2) |
| Itens da lista "Meu trabalho" | selo de status e chip do projeto somem abaixo de `sm` (`hidden sm:inline-flex`) |
| Cabeçalho | altura mínima 150px (`sm`) / 170px (`md`); colunas esquerda/direita quebram (`flex-wrap`) |
| `useIsMobile` | `< 768px` (hook `use-mobile.ts`), usado, p.ex., para o `ManageCardsMenu` (Popover no desktop, Sheet inferior no mobile) |

## 7. Navegação ligada ao Início

- Chave de seção: `inicio` (valor default de `?section=` em `/time`).
- No Início, **ações de navegação** saem dos blocos: "Ver tudo" (Agenda → Reuniões), "Ir para Financeiro"/"Ir para Comercial" (rodapés), clique numa tarefa abre campanha/projeto, cada indicador do cabeçalho filtra/rola até "Meu trabalho".
- Não há breadcrumb nem abas na página.
