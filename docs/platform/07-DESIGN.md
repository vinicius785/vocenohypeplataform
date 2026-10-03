# 07 · Design

O contrato completo é `../design-system/DESIGN-SYSTEM.md` (regras), com decisões em `DECISIONS.md`, evidências em `AUDIT-FINDINGS.md` e a página Início como referência de linguagem em `INICIO-REFERENCE.md`. Aqui está o resumo operacional e **como cada superfície aplica**.

## Princípios
Hierarquia por tipografia e espaço, não por cor. Cor só para ação, seleção e estado. Superfícies planas (sem sombra), densidade alta. Arquitetura de UX vale tanto quanto o visual: página única por contexto, contexto declarado uma vez, **um só mecanismo de filtro**, uma ação primária por contexto, um só fluxo de rolagem, mesma função = mesmo componente.

## Tokens (`src/styles.css`, `src/lib/design-tokens.ts`)
| Grupo | Tokens |
|---|---|
| Superfície | `background`, `card`, `popover`, `muted`; card elevado `surface-card` (= `SURFACE.card`) |
| Texto | `foreground`; secundário `text-secondary` (= `muted-foreground`, alinhados); marca `text-brand` (AA no claro) |
| Marca/ação | `brand`, `brand-hover`, `brand-subtle`, `brand-foreground`, `brand-foreground-secondary`, `brand-border` |
| Estado | `success`, `warning`, `danger`, `info` (+ `-soft`, `-soft-foreground`, `-border`), `destructive` |
| Borda/foco | `border`, `input`, `ring` |
| Raio | controle `rounded-md` · linha/tile `rounded-lg` · card e overlay `rounded-2xl` · pill `rounded-full` |
| Tipografia | pilha do sistema; escala em `TYPOGRAPHY`: pageHeading 24/26 600, section/card 15 600, body 14, metadata 11, label caixa-alta 11, KPI 20/24 600, KPI lead 30/36 700 |
| Espaço | múltiplos de 4px; blocos 24→32, cards 16→24 |
Temas claro e escuro, todos em `oklch`.

## Componentes canônicos
`PageHeader` · `Card/CardHeader` (`ui/card`) · `Kpi` (Strip e Lead) · `FilterToolbar` (busca, Filtros, Ordenar, chips) · `SegmentedControl` · `Tabs` (só em overlay) · `Badge` · `EmptyState` · `Alert` · `Skeleton` · `NativeSelect` · `Table` (scroll horizontal no container) · `Dialog` · `Sheet` (drawer) · `useConfirm`. Vitrine em `/design-system`.

## Arquitetura de página (app interno)
Cabeçalho → contexto global (período, mês) → KPIs (só se decidem algo) → Busca + Filtros → conteúdo. Detalhe: retorno → identidade → KPIs curtos → seções na mesma página com âncora. Shell: sidebar 256/68px, topbar 64px, `main p-4 md:p-8`, `PageContainer` 1280/1600/total.

## Estado da migração
| Item | Situação |
|---|---|
| Título oficial, sem canvas cinza, cards `surface-card`, tokens de texto e marca, tipografia 9/10/13px/bold/light, selects nativos, confirmação via `useConfirm` | **Aplicado na plataforma** (commit `f8679aa`), validado visualmente só em **Clientes** |
| KPI, filtros e estados vazios dos demais módulos; caixas de erro; pills e abas feitas à mão; cores de estado por paleta direta; tabelas cruas; Radix Select (5 arquivos) | Pendente |
| Cores de etapa do pipeline (decisão P4: neutras + semântica real) | Decidido, **não implementado** |
| Alvos de toque de 44px nos filtros | Pendente |
| Validação visual dos demais módulos, especialmente telas densas e escuro | Pendente (precisa de login) |

## Portal do cliente
Mesma base de tokens e a mesma superfície elevada do Início (`SURFACE.raised`, `rounded-2xl`), com decisões próprias:
- **Linguagem sem alarme**: o teste `no-risk-language` garante que os derivadores do portal V2 (atenção, resumo de campanhas, atividade) não vazem rótulos internos de risco ou atraso ("em risco", "atrasado", "crítico"…); status do cliente usa rótulos neutros em `client-status`.
- **Foco em decisão**: a Início do portal destaca "o que espera você" (`ClientAttentionList`), progresso das campanhas e atividade.
- **Formatadores próprios** em `features/client-portal-v2/lib` (`metric-format`, `competencia`, `ajuste-format`, `client-file-format`) para nunca expor dado cru.
- Layout `PortalV2Shell` (sidebar Início/Campanhas/Relatórios/Arquivos, perfil, tema) e **NPS como porta**: bloqueia a navegação até responder.
- Portal por token usa componentes próprios (`components/portal/*`) e `portal-i18n`; ainda não passou pela migração de cards/tipografia — **a verificar**.

## Páginas públicas e e-mail
Inscrição, NPS do influenciador, bugs, proposta e descadastro são páginas **fora do shell**, centradas, com logo/nome do workspace (`workspace-store`) e `noindex`. A inscrição tem página de edição por campanha (`InscricaoPageDialog`) com pré-visualização. E-mails usam `email-template` + templates editáveis (`email_templates`).

## Acessibilidade e responsividade (regras do contrato)
Foco visível; botão só de ícone com nome acessível; linha clicável com `role="button"`; contraste ≥ 4.5:1 nos dois temas; `prefers-reduced-motion`; mobile-first, sidebar vira drawer abaixo de `md`; a página nunca rola na horizontal (só tabelas, dentro do container).
