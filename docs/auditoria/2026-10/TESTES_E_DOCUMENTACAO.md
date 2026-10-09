# Testes e documentação — auditoria 2026-10

## 1. Comandos executados (commit `d7b374a`, 2026-10-09, macOS, Node/bun locais)

| Comando                                          | Resultado                                                                                                                                                                                                    | Observação                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck`                              | sem erros (≈ 23 s)                                                                                                                                                                                           | `tsc --noEmit`                                                                                                                                          |
| `bun run lint`                                   | **0 erros, 112 avisos**                                                                                                                                                                                      | 78 `react-refresh/only-export-components`, 17 `no-unused-vars`, 15 `exhaustive-deps` (+2 diretivas sem uso)                                             |
| `bun run test` (3 execuções)                     | **176 arquivos / 2.145 testes, todos passando**; ≈ 16 s                                                                                                                                                      | sem `.only`, `.skip` ou `.todo`                                                                                                                         |
| `TZ=UTC bun run test`                            | 2.145 passando                                                                                                                                                                                               |                                                                                                                                                         |
| `TZ=America/Sao_Paulo bun run test`              | 2.145 passando                                                                                                                                                                                               |                                                                                                                                                         |
| `TZ=Asia/Tokyo bun run test`                     | **2 falhas**                                                                                                                                                                                                 | `entrega-ajustes.test.ts` ("anexo antigo (só o dia)…") e `performance-engine.test.ts` ("cenário 3 … saúde bem arranhada", esperado 0,5, recebido 0,375) |
| `bun run build`                                  | sucesso (preset Nitro/Vercel)                                                                                                                                                                                | 312 chunks, 4,5 MB brutos                                                                                                                               |
| scripts de `docs/auditoria/2026-10/scripts/*.py` | executados; saídas em `evidencias/` (`rls.txt` e `authz.txt` são **resumos sanitizados**; a saída completa, que nomeia tabelas e funções, fica em anexo local não versionado porque o repositório é público) | somente leitura; não criam arquivos (verificado)                                                                                                        |

Reprodução do achado de fuso: `TZ=Asia/Tokyo bunx vitest run src/lib/performance-engine.test.ts src/lib/entrega-ajustes.test.ts`.

Não executado: `bun audit`/varredura de vulnerabilidades (exige rede), cobertura de linhas (o provedor `@vitest/coverage-v8` **não está instalado**), testes e2e (não existem), qualquer teste contra Supabase ou integrações reais (não existe ambiente seguro — ver OPS-08).

## 2. O que existe de teste

| Camada                                                     | Existe         | Evidência                                                                                                                                |
| ---------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Unitários de lógica pura (`lib/*`)                         | sim, a maioria | 105 arquivos em `lib/` + 18 em `lib/demo/`                                                                                               |
| Componentes (renderização estática com `react-dom/server`) | pouco          | 27 de 376 componentes `.tsx` têm teste que os importa                                                                                    |
| Rotas                                                      | pouco          | 25 de 97 arquivos de rota                                                                                                                |
| Integração com banco / RLS                                 | **não**        | nenhum teste usa Postgres; ambiente de teste de banco não existe                                                                         |
| Contrato de APIs e webhooks                                | parcial        | Autentique (assinatura, idempotência, ordem) e Meta (assinatura, idempotência) têm testes com repositório em memória; leads e Resend não |
| e2e / navegador                                            | **não**        | sem Playwright/Cypress; validação visual foi manual                                                                                      |
| Migrations                                                 | **não**        | nenhuma verificação automatizada de migrations (aplicação manual)                                                                        |
| Concorrência                                               | quase nada     | só travas pontuais; `table-array-store.test.ts` não cobre edição simultânea (INT-01)                                                     |
| Cobertura medida                                           | **não**        | sem ferramenta                                                                                                                           |

### Mapa de testes por módulo (estimativa por palavra-chave, `evidencias/mods.txt`)

| Módulo                 | Prod (arq/linhas) | Testes (arq/it) | Leitura                                            |
| ---------------------- | ----------------- | --------------- | -------------------------------------------------- |
| Demo                   | 38 / 4,7 mil      | 24 / 304        | bem coberto                                        |
| Time/Score             | 41 / 11,5 mil     | 12 / 228        | regras puras bem cobertas                          |
| Influenciadores/Banco  | 49 / 17,5 mil     | 9 / 201         | lógica sim; `InfluencerBoard` (6,5 mil linhas) não |
| Campanhas              | 98 / 20,5 mil     | 13 / 196        | parcial                                            |
| Comercial              | 42 / 8,7 mil      | 14 / 173        | motores sim; `comercial.functions` não             |
| Portal                 | 147 / 17,3 mil    | 21 / 166        | modelos sim; ações públicas por token quase não    |
| Contratos/Autentique   | 14 / 2,8 mil      | 4 / 150         | bem coberto (sem UI)                               |
| Projetos/Tarefas       | 52 / 19,1 mil     | 7 / 134         | regras de prazo/bloqueio sim; `TaskBoard` não      |
| Chat/Chamadas          | 59 / 12,5 mil     | 9 / 81          | `call-controller` (1,4 mil linhas) sem teste       |
| Autenticação/acesso    | 55 / 6,9 mil      | 10 / 72         | regras puras; sem teste de RLS                     |
| Clientes               | 33 / 6,6 mil      | 5 / 78          | parcial                                            |
| Financeiro             | 30 / 7,2 mil      | 2 / 58          | motor sim; 7 mil linhas                            |
| **Metas/AEO**          | 45 / 7,9 mil      | **0 / 0**       | **sem teste algum**                                |
| Cofre/Segurança/Config | 36 / 6,3 mil      | 3 / 22          | fraco para área sensível                           |

Por importação (limite inferior, não é cobertura de linhas): **96 de 248** arquivos de `lib/` e **32 de 39** `*.functions.ts` não são importados por nenhum teste; 8 dos 18 `*.server.ts` (repositórios e guardas de infraestrutura) também não.

## 3. Qualidade dos testes (nome × o que realmente verifica)

- `mfa.functions.test.ts` e `cliente-link.functions.test.ts` levam o nome de arquivos de **server functions** mas testam só funções puras auxiliares (`shouldRequireMfaChallenge`, `isVisibleToClientPortal`). Os 1.304 linhas de `cliente-link.functions.ts` têm 6 testes de visibilidade; o nome sugere cobertura que não existe. Risco de **falso conforto** (TST-03).
- `rate-limit.server.test.ts` prova que o limitador **falha aberto** (comportamento desejado e documentado), mas nenhum teste prova que as funções públicas **chamam** o limitador (28 não chamam).
- `table-array-store.test.ts` (14) garante a Demo oculta e a reversão após erro de RLS; não garante conflitos entre usuários.
- `agency-hours.test.ts` valida as **constantes** de horário útil; a função SQL `business_seconds_between` não é executada por nenhum teste (existe script de verificação manual).
- Testes de motores (`deadline-rules`, `approval-flow`, `task-blocks-rules`, `performance-engine`, `comercial-engine`, `financeiro-entries`) têm nomes que descrevem regras de negócio e verificam exatamente isso — são o ponto forte do projeto.
- **Fragilidade de fuso:** 2 testes dependem do fuso do executor (falham em UTC+9), contrariando a regra do próprio guia ("testes que dependem de 'hoje' usam o fuso de Brasília", TST-04). O motor de prazo usa `parseIsoDateLocal`/`setHours` no fuso do dispositivo; para usuários em BRT não há efeito, para outros fusos a pontuação pode divergir. Impacto de negócio baixo, mas é uma regra não declarada.
- **Falsos positivos prováveis:** repositórios em memória nos testes de Autentique/Meta/Instagram reproduzem a regra de unicidade do banco; se o índice real divergir, os testes continuam verdes.
- **Estabilidade:** 3 execuções sem variação; sem testes lentos (≈ 16 s). Não há dependência de rede.

## 4. Verificações automáticas e pipeline

- Não há CI: `typecheck`, `lint`, `test`, `build` rodam **manualmente** antes de cada push (convenção de `CLAUDE.md`). O deploy ocorre por push no `main`; não há proteção de branch verificável.
- `bunfig.toml` impõe idade mínima de 24 h para novas versões de pacotes (mitigação de cadeia de suprimentos).
- Avisos de lint (112) são estáveis, mas escondem regressões novas (a contagem não é um gate). Recomenda-se transformá-los em _baseline_ com falha em avisos novos.

## 5. Documentação: situação e mínimo recomendado

Existente (boa base): `architecture/*` (visão, arquitetura, dados, portal, comunicação, riscos), `security/*` (auditoria 2026-09, plano, consolidado, RLS interno), `performance/*`, `decisions/` (4 ADRs), `modules/*` (autentique, contrato, instagram), `development/guia.md`, `demo-runbook.md`, `metricas-time.md`, `design-system/*`, `.lovable/plan.md`.

| Documento mínimo              | Situação                                       | Ação                                                                        |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| Visão geral e arquitetura     | existe; números e rotas desatualizados         | atualizar (ver divergências em `ARQUITETURA_ATUAL.md`)                      |
| Mapa de módulos e integrações | existe; sem Instagram, Meta, legais            | atualizar índice                                                            |
| Regras de negócio             | espalhadas em código, testes e docs de módulo  | criar `docs/regras/` com uma página por módulo (fonte → código → teste)     |
| Modelo de dados e permissões  | `dados-e-acesso.md` (52 linhas)                | detalhar tabelas, colunas sensíveis e quem as acessa (SEC-01/03/04)         |
| Contratos de APIs e webhooks  | tabela parcial em `portal-e-links-externos.md` | completar as 9 rotas, formatos, autenticação, idempotência, reprocessamento |
| Configuração dos ambientes    | `guia.md` + `.env.example` incompleto          | completar `.env.example`; documentar ambientes (hoje só um)                 |
| Estratégia de testes          | **ausente**                                    | documentar (esta auditoria, seção 2, serve de ponto de partida)             |
| Deploy e rollback             | uma linha                                      | runbook (ver `OPERACAO_E_CONTINUIDADE.md`)                                  |
| Backup e recuperação          | **ausente**                                    | criar após a verificação do P0                                              |
| Resposta a incidentes         | **ausente**                                    | criar                                                                       |
| ADRs                          | 4, o último de demo                            | registrar: modelo de permissões, JSONB por entidade, migrations manuais     |

Princípio já adotado pelo projeto (`docs/README.md`): uma fonte por assunto; relatórios datados não são reescritos. Esta auditoria referencia as anteriores (`architecture/auditoria-2026-10.md`, `platform-optimization-audit-2026-10.md`, `security/*`) em vez de copiá-las; os achados novos em relação a elas são SEC-01, SEC-02 (parcialmente já mencionado como "MFA"), SEC-03, SEC-04, SEC-05, SEC-14, INT-01/02 (aprofundados), OPS-08, TST-03 e TST-04.
