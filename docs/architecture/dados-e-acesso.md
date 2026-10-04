# Dados e acesso

Backend: Supabase projeto `kehjxyzrolltsdaqzkww`. 144 migrations aditivas em `supabase/migrations/`. RLS ligada em todas as tabelas de domínio.

## Modelo de dados por domínio

| Domínio | Tabelas principais | Observação |
|---|---|---|
| **Identidade e acesso** | `profiles`, `user_roles`, `organizations`, `organization_members`, `campaign_members`, `access_audit_log`, `settings_audit_log`, `password_reset_requests`, `rate_limit_events` | `profiles.permissions` guarda as permissões do membro; `organizations.type` é `internal` ou `client` |
| **Clientes e contratos** | `clientes`, `contratos` | `clientes.data` é JSONB e **embute as campanhas** do cliente |
| **Comercial** | `leads`, `commercial_interactions`, `comercial_saved_views`, `pricing_settings` | Leads vêm do webhook ou da UI; `proposta` pública por token |
| **Campanhas** | `campanha_influenciadores`, `campanha_tarefas`, `campanha_documentos`, `campanha_cronograma`, `campanha_entregas`, `campanha_entrega_versoes`, `campanha_entrega_eventos`, `campanha_nps`, `campanha_nps_influenciador`, `campanha_influenciador_avaliacoes`, `campaign_cycles`, `inscricao_campanha_idempotency`, `influencer_approvals` | Tabelas "scoped": cada linha tem `campanha_id`; o dado completo fica em `data` JSONB com `data.id` sincronizado por trigger |
| **Influenciadores** | `banco_influenciadores`, `projeto_influenciadores` | Dados bancários exigem permissão própria |
| **Projetos e tarefas** | `projetos`, `projeto_tarefas`, `task_blocks`, `task_dependencies`, `task_tags`, `marketing_tasks`, `marketing_standalone_tasks`, `time_entries` | Tarefas também existem dentro de campanhas e do Marketing; `task-aggregation` as une |
| **Reuniões** | `reunioes`, `reunioes_disponibilidade`, `google_calendar_connections`, `google_calendar_sync_state`, `google_oauth_states`, `shared_calendar_connection` | Sync opcional com Google Calendar |
| **Financeiro** | `financeiro_lancamentos`, `financeiro_recorrencias`, `financeiro_settings`, `financeiro_status_overrides` | Lançamentos podem apontar para cliente, campanha e influenciador |
| **Metas** | `metas`, `performance_events`, `performance_settings` | Objetivos e indicadores; motor de saúde puro em `metas-engine` |
| **Chat** | `chat_channels`, `chat_messages`, `chat_reads`, `chat_status`, `chat_conversations`, `chat_conversation_members`, `chat_message_attachments`, `chat_message_reactions`, `chat_pinned_messages`, `chat_saved_messages`, `chat_deliveries`, `chat_drafts` | Convive V1 (`/time?section=chat`) e V2 (`/chat-v2`); trigger sincroniza JSONB legado para tabelas |
| **Marketing** | `email_campaigns`, `email_campaign_steps`, `email_campaign_recipients`, `email_campaign_activity`, `email_flows`, `email_flow_enrollments`, `email_sends`, `email_templates`, `email_unsubscribes`, `email_provider_settings`, `aeo_prompts`, `aeo_rodadas`, `aeo_respostas`, `blog_comments`, `blog_likes` | E-mail (Resend), monitor AEO e blog |
| **Central de Problemas** | `bug_reports`, `bug_report_comments`, `bug_report_events`, `bug_report_attachments`, `bug_report_diagnostics` | Triagem exige `can_manage_problems` |
| **Hypito** | `hypito_action_log`, `hypito_alerts_sent`, `hypito_conversation_state`, `hypito_daily_briefing_runs`, `hypito_meeting_reminders_sent`, `hypito_pending_actions`, `hypito_reminders`, `hypito_report_runs`, `hypito_report_settings`, `hypito_user_prefs` | Assistente/automações |
| **Plataforma** | `workspace_settings`, `shared_state`, `platform_releases`, `outgoing_webhooks`, `webhook_settings`, `push_subscriptions`, `personal_reminders` | Config global e avisos de versão |
| **Segurança** | `vault_secret`, `vault_totp_secrets`, `vault_totp_attempts`, `vault_access_requests` | Cofre de senhas |
| **Extras** | `daily_game_sessions(+archive)`, `sudoku_daily_results`, `zip_daily_results` | Jogos diários |

(`projeto_fases` foi removida na migration `20261003120000`.)

## Storage (buckets)
`avatars`, `chat-attachments`, `bug-reports`, `task-attachments`, `financeiro-anexos`, `entrega-anexos`, `relatorios-mensais`, `aeo-evidencias` (5 receberam limite de 100 MB na remediação de setembro). Anexos públicos de bug-report por link vão em `public/<token>/...`. Relatórios mensais são entregues por URL assinada fresca (`getFreshRelatorioUrl*`).

## Autorização em camadas

1. **RLS no banco** (a barreira real). Funções-chave: `is_admin()`, `has_permission(uid, perm)` (une admin + permissão), `can_manage_problems`, `is_internal_team_member`, `shares_internal_organization`, `is_active_client_admin_of`, `user_can_access_campanha`.
2. **Permissões de módulo** (`lib/permissions.ts`): `clientes, campanhas, contratos, projetos, reunioes, comercial, financeiro, time, influenciadores, influenciadores:bancario, metas, chat, senhas, configuracoes (+ :perfil/:workspace/:av/:senhas), membros, problemas`. Todas as tabelas de domínio chamam `has_permission` em suas policies.
3. **Server functions**: RLS-scoped (`requireSupabaseAuth`) por padrão; as que usam service-role validam admin ou token explicitamente.
4. **UI**: esconde/esmaece o que a pessoa não pode usar — conveniência, nunca a barreira.

Limitações aceitas e documentadas:
- `clientes` aceita `clientes` **ou** `campanhas`, porque a campanha vive no JSONB do cliente.
- `membros` é **decorativa**: criar/editar/excluir membro e redefinir senha seguem exigindo admin (um endpoint único altera `role`, e liberar abriria escalada de privilégio).
- `senhas` é decorativa: o acesso real ao cofre é `configuracoes:senhas`.

## Portal do cliente — isolamento
- Cliente com login: papéis `client_standard` (administra pessoas e acessos), `client_approver`, `client_viewer`; **nunca** pode alterar as próprias permissões (`prevent_client_permissions`); proteção contra remover o último admin; acesso restrito a campanhas liberadas (`campaign_members`, `user_can_access_campanha`).
- Cliente por token: o token público do cliente (`clientes.data.publicToken`) é a credencial; as funções do `cliente-link` validam o token e escopam tudo ao cliente.

## Outras proteções
- **MFA/TOTP**; rate limit de login e recuperação; `X-Frame-Options`, `nosniff`, `Referrer-Policy` (Vercel).
- Webhook de leads com `X-Webhook-Secret` (segredo em `webhook_settings`, rotacionável por admin); Resend com assinatura Svix; crons com `Authorization: Bearer $CRON_SECRET`.
- Markdown do blog sanitizado (DOMPurify). Páginas por token têm `noindex, nofollow`.
- Estado de segurança e histórico: [`../security/README.md`](../security/README.md). **RLS pendente**: dados internos e buckets ainda abertos a contas de cliente até a migration `20261004000000` ser aplicada ([`../security/rls-internal-only.md`](../security/rls-internal-only.md)).
- Verificação do esquema vivo: `src/integrations/supabase/types.ts` (gerado) lista 103 tabelas; 6 criadas por migrations foram removidas depois (`projeto_fases`, `influencer_approvals`, `email_flows`, `email_flow_enrollments`, `shared_calendar_connection`, `vault_access_requests`).
