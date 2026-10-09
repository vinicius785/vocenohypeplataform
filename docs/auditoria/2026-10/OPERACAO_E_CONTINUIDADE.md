# Operação e continuidade — auditoria 2026-10

Pergunta: existem procedimentos **executáveis** (que outra pessoa consiga seguir às 3 da manhã sem a conversa que os originou)? Classificação: **documentado e validado**, **documentado, mas não testado**, **parcialmente documentado**, **ausente**, **não verificável com o acesso atual**. Nenhum procedimento foi executado nesta auditoria (regra: sem mutações, sem restauração, sem rollback).

## 1. Quadro de procedimentos

| Procedimento                            | Situação                                    | Evidência e lacuna                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monitoramento e alertas                 | **Ausente**                                 | nenhuma biblioteca de APM/erro (0 ocorrências de Sentry etc. em `package.json`); só `console.error/warn` (87 no servidor) lidos manualmente nos logs da Vercel; sem sonda externa; sem alerta de falha de cron/webhook (OPS-03)                                                                                               |
| Investigação de erros                   | **Parcialmente documentado**                | mensagens com prefixo (`[leads webhook]`, `[rate-limit]`, `[google-calendar]`); `access_audit_log` e `settings_audit_log`; sem identificador de correlação; funções públicas deliberadamente escondem o erro cru, o que dificulta o diagnóstico sem log do servidor                                                           |
| Triagem e classificação de incidentes   | **Ausente**                                 | não há definição de severidade, canal ou dono. O módulo "Problemas" (Central de Problemas) triagem reports de usuários, não incidentes de plataforma                                                                                                                                                                          |
| Comunicação e escalonamento             | **Ausente**                                 | sem lista de contatos, sem página de status, sem modelo de aviso a clientes. Existe aviso de versão no app (`VersionWatcher`) — serve a releases, não a incidentes                                                                                                                                                            |
| Rollback de aplicação                   | **Não verificável** / não documentado       | o deploy é por push no `main`; a Vercel normalmente permite promover um deploy anterior, mas o procedimento, quem tem permissão e o efeito sobre migrations já aplicadas **não estão escritos** nem foram testados                                                                                                            |
| Recuperação de migrations problemáticas | **Ausente**                                 | migrations aditivas sem _down_; aplicadas à mão (OPS-01); sem ledger; `supabase/manual/` guarda SQL avulso não versionado (untracked)                                                                                                                                                                                         |
| Restauração de backup                   | **Não verificável / ausente**               | nada documentado; plano/retenção do Supabase desconhecidos; nenhuma restauração testada (seção 3 de `SEGURANCA_E_NFR.md`)                                                                                                                                                                                                     |
| Rotação de credenciais comprometidas    | **Parcialmente documentado**                | existe rotação interna só para o segredo do webhook de leads (`regenerateLeadsWebhookSecret`); sem procedimento para `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, Google, Autentique, Meta/Instagram, Resend, VAPID, TURN, chaves do Auth; o nome de uma variável em `.env.local` indica token OIDC da Vercel (valor não lido) |
| Indisponibilidade de serviços externos  | **Parcialmente documentado**                | erros mapeados em códigos estáveis (Autentique, Instagram); sem modo degradado, sem fila de reenvio de e-mail/webhook de saída, sem mensagem padrão ao usuário                                                                                                                                                                |
| Falha ou acúmulo de jobs                | **Ausente**                                 | sem fila; crons sem registro de execução; ciclo do Google depende de agendador externo não verificável; `email-flows` roda uma vez ao dia                                                                                                                                                                                     |
| Reprocessamento seguro de webhooks      | **Parcialmente documentado**                | Autentique: eventos persistidos com `processado_at`/`erro`, reentrega do provedor reprocessa o mesmo `event_id`, `reconcileContract` repara sob demanda (sem botão/endpoint; é função de serviço); Meta: `failed` é reprocessado na reentrega; Resend e leads: nenhum registro de evento                                      |
| Incidente de segurança / privacidade    | **Ausente**                                 | a Política de Privacidade promete comunicar incidentes relevantes; não há procedimento, responsável nem modelo de notificação à ANPD/titulares (LGPD art. 48)                                                                                                                                                                 |
| Pedido de titular (acesso/exclusão)     | **Parcialmente documentado**                | e-mail de privacidade e página pública; exclusão manual; callback da Meta; sem rastreio dos pedidos por e-mail nem prazos internos                                                                                                                                                                                            |
| Release/versão                          | **Documentado, não validado por terceiros** | `scripts/release.ts` (`bump`/`publish`), `version.json`, `VersionWatcher`                                                                                                                                                                                                                                                     |
| Demo operacional                        | **Documentado**                             | `development/demo-runbook.md` (129 linhas) com migrations e solução de problemas                                                                                                                                                                                                                                              |

## 2. Dependências operacionais fora do repositório (todas **não verificáveis**)

1. Plano/região do Supabase (backups, PITR, limites de conexão, e-mail transacional do Auth).
2. Plano da Vercel (um comentário no código indica **Hobby** — indício não verificado: sem SLA, uso comercial restrito pelos termos, limites de cron e de duração; confirmar).
3. Agendador externo mencionado em `google-calendar-sync.ts` (cadência de 5–10 min) e para `instagram-refresh`: quem opera, onde, com que segredo.
4. Configuração dos apps Google, Meta/Instagram, Autentique e Resend (URLs de redirect/webhook, segredos, modo de desenvolvimento/produção).
5. Domínios (`plataforma.vocenohype.com.br`, site institucional separado) e DNS.
6. Quem tem acesso de administrador a cada painel (continuidade se uma pessoa sair).

## 3. Responsabilidades a atribuir formalmente (funções, não pessoas)

| Função                                                                    | Responde por                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Responsável pela plataforma (plantão)                                     | detectar, triar e mitigar incidentes; decidir rollback        |
| Responsável por banco e migrations                                        | ledger, aplicação ordenada, backups/restauração, RLS          |
| Responsável por segurança e privacidade (inclui o encarregado, se houver) | rotação de credenciais, incidentes, pedidos de titulares      |
| Responsável por integrações                                               | Google, Meta/Instagram, Autentique, Resend, cron externo      |
| Responsável comercial/jurídico                                            | SLA contratual com clientes, textos legais, contratos         |
| Responsável por produto                                                   | decisões de negócio listadas em `REQUISITOS_E_JORNADAS.md` §2 |

Nomes e substitutos **não foram inventados**: precisam ser definidos pela diretoria.

## 4. Roteiro mínimo recomendado para os runbooks (conteúdo, não implementação)

- **Rollback de aplicação:** localizar o último deploy saudável, promover, conferir `version.json`, avisar a equipe; checar se alguma migration recente quebra o código antigo.
- **Migration problemática:** isolar a tabela/política, restaurar do backup (se destrutiva) ou aplicar correção aditiva; registrar no ledger.
- **Restauração:** criar projeto temporário, restaurar, validar contagens por tabela e RLS, trocar variáveis, registrar RPO/RTO obtidos.
- **Credencial comprometida:** matriz por credencial (onde é usada, como rotacionar, o que invalida, quem avisar); a do service-role exige redeploy e revisão do log de acesso.
- **Webhook perdido/atrasado:** identificar eventos não processados (`processado_at is null`), reconciliar via API do provedor, nunca confiar no payload.
- **Cron parado:** verificar execução, rodar manualmente com o segredo, registrar causa.
- **Incidente de privacidade:** contenção, avaliação de risco, comunicação (ANPD/titulares), registro.
