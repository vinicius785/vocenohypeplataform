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

## Score Operacional — fórmula v3 (`OPERATIONAL_SCORE_VERSION = 3`)
| Dimensão | Pontos | O que mede |
|---|---|---|
| Confiabilidade de prazo | 50 | Conclusões no prazo vigente (40) + saúde atual dos prazos (10) |
| Previsibilidade | 25 | Gestão dos prazos: replanejamentos por severidade, repetição, isenções |
| Compromissos | 15 | Presença nas reuniões esperadas |
| Fluxo sem retrabalho | 10 | Entregas aprovadas sem voltar para "Em ajustes" |

Dimensão sem dado sai do cálculo e as demais são escaladas para 100; sem nenhuma dimensão, "sem dados". A confiança da amostra (nº de tarefas) é separada da nota. Quantidade de tarefas nunca soma pontos; comunicação (tempo de resposta) fica fora do score. A taxa de conclusão é só informativa.

### Prazo vigente, atraso e replanejamento
- **PRAZO** responde "entregou dentro do prazo VIGENTE?"; **PREVISIBILIDADE** responde "quão previsível foi a gestão desse prazo?". Nunca o mesmo evento nos dois (sem dupla penalização).
- **Prazo vigente = o último prazo definido** (`effectivePerformanceDueDate`), seja o replanejamento antes ou depois de o anterior expirar. A tarefa não fica presa ao prazo antigo nem acumula "dias de atraso" depois do novo prazo.
- **Replanejar antes de expirar** (qualquer dia anterior, ou no dia até o corte de `deadlineCutoffHour`, padrão 19h): replanejamento sem custo de prazo; no dia, custo leve em Previsibilidade.
- **Replanejar depois de expirado** (`isCriticalReplan` = prazo anterior já expirado): custo pesado em Previsibilidade (4× o do dia) — e só aí. Repetição na mesma tarefa soma. Isenção por motivo externo tira o evento da conta.
- **Vencida sem replanejamento**: atrasada contra o prazo vigente. **Bloqueio**: continua pausando o prazo; dependência externa isenta a penalidade da saúde atual (bloqueio ≠ atraso).
- Previsibilidade: `25 × (no_dia + 4×após_vencimento + 2×repetição) ÷ 7`, cada termo dividido pela base de tarefas do período.
- **Histórico**: eventos do ledger nunca são alterados; ao LER, `reconcileLedgerEvents` (`lib/performance-reconcile.ts`, em `usePerformanceEvents`) recalcula criticidade e resultado das conclusões pelo histórico de prazos da tarefa; tarefas abertas usam `performanceDueDate` reconciliado (`reconcilePerformanceReference`, preserva dias de bloqueio).

### Fluxo sem retrabalho (`lib/approval-flow.ts`)
- **Avaliável**: tarefa (ou subtarefa) que passou por "Em aprovação" e foi resolvida ("Aprovado" ou "Concluído") no período. Sem aprovação, ou ainda não resolvida: fora.
- **Retrabalho**: ao menos uma TRANSIÇÃO REAL para "Em ajustes" entre a primeira aprovação e a resolução (atividade "mudou status para X" da tarefa; texto/comentário nunca conta). Vários ciclos = 1 tarefa com retrabalho; o nº de ciclos é guardado (média só para quem teve ajuste).
- **Atribuição**: responsável principal, ou todos os responsáveis se não houver principal (mesma regra da conclusão).
- **Pontos** = % sem ajustes × 10, com mínimo de 3 tarefas avaliáveis (senão a dimensão fica sem dados). Mede o fluxo de aprovação, não a qualidade de quem entrega.
- Tarefas antigas sem registro de atividade não são avaliáveis. Entregas de influenciador (etapas/feedback do cliente) têm outro motor e não entram aqui.

## Insights por tarefa (`team-insights-tasks.ts`)
Complementam `team-insights-v2.ts` com regras sobre as próprias tarefas (`DashTaskFlat`), sem consulta
nem fonte nova; entram no mesmo ranking (`selectTeamInsights`: 1 insight por pessoa e tema, máx. 12).
"No prazo" usa `classifyOutcome` e o prazo **vigente** (`performanceDueDate ?? dueDate`), então
replanejamento antes de vencer não vira atraso e o prazo original não é referência.

| Regra | Dispara quando | Amostra mínima | Observação |
|---|---|---|---|
| `reincidencia_atraso` | ≥ 4 das últimas 5 conclusões (60 dias) passaram do prazo vigente | 5 conclusões | Compara com as 5 anteriores; se já era igual ou pior antes, não repete o alerta |
| `risco_acumulo` | ≥ 3 vencidas **sem bloqueio** + ≥ 3 prazos nos próximos 3 dias; ou ≥ 3 críticas (Alta/Urgente) próximas com vencida ou ≥ 3 atrasos recentes | — | Bloqueadas ficam fora da conta; quantidade sozinha não alerta |
| `concentracao_criticas` | ≥ 70% das críticas (abertas + concluídas em 30 dias) numa pessoa | 6 críticas, 3 pessoas | Risco operacional, com ressalva de que pode ser a função da pessoa |
| `bloqueios_externos` | ≥ 3 abertas bloqueadas por cliente/fornecedor/aprovação/informação | 3 | Problema de processo, sem pessoa |
| `aprovacoes_acumuladas` | ≥ 6 e ≥ 25% das abertas em "Em aprovação" | 6 | Não há data de entrada em aprovação |

Limiares em `TASK_INSIGHT_THRESHOLDS`. **Sem suporte hoje (dados inexistentes):** retrabalho
reincidente na mesma tarefa e causa por briefing (o histórico de "Em ajustes" só existe agregado),
mudança recorrente de prioridade (sem histórico), prazo incompatível com o histórico (sem
estimativa) e tempo na fila de aprovação (sem data de entrada).

### Calibração dos limiares (estado: PROVISÓRIO)
Nenhum limiar de `TASK_INSIGHT_THRESHOLDS` nem de `TEAM_INSIGHT_THRESHOLDS` foi calibrado com dados
reais. O projeto não tem ambiente de desenvolvimento/teste com dados (há um único Supabase, o de
produção, que não foi consultado para isso), nem seeds ou fixtures. Os valores são heurísticas
iniciais, escolhidas para exigir amostra mínima e evitar alertas por evento isolado; os testes
provam **como** cada regra reage a cenários construídos, não que os cortes sejam os ideais.

Para calibrar depois é preciso, por regra, uma distribuição observada (por pessoa, por mês):
- `reincidencia_atraso`: nº de conclusões por pessoa nos últimos 60 dias (se a maioria tem < 5, a regra quase nunca dispara) e a taxa de atraso típica do time;
- `risco_acumulo`: distribuição de vencidas e de prazos nos próximos 3 dias por pessoa;
- `concentracao_criticas`: nº de tarefas Alta/Urgente por mês e quantas pessoas as recebem (se prioridade alta for o padrão, a regra perde sentido);
- `bloqueios_externos` / `aprovacoes_acumuladas`: contagem semanal de bloqueios por motivo e de tarefas em "Em aprovação".
Ajustar apenas por essa evidência, nunca para "fazer mais insights aparecerem".

### Verificação do tempo útil (SQL)
`business_seconds_between` (versão v2, `20261005110000_business_hours_weekends_holidays.sql`: 09:00–19:00,
`America/Sao_Paulo`, sem fins de semana nem feriados de `agency_holidays`) só pode ser exercitada no
Postgres. O repositório não tem infraestrutura de teste de banco (sem pgTAP, sem Postgres local). O
script `docs/development/business-seconds-verificacao.sql` roda só `SELECT`s com valores esperados
calculados à mão e deve ser executado no SQL Editor; até alguém rodá-lo, a regra está **lida, não
testada**.
