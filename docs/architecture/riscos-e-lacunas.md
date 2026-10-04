# 08 · Lacunas, pendências e riscos

## O que **não** foi verificado neste levantamento
- **Dados reais**: contagens, volume e qualidade dos registros em produção não foram consultados.
- **Telas em produção**: o app exige login; nenhuma tela autenticada foi aberta. O visual só foi validado em harness isolado (Clientes).
- **Hypito**: o serviço não está neste repositório; seu comportamento é deduzido de tabelas, permissões e `hypito_payload`.
- **Políticas RLS linha a linha**: documentamos o desenho (funções e permissões), não auditamos cada policy. Ver `security-audit-report.md`.
- **Funções de servidor**: listadas por arquivo/nome; o corpo de cada uma não foi revisado.
- **Portal por token**: o conteúdo exato de cada tela não foi lido em detalhe.

## Pendências conhecidas (do projeto)
- `membros` e `senhas` são permissões **decorativas** (ver 03).
- `clientes` aceita permissão `campanhas` por causa do JSONB.
- Segredo do webhook de leads vive em tabela (não em env); `CLAUDE.md` ainda cita `LEADS_WEBHOOK_SECRET` como legado.
- Chat V1 e V2, e portal V2 + token + legado, convivem.
- Metas: indicadores automáticos (`dataSource: auto`) reservados, sem implementação.
- `SummaryStat`, `MetricCard` (só na vitrine) e `PipelineSummary` ainda não convergem para o KPI canônico.
- Arquivos não rastreados soltos no repositório: `.claude/scheduled_tasks 2.lock`, `src/lib/portal-auth.functions 2.ts` (cópia duplicada — deve ser revisada e removida).
- `.claude/worktrees/*` são cópias antigas que quebram o `vitest` padrão; excluir da execução ou apagar.

## Riscos técnicos
| Risco | Efeito | Mitigação sugerida |
|---|---|---|
| Vínculos em JSONB sem FK | Inconsistência silenciosa (campanha órfã, id divergente) | Triggers existentes + testes; considerar normalizar `campanhas` |
| Realtime sem fila | Notificação perdida com aba fechada | Push e recarga já cobrem parte; monitorar |
| Sem CI | Regressão passa até o deploy | Rodar `typecheck`, `lint`, `test`, `build` antes de cada push |
| Arquivos enormes (`CampanhasSection` ~1.700 linhas; `TaskBoard`, `InfluencerBoard` > 4.000) | Difícil manter e testar | Quebrar por responsabilidade |
| Service-role em server functions | Bypass de RLS se faltar checagem | Sweep já feito; manter `assertAdmin`/validação de token em toda função nova |
| Webhooks de saída best-effort | Evento perdido sem aviso | Considerar log/retry |
| Migração visual sem validação autenticada | Contraste ou separação ruins em telas densas | Validar módulo a módulo logado |

## Próximos passos sugeridos
1. Validar visualmente os módulos migrados (claro e escuro, mobile).
2. Converter KPI, filtros e estados vazios restantes ao padrão canônico.
3. Implementar a decisão P4 (pipeline neutro) e P3 (tabelas com scroll no container).
4. Remover `portal-auth.functions 2.ts` e os worktrees antigos.
5. Reconciliar `CLAUDE.md` (variáveis e permissões) com o que está aqui.
