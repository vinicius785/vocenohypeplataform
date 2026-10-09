# Resumo executivo — auditoria técnica e operacional da Plataforma VNH

Data: 2026-10-09 · Commit auditado: `d7b374a` · Natureza: **somente leitura** (nenhum código, banco, configuração, dependência ou infraestrutura foi alterado; nenhum commit, push ou deploy; nenhuma chamada a produção ou a integrações; nenhum segredo ou dado pessoal lido ou registrado).

> **Versão compartilhável.** O repositório remoto é **público** (confirmado por consulta anônima à API do GitHub em 2026-10-09). Por isso esta versão **omite** receitas de exploração, nomes de objetos e consultas dos achados de segurança SEC-01 a SEC-05 e SEC-14. A versão completa existe só localmente, em pasta não versionada; **não há, hoje, um local restrito comprovadamente adequado** (pendência registrada em `PLANO_DE_ACAO.md`, P0-10).

Documentos: [`ARQUITETURA_ATUAL`](./ARQUITETURA_ATUAL.md) · [`REQUISITOS_E_JORNADAS`](./REQUISITOS_E_JORNADAS.md) · [`SEGURANCA_E_NFR`](./SEGURANCA_E_NFR.md) · [`SLO_SLA`](./SLO_SLA.md) · [`TESTES_E_DOCUMENTACAO`](./TESTES_E_DOCUMENTACAO.md) · [`OPERACAO_E_CONTINUIDADE`](./OPERACAO_E_CONTINUIDADE.md) · [`PLANO_DE_ACAO`](./PLANO_DE_ACAO.md) · `scripts/` e `evidencias/` (reproduzíveis).

## A pergunta fundamental

> O sistema foi construído com requisitos, regras, testes e controles verificáveis, ou depende de caminhos felizes e explicações presentes só nos prompts?

**Resposta, com evidência: as duas coisas, e a divisão é nítida.**

- **Verificável (ponto forte).** As regras de negócio **puras** têm testes que dizem o que verificam e cobrem bordas reais: corte de prazo às 19h, replanejamento no mesmo dia que não vira atraso, retrabalho só após a primeira aprovação, bloqueio com pausa de prazo, funil comercial, contrato e assinatura, demo oculta. São 2.145 testes passando (176 arquivos), sem testes pulados, `typecheck` limpo, `lint` sem erros e build ok. Esse núcleo não depende de explicação oral.
- **Não verificável (onde está o risco real).** Tudo o que cruza a fronteira do código — **RLS e permissões no banco, concorrência entre usuários, integrações reais, operação** — não tem teste nem procedimento verificável: nenhum teste usa banco, não há e2e, não há ambiente de teste (o desenvolvimento local usa o backend real), não há CI, monitoramento, backup documentado ou runbook. E é exatamente nessa fronteira que a auditoria encontrou os achados mais graves (SEC-01, SEC-02, SEC-03, SEC-14, INT-01). Várias decisões de segurança vivem em comentários de código ("a checagem de verdade é no servidor, depois"), não em requisitos aprovados.
- **Requisitos formais não existem.** As regras estão em código, testes, ADRs e docs de módulo; a matriz de `REQUISITOS_E_JORNADAS.md` as reconstrói e marca 12 perguntas de negócio que só uma pessoa pode responder.

Não atribuo nota global de maturidade: não há critérios acordados, e metade dos controles é **não verificável** com o acesso desta auditoria.

## Estado em números

|                            |                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código de produto / testes | 176.447 / 27.987 linhas; 878 + 176 arquivos                                                                                                          |
| Server functions           | 184 (147 autenticadas, 37 públicas por token); 151 com validador                                                                                     |
| Banco                      | 162 migrations, 114 tabelas, todas com RLS; 41 funções `SECURITY DEFINER` (contagens por regex: estimativas sujeitas a falsos positivos e negativos) |
| Verificações               | typecheck ok · lint 0 erros/112 avisos · 2.145 testes ok · build ok                                                                                  |
| Testes por importação      | 96 de 248 arquivos de `lib/` e 32 de 39 `*.functions.ts` não são importados por nenhum teste; Metas/AEO: 0 testes                                    |
| Bundle                     | 4,5 MB de JS bruto, 312 chunks; entrada 136 KB gzip                                                                                                  |

## Os dez riscos mais relevantes (com evidência)

| #   | ID     | Risco                                                                                                                                                                            | Sev.  | Tipo                                                                  |
| --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| 1   | SEC-01 | Atributos que governam as permissões de acesso podem ser alterados pelo próprio usuário interno, ampliando seu acesso aos módulos protegidos (detalhe técnico no anexo restrito) | Alta  | confirmado por inspeção                                               |
| 2   | OPS-02 | Backup, RPO/RTO e restauração: **nenhuma evidência** (nem documentação, nem teste); crítica se não houver backup                                                                 | Alta  | não verificável                                                       |
| 3   | SEC-02 | Segundo fator (MFA) é exigido apenas na interface, não nas camadas de servidor e banco                                                                                           | Alta  | confirmado por inspeção                                               |
| 4   | INT-01 | Escrita concorrente: última gravação vence, sem versão, em dados centrais (cliente/campanha/financeiro)                                                                          | Alta  | confirmado por inspeção                                               |
| 5   | SEC-03 | Dados financeiros de influenciadores protegidos por permissão específica só na interface                                                                                         | Alta  | confirmado por inspeção                                               |
| 6   | OPS-01 | Migrations aplicadas à mão, sem ledger; código é publicado antes do schema                                                                                                       | Alta  | confirmado (processo)                                                 |
| 7   | OPS-08 | Desenvolvimento local conectado ao backend real; sem staging nem dados de teste                                                                                                  | Alta  | observado em etapa anterior da mesma sessão (não durante a auditoria) |
| 8   | OPS-03 | Sem monitoramento, alertas ou APM; cron/webhook podem falhar sem aviso                                                                                                           | Alta  | confirmado                                                            |
| 9   | TST-01 | Nenhum teste de RLS/integração/e2e: os riscos 1–5 não seriam detectados por nenhum teste                                                                                         | Alta  | confirmado                                                            |
| 10  | SEC-14 | Rotinas de sincronização global de agenda sem autorização por perfil (acionáveis por contas autenticadas de qualquer tipo)                                                       | Média | confirmado por inspeção                                               |

Outros relevantes: SEC-04 (campos de RH acessíveis a membros internos fora da interface), SEC-05 (tabela legada com política de acesso ampla), SEC-06 (28 funções públicas sem limitador), INT-02 (falha de carga inicial vira tela vazia), TST-04 (testes e motor de prazo sensíveis ao fuso: 2 falhas reproduzidas em `TZ=Asia/Tokyo`). Lista completa (33 achados) em `SEGURANCA_E_NFR.md`.

## Jornadas críticas

- **Comprovadas (nível de regra, por teste automatizado):** cálculo de prazo/atraso e replanejamento, retrabalho de entrega, regras de convite de cliente (núcleos), bloqueio de tarefa (regra pura), contrato/assinatura (serviço com repositório em memória), demo operacional, páginas legais (**executado**: HTTP 200 sem redirecionamento e conteúdo no HTML do servidor, em ambiente local).
- **Nenhuma jornada foi executada ponta a ponta** nesta auditoria (sem ambiente seguro). Não comprovadas ponta a ponta: login+MFA, criação de membro, campanha→aprovação do cliente, portal por token (ações), lead→proposta, financeiro, sincronização Google, chamadas, e-mail de campanha, contrato com assinatura em produção (credencial retornou 401; nenhum evento real de webhook recebido), Instagram (nunca chamou a API real), exclusão pela Meta (não publicado).

## Segurança e isolamento de dados — principais lacunas

1. O modelo de permissões depende de atributos que o próprio usuário consegue alterar (SEC-01) e de controles que o segundo fator não alcança (SEC-02); detalhes no anexo restrito, fora do repositório.
2. Proteções "de campo" existem só na interface: dados bancários (SEC-03) e campos de RH (SEC-04).
3. Isolamento de **clientes** está bem desenhado (37 tabelas internas por estimativa de regex, gatilho que impede permissões em contas de cliente, portal por server functions) mas sem teste de RLS; exceções confirmadas por inspeção: uma tabela legada (SEC-05) e rotinas de sincronização de agenda (SEC-14).
4. Superfície pública por token grande (37 funções, service-role) e sem limitador em 28 (SEC-06); tokens com 122 bits de entropia; **não encontrei lógica de expiração ou revogação nos arquivos inspecionados** (isso não prova que não exista em outro ponto do sistema).
5. Pontos positivos verificados: sem segredos versionados (histórico), Markdown com escape + DOMPurify, webhooks novos com assinatura em tempo constante e idempotência, 6 dos 9 buckets verificados como privados e com limite de tamanho (os outros 3 têm políticas por pasta/permissão; visibilidade viva não verificada), token do Instagram criptografado.

## Disponibilidade, backup e recuperação

Nível de evidência: **nenhum**. Não há SLO medido, backup documentado, RPO/RTO, restauração testada, runbook de incidente ou rollback; plano e retenção do Supabase e plano da Vercel são **desconhecidos** (um comentário de código sugere plano Hobby). A existência de recursos de backup do provedor não foi tratada como recuperação comprovada.

## SLA e SLO

Existente: **nenhum SLA contratual** encontrado no repositório (contratos com clientes não estão aqui — validar com o comercial/jurídico). Recomendados: 10 SLOs com fórmula, fonte e meta **proposta** (S1–S10) e pré-requisitos de medição. Decisões pendentes: compromisso com clientes, RPO/RTO, retenção, horário de atendimento, orçamento de erro.

## Limitações de acesso, ambiente e cobertura

- Sem acesso ao banco vivo, aos painéis (Supabase, Vercel, Google, Meta, Autentique, Resend) e à rede de pacotes: políticas efetivamente aplicadas, migrations pendentes, backups, variáveis e agendador externo **não foram verificados**.
- Análise de RLS por simulação das migrations em ordem (aproximação por regex); varredura de autorização por heurística (falsos positivos revisados à mão, falsos negativos não excluídos). Das 22 server functions sinalizadas, **apenas 4 foram revisadas manualmente**; as outras 18 **não** podem ser consideradas seguras só por usarem `context.userId` e precisam de revisão.
- **Reprodução dinâmica:** apenas **TST-04** (suíte executada com `TZ=Asia/Tokyo`) foi reproduzido. Todos os demais achados foram identificados por **inspeção estática** do repositório ou dependem de validação adicional no banco vivo e nos painéis; os de segurança têm roteiro de validação somente para **ambiente de teste** (nunca produção).
- Acessibilidade: contagens estáticas; sem sessão com leitor de tela/teclado/dispositivos.
- Segurança de dependências (`bun audit`) e cobertura de linhas não medidas (sem rede; provedor de cobertura não instalado).
- O arquivo local `.env`/`.env.local` não foi lido (somente nomes de variáveis e se estavam preenchidas, em etapa anterior).

## Arquivos criados ou atualizados

Criados em `docs/auditoria/2026-10/`: os 8 documentos acima, `scripts/` (5 scripts Python somente leitura) e `evidencias/` (saídas e log de verificações). Atualizado: `docs/README.md` (uma linha no índice). Nada em `src/`, `supabase/`, configuração ou dependências.

## Sequência recomendada de correção

1. **P0 (1–2 dias, sem código):** verificar backup/restauração, políticas de escrita da tabela de perfis, volume da tabela legada (SEC-05), migrations aplicadas, plano/variáveis, "leaked password protection".
2. **P1:** SEC-01 e SEC-14 (rápidos), staging (OPS-08) e ledger (OPS-01), depois SEC-02, SEC-03, INT-01, monitoramento mínimo.
3. **P2:** suíte de RLS/integração, CI, limitadores públicos, idempotência/tempo nos webhooks, estado de erro de carga, medição de desempenho, CSP em modo observação.
4. **P3:** runbooks e responsáveis, documentação alinhada ao código, acessibilidade (`lang`, controles semânticos), refatoração dos arquivos gigantes, decisões de SLA.

Detalhes, dependências, riscos, testes e critérios de conclusão por lote: [`PLANO_DE_ACAO.md`](./PLANO_DE_ACAO.md).
