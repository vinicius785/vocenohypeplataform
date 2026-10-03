-- Central de Problemas (substitui "Bugs reportados" + botão flutuante).
--
-- REUTILIZA `bug_reports` (source='plataforma'); o painel Bugs & Sugestões do
-- Projeto HypeApp (source='hypeapp') e o link público /bugs/$token continuam
-- funcionando: o booleano `resolved` segue existindo e é mantido em sincronia
-- com o novo `status` por trigger (nos dois sentidos).
--
-- Novidades:
--  * bug_reports: tipo (bug/problema/sugestão/dúvida), título, área,
--    prioridade, status (6 estados), responsável, resolução, updated_at.
--  * bug_report_events: HISTÓRICO gravado só por trigger (o cliente não
--    escreve), separado dos comentários.
--  * bug_report_comments: comentários; `is_internal` = nota interna, visível
--    só para quem gerencia problemas.
--  * bug_report_attachments: anexos do report/comentário (bucket existente
--    `bug-reports`, pasta do próprio usuário).
--  * bug_report_diagnostics: metadados de diagnóstico (rota, módulo,
--    navegador, dispositivo, versão, tarefa) — legíveis só por quem reportou
--    e por quem gerencia.
--
-- PERMISSÕES:
--  * Ver/criar/comentar: membro interno ativo (`is_internal_team_member`).
--    Cliente do portal NUNCA lê nada (fecha a policy USING (true) anterior).
--  * Gerenciar (status, prioridade, responsável, área, resolver):
--    `can_manage_problems` = admin OU permissão 'problemas'.
--  * Responsável atribuído: pode mudar status/nota de resolução do que é dele
--    (trigger impede alterar qualquer outro campo).
--  * Excluir: admin (policy existente).

-- ------------------------------------------------------------------
-- 1) bug_reports — novos campos
-- ------------------------------------------------------------------
alter table public.bug_reports drop constraint if exists bug_reports_kind_check;
alter table public.bug_reports
  add constraint bug_reports_kind_check
  check (kind in ('bug', 'sugestao', 'problema', 'duvida'));

alter table public.bug_reports
  add column if not exists title text,
  add column if not exists area text,
  add column if not exists priority text not null default 'normal',
  add column if not exists status text not null default 'novo',
  add column if not exists assignee_id uuid references auth.users(id) on delete set null,
  add column if not exists assignee_name text,
  add column if not exists resolution_note text,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists resolved_by_name text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.bug_reports drop constraint if exists bug_reports_priority_check;
alter table public.bug_reports
  add constraint bug_reports_priority_check
  check (priority in ('baixa', 'normal', 'alta', 'critica'));
alter table public.bug_reports drop constraint if exists bug_reports_status_check;
alter table public.bug_reports
  add constraint bug_reports_status_check
  check (status in ('novo', 'em_analise', 'em_correcao', 'aguardando_info', 'resolvido', 'fechado'));
alter table public.bug_reports drop constraint if exists bug_reports_title_len;
alter table public.bug_reports
  add constraint bug_reports_title_len check (title is null or length(title) <= 200);

-- Backfill: resolvidos antigos viram status 'resolvido'.
update public.bug_reports set status = 'resolvido' where resolved and status = 'novo';
update public.bug_reports set updated_at = coalesce(resolved_at, created_at);

create index if not exists bug_reports_source_updated_idx
  on public.bug_reports (source, updated_at desc);
create index if not exists bug_reports_reporter_idx on public.bug_reports (reporter_id);

grant update on public.bug_reports to authenticated;

-- ------------------------------------------------------------------
-- 2) Helpers
-- ------------------------------------------------------------------
create or replace function public.can_manage_problems(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_internal_team_member(_user_id)
     and public.has_permission(_user_id, 'problemas');
$$;
revoke all on function public.can_manage_problems(uuid) from public;
revoke all on function public.can_manage_problems(uuid) from anon;
grant execute on function public.can_manage_problems(uuid) to authenticated;

create or replace function public.problem_actor_name(_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(p.full_name, '') from public.profiles p where p.id = _user_id),
    'Sistema'
  );
$$;
revoke all on function public.problem_actor_name(uuid) from public;
revoke all on function public.problem_actor_name(uuid) from anon;

-- ------------------------------------------------------------------
-- 3) RLS de bug_reports
-- ------------------------------------------------------------------
drop policy if exists "authenticated read bug reports" on public.bug_reports;
drop policy if exists "internal read bug reports" on public.bug_reports;
create policy "internal read bug reports" on public.bug_reports
  for select to authenticated
  using (public.is_internal_team_member(auth.uid()));

drop policy if exists "users insert own bug reports" on public.bug_reports;
create policy "users insert own bug reports" on public.bug_reports
  for insert to authenticated
  with check (auth.uid() = reporter_id and public.is_internal_team_member(auth.uid()));

drop policy if exists "managers or assignee update bug reports" on public.bug_reports;
create policy "managers or assignee update bug reports" on public.bug_reports
  for update to authenticated
  using (public.can_manage_problems(auth.uid()) or assignee_id = auth.uid())
  with check (public.can_manage_problems(auth.uid()) or assignee_id = auth.uid());

-- ------------------------------------------------------------------
-- 4) Triggers de bug_reports (ordem alfabética: a_guard, b_sync, c_events)
-- ------------------------------------------------------------------

-- 4a) Quem não gerencia (o responsável) só muda status e nota de resolução.
create or replace function public.bug_reports_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role / triggers internos (auth.uid() nulo) e quem gerencia: livre.
  if auth.uid() is null or public.can_manage_problems(auth.uid())
     or public.is_admin(auth.uid()) then
    return new;
  end if;
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.area is distinct from old.area
     or new.kind is distinct from old.kind
     or new.priority is distinct from old.priority
     or new.assignee_id is distinct from old.assignee_id
     or new.source is distinct from old.source
     or new.reporter_id is distinct from old.reporter_id then
    raise exception 'forbidden: only status can be changed by the assignee';
  end if;
  return new;
end;
$$;

drop trigger if exists bug_reports_a_guard on public.bug_reports;
create trigger bug_reports_a_guard
  before update on public.bug_reports
  for each row execute function public.bug_reports_guard();

-- 4b) status <-> resolved, quem resolveu, nome do responsável, updated_at.
create or replace function public.bug_reports_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.resolved and new.status = 'novo' then
      new.status := 'resolvido';
    end if;
    if new.assignee_id is not null then
      new.assignee_name := public.problem_actor_name(new.assignee_id);
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.status is distinct from old.status then
    new.resolved := new.status in ('resolvido', 'fechado');
  elsif new.resolved is distinct from old.resolved then
    -- Caminho legado (toggle do painel HypeApp): espelha no status.
    new.status := case when new.resolved then 'resolvido' else 'novo' end;
  end if;

  if new.resolved and not old.resolved then
    new.resolved_at := coalesce(new.resolved_at, now());
    if auth.uid() is not null then
      new.resolved_by := auth.uid();
      new.resolved_by_name := public.problem_actor_name(auth.uid());
    end if;
  elsif not new.resolved and old.resolved then
    new.resolved_at := null;
    new.resolved_by := null;
    new.resolved_by_name := null;
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    new.assignee_name := case
      when new.assignee_id is null then null
      else public.problem_actor_name(new.assignee_id)
    end;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bug_reports_b_sync on public.bug_reports;
create trigger bug_reports_b_sync
  before insert or update on public.bug_reports
  for each row execute function public.bug_reports_sync();

-- ------------------------------------------------------------------
-- 5) Histórico
-- ------------------------------------------------------------------
create table if not exists public.bug_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.bug_reports(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  event_type text not null
    check (event_type in ('created', 'status', 'priority', 'assignee', 'area', 'edit', 'comment', 'attachment')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bug_report_events_report_idx
  on public.bug_report_events (report_id, created_at);

alter table public.bug_report_events enable row level security;
revoke all on public.bug_report_events from anon;
revoke all on public.bug_report_events from authenticated;
grant select on public.bug_report_events to authenticated;
grant all on public.bug_report_events to service_role;

drop policy if exists "internal read problem events" on public.bug_report_events;
create policy "internal read problem events" on public.bug_report_events
  for select to authenticated
  using (public.is_internal_team_member(auth.uid()));

create or replace function public.log_problem_event(
  _report_id uuid, _type text, _data jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bug_report_events (report_id, actor_id, actor_name, event_type, data)
  values (
    _report_id,
    auth.uid(),
    case when auth.uid() is null then 'Sistema' else public.problem_actor_name(auth.uid()) end,
    _type,
    coalesce(_data, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.log_problem_event(uuid, text, jsonb) from public;
revoke all on function public.log_problem_event(uuid, text, jsonb) from anon;
revoke all on function public.log_problem_event(uuid, text, jsonb) from authenticated;

create or replace function public.bug_reports_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fields text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.log_problem_event(new.id, 'created',
      jsonb_build_object('kind', new.kind, 'priority', new.priority, 'area', new.area));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.log_problem_event(new.id, 'status',
      jsonb_build_object('from', old.status, 'to', new.status,
                         'note', case when new.resolved then new.resolution_note end));
  end if;
  if new.priority is distinct from old.priority then
    perform public.log_problem_event(new.id, 'priority',
      jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    perform public.log_problem_event(new.id, 'assignee',
      jsonb_build_object('from', old.assignee_name, 'to', new.assignee_name));
  end if;
  if new.area is distinct from old.area then
    perform public.log_problem_event(new.id, 'area',
      jsonb_build_object('from', old.area, 'to', new.area));
  end if;
  if new.title is distinct from old.title then v_fields := array_append(v_fields, 'titulo'); end if;
  if new.description is distinct from old.description then v_fields := array_append(v_fields, 'descricao'); end if;
  if new.kind is distinct from old.kind then v_fields := array_append(v_fields, 'tipo'); end if;
  if array_length(v_fields, 1) > 0 then
    perform public.log_problem_event(new.id, 'edit', jsonb_build_object('fields', v_fields));
  end if;
  return new;
end;
$$;

drop trigger if exists bug_reports_c_events on public.bug_reports;
create trigger bug_reports_c_events
  after insert or update on public.bug_reports
  for each row execute function public.bug_reports_events();

-- ------------------------------------------------------------------
-- 6) Comentários
-- ------------------------------------------------------------------
create table if not exists public.bug_report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.bug_reports(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default '',
  body text not null check (length(btrim(body)) > 0 and length(body) <= 10000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bug_report_comments_report_idx
  on public.bug_report_comments (report_id, created_at);

alter table public.bug_report_comments enable row level security;
revoke all on public.bug_report_comments from anon;
revoke all on public.bug_report_comments from authenticated;
grant select, insert, delete on public.bug_report_comments to authenticated;
grant all on public.bug_report_comments to service_role;

drop policy if exists "internal read problem comments" on public.bug_report_comments;
create policy "internal read problem comments" on public.bug_report_comments
  for select to authenticated
  using (
    public.is_internal_team_member(auth.uid())
    and (not is_internal or public.can_manage_problems(auth.uid()))
  );

drop policy if exists "internal insert problem comments" on public.bug_report_comments;
create policy "internal insert problem comments" on public.bug_report_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_internal_team_member(auth.uid())
    and (not is_internal or public.can_manage_problems(auth.uid()))
  );

drop policy if exists "author or admin delete problem comments" on public.bug_report_comments;
create policy "author or admin delete problem comments" on public.bug_report_comments
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()));

create or replace function public.bug_report_comments_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_name := public.problem_actor_name(new.author_id);
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists bug_report_comments_a_before on public.bug_report_comments;
create trigger bug_report_comments_a_before
  before insert on public.bug_report_comments
  for each row execute function public.bug_report_comments_before();

create or replace function public.bug_report_comments_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nota interna não gera evento (o histórico é visível a todo o time).
  if not new.is_internal then
    perform public.log_problem_event(new.report_id, 'comment', '{}'::jsonb);
  end if;
  update public.bug_reports set updated_at = now() where id = new.report_id;
  return new;
end;
$$;
drop trigger if exists bug_report_comments_b_after on public.bug_report_comments;
create trigger bug_report_comments_b_after
  after insert on public.bug_report_comments
  for each row execute function public.bug_report_comments_after();

-- ------------------------------------------------------------------
-- 7) Anexos
-- ------------------------------------------------------------------
create table if not exists public.bug_report_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.bug_reports(id) on delete cascade,
  comment_id uuid references public.bug_report_comments(id) on delete cascade,
  path text not null,
  name text not null check (length(name) <= 300),
  mime text,
  size_bytes bigint,
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists bug_report_attachments_report_idx
  on public.bug_report_attachments (report_id);

alter table public.bug_report_attachments enable row level security;
revoke all on public.bug_report_attachments from anon;
revoke all on public.bug_report_attachments from authenticated;
grant select, insert, delete on public.bug_report_attachments to authenticated;
grant all on public.bug_report_attachments to service_role;

drop policy if exists "internal read problem attachments" on public.bug_report_attachments;
create policy "internal read problem attachments" on public.bug_report_attachments
  for select to authenticated
  using (
    public.is_internal_team_member(auth.uid())
    and (
      comment_id is null
      or exists (
        select 1 from public.bug_report_comments c
        where c.id = comment_id
          and (not c.is_internal or public.can_manage_problems(auth.uid()))
      )
    )
  );

drop policy if exists "internal insert problem attachments" on public.bug_report_attachments;
create policy "internal insert problem attachments" on public.bug_report_attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.is_internal_team_member(auth.uid())
    and split_part(path, '/', 1) = auth.uid()::text
  );

drop policy if exists "uploader or admin delete problem attachments" on public.bug_report_attachments;
create policy "uploader or admin delete problem attachments" on public.bug_report_attachments
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_admin(auth.uid()));

create or replace function public.bug_report_attachments_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.comment_id is null or exists (
    select 1 from public.bug_report_comments c where c.id = new.comment_id and not c.is_internal
  ) then
    perform public.log_problem_event(new.report_id, 'attachment',
      jsonb_build_object('name', new.name));
  end if;
  update public.bug_reports set updated_at = now() where id = new.report_id;
  return new;
end;
$$;
drop trigger if exists bug_report_attachments_after on public.bug_report_attachments;
create trigger bug_report_attachments_after
  after insert on public.bug_report_attachments
  for each row execute function public.bug_report_attachments_after();

-- Storage: membros internos leem os arquivos do bucket (antes só admin);
-- cada um apaga o que enviou. Upload continua restrito à própria pasta.
drop policy if exists "internal read bug files" on storage.objects;
create policy "internal read bug files" on storage.objects
  for select to authenticated
  using (bucket_id = 'bug-reports' and public.is_internal_team_member(auth.uid()));
drop policy if exists "users delete own bug files" on storage.objects;
create policy "users delete own bug files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bug-reports' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------------
-- 8) Diagnóstico (metadados internos)
-- ------------------------------------------------------------------
create table if not exists public.bug_report_diagnostics (
  report_id uuid primary key references public.bug_reports(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.bug_report_diagnostics enable row level security;
revoke all on public.bug_report_diagnostics from anon;
revoke all on public.bug_report_diagnostics from authenticated;
grant select, insert on public.bug_report_diagnostics to authenticated;
grant all on public.bug_report_diagnostics to service_role;

drop policy if exists "reporter or manager read diagnostics" on public.bug_report_diagnostics;
create policy "reporter or manager read diagnostics" on public.bug_report_diagnostics
  for select to authenticated
  using (
    public.can_manage_problems(auth.uid())
    or exists (
      select 1 from public.bug_reports r
      where r.id = report_id and r.reporter_id = auth.uid()
    )
  );

drop policy if exists "reporter insert diagnostics" on public.bug_report_diagnostics;
create policy "reporter insert diagnostics" on public.bug_report_diagnostics
  for insert to authenticated
  with check (
    pg_column_size(data) <= 16384
    and exists (
      select 1 from public.bug_reports r
      where r.id = report_id and r.reporter_id = auth.uid()
    )
  );
