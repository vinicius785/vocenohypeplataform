# Plano de ação priorizado — auditoria 2026-10

Nada deste plano foi implementado. A prioridade combina risco × impacto × dependências × custo, não a contagem de achados. Esforço: **P** ≤ 2 dias, **M** 3–10 dias, **G** > 2 semanas (todos com incerteza declarada). IDs de achados em [`SEGURANCA_E_NFR.md`](./SEGURANCA_E_NFR.md).

## Sequência recomendada (resumo)

1. **P0 — verificar o que não consigo ver** (1–2 dias, sem código): backup/plano, migrations aplicadas, se atributos de permissão podem ser alterados pelo usuário, volume da tabela legada (SEC-05), plano Vercel.
2. **P1 — fechar os dois buracos de autorização do banco** (SEC-01 e SEC-14, depois SEC-02/SEC-03), criar **staging** (OPS-08) e um **ledger de migrations** (OPS-01).
3. **P2 — rede de segurança**: testes de RLS e de conflito (TST-01/INT-01), limitadores públicos, monitoramento mínimo e CI.
4. **P3 — documentação, acessibilidade e refatorações**.

---

## Lote P0 — verificações e contenção imediata (sem alterar código)

**Objetivo.** Transformar riscos "não verificáveis" em fatos antes de gastar esforço de correção.

| #     | Ação                                                                                                                                                                                                                                                                                                                                                                         | Achados               | Evidência esperada                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| P0-1  | No Supabase: plano, retenção de backup, PITR, última restauração                                                                                                                                                                                                                                                                                                             | OPS-02                | captura/texto do painel; decisão de RPO/RTO                                           |
| P0-2  | Restaurar um backup num projeto temporário e conferir contagens e RLS                                                                                                                                                                                                                                                                                                        | OPS-02                | registro com tempo gasto (RTO real)                                                   |
| P0-3  | Conferir as políticas de escrita da tabela de perfis e os privilégios por coluna (consultas no anexo restrito)                                                                                                                                                                                                                                                               | SEC-01                | resultado das consultas                                                               |
| P0-4  | Levantar quais contas têm acesso mais amplo que o pretendido a dados financeiros de influenciadores; listar quantos usuários internos existem e quais são de baixa confiança                                                                                                                                                                                                 | SEC-03, SEC-01        | contagem (sem dados pessoais no relatório)                                            |
| P0-5  | Contar linhas e links ativos da tabela legada (consulta no anexo restrito)                                                                                                                                                                                                                                                                                                   | SEC-05                | contagem                                                                              |
| P0-6  | Comparar migrations do repositório com as aplicadas (`supabase_migrations.schema_migrations`, se existir; senão, verificar presença de tabelas/colunas recentes)                                                                                                                                                                                                             | OPS-01                | lista de divergências                                                                 |
| P0-7  | Confirmar plano da Vercel (indício de Hobby em comentário de código, não verificado) e as variáveis de ambiente de produção (`META_APP_SECRET`, `INSTAGRAM_*`, `AUTENTIQUE_*`, `CRON_SECRET`) e existência/dono do agendador externo                                                                                                                                         | OPS-05                | checklist assinado                                                                    |
| P0-8  | Verificar o estado de "Leaked password protection" (indício vindo de auditoria anterior, não verificado) e, se desligado, ligar; revisar restrição de MIME dos buckets                                                                                                                                                                                                       | SEC-13                | captura                                                                               |
| P0-9  | Confirmar se a conta da `plataforma.vocenohype.com.br` responde HTTP 200 nas URLs legais e de exclusão após o deploy                                                                                                                                                                                                                                                         | FR-LEG-01, FR-META-01 | resultado dos testes                                                                  |
| P0-10 | **Definir onde guardar os detalhes sensíveis da auditoria**: o repositório é **público**; hoje a versão completa está só em pasta local não versionada (sem local restrito comprovadamente adequado). Mover para armazenamento privado e decidir se os documentos de auditoria anteriores já publicados em `docs/security/` e `docs/architecture/` devem permanecer públicos | SEC-01..05, SEC-14    | local escolhido, acesso verificado, autorização para `.git/info/exclude` se aplicável |

**Riscos da mudança.** Nenhum (somente leitura). **Acesso/aprovação.** Admin do Supabase e da Vercel. **Conclusão.** Todos os itens respondidos e anexados a `evidencias/`.

---

## Lote P1 — segurança, integridade e jornadas críticas

**P1-1 · SEC-01 — impedir que o usuário altere atributos que governam as próprias permissões.** (P, incerteza baixa)

- Dependências: P0-3. Risco: quebrar telas que gravam atributos de perfil pelo cliente (mover o que for sensível para server function admin).
- Testes: RLS em staging — usuário comum **não** consegue alterar atributos sensíveis do próprio perfil e continua podendo editar os dados pessoais permitidos (lista exata no anexo restrito).
- Critério: consultas de P0-3 mostram política/gatilho/grant restritivos e o teste passa.

**P1-2 · SEC-14 — autorizar as rotinas de sincronização global de agenda.** (P)

- Exigir autorização por perfil e limitador por usuário nas três rotinas de sincronização global de agenda (nomes no anexo restrito). Teste unitário de autorização e de cliente negado.

**P1-3 · SEC-02 — exigir o segundo fator no servidor e no banco para quem o possui.** (M, incerteza média)

- Verificação no banco e no middleware das server functions (mecanismo detalhado no anexo restrito). Cuidado: contas sem MFA e sessões em curso.
- Teste: sessão sem o segundo fator concluído, de usuário com MFA, é negada em tabela e server function; sessão completa funciona; usuário sem MFA inalterado.

**P1-4 · SEC-03 — proteger dados bancários no servidor.** (M–G)

- Segregar os dados financeiros em estrutura com controle de acesso específico no servidor e migrar dados sem perda. Preservar o contrato de influenciador (snapshot).
- Critério: usuário sem a permissão específica não lê dados financeiros por nenhum caminho; testes e migração verificados em staging.

**P1-5 · SEC-05 — fechar a tabela legada de acesso amplo.** (P)

- Se não há uso, remover o acesso amplo (e a tabela, após backup); se houver, restringir à equipe interna.

**P1-6 · OPS-08 — ambiente de staging.** (M)

- Projeto Supabase separado com restore + máscara de dados pessoais; variáveis por ambiente; scripts de smoke exigem alvo explícito. **Pré-requisito** de P2-1.

**P1-7 · OPS-01 — ledger e ordem de migrations.** (M)

- Ledger (CLI do Supabase ou tabela própria), checagem de versão no deploy e _feature gates_ para recursos que dependem de tabela nova (Instagram, exclusão da Meta, demo, portal onboarding).

**P1-8 · INT-01 — detecção de conflito de escrita.** (M–G, incerteza média)

- Escrita condicional por `updated_at` (ou etag) nas 15 stores; conflito mostra aviso e preserva o trabalho local. Começar por `clientes`, `banco_influenciadores`, `financeiro_lancamentos`.

**P1-9 · OPS-03 — monitoramento mínimo.** (P–M)

- Sonda externa de `/` e de uma função autenticada; e-mail de alerta para 5xx de rotas/crons; registro de execução de cron/webhook (`job_runs`).

Dependências do lote: P0 concluído; staging (P1-6) antes de testar P1-3/P1-4/P1-8. **Riscos gerais:** regressão de permissões — mitigar com suíte de RLS e implantação gradual. **Evidências esperadas:** consultas de catálogo, testes de RLS arquivados, captura dos alertas. **Aprovação:** diretoria (decisões de negócio de `REQUISITOS_E_JORNADAS.md` §2: itens 1–3).

---

## Lote P2 — confiabilidade, desempenho e lacunas de testes

| #     | Ação                                                                                                                                                      | Achados        | Critério de conclusão                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------- |
| P2-1  | Suíte de RLS/integração em staging (contas interna, cliente, sem permissão) executável por um comando                                                     | TST-01         | roda em CI sem tocar produção          |
| P2-2  | CI mínimo: typecheck, lint com _baseline_ (falha em aviso novo), test, build, com proteção de branch                                                      | OPS-04         | PR não mescla sem verde                |
| P2-3  | Rate limit nas 28 funções públicas (por token + por origem quando confiável) e testes de que são chamados                                                 | SEC-06         | testes + limitador comprovado          |
| P2-4  | Idempotência e verificação de tempo (Svix) nos webhooks de leads/Resend; remover consulta pré-autenticação                                                | SEC-09         | testes de reentrega                    |
| P2-5  | Falha de carga inicial das stores vira estado de erro visível com "tentar de novo"                                                                        | INT-02         | teste de falha de rede                 |
| P2-6  | Limitador de login efetivo (no servidor/Auth) + CAPTCHA se necessário                                                                                     | SEC-07         | decisão de produto + teste             |
| P2-7  | Testes de Metas/AEO, de `*.functions.ts` críticos (comercial, cliente-link, proposta, vault, email) e renomear testes cujo nome sugere mais do que cobrem | TST-02, TST-03 | cobertura por módulo registrada        |
| P2-8  | Testes dependentes de fuso passam em qualquer TZ (`TZ` forçado em `vitest.config`)                                                                        | TST-04         | `TZ=Asia/Tokyo` verde                  |
| P2-9  | Medição: Web Vitals, `pg_stat_statements`, duração de server functions; metas S1–S5                                                                       | PERF-01, SLO   | painel com 30 dias de dados            |
| P2-10 | Carga inicial: paginar/segmentar as stores grandes (`reunioes`) e adiar as não essenciais                                                                 | PERF-01        | métrica S2 melhora sobre linha de base |
| P2-11 | Cron/agendador externo documentado, com alarme de atraso                                                                                                  | OPS-05         | alerta dispara em teste                |
| P2-12 | Cabeçalhos: CSP em modo _report-only_, HSTS e Permissions-Policy                                                                                          | SEC-08         | sem violações legítimas por 2 semanas  |
| P2-13 | Tokens do Google criptografados como os do Instagram; `search_path` na função `SECURITY DEFINER`                                                          | SEC-11         | migração + teste                       |

**Riscos.** CSP e paginação podem quebrar telas — usar modo observação e feature flag. **Aprovação.** Orçamento (staging, monitoramento) e plano das plataformas.

---

## Lote P3 — documentação, operação e qualidade de experiência

| #    | Ação                                                                                                                                                              | Achados | Critério                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------- |
| P3-1 | Runbooks: rollback, migration, restauração, rotação de credenciais, webhook perdido, cron parado, incidente de privacidade                                        | OPS-06  | simulação de um runbook por semestre              |
| P3-2 | Atribuir responsáveis (funções) e canal de incidentes                                                                                                             | OPS-06  | tabela preenchida e comunicada                    |
| P3-3 | Atualizar docs divergentes e o índice; completar `.env.example`; documentar regras de negócio por módulo e ADRs (modelo de permissões, JSONB, migrations manuais) | OPS-07  | docs conferidos contra o código                   |
| P3-4 | Acessibilidade: `lang="pt-BR"`, trocar 36 cliques em `div/span` por controles semânticos, foco visível nos 27 `outline-none`, alt nas 3 imagens                   | UX-01   | auditoria com leitor de tela e teclado em 5 telas |
| P3-5 | Remover/ligar as 10 funções `*Session` e os guardas sem uso; decidir permissões decorativas (`membros`, `senhas`)                                                 | ARQ-02  | decisão registrada                                |
| P3-6 | Dividir `InfluencerBoard`, `TaskBoard`, `AppShell`; cumprir regra `lib ↛ components`                                                                              | ARQ-01  | arquivos < 1.500 linhas ou justificativa          |
| P3-7 | Definir SLA/SLOs com a diretoria e retenção de dados                                                                                                              | SLO_SLA | decisões registradas                              |

## Critério global de conclusão

Uma pessoa técnica que **não** participou das conversas consegue: reproduzir as verificações (`scripts/` e comandos em `TESTES_E_DOCUMENTACAO.md`), executar P0 sem ajuda, e validar cada correção pelos critérios de aceite acima.
