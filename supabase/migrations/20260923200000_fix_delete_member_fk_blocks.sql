-- Corrige "não consigo excluir membros em Time": `deleteTeamMember`
-- (team.functions.ts) chama `supabaseAdmin.auth.admin.deleteUser(id)`, que
-- falha com violação de chave estrangeira sempre que o membro já editou/
-- criou QUALQUER registro em QUALQUER uma das dezenas de tabelas que
-- guardam `updated_by`/`created_by`/`actor_id`/etc. como
-- `REFERENCES auth.users(id)` sem `ON DELETE` — ou seja, praticamente
-- qualquer membro que já usou a plataforma de verdade. `profiles` já tem
-- `ON DELETE CASCADE` (a linha do perfil é apagada corretamente); o
-- problema é só essas colunas de atribuição/auditoria, que ficaram com o
-- padrão do Postgres (`NO ACTION` — bloqueia o DELETE).
--
-- Estratégia: nunca apagar dados de negócio (clientes, projetos, reuniões,
-- campanhas, financeiro, marketing, metas, tarefas, auditoria) só porque
-- quem editou por último foi removido do time — troca essas FKs pra
-- `ON DELETE SET NULL`, preservando o registro com a atribuição zerada.
-- 4 colunas eram NOT NULL (pensadas como "sempre tem um autor"); como
-- SET NULL exige a coluna aceitar NULL, relaxa a constraint pra elas
-- também — a alternativa seria apagar essas linhas (`ON DELETE CASCADE`),
-- o que destruiria histórico de auditoria/performance/horas trabalhadas
-- sem necessidade.

alter table public.access_audit_log alter column actor_user_id drop not null;
alter table public.commercial_interactions alter column created_by drop not null;
alter table public.performance_events alter column actor_id drop not null;
alter table public.time_entries alter column user_id drop not null;

alter table public.access_audit_log
  drop constraint access_audit_log_target_user_id_fkey,
  add constraint access_audit_log_target_user_id_fkey
    foreign key (target_user_id) references auth.users(id) on delete set null;
alter table public.access_audit_log
  drop constraint access_audit_log_actor_user_id_fkey,
  add constraint access_audit_log_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null;

alter table public.aeo_prompts
  drop constraint aeo_prompts_updated_by_fkey,
  add constraint aeo_prompts_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.aeo_respostas
  drop constraint aeo_respostas_updated_by_fkey,
  add constraint aeo_respostas_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.aeo_rodadas
  drop constraint aeo_rodadas_updated_by_fkey,
  add constraint aeo_rodadas_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.banco_influenciadores
  drop constraint banco_influenciadores_updated_by_fkey,
  add constraint banco_influenciadores_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.campanha_cronograma
  drop constraint campanha_cronograma_updated_by_fkey,
  add constraint campanha_cronograma_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.campanha_documentos
  drop constraint campanha_documentos_updated_by_fkey,
  add constraint campanha_documentos_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.campanha_entrega_eventos
  drop constraint campanha_entrega_eventos_created_by_fkey,
  add constraint campanha_entrega_eventos_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;
alter table public.campanha_entrega_versoes
  drop constraint campanha_entrega_versoes_created_by_fkey,
  add constraint campanha_entrega_versoes_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;
alter table public.campanha_entregas
  drop constraint campanha_entregas_updated_by_fkey,
  add constraint campanha_entregas_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.campanha_influenciadores
  drop constraint campanha_influenciadores_updated_by_fkey,
  add constraint campanha_influenciadores_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.campanha_tarefas
  drop constraint campanha_tarefas_updated_by_fkey,
  add constraint campanha_tarefas_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.clientes
  drop constraint clientes_updated_by_fkey,
  add constraint clientes_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.commercial_interactions
  drop constraint commercial_interactions_created_by_fkey,
  add constraint commercial_interactions_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.financeiro_lancamentos
  drop constraint financeiro_lancamentos_updated_by_fkey,
  add constraint financeiro_lancamentos_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.financeiro_recorrencias
  drop constraint financeiro_recorrencias_updated_by_fkey,
  add constraint financeiro_recorrencias_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.financeiro_status_overrides
  drop constraint financeiro_status_overrides_updated_by_fkey,
  add constraint financeiro_status_overrides_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.marketing_standalone_tasks
  drop constraint marketing_standalone_tasks_updated_by_fkey,
  add constraint marketing_standalone_tasks_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.marketing_tasks
  drop constraint marketing_tasks_updated_by_fkey,
  add constraint marketing_tasks_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.metas
  drop constraint metas_updated_by_fkey,
  add constraint metas_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.organization_members
  drop constraint organization_members_invited_by_fkey,
  add constraint organization_members_invited_by_fkey
    foreign key (invited_by) references auth.users(id) on delete set null;

alter table public.password_reset_requests
  drop constraint password_reset_requests_resolved_by_fkey,
  add constraint password_reset_requests_resolved_by_fkey
    foreign key (resolved_by) references auth.users(id) on delete set null;

alter table public.performance_events
  drop constraint performance_events_person_id_fkey,
  add constraint performance_events_person_id_fkey
    foreign key (person_id) references auth.users(id) on delete set null;
alter table public.performance_events
  drop constraint performance_events_actor_id_fkey,
  add constraint performance_events_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null;

alter table public.projeto_fases
  drop constraint projeto_fases_updated_by_fkey,
  add constraint projeto_fases_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.projeto_influenciadores
  drop constraint projeto_influenciadores_updated_by_fkey,
  add constraint projeto_influenciadores_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.projeto_tarefas
  drop constraint projeto_tarefas_updated_by_fkey,
  add constraint projeto_tarefas_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.projetos
  drop constraint projetos_updated_by_fkey,
  add constraint projetos_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.reunioes
  drop constraint reunioes_updated_by_fkey,
  add constraint reunioes_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
alter table public.reunioes_disponibilidade
  drop constraint reunioes_disponibilidade_updated_by_fkey,
  add constraint reunioes_disponibilidade_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.settings_audit_log
  drop constraint settings_audit_log_actor_id_fkey,
  add constraint settings_audit_log_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null;

alter table public.task_tags
  drop constraint task_tags_updated_by_fkey,
  add constraint task_tags_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.time_entries
  drop constraint time_entries_user_id_fkey,
  add constraint time_entries_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;
alter table public.time_entries
  drop constraint time_entries_edited_by_fkey,
  add constraint time_entries_edited_by_fkey
    foreign key (edited_by) references auth.users(id) on delete set null;
