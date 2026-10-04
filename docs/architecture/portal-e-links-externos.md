# Portal do cliente, links externos e integrações

## Portal do cliente — três gerações

| Rota               | Estado                                                                                                                          | Acesso                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `/portal-v2/*`     | **Atual**, destino de todo login de cliente                                                                                     | Sessão Supabase + organização `client` ativa |
| `/portal/$token/*` | **Em uso**, por link                                                                                                            | Token público fixo do cliente, sem login     |
| `/portal-app/*`    | **Legado**: um único redirect para `/portal-v2` (links e e-mails antigos); a guarda e as telas do V1 foram removidas em 2026-10 | —                                            |

### Portal V2 (`features/client-portal-v2`, rotas `portal-v2/*`)

Layout `PortalV2Shell`. Guard (`portal-v2/route.tsx`): exige sessão, MFA resolvido, troca de senha se pendente, aceita convites pendentes, resolve o ambiente; e aplica o **gate de NPS** — se há NPS do mês pendente, bloqueia a navegação até responder (`nps-guard`).

| Página                                 | Função                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Início                                 | Resumo, atenção (o que espera o cliente), progresso das campanhas, atividade |
| Campanhas / `$id`                      | Visão geral, **creators**, conteúdo, arquivos, timeline, resultados          |
| Aprovações                             | Perfis de influenciador e entregas aguardando o cliente                      |
| Conteúdos, Arquivos, Relatórios        | Entregas, anexos, relatórios mensais (URL assinada)                          |
| NPS                                    | Avaliação mensal por campanha                                                |
| Notificações, Perfil, Conta, Segurança | Conta e preferências                                                         |
| Configurações → Acessos                | Administradores do cliente convidam e gerenciam pessoas (papéis e campanhas) |

Ações do cliente no V2 (server functions `portal-auth.functions`, sufixo `Session`): **responder influenciador** (aprovar/recusar), **responder entrega**, abrir **relatório** (URL assinada) e **NPS** (porta obrigatória). As demais funções `Session` (reabrir aprovação, editar briefing/observações/anexos, enviar demanda, reportar bug, artigos do blog) existem mas **nenhuma tela do V2 as chama** hoje; essas ações vivem no portal por token (`cliente-link.functions`). Papéis: `client_standard` (admin), `client_approver` (aprova), `client_viewer` (lê).

### Portal por token (`portal.$token/*`)

Mesmo conteúdo essencial (início, campanhas, aprovações, relatórios, solicitações) sem login, via `cliente-link.functions` (as mesmas ações, sufixo sem `Session`). Visual próprio em `components/portal/*`. Idiomas via `portal-i18n`. `noindex`.

## Links externos (por token, sem login)

| URL                                | Quem usa              | O que faz                                                                                                                                                                                                                                                           | Credencial                                                          |
| ---------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `/inscricao/$token`                | Influenciador         | Inscreve-se numa campanha (redes, nicho, perguntas personalizadas, anexo); idempotente                                                                                                                                                                              | `signupToken` da campanha                                           |
| `/nps-influenciador/$token`        | Influenciador         | Avalia a experiência (notas + "voltaria a trabalhar")                                                                                                                                                                                                               | `token` em `campanha_nps_influenciador`                             |
| `/bugs/$token`                     | Cliente/influenciador | Lista, reporta e marca bugs/sugestões do projeto (com print)                                                                                                                                                                                                        | Token do projeto                                                    |
| `/calculadora-proposta/$token`     | Lead                  | Monta e salva uma proposta no simulador                                                                                                                                                                                                                             | Token do lead                                                       |
| `/email/descadastro/$token`        | Destinatário          | Descadastro (entra em `email_unsubscribes` e cancela o destinatário em **todas** as campanhas)                                                                                                                                                                      | `unsubscribe_token` do destinatário                                 |
| `/portal/$token/*`                 | Cliente               | Portal sem login                                                                                                                                                                                                                                                    | Token do cliente                                                    |
| `/demo/$token/*`                   | Cliente (prospect)    | **Demonstração** operável: mesmas páginas do Portal V2, sem login, sobre uma campanha isolada com dados fictícios. Validade 14 dias, renovável e revogável; qualquer falha mostra a mesma tela. Ver [`development/demo-runbook.md`](../development/demo-runbook.md) | `demo_sessions.token` (32 bytes aleatórios; limite de uso por link) |
| `/criar-senha`, `/redefinir-senha` | Cliente/equipe        | Convite e recuperação                                                                                                                                                                                                                                               | Link do Supabase Auth                                               |

Todas devolvem `noindex, nofollow` e escopam a leitura/escrita ao dono do token. Tentativas inválidas caem em estado de erro amigável.

## Endpoints de máquina

| Endpoint                             | Chamado por                   | Proteção                                                                            | O que faz                                                                                                                                              |
| ------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/public/leads`             | Make / Typeform / formulários | `X-Webhook-Secret` (em `webhook_settings`); CORS                                    | Insere o lead via service-role (o disparo `lead.created`/`lead.won` para webhooks de saída acontece em `comercial.functions`, ao criar/ganhar pela UI) |
| `POST /api/webhooks/resend`          | Resend                        | Assinatura Svix (segredo `whsec_` guardado pelo admin em `email_provider_settings`) | Atualiza o estado de cada envio em `email_sends`                                                                                                       |
| `GET /api/google/oauth-callback`     | Google                        | `state` em `google_oauth_states`; `APP_URL` canônico                                | Conclui OAuth do Calendar                                                                                                                              |
| `GET /api/cron/email-flows`          | Vercel Cron `0 13 * * *`      | `Bearer CRON_SECRET`                                                                | Avança fluxos de e-mail automáticos                                                                                                                    |
| `GET /api/cron/google-calendar-sync` | Vercel Cron `0 6 * * *`       | `Bearer CRON_SECRET`                                                                | Sincroniza reuniões ↔ Google                                                                                                                           |

## Integrações de saída

| Destino                            | Como                                                                                                      | Gatilho                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Webhooks configuráveis (Make etc.) | `outgoing_webhooks` (admin, Configurações → Integrações), POST JSON `{event,data,timestamp}`; best-effort | `lead.created`, `lead.won`    |
| Webhook do blog (Make)             | `BLOG_WEBHOOK_URL`, campo `action` = upsert/archive/delete                                                | Ciclo de vida do artigo       |
| Resend                             | `email-provider.server`, configurado em `email_provider_settings`                                         | Disparos de campanha e fluxos |
| Google Calendar                    | OAuth + `googleapis.com/calendar/v3`                                                                      | Reuniões                      |
| Web Push                           | VAPID (`push.functions`, `push_subscriptions`)                                                            | Chat, menções, lembretes      |
| Open-Meteo                         | `weather-service`                                                                                         | Cabeçalho da Início           |
| WhatsApp (`wa.me`), redes sociais  | Links gerados na UI                                                                                       | Contato e perfis              |
