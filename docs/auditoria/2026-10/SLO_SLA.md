# SLA, SLO e indicadores operacionais — auditoria 2026-10

**Regra desta seção:** nenhum número abaixo é um compromisso. Metas são **propostas** para decisão humana. Onde não há medição, está escrito "não medido".

## 1. Separação obrigatória

| Categoria                                    | Conteúdo hoje                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. SLA contratual existente**              | **Nenhum encontrado** em `docs/`, `CLAUDE.md`, código ou no template de contrato de influenciador (`docs/modules/contrato-influenciador-dicionario.md`). Contratos/propostas com clientes não estão no repositório: **não verificável** — pedir ao responsável comercial/jurídico. |
| **2. SLO interno recomendado**               | Seção 3 (propostas, sujeitas a aprovação).                                                                                                                                                                                                                                         |
| **3. Métrica atualmente observável**         | Seção 2 (o que já existe como dado, mesmo sem painel).                                                                                                                                                                                                                             |
| **4. Meta dependente de decisão de negócio** | Seção 5.                                                                                                                                                                                                                                                                           |

Há três conceitos de "SLA" **de domínio** no produto (não são SLAs da plataforma): dias de espera de aprovação do cliente (`influencer-model.ts:493`, "Enviado ao cliente há mais dias que o SLA"), horário útil 09–19 BRT para tempo de resposta (`agency-hours.ts`, `business_seconds_between`) e prazo vigente de tarefa (19h). Não devem ser confundidos com disponibilidade.

## 2. O que é observável hoje (sem painel dedicado)

| Fonte                                                          | O que dá para medir                                                      | Limite                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Logs da Vercel (`console.error/warn`, 87 chamadas no servidor) | erros de server functions/rotas, falhas de rate limit, falha de webhook  | sem agregação, retenção e alerta próprios; formato livre |
| `rate_limit_events`                                            | volume de tentativas por balde (login, recuperação, convites, MFA, demo) | só os baldes existentes; sem painel                      |
| `access_audit_log`, `settings_audit_log`                       | ações de acesso/administração                                            | sem sucesso/latência                                     |
| `contratos_influenciador_eventos`                              | evento recebido, `processado_at`, `erro` por webhook do Autentique       | apenas o Autentique                                      |
| `meta_deletion_requests`                                       | `created_at` → `completed_at` por pedido da Meta                         | apenas exclusão                                          |
| `email_sends` + eventos Resend                                 | entrega/abertura/clique/bounce                                           | sem taxa de falha do cron                                |
| `platform_releases`, `version.json`                            | frequência e versões publicadas                                          | sem taxa de falha de deploy                              |
| Supabase/Vercel dashboards                                     | disponibilidade e uso da infraestrutura                                  | **não verificáveis** daqui; plano define o que existe    |
| Medição de desempenho de usuário real (Web Vitals/RUM)         | **inexistente**                                                          | —                                                        |

## 3. SLOs internos recomendados (proposta)

Janela padrão: 30 dias corridos. Exclusões: manutenção anunciada com antecedência e indisponibilidade comprovada de provedor (Supabase/Vercel) **somente** para o SLO de "causa própria", nunca para o de disponibilidade percebida. Responsável sugerido = função, não pessoa (ver `OPERACAO_E_CONTINUIDADE.md`).

| #   | Indicador                             | Definição e fórmula                                                                                                                                 | Escopo / fonte                                             | Meta proposta e justificativa                                                        | Estado atual                                                    |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| S1  | **Disponibilidade da plataforma**     | `1 − (min com falha de login+carga inicial) / min totais`, via sonda sintética a cada minuto em `/` e em uma server function de leitura autenticada | app web (Vercel+Supabase)                                  | 99,5% (≈ 3 h 36 min/mês): equipe pequena, sem plantão; subir após 3 meses de medição | **não medido**                                                  |
| S2  | **Latência de carga inicial**         | p75 do tempo "login → home utilizável" (Web Vitals + evento próprio)                                                                                | navegador                                                  | p75 ≤ 4 s em 4G rápido; hoje há 15 tabelas lidas por inteiro, entrada 136 KB gzip    | **não medido**                                                  |
| S3  | **Taxa de erro de server functions**  | `respostas 5xx / total` por função, por dia                                                                                                         | logs Vercel                                                | ≤ 1% por dia; ≤ 0,1% para funções de escrita                                         | **parcialmente observável** (logs sem agregação)                |
| S4  | **Sucesso de webhooks de entrada**    | `eventos com processado_at ≠ null / eventos recebidos` em 15 min                                                                                    | Autentique, Resend, leads, Meta                            | ≥ 99% em 15 min; falha deve acionar alerta                                           | **parcial** (Autentique e Meta têm tabelas; Resend e leads não) |
| S5  | **Atraso de jobs/cron**               | `agora − última execução bem-sucedida` por cron                                                                                                     | `email-flows`, `google-calendar-sync`, `instagram-refresh` | ≤ 26 h para crons diários; ≤ 15 min para o ciclo do Google se o cron externo existir | **não medido** (sem registro de execução)                       |
| S6  | **Integridade de operações críticas** | contagem de (a) edições perdidas por conflito, (b) contratos órfãos (linha sem `external_id` > 1 h), (c) pedidos de exclusão `failed` > 24 h        | banco                                                      | zero; qualquer ocorrência abre incidente                                             | **não medido** (INT-01 sem detecção)                            |
| S7  | **Detecção de incidentes (MTTD)**     | tempo entre início da falha e ciência da equipe                                                                                                     | alerta/sonda                                               | ≤ 10 min em horário comercial                                                        | hoje depende de aviso humano                                    |
| S8  | **Recuperação de aplicação (MTTR)**   | tempo até rollback/mitigação                                                                                                                        | deploy                                                     | ≤ 30 min (rollback pela Vercel)                                                      | não praticado/documentado                                       |
| S9  | **Recuperação de dados (RPO/RTO)**    | perda máxima aceitável / tempo de restauração                                                                                                       | banco e storage                                            | **decisão de negócio** (ver seção 5)                                                 | **desconhecido**                                                |
| S10 | **Resposta a titulares**              | dias entre pedido de exclusão/acesso e conclusão                                                                                                    | `meta_deletion_requests` + e-mail de privacidade           | prazo legal (LGPD); alvo interno a definir                                           | só Meta é rastreada                                             |

### Orçamento de erro e revisão

Recomendado **depois** de S1/S3 serem medidos por 30 dias: orçamento = `1 − SLO` (0,5% ≈ 3 h 36 min/mês). Se consumido antes do fim da janela, congelar mudanças não essenciais e priorizar confiabilidade. Revisão mensal curta (30 min): consumo do orçamento, incidentes, ações. Hoje, sem medição, **não há base para orçamento**.

## 4. Pré-requisitos mínimos de medição (para S1–S5)

1. Sonda externa gratuita/barata (HTTP) em `/` e em um endpoint de saúde que valide Supabase.
2. Agregador de logs ou alertas por e-mail da Vercel/Supabase para 5xx e falha de cron.
3. Tabela `job_runs` (ou log estruturado) por cron/webhook com início, fim e resultado.
4. Web Vitals enviados a um destino (sem dados pessoais).

## 5. Decisões de negócio pendentes

- Existe compromisso de disponibilidade com clientes? Qual?
- Horário de atendimento de incidentes e quem é o responsável (função).
- RPO/RTO aceitáveis por tipo de dado (financeiro, contratos, mensagens, anexos).
- Retenção de logs e eventos (hoje não definida).
- Prazo interno de resposta a titulares.
- Se haverá orçamento de erro formal e quem preside a revisão.
