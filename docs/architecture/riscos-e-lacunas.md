# Riscos e lacunas conhecidos

Atualizado em 2026-10-03 (após a auditoria técnica). Detalhes e matriz de prioridades: [`auditoria-2026-10.md`](./auditoria-2026-10.md).

## O que **não** foi verificado
- **Banco vivo**: a análise de RLS/índices é estática (migrations + `types.ts`); nada foi executado contra produção. Consultas de verificação em [`../security/rls-internal-only.md`](../security/rls-internal-only.md).
- **Dados reais**: volume e qualidade dos registros não foram consultados (afeta a decisão sobre carga das stores).
- **Telas autenticadas**: o app exige login; o visual foi validado só em harness isolado, e o comportamento de lazy-load (diálogo de tarefa, jogos) só por build, não no navegador logado.
- **Hypito**: o serviço não está neste repositório; comportamento deduzido de tabelas e permissões.
- **Funções de servidor**: autorização e validação de entrada conferidas por varredura (middleware, zod, rate limit); o corpo de cada uma não foi revisado.
- **Portal por token**: conteúdo de cada tela não lido em detalhe.

## Riscos ativos
| Risco | Efeito | Onde tratar |
|---|---|---|
| RLS aberta a contas de cliente em dados internos e buckets (migration pendente) | Cliente lê dados de outros clientes e da agência pela API direta | `security/rls-internal-only.md` (P1) |
| 16 stores carregadas por inteiro antes de qualquer tela | Carga inicial cresce com os dados | `performance/README.md` (P1) |
| Vínculos em JSONB sem FK (`clientes.data.campanhas`, `*.data`) | Inconsistência silenciosa | triggers existentes + testes; avaliar normalizar |
| Rate limit de login consultivo; escrita pública por token sem rate limit | Abuso com token vazado / força bruta direta no Auth | `security/README.md` (P2) |
| Realtime sem fila | Notificação perdida com aba fechada | push + recarga cobrem parte |
| Sem CI | Regressão chega ao deploy | rodar `typecheck`, `lint`, `test`, `build` antes de cada push |
| Arquivos enormes (`InfluencerBoard` ~6.000, `TaskBoard` ~5.400, `ChatSection` ~2.800, `AppShell` ~2.250) | Difícil manter e testar | dividir por responsabilidade |
| Service-role em server functions | Bypass de RLS se faltar checagem | manter validação de token/`assertAdmin` em toda função nova |
| Webhooks de saída best-effort | Evento perdido sem aviso | log/retry |
| Validação visual logada pendente | Contraste ou separação ruins em telas densas | validar módulo a módulo |

## Pendências conhecidas do produto
- `membros` e `senhas` são permissões **decorativas** (ver `dados-e-acesso.md`).
- `clientes` aceita a permissão `campanhas` por causa do JSONB.
- Chat V1 e V2, e portal V2 + token + legado, convivem.
- Metas: indicadores automáticos (`dataSource: auto`) reservados, sem implementação.
- **10 funções `*Session` do portal V2 sem nenhum chamador** (`reopenCampanhaInfluSession`, `updateInfluBriefingSession`, `updateInfluObservacoesSession`, `updateInfluBriefingAnexoSession`, `submitClientDemandSession`, `submitPortalBugReportSession`, `submitRelatorioNpsSession`, `loadArtigoEngagementSession`, `toggleArtigoLikeSession`, `addArtigoComentarioSession`): o portal V2 hoje só usa aprovar/recusar influenciador, responder entrega, relatórios e NPS; solicitações, bug report e artigos existem só no portal por token. São endpoints autenticados (superfície sem uso) — confirmar com o produto se o V2 deve ganhar essas telas ou se as funções saem.
- `access-guards.server.ts` / `hypito-permissions.server.ts`: guardas de autorização nunca ligados.
- `.claude/scheduled_tasks 2.lock` solto na raiz (sobra de ambiente; não versionado).
