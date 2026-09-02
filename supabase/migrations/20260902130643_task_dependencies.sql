-- Dependências entre tarefas (Depende de / Bloqueia). Sem tabela `tasks`
-- unificada no app (Task vive dentro de 3 tabelas jsonb diferentes:
-- projeto_tarefas/campanha_tarefas/marketing_standalone_tasks, todas
-- usando o mesmo espaço de UUIDs como id) — por isso não há FK real aqui,
-- só os dois ids soltos. Integridade é mantida pela aplicação (limpa a
-- relação quando qualquer ponta é excluída).
create table public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  blocking_task_id uuid not null,  -- precisa acontecer primeiro
  blocked_task_id uuid not null,   -- depende da blocking
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint task_dependencies_no_self check (blocking_task_id <> blocked_task_id),
  constraint task_dependencies_unique unique (blocking_task_id, blocked_task_id)
);

create index task_dependencies_blocking_idx on public.task_dependencies (blocking_task_id);
create index task_dependencies_blocked_idx on public.task_dependencies (blocked_task_id);

alter table public.task_dependencies enable row level security;

create policy "task_dependencies_all_authenticated" on public.task_dependencies
  for all to authenticated
  using (
    public.has_permission(auth.uid(), 'projetos')
    or public.has_permission(auth.uid(), 'campanhas')
    or public.is_admin(auth.uid())
  )
  with check (
    public.has_permission(auth.uid(), 'projetos')
    or public.has_permission(auth.uid(), 'campanhas')
    or public.is_admin(auth.uid())
  );

alter publication supabase_realtime add table public.task_dependencies;
