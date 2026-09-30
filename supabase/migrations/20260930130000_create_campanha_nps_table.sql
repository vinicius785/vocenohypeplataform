-- NPS mensal obrigatório do Portal do Cliente. Diferente do NPS por
-- relatório já existente (`campanha.relatoriosMensais[].nps`, JSONB,
-- opcional, atrelado a um PDF específico) — este é um gate mensal por
-- CAMPANHA, não por relatório: uma linha por (campanha, mês), nunca por
-- usuário que respondeu (o usuário é só auditoria em `answered_by`).
--
-- Tabela própria (não JSONB dentro de `clientes.data`) porque a regra de
-- negócio central é justamente uma consulta cross-cutting — "quais
-- campanhas de QUALQUER cliente ainda não têm resposta neste mês" — e
-- precisa de uma constraint de unicidade real (`campanha_id`,
-- `reference_month`) pra resolver concorrência (dois usuários do mesmo
-- cliente respondendo ao mesmo tempo) sem lógica de aplicação: mesmo
-- padrão de justificativa já usado por `contratos`
-- (20260930100000_create_contratos_table.sql).
--
-- `campanha_id text` sem FK: campanhas não têm linha própria (vivem em
-- `clientes.data.campanhas[]`), mesmo padrão de
-- `contratos.campanha_ids`/`campanha_tarefas.campanha_id`.

create table if not exists public.campanha_nps (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  campanha_id text not null,
  reference_month text not null
    check (reference_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  score smallint not null check (score >= 0 and score <= 10),
  comment text,
  answered_by uuid,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campanha_id, reference_month)
);

create index if not exists campanha_nps_cliente_id_idx on public.campanha_nps(cliente_id);
create index if not exists campanha_nps_campanha_id_idx on public.campanha_nps(campanha_id);
create index if not exists campanha_nps_reference_month_idx on public.campanha_nps(reference_month);

create or replace function public.campanha_nps_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists campanha_nps_updated_at on public.campanha_nps;
create trigger campanha_nps_updated_at
  before update on public.campanha_nps
  for each row execute function public.campanha_nps_set_updated_at();

alter table public.campanha_nps enable row level security;

-- Escritas do Portal do Cliente passam por `supabaseAdmin` (service role,
-- ignora RLS) a partir de server functions com suas próprias checagens de
-- sessão/organização — mesmo padrão de `submitRelatorioNpsSession`
-- (portal-auth.functions.ts). As policies abaixo cobrem só o time interno
-- (Supabase Auth + permissões), pra futura tela de backoffice (item 16 do
-- pedido) — nenhuma escrita do time interno é esperada hoje, por isso só
-- leitura é liberada; insert/update/delete ficam admin-only por segurança.
create policy "clientes/campanhas read campanha_nps"
  on public.campanha_nps for select
  to authenticated
  using (public.has_permission(auth.uid(), 'clientes') or public.has_permission(auth.uid(), 'campanhas') or public.is_admin(auth.uid()));

create policy "admin write campanha_nps"
  on public.campanha_nps for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "admin update campanha_nps"
  on public.campanha_nps for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "admin delete campanha_nps"
  on public.campanha_nps for delete
  to authenticated
  using (public.is_admin(auth.uid()));
