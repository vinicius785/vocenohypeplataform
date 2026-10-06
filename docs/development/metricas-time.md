# Métricas da página Time (definições únicas)

Fuso de **todas** as métricas: America/Sao_Paulo (UTC−03:00). Dia, semana, mês e "mês" são
calculados em Brasília (`todayIsoInBrasilia`); o banco recebe a janela como `…T00:00:00-03:00`
(`isoRangeToTimestamps`).

Identidade da pessoa: id do membro. Tarefas guardam o responsável como **nome**; a ponte nome → id é
`memberIdResolver` (`team-metrics.ts`) e **nomes repetidos não resolvem** (não contam).

## Janelas
| Nome | Definição | Onde |
|---|---|---|
| Janela dos Insights | **este mês**: dia 1 até hoje (inclusive) | `insightWindows().current` |
| Janela anterior | **mesmo trecho do mês passado**: dia 1 até o mesmo dia (limitado ao último dia daquele mês) | `insightWindows().previous` |
| Período do Time / do perfil | seletor da tela (padrão "Mês" = dia 1 até hoje/fim do mês) | `rangeForScorePeriod` / `rangeForProfilePeriod` |

Por que o mesmo trecho e não o mês passado inteiro: comparar um mês parcial com um mês completo
distorce toda contagem (tarefas, replanejamentos). O recorte tem o mesmo tamanho nos dois lados.

Os Insights **sempre** usam a janela dos Insights (e dizem isso no próprio texto). O perfil e a
tabela do Time usam o período selecionado — por isso o perfil mostra a faixa de datas ao lado do
seletor. Os números só são comparáveis quando a janela é a mesma.

## Tempo médio de resposta
- **Definição:** média, em segundos **úteis** (09:00–19:00, sem fins de semana/feriados), entre a
  primeira mensagem de uma demanda e a primeira resposta da pessoa. Demanda = bloco de mensagens
  seguidas de outra pessoa numa DM, ou menção em canal.
- **Ignorado:** mensagens do Hypito/automáticas (`hypito_payload`), menções em canal privado onde a
  pessoa não é membro, demandas ainda sem resposta (contadas à parte).
- **Fonte:** `get_member_response_time` (perfil) e `get_team_response_time` (tabela e Insights — chama
  a primeira por membro; mesmo cálculo). Mapeamento: `member-response-time.ts`.
- É **média**: uma demanda muito longa puxa o valor de janelas longas.

## Tarefas
- **Origens contadas** (Início, Time, Score, menções e diretório): tarefas de projetos, de campanhas, avulsas do Marketing e do **Comercial** (`comercial_tarefas`). Todas são tarefas como as demais; a do Comercial não tem projeto/campanha, tem origem própria `comercial` (cronômetro e eventos de performance; migration `20261007030000`) e abre por deep-link no Comercial (`comercial-task-link.ts`).
- **Abertas:** status em `OPEN_STATUSES`, responsável atual (`openTasksByMemberId`).
- **Atrasadas:** abertas com prazo (de performance) vencido.
- **Novas (criadas na janela):** tarefas **raiz** (subtarefas não contam) cuja `createdAt`, em Brasília,
  está na janela; "recebeu" = responsável **atual**. Tarefa com 2 responsáveis conta 1 no total e 1
  para cada. Sem histórico de atribuição, reatribuições distorcem a parcela de cada pessoa.
  Fonte: `newTaskCounts` (`team-metrics.ts`).
- **Conclusão no prazo / replanejamentos:** `computeAggregateIndicators` sobre os eventos da janela
  (`usePerformanceEvents`); crítico = replanejamento no dia ou após o vencimento.

## Reuniões
`attendance` do Score na janela: esperadas (convidado) × presentes.

## Dependências
Somente relações formais (`task_dependencies`) entre tarefas **abertas**.

## Insights
`team-insights-v2.ts`: regras puras sobre `MemberSignals` (montados por `buildMemberSignals` a partir
do bundle do motor + contagens + resposta). Limiares em `TEAM_INSIGHT_THRESHOLDS`. Cada insight traz a
janela em que o número vale (`window`). Não altera Score nem regras de tarefa.

## Prazo, atraso e replanejamento (Score Operacional)
- **Atraso = descumprir o PRAZO VIGENTE** (corte às `deadlineCutoffHour`, padrão 19h, em Brasília) — não o prazo original.
- **Replanejar antes de o prazo expirar** (qualquer dia anterior, ou no próprio dia até o corte): replanejamento, **não** atraso. O novo prazo passa a ser o vigente. No próprio dia gera só um custo leve em Previsibilidade (`sameDayReplans`).
- **Replanejar depois de expirado**: atraso **e** replanejamento. A referência fica no prazo descumprido e nenhum replanejamento posterior a "descongela" (o atraso não é apagado). Isenção por motivo externo (ou correção de Admin) continua avançando a referência.
- **Vencida sem replanejamento**: atraso. **Bloqueio**: continua pausando o prazo e dependência externa isenta a penalidade da saúde atual (bloqueio ≠ atraso).
- **Fonte única**: `isDeadlineExpiredAt` → `isCriticalReplan`, `classifyReplanTiming`, `effectivePerformanceDueDate` e `reconcilePerformanceReference` (`lib/performance-engine.ts`).
- **Histórico**: eventos do ledger nunca são alterados; ao LER, `reconcileLedgerEvents` (`lib/performance-reconcile.ts`, aplicado em `usePerformanceEvents`) recalcula a criticidade e o resultado das conclusões pelo histórico de prazos da própria tarefa. Tarefas abertas usam `performanceDueDate` gravado reconciliado com o histórico (dias de bloqueio preservados).
- **Taxa de conclusão** (`EntregaResult.completionRate`): só informação; não entra no score.
