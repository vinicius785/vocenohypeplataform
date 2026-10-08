-- Fase 3 — persistência do contrato de influenciador (assinatura eletrônica).
-- Auditoria: a participação é `campanha_influenciadores` (pk uuid real); não existia tabela de
-- contrato de influenciador, de signatários nem de eventos de provedor (`contratos` é o contrato
-- comercial do CLIENTE, outra entidade). Três tabelas novas:
--   contratos_influenciador              1 linha por contrato enviado
--   contratos_influenciador_signatarios  os DOIS signatários esperados (CONTRATADO/CONTRATANTE)
--   contratos_influenciador_eventos      eventos recebidos do provedor (idempotência + auditoria)
-- Escrita SÓ via service_role (server functions/webhook). `authenticated` apenas LÊ.
-- Nenhum token, link de assinatura ou payload bruto é guardado.
-- Estados: aguardando | parcial | assinado | recusado | cancelado. "Ainda não enviado ao
-- provedor" = sent_at e external_id nulos (linha criada antes da chamada, para reconciliar órfãos).

create table if not exists public.contratos_influenciador (
  id uuid primary key default gen_random_uuid(),
  participacao_id uuid not null references public.campanha_influenciadores(id) on delete restrict,
  provider text not null default 'autentique',
  external_id text,
  status text not null default 'aguardando'
    check (status in ('aguardando', 'parcial', 'assinado', 'recusado', 'cancelado')),
  sent_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No máximo um contrato "vivo" por participação; recusado/cancelado liberam para um novo.
create unique index if not exists contratos_influenciador_um_ativo_idx
  on public.contratos_influenciador (participacao_id)
  where status in ('aguardando', 'parcial', 'assinado');

create unique index if not exists contratos_influenciador_external_idx
  on public.contratos_influenciador (provider, external_id)
  where external_id is not null;

create table if not exists public.contratos_influenciador_signatarios (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos_influenciador(id) on delete cascade,
  papel text not null check (papel in ('CONTRATADO', 'CONTRATANTE')),
  nome text not null,
  email text not null,
  email_normalizado text not null,
  external_id text,
  status text not null default 'aguardando'
    check (status in ('aguardando', 'assinado', 'recusado')),
  viewed_at timestamptz,
  signed_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contrato_id, papel),
  unique (contrato_id, email_normalizado)
);

create table if not exists public.contratos_influenciador_eventos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid references public.contratos_influenciador(id) on delete set null,
  provider text not null default 'autentique',
  event_id text not null,
  tipo text not null,
  external_document_id text,
  external_signature_id text,
  -- só campos mínimos já extraídos (tipo, ids, data do evento); nunca o corpo cru
  payload jsonb not null default '{}'::jsonb,
  recebido_at timestamptz not null default now(),
  processado_at timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists contratos_influenciador_eventos_contrato_idx
  on public.contratos_influenciador_eventos (contrato_id);

create or replace function public.contratos_influenciador_set_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists contratos_influenciador_updated_at on public.contratos_influenciador;
create trigger contratos_influenciador_updated_at
  before update on public.contratos_influenciador
  for each row execute function public.contratos_influenciador_set_updated_at();

drop trigger if exists contratos_influenciador_sig_updated_at
  on public.contratos_influenciador_signatarios;
create trigger contratos_influenciador_sig_updated_at
  before update on public.contratos_influenciador_signatarios
  for each row execute function public.contratos_influenciador_set_updated_at();

alter table public.contratos_influenciador enable row level security;
alter table public.contratos_influenciador_signatarios enable row level security;
alter table public.contratos_influenciador_eventos enable row level security;

-- Leitura: equipe interna com a permissão de Campanhas (conta de cliente do portal NÃO passa,
-- pois exige is_internal_team_member). Sem policy de escrita: só service_role (bypassa RLS).
create policy "campanhas read contratos_influenciador" on public.contratos_influenciador
  for select to authenticated
  using (
    public.is_admin(auth.uid())
    or (public.is_internal_team_member(auth.uid()) and public.has_permission(auth.uid(), 'campanhas'))
  );
create policy "campanhas read contratos_influenciador_signatarios"
  on public.contratos_influenciador_signatarios
  for select to authenticated
  using (
    public.is_admin(auth.uid())
    or (public.is_internal_team_member(auth.uid()) and public.has_permission(auth.uid(), 'campanhas'))
  );
create policy "admin read contratos_influenciador_eventos"
  on public.contratos_influenciador_eventos
  for select to authenticated
  using (public.is_admin(auth.uid()));

revoke all on public.contratos_influenciador, public.contratos_influenciador_signatarios,
  public.contratos_influenciador_eventos from anon, authenticated;
grant select on public.contratos_influenciador, public.contratos_influenciador_signatarios,
  public.contratos_influenciador_eventos to authenticated;
grant all on public.contratos_influenciador, public.contratos_influenciador_signatarios,
  public.contratos_influenciador_eventos to service_role;
