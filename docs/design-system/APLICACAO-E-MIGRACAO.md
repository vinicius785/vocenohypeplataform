# Aplicação do Design System e estado da migração

> Complementa [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) (o contrato). Aqui: **como cada superfície aplica** o contrato e **o que já foi migrado**. Estado em 2026-10-03.

## Componentes canônicos (fonte única)
| Função | Componente | Observação |
|---|---|---|
| Cabeçalho de página | `shared/PageHeader` | Título 24/26 · 600; ação primária à direita |
| Card / seção | `ui/card` (`Card`, `CardHeader`) · `shared/SectionCard` · utilidade CSS `surface-card` | `rounded-2xl`, borda `/60`, sem sombra |
| KPI | `shared/Kpi` (`KpiStrip`/`KpiCell`, `KpiLead*`) | Strip ajusta colunas pela quantidade; valor nunca trunca |
| Busca, filtros, ordenar | `shared/FilterToolbar` (`FilterSearch`, `FilterPopover`, `FilterGroup`, `FilterPill`, `SortMenu`, `FilterChips`) | Aplicação imediata, chips neutros |
| Período (contexto) | `shared/PeriodMenu` (atalhos) · `financeiro/PeriodPicker` (mês + atalhos) | Não é filtro |
| Select | `ui/native-select` (`NativeSelect`) | Decisão P1; Radix `ui/select` em 5 arquivos a migrar |
| Visões / abas | `ui/segmented-control` · `ui/tabs` (só em overlay) | |
| Estados | `shared/EmptyState` · `ui/alert` · `ui/skeleton` | |
| Confirmação | `hooks/use-confirm` | Sem `window.confirm` (2 restantes em fluxos síncronos) |
| Modal / drawer | `ui/dialog` · `ui/sheet` | |

Tokens: `src/styles.css` (oklch, `text-brand`, `muted-foreground` = `text-secondary`, `--card-raised`) e `src/lib/design-tokens.ts` (`TYPOGRAPHY`, `SURFACE`, `RADIUS`, `TONE_*`).

## Estado da migração
| Item | Situação |
|---|---|
| Título oficial, sem canvas cinza, cards `surface-card`, tipografia (9/10/13px, bold/light), selects nativos, confirmações via `useConfirm` | **Aplicado** em todos os módulos |
| KPI canônico (`KpiStrip`/`KpiLead`) | **Aplicado**: Clientes, Campanhas, Projetos, Comercial, Financeiro, Reuniões, Metas, Time, Problemas, NPS, detalhes de campanha/projeto e portal V2 |
| Filtros no padrão (Busca + Filtros + Ordenar + chips) | **Aplicado**: Clientes, Campanhas, Projetos, Influenciadores (banco), Financeiro, Metas, Comercial, Time, Problemas |
| Estados vazios com `EmptyState` | **Aplicado** em Comercial, Metas, Reuniões, Problemas, Time; ~50 `<p>` soltos restantes |
| Topo do Financeiro e controle de período | **Aprovado** (referência de composição) |
| Comercial (conformidade; drawer, proposta, funil, Kanban) | **Aplicado**; pipeline neutro (decisão P4) |
| Cores de estado por paleta direta (`amber-500`…) | **Pendente**: ~690 usos em ~80 arquivos |
| Tabelas cruas `<table>` | **Pendente**: 11 (decisão P3: scroll horizontal no container) |
| Radix Select | **Pendente**: 5 arquivos |
| Portal por token (`components/portal/*`) | **Pendente** de revisão visual |
| Validação visual **logada** dos módulos migrados (claro/escuro, mobile, telas densas) | **Pendente** — só validado em harness isolado |

Evidências de validação (imagens): [`validation/`](./validation/).

## Portal do cliente
Mesma base de tokens e superfície do Início, com decisões próprias:
- **Linguagem sem alarme**: o teste `no-risk-language` garante que os derivadores do portal V2 não vazem rótulos internos de risco/atraso; o status do cliente usa rótulos neutros (`client-status`).
- **Foco em decisão**: Início do portal destaca "o que espera você", progresso e atividade.
- **Formatadores próprios** (`features/client-portal-v2/lib`) para nunca expor dado cru.
- **NPS como porta**: bloqueia a navegação até responder.

## Páginas públicas e e-mail
Inscrição, NPS do influenciador, bugs, proposta e descadastro ficam **fora do shell**, centradas, com logo/nome do workspace e `noindex`. E-mails usam `email-template` + templates editáveis.
