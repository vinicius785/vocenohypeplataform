-- Estado operacional "Bloqueada" para tarefas. Tarefas não têm backend
-- próprio por evento (Task inteiro é um jsonb em projeto_tarefas/
-- campanha_tarefas/marketing_standalone_tasks, reescrito por inteiro só
-- quando o usuário clica "Salvar" no dialog) — isso não serve pro
-- bloqueio, que precisa de escrita atômica e imediata (não pode esperar
-- o "Salvar" da tarefa, senão fica "parcialmente bloqueada" se algo
-- falhar no meio). Por isso: (1) uma tabela relacional real de
-- histórico, mesmo padrão sem-FK de task_dependencies (tarefas vivem em
-- 3 tabelas diferentes); (2) duas funções SECURITY DEFINER que atualizam
-- task_blocks + a linha da tarefa na mesma transação, chamadas via RPC a
-- partir do server function (toda a validação de regra roda antes, em
-- TypeScript — estas funções só validam permissão/estado e escrevem).

create table public.task_blocks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  task_scope text not null check (task_scope in ('projeto', 'campanha', 'marketing')),
  status text not null default 'ativo' check (status in ('ativo', 'resolvido', 'cancelado')),
  category text not null check (
    category in (
      'dependencia_tarefa',
      'aguardando_time',
      'aguardando_cliente',
      'aguardando_fornecedor',
      'aguardando_aprovacao',
      'problema_tecnico',
      'falta_informacao',
      'outro'
    )
  ),
  reason text not null,
  blocked_at timestamptz not null default now(),
  blocked_by_user_id uuid not null,
  affected_assignee_id uuid,
  responsible_for_unblocking_user_id uuid,
  related_task_id uuid,
  related_entity_type text,
  related_entity_id text,
  required_action text,
  expected_resolution_at timestamptz,
  unblocked_at timestamptz,
  unblocked_by_user_id uuid,
  resolution_note text,
  pauses_deadline boolean not null default false,
  pause_approved_by_user_id uuid,
  pause_override_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_blocks_task_idx on public.task_blocks (task_id, status);

alter table public.task_blocks enable row level security;

-- Leitura: qualquer autenticado com permissão do módulo da tarefa (ou
-- admin) — mesma convenção de task_dependencies. Nenhuma linha é
-- apagada pelo app (histórico imutável); só INSERT/UPDATE controlado
-- pelas duas funções abaixo (que já checam permissão internamente), mas
-- a policy fica como segunda trava.
create policy "task_blocks_select" on public.task_blocks
  for select to authenticated
  using (
    public.has_permission(auth.uid(), 'projetos')
    or public.has_permission(auth.uid(), 'campanhas')
    or public.is_admin(auth.uid())
  );

alter table public.task_blocks replica identity full;
alter publication supabase_realtime add table public.task_blocks;

grant select on public.task_blocks to authenticated;
grant all on public.task_blocks to service_role;

-- Bloqueia a tarefa: insere o registro de histórico e atualiza a linha
-- jsonb da tarefa (status, blockedState denormalizado, activity[],
-- performanceDueDate) numa única transação. `p_blocked_state` e
-- `p_activity_entry` já vêm prontos do TypeScript (toda decisão de
-- categoria/pausa/prazo roda antes, em `task-blocks.functions.ts`) —
-- esta função só valida estado/permissão e escreve.
create or replace function public.apply_task_block(
  p_task_id uuid,
  p_task_scope text,
  p_category text,
  p_reason text,
  p_affected_assignee_id uuid,
  p_responsible_for_unblocking_user_id uuid,
  p_related_task_id uuid,
  p_related_entity_type text,
  p_related_entity_id text,
  p_required_action text,
  p_expected_resolution_at timestamptz,
  p_pauses_deadline boolean,
  p_pause_approved_by_user_id uuid,
  p_pause_override_reason text,
  p_blocked_state jsonb,
  p_activity_entry jsonb,
  p_performance_due_date text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_block_id uuid;
begin
  if v_actor is null then
    raise exception 'Não autenticado.';
  end if;

  if p_task_scope = 'projeto' and not (public.has_permission(v_actor, 'projetos') or public.is_admin(v_actor)) then
    raise exception 'Sem permissão para bloquear tarefas de Projetos.';
  elsif p_task_scope = 'campanha' and not (public.has_permission(v_actor, 'campanhas') or public.is_admin(v_actor)) then
    raise exception 'Sem permissão para bloquear tarefas de Campanhas.';
  end if;

  if p_task_scope = 'projeto' then
    select data->>'status' into v_status from public.projeto_tarefas where id = p_task_id for update;
  elsif p_task_scope = 'campanha' then
    select data->>'status' into v_status from public.campanha_tarefas where id = p_task_id for update;
  elsif p_task_scope = 'marketing' then
    select data->>'status' into v_status from public.marketing_standalone_tasks where id = p_task_id for update;
  else
    raise exception 'task_scope inválido: %', p_task_scope;
  end if;

  if v_status is null then
    raise exception 'Tarefa não encontrada.';
  end if;
  if v_status in ('Concluído', 'Arquivado') then
    raise exception 'Não é possível bloquear uma tarefa %.', v_status;
  end if;
  if v_status = 'Bloqueada' then
    raise exception 'Esta tarefa já está bloqueada.';
  end if;
  if p_pause_approved_by_user_id is not null and not (public.is_admin(v_actor) or public.has_permission(v_actor, 'projetos') or public.has_permission(v_actor, 'campanhas')) then
    raise exception 'Só líder ou administrador pode sobrescrever a pausa de prazo.';
  end if;

  insert into public.task_blocks (
    task_id, task_scope, status, category, reason, blocked_at, blocked_by_user_id,
    affected_assignee_id, responsible_for_unblocking_user_id, related_task_id,
    related_entity_type, related_entity_id, required_action, expected_resolution_at,
    pauses_deadline, pause_approved_by_user_id, pause_override_reason
  ) values (
    p_task_id, p_task_scope, 'ativo', p_category, p_reason, now(), v_actor,
    p_affected_assignee_id, p_responsible_for_unblocking_user_id, p_related_task_id,
    p_related_entity_type, p_related_entity_id, p_required_action, p_expected_resolution_at,
    p_pauses_deadline, p_pause_approved_by_user_id, p_pause_override_reason
  ) returning id into v_block_id;

  if p_task_scope = 'projeto' then
    update public.projeto_tarefas set data =
      (data || jsonb_build_object('status', 'Bloqueada', 'blockedState', p_blocked_state, 'performanceDueDate', p_performance_due_date))
      || jsonb_build_object('activity', coalesce(data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity_entry))
      where id = p_task_id;
  elsif p_task_scope = 'campanha' then
    update public.campanha_tarefas set data =
      (data || jsonb_build_object('status', 'Bloqueada', 'blockedState', p_blocked_state, 'performanceDueDate', p_performance_due_date))
      || jsonb_build_object('activity', coalesce(data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity_entry))
      where id = p_task_id;
  elsif p_task_scope = 'marketing' then
    update public.marketing_standalone_tasks set data =
      (data || jsonb_build_object('status', 'Bloqueada', 'blockedState', p_blocked_state, 'performanceDueDate', p_performance_due_date))
      || jsonb_build_object('activity', coalesce(data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity_entry))
      where id = p_task_id;
  end if;

  return v_block_id;
end;
$$;

-- Resolve um bloqueio ativo específico. Se ainda existir outro bloqueio
-- ativo pra mesma tarefa, o status/blockedState visível permanecem
-- "Bloqueada" (mostra o mais antigo/relevante — decidido em TypeScript
-- antes de chamar) — só fecha de vez quando este for o último ativo.
create or replace function public.resolve_task_block(
  p_block_id uuid,
  p_resolution_note text,
  p_new_status text,
  p_performance_due_date text,
  p_activity_entry jsonb,
  p_next_blocked_state jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_task_id uuid;
  v_task_scope text;
  v_affected uuid;
  v_responsible uuid;
  v_blocked_by uuid;
  v_still_blocked boolean;
begin
  if v_actor is null then
    raise exception 'Não autenticado.';
  end if;

  select task_id, task_scope, affected_assignee_id, responsible_for_unblocking_user_id, blocked_by_user_id
    into v_task_id, v_task_scope, v_affected, v_responsible, v_blocked_by
    from public.task_blocks where id = p_block_id and status = 'ativo' for update;

  if v_task_id is null then
    raise exception 'Bloqueio não encontrado ou já resolvido.';
  end if;

  if not (
    v_actor = coalesce(v_responsible, v_actor)
    or v_actor = coalesce(v_affected, v_actor)
    or v_actor = v_blocked_by
    or public.is_admin(v_actor)
    or (v_task_scope = 'projeto' and public.has_permission(v_actor, 'projetos'))
    or (v_task_scope = 'campanha' and public.has_permission(v_actor, 'campanhas'))
  ) then
    raise exception 'Sem permissão para resolver este bloqueio.';
  end if;

  update public.task_blocks
    set status = 'resolvido', unblocked_at = now(), unblocked_by_user_id = v_actor,
        resolution_note = p_resolution_note, updated_at = now()
    where id = p_block_id;

  select exists(
    select 1 from public.task_blocks where task_id = v_task_id and status = 'ativo' and id <> p_block_id
  ) into v_still_blocked;

  if v_task_scope = 'projeto' then
    update public.projeto_tarefas set data =
      (data || jsonb_build_object(
        'status', case when v_still_blocked then 'Bloqueada' else p_new_status end,
        'blockedState', p_next_blocked_state,
        'performanceDueDate', p_performance_due_date
      )) || jsonb_build_object('activity', coalesce(data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity_entry))
      where id = v_task_id;
  elsif v_task_scope = 'campanha' then
    update public.campanha_tarefas set data =
      (data || jsonb_build_object(
        'status', case when v_still_blocked then 'Bloqueada' else p_new_status end,
        'blockedState', p_next_blocked_state,
        'performanceDueDate', p_performance_due_date
      )) || jsonb_build_object('activity', coalesce(data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity_entry))
      where id = v_task_id;
  elsif v_task_scope = 'marketing' then
    update public.marketing_standalone_tasks set data =
      (data || jsonb_build_object(
        'status', case when v_still_blocked then 'Bloqueada' else p_new_status end,
        'blockedState', p_next_blocked_state,
        'performanceDueDate', p_performance_due_date
      )) || jsonb_build_object('activity', coalesce(data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity_entry))
      where id = v_task_id;
  end if;
end;
$$;

grant execute on function public.apply_task_block(
  uuid, text, text, text, uuid, uuid, uuid, text, text, text, timestamptz,
  boolean, uuid, text, jsonb, jsonb, text
) to authenticated;

grant execute on function public.resolve_task_block(uuid, text, text, text, jsonb, jsonb) to authenticated;
