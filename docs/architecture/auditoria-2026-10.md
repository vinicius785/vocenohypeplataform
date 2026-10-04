# Auditoria técnica — 2026-10-03

Mapear → auditar → classificar → priorizar → implementar → validar. Nada foi reescrito "por sensação": cada mudança abaixo tem uma medição ou evidência de código. O que **não** foi possível verificar está dito na seção 12.

## 1. Método e limites
- **Medido no build**: tamanho de chunks e fechamento de imports estáticos (`performance/README.md`).
- **Análise estática**: grafo de imports (arquivos não alcançáveis, ciclos), migrations em ordem (policies efetivas, índices, funções `SECURITY DEFINER`), varredura de server functions, `bun audit`.
- **Validação**: `tsc`, ESLint (0 erros), 808 testes, build — rodados depois de cada bloco.
- **Não feito**: nenhuma consulta ao banco vivo, nenhum teste em produção/logado, nenhum teste de carga. Portanto RLS e índices são **achados estáticos** a confirmar (ver 12).

## 2. Inventário e classificação
| Camada | Arquivos | Linhas | Papel |
|---|---|---|---|
| `src/components` | 358 (50 pastas) | ~99.500 | UI dos módulos + shell + `ui/` (shadcn) + `shared/` (canônicos) |
| `src/lib` | 202 | ~39.700 | regra de negócio, stores, engines puros, 34 arquivos `*.functions.ts` (161 server functions) |
| `src/routes` | 74 | ~9.200 | rotas (app, portal V2, portal por token, páginas públicas, `/api/*`) |
| `src/features/client-portal-v2` | 83 | ~9.300 | portal do cliente |
| Banco | 140 migrations · 103 tabelas (live, `types.ts`) · 37 funções `SECURITY DEFINER` | | Supabase |
| Testes | 65 arquivos · 808 testes | | engines, regras puras, parte da UI |
| Dependências | 54 runtime · 19 dev | | |

Classificação (por inspeção do código, não por nome):
- **CORE**: `AppShell`, `_authenticated/route`, stores (`*-store.ts`, `table-array-store`, `shared-sync`), `integrations/supabase`, `permissions`, `user-environment`.
- **MÓDULOS**: Início, Clientes, Campanhas, Projetos/Tarefas, Reuniões, Comercial, Financeiro, Time, Influenciadores, Metas, Chat, Marketing, Configurações, Problemas.
- **INFRAESTRUTURA**: `*.functions.ts`, `*.server.ts`, `routes/api/*`, crons, webhooks, e-mail (Resend), push, Google Calendar, rate limit, audit log.
- **COMPARTILHADO**: `ui/*`, `shared/*` (PageHeader, Kpi, FilterToolbar, EmptyState, SectionCard…), `design-tokens`, `use-confirm`.
- **LEGADO (ainda ligado)**: Chat V1 (`ChatSection`) ao lado do V2; portal por token ao lado do V2; `/portal-app/*` (só redirects); `/foco`, `/time-v2`, `/banco-influenciadores-v2` (redirects).
- **EXPERIMENTAL**: `/design-system`, `/design-system-finance-concept` (vitrine interna).
- **CÓDIGO MORTO / DUPLICADO**: ver seção 7.

## 3. Documentação
Antes: 26 arquivos Markdown espalhados (relatórios soltos, pasta `platform/` que duplicava o Design System, comandos repetidos). Depois: estrutura por assunto, índice único (`docs/README.md`), ADRs.

| Documento | Decisão | O que foi feito |
|---|---|---|
| `CLAUDE.md` | ATUALIZAR | Ponteiros e regras de camada; bullets obsoletos corrigidos |
| `AGENTS.md` | MANTER | — |
| `.lovable/plan.md` | MANTER (gerenciado pelo Lovable) | Registrado no índice como histórico, não movido |
| `docs/security-audit-report.md`, `security-remediation-plan.md` | MANTER (histórico) | Movidos para `security/` com data no nome |
| `docs/codebase-optimization-report.md` | ARQUIVAR | Movido para `performance/` com data no nome |
| `docs/design-system/*` (+`technical/`) | MANTER | Imagens de validação reunidas em `validation/` |
| `docs/platform/01…06,08` | MANTER | Movidos para `architecture/`; `04` virou `modules/README.md` |
| `docs/platform/02` (comandos, env, deploy, convenções) | CONSOLIDAR | Extraído para `development/guia.md` |
| `docs/platform/07-DESIGN.md` | CONSOLIDAR → REMOVER | Duplicava o contrato; parte única foi para `design-system/APLICACAO-E-MIGRACAO.md` |
| `docs/platform/README.md` | REMOVER | Substituído por `docs/README.md` |
| `src/routes/README.md` | MANTER | Convenção de rotas, junto do código |
| **Novos** | | `docs/README.md`, `development/guia.md`, `security/README.md`, `security/rls-internal-only.md`, `performance/README.md`, `decisions/0001–0003`, esta auditoria |

## 4. Design System
Fonte de verdade: [`../design-system/DESIGN-SYSTEM.md`](../design-system/DESIGN-SYSTEM.md). Estado atual medido no código:

| Divergência | Antes desta rodada | Agora |
|---|---|---|
| `text-[9px]`, `text-[10px]`, `text-[13px]` | ~105 arquivos | 0 |
| `font-bold`/`font-light` | 37 arquivos | 10 usos (KPI lead e casos documentados) |
| `window.confirm` | 5 | 2 (fluxos síncronos) |
| `<select>` nativo com estilo próprio | ~111 | 1 (interno do `date-field`); resto em `NativeSelect` |
| Card sem borda sobre canvas cinza (`PageCanvas`) | 9 módulos | 0 |
| Resumos de KPI como sistemas visuais separados | 7+ componentes | `Kpi` canônico (`SummaryStat`/`PageSummaryPanel` removidos) |
| Paleta direta de cor (`amber-500`, `emerald-500`…) | — | **~690 usos em ~80 arquivos** (maior dívida restante) |
| `<table>` cru | 11 | 11 |
| Radix `Select` | 5 arquivos | 5 |

Consistência sem homogeneização: cada módulo mantém sua arquitetura funcional (Kanban do Comercial, workspace de tarefas, chat…), compartilhando shell, cabeçalho, tipografia, KPI, filtros e estados.

## 5. Performance (frontend e dados)
Ver [`../performance/README.md`](../performance/README.md). Resumo medido: carga inicial comum **−47% gzip**; landing do app **−41% gzip**; o gargalo era uma dependência `lib → componente` que arrastava 7.100 linhas de UI e o recharts para o bundle inicial.

Dados: 16 stores baixam tabelas inteiras antes de qualquer tela (P1, não alterado — contrato síncrono `get()` exige auditar consumidores); ~26 canais realtime; polling de 15–60 s em 8 pontos, parte redundante com realtime; 53 `select("*")`. Chat bem indexado (`convo_id, created_at`; GIN em menções). Sem N+1 óbvio nas server functions auditadas.

## 6. Banco de dados
- **Schema vivo × migrations**: `types.ts` (103 tabelas) bate com as migrations menos 6 tabelas removidas depois — sem drift.
- **RLS**: todas as tabelas têm RLS; 10 sem policy (só service-role) por desenho; **achado P1**: policies `authenticated USING (true)` e storage por `bucket_id` expõem dado interno a contas de cliente → migration proposta, **não aplicada**.
- **Funções**: 37 `SECURITY DEFINER`; 1 sem `search_path` fixo (`enforce_cliente_archive_admin_only`) → corrigida na migration pendente. RPCs expostas ao cliente conferidas (guardas por `auth.uid()`/`is_internal_team_member`).
- **Índices**: `organization_members` só tem `UNIQUE(organization_id, user_id)` e é consultada por `user_id` dentro das policies (`is_internal_team_member`) → índice parcial na migration. A lista automática de "FK sem índice" (60 colunas) é **majoritariamente colunas de auditoria** (`updated_by`) e tem falsos positivos de parser; não foi tratada.
- **Regra**: nada destrutivo; migration idempotente com rollback documentado.

## 7. Código morto e duplicação
Grafo de imports (733 arquivos): só 6 não alcançáveis a partir das rotas.

| Item | Classe | Ação |
|---|---|---|
| `src/lib/portal-auth.functions 2.ts` (cópia antiga, menos segura) | SEGURO REMOVER | **Removido** |
| `components/financeiro/CobrancaDialog.tsx` (sem importadores desde a simplificação do Financeiro) | SEGURO REMOVER | **Removido** (histórico no git) |
| `requestPasswordReset` (endpoint legado sem sessão) | SEGURO REMOVER | **Removido** |
| `lib/access-guards.server.ts`, `lib/hypito-permissions.server.ts` | REVISAR | Mantidos (infra de autorização nunca ligada) |
| `lib/games/zip/fixture.ts`, `lib/semver.ts` | NÃO REMOVER | Usados por testes |
| 10 funções `*Session` do portal V2 sem chamadores | REVISAR | Mantidas; decisão de produto |
| ~63 exports com uma única ocorrência | REVISAR | Lista por varredura; não removidos sem confirmar referências dinâmicas |
| Duplicações de UI (SummaryStat/PageSummaryPanel/PipelineSummary, 5 barras de filtro, 49 selects) | CONSOLIDADO | `Kpi`, `FilterToolbar`, `NativeSelect` |

## 8. Arquitetura
- **Camadas**: `lib` importava componentes (20+ módulos, 5 ciclos). Tratado o pior caso (modelo de influenciadores e pessoas/motivos de tarefa → ADR 0001). Restam 19 imports `lib → components` (14 `import type`; 5 de valor: `campanhaStatus` ×3 e `clienteStatus` de `campanha-ui`/`cliente-ui`, e os tipos de `marketing-tasks`).
- **Ciclos restantes** (3, de 2 arquivos cada): `TaskBoard` ↔ `TaskActivityPanel` (mesmo workspace), `PendingNpsGate` ↔ `PortalV2Shell`, `routeTree.gen` ↔ `router` (gerado). Eram 5 (incluíam `InfluencerBoard`↔`chat-store`↔`permissions`↔`projetos` e `InicioDashboard`↔cartões, resolvidos).
- **Arquivos gigantes**: `InfluencerBoard` ~6.000, `TaskBoard` ~5.400, `ChatSection` ~2.800, `AppShell` ~2.250, `portal-widgets` ~2.100.
- **UI → banco**: 2 chamadas `supabase.from` diretas em componentes (resto passa por stores/server functions): aceitável.

## 9. UX e complexidade estrutural
Mapeadas e **parcialmente** tratadas: filtro-dentro-de-filtro (Financeiro, Comercial, Problemas → padrão único), controles de período como "coleção de filtros" (→ unidade de contexto), drawers sobrecarregados (Comercial reorganizado). Pendentes: abas aninhadas em Projeto → E-mails → campanha; inscrição de campanha (overlay com 3 abas e preview); `TaskBoard` (workspace com muitas camadas); Chat V1+V2 simultâneos.

## 10. Padrão entre módulos
Todos compartilham shell, `PageHeader`, tipografia oficial, `surface-card`, KPI e filtros canônicos. Diferenças legítimas por função preservadas (Kanban, workspace de tarefa, chat, calendário). Validação visual logada ainda pendente (ver 12).

## 11. Observabilidade
Existe: captura de erros do host (Lovable) + `error-capture`/`error-page`, 113 `console.error/warn`, `access_audit_log` e `settings_audit_log`, Central de Problemas (reports com diagnóstico), `platform_releases`. Não existe: log estruturado nem alerta de falha de **cron/webhook/e-mail** (só `console`). Recomendação sem ferramenta nova: registrar o resultado de cada execução de cron e de cada falha de webhook em tabela própria e expor na Central de Problemas (P3).

## 12. Riscos restantes e o que não foi verificado
1. **RLS pendente** (P1): confirmar no banco vivo e aplicar `20261004000000` — [`rls-internal-only.md`](../security/rls-internal-only.md).
2. **Stores por inteiro no startup** (P1): precisa de dado real de volume para decidir a divisão.
3. **Lazy-load** de `TaskDialog` e jogos validado por build e testes, **não** no navegador logado.
4. **Rate limit** de login consultivo e escrita pública por token sem limite (P2).
5. Validação visual logada dos módulos migrados (claro/escuro, mobile, telas densas).
6. **Regra aparentemente estranha, só documentada**: o `rate limit` de login é chamado pelo cliente antes do `signInWithPassword` (consultivo); `shared_state` permite `UPDATE` de qualquer linha a qualquer autenticado (tratado na migration, não no código); funções `*Session` do portal V2 sem tela. Nenhuma foi "corrigida" por conta própria.
7. Um teste (`projeto-ui.test.ts`) dependia do dia UTC e falhava entre 21h e 00h (BRT); corrigido o **teste** (o código do app já usa Brasília). Nenhuma regra de negócio alterada.

## 13. Matriz de prioridades
| # | Problema | Área | Impacto | Risco | Esforço | Prio | Solução | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Policies/storage abertos a contas de cliente (relatórios de outros clientes, precificação, estado compartilhado) | Segurança | Alto (vazamento entre clientes) | Médio (testar com dados reais) | Baixo | **P1** | Migration `20261004000000` | **Pronta, pendente de aplicar** |
| 2 | 16 stores baixam tudo antes de qualquer tela | Performance/escala | Alto com crescimento | Alto (contrato síncrono) | Alto | **P1** | Init lazy por módulo | Documentado |
| 3 | UI de 7.100 linhas + recharts no bundle inicial | Performance | Alto | Baixo | Médio | P1 | Extrair modelo para `lib/` | **Feito** (−47% gz comum) |
| 4 | Workspace de tarefas (600 KB) no shell | Performance | Alto | Baixo | Médio | P1 | `TaskDialog` lazy + `task-people` | **Feito** |
| 5 | Endpoint legado sem sessão (`requestPasswordReset`) | Segurança | Médio (spam a admins) | Baixo | Baixo | P2 | Remover | **Feito** |
| 6 | `logLoginFailure` sem teto | Segurança | Médio | Baixo | Baixo | P2 | Rate limit | **Feito** |
| 7 | Erros de banco crus em endpoints públicos (18) | Segurança | Médio | Baixo | Baixo | P2 | `throwSafeDbError` | **Feito** |
| 8 | Rate limit de login consultivo; escrita pública sem limite | Segurança | Médio | Médio | Médio | P2 | Limites no servidor por token/IP | Documentado |
| 9 | Cores por paleta direta (~690 usos) | Design System | Médio (inconsistência) | Baixo | Alto | P2 | Mapear status → tokens | Documentado |
| 10 | Arquivos gigantes e `lib → components` residual | Arquitetura | Médio | Médio | Alto | P2 | Dividir por responsabilidade; mover tipos | Parcial (ADR 0001) |
| 11 | Índice em `organization_members(user_id)` | Banco | Baixo hoje, cresce | Baixo | Baixo | P2 | Índice parcial | Na migration pendente |
| 12 | Auth: init sequencial (3 idas) | Performance | Baixo-médio | Baixo | Baixo | P2 | `Promise.all` preservando a ordem de decisão | **Feito** |
| 13 | Teste dependente de fuso (falhava 21h–00h) | Dívida técnica | Baixo | Nulo | Baixo | P2 | Usar `todayIsoInBrasilia` | **Feito** |
| 14 | `vitest`/ESLint rodavam em worktrees antigos | Dívida técnica | Médio (lint/test quebrados) | Nulo | Baixo | P2 | Excluir `.claude` | **Feito** |
| 15 | Dependências com advisory (dompurify) | Segurança | Baixo | Baixo | Baixo | P3 | `bun update dompurify` | **Feito**; demais são só de build |
| 16 | 10 funções `*Session` sem chamador; guardas nunca ligados | Dívida técnica | Baixo | Baixo | Baixo | P3 | Decisão de produto | Documentado |
| 17 | Polling redundante com realtime | Performance | Baixo | Baixo | Médio | P3 | Consolidar | Documentado |
| 18 | Sem log de falha de cron/webhook | Observabilidade | Baixo | Baixo | Médio | P3 | Tabela de execuções | Documentado |
| 19 | 11 `<table>` cruas, 5 Radix Select, 2 `window.confirm` | Design System | Baixo | Baixo | Médio | P3 | Migrar | Documentado |
| 20 | `target="_blank"` sem `rel` | Segurança | Nulo | Nulo | — | — | Verificado por parser JSX: todas as tags têm `rel` | **Falso positivo** |

## 14. Resumo
**Segurança** — encontrados: exposição de dado interno e de outros clientes por RLS/storage abertos a contas de cliente; endpoint sem sessão legado; log de auditoria inundável; erros de banco vazando; advisory em dompurify. Corrigidos no código: endpoint legado, rate limit, erros, dompurify. **Restante**: aplicar a migration (pendente de conferência no banco vivo), rate limits do servidor para escrita pública.

**Performance** — gargalo: dependência `lib → UI` e workspace de tarefas no shell. Medido: carga inicial comum −49% bruto / −47% gzip; landing do app −43% / −41%. Pendente: stores completas no startup.

**Arquitetura** — camada `lib → components` corrigida nos casos de maior custo; ADR 0001; ciclos 5 → 3 (um gerado); arquivos gigantes documentados.

**Design System** — 9/10/13px, selects, canvas, confirmações, KPI e filtros consolidados; paleta direta, tabelas cruas e Radix Select pendentes.

**Documentação** — 26 arquivos reorganizados em 7 áreas, 1 índice, 3 ADRs, 1 duplicado dissolvido.

**Código** — 3 remoções seguras (arquivo duplicado, diálogo órfão, endpoint legado); 2 extrações de módulo; lint e testes voltaram a rodar por padrão.

**Banco/Supabase** — 1 migration (policies, storage, `search_path`, índice) com rollback e consultas de verificação; sem mudança destrutiva; nada aplicado.

## 15. Próximos passos que valem a pena
1. Conferir e aplicar a migration de RLS (P1).
2. Validar visualmente os módulos logado e o diálogo de tarefa/jogos.
3. Decidir a carga lazy das stores com volume real de dados (P1).
4. Mapear status → tokens e eliminar a paleta direta (P2).
5. Rate limit de escrita pública no servidor (P2).
