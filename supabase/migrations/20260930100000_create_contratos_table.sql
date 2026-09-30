-- Reconstrução do domínio Comercial/Clientes/Campanhas/Contratos/Financeiro
-- — Fase "Contratos" (item 14 do pedido). Entidade greenfield: nenhuma
-- tabela/tipo de contrato existia antes (confirmado em auditoria — o único
-- parente era o campo de briefing da campanha, texto livre sem status/
-- vigência). Diferente de `clientes`/campanhas (que vivem em JSONB),
-- contrato é modelado como TABELA PRÓPRIA com colunas discretas: os campos
-- pedidos (vigência, valor, status) são consultados/filtrados o bastante
-- (ex: "contratos próximos do vencimento" no item 19) pra justificar
-- colunas reais em vez de mais um blob JSONB.
--
-- `campanha_ids text[]`: campanhas não têm linha própria (vivem dentro de
-- `clientes.data.campanhas[]`), então não há FK possível — é só uma lista
-- de ids de campanha (validada na aplicação, não no banco), igual ao
-- padrão já usado por `campanha_influenciadores.campanha_id` (texto livre,
-- sem FK, documentado nesse mesmo formato alhures no projeto).

create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null,
  tipo text,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'em_assinatura', 'vigente', 'encerrado', 'cancelado')),
  vigencia_inicio date,
  vigencia_fim date,
  data_assinatura date,
  valor numeric,
  arquivo_url text,
  campanha_ids text[] not null default '{}',
  responsavel_interno text,
  observacoes text,
  renovacao text,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contratos_cliente_id_idx on public.contratos(cliente_id);

create or replace function public.contratos_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists contratos_updated_at on public.contratos;
create trigger contratos_updated_at
  before update on public.contratos
  for each row execute function public.contratos_set_updated_at();

alter table public.contratos enable row level security;

-- Mesma limitação já documentada para `clientes`/`campanhas` (uma linha de
-- contrato pertence a um cliente, então quem edita campanha do cliente
-- também precisa poder ver/gerenciar seus contratos) — gated por
-- has_permission('clientes') OR has_permission('contratos'), igual ao
-- padrão de `has_permission('clientes') OR has_permission('campanhas')`
-- já usado na policy de `clientes`.
create policy "clientes/contratos read contratos"
  on public.contratos for select
  to authenticated
  using (public.has_permission(auth.uid(), 'clientes') or public.has_permission(auth.uid(), 'contratos') or public.is_admin(auth.uid()));

create policy "clientes/contratos insert contratos"
  on public.contratos for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'clientes') or public.has_permission(auth.uid(), 'contratos') or public.is_admin(auth.uid()));

create policy "clientes/contratos update contratos"
  on public.contratos for update
  to authenticated
  using (public.has_permission(auth.uid(), 'clientes') or public.has_permission(auth.uid(), 'contratos') or public.is_admin(auth.uid()))
  with check (public.has_permission(auth.uid(), 'clientes') or public.has_permission(auth.uid(), 'contratos') or public.is_admin(auth.uid()));

create policy "clientes/contratos delete contratos"
  on public.contratos for delete
  to authenticated
  using (public.is_admin(auth.uid()));
