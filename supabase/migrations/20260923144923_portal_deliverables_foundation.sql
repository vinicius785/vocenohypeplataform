-- Fase 1 da reconstrução do Portal do Cliente: fundação de dados.
--
-- Hoje uma "entrega" vive só dentro de `campanha_influenciadores.data
-- -> 'entregas'[]` (um influenciador guarda um array de entregas dentro
-- do próprio JSONB) — não existe uma linha própria pra cada entrega, o
-- que impede: referenciar uma entrega de outro lugar com FK de verdade,
-- aplicar RLS por entrega, e guardar versões/decisões sem depender de
-- convenção de array (`EntregaAnexo.versao`) ou de um campo solto
-- (`clienteReprovacao`) que só cobre reprovação, nunca aprovação.
--
-- Esta migração é 100% aditiva: cria 3 tabelas novas e faz um BACKFILL
-- de cópia (nunca apaga/edita o JSONB original). Nada no app lê essas
-- tabelas ainda — elas só passam a existir, validadas, prontas pra virar
-- a fonte de leitura nas próximas rodadas (Fase 3 do plano do Portal).
--
-- `campanha_id`/`influenciador_id` aqui não são FK pra uma tabela
-- "campanhas" porque ela não existe — campanha é um objeto dentro do
-- JSONB de `clientes.data.campanhas[]` (mesma limitação documentada em
-- `user_can_access_campanha()`, migração 20260918160000). Já
-- `influenciador_id` referencia `campanha_influenciadores.id` de
-- verdade, porque essa tabela já existe e seu `id` é mantido igual ao
-- `data->>'id'` por trigger (ver migração
-- 20260922191000_sync_scoped_table_data_id.sql).

-- 1. campanha_entregas — uma linha por entrega (hoje: um item do array
--    `Influ.entregas[]`). `id` é preservado igual ao `Entrega.id`
--    original, pra qualquer referência existente (`InfluActivity.entregaId`,
--    `InfluActivityEvent.entregaId`) continuar batendo depois do backfill.
create table public.campanha_entregas (
  id uuid primary key,
  campanha_id uuid not null,
  influenciador_id uuid not null references public.campanha_influenciadores(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create index campanha_entregas_campanha_id_idx on public.campanha_entregas(campanha_id);
create index campanha_entregas_influenciador_id_idx on public.campanha_entregas(influenciador_id);

comment on table public.campanha_entregas is
  'Fase 1 do Portal do Cliente: espelho normalizado de Influ.entregas[]. Fonte de verdade continua sendo campanha_influenciadores até a leitura ser migrada (Fase 3) — nenhum app code lê esta tabela ainda.';

-- 2. campanha_entrega_versoes — cada envio novo vira uma linha própria,
--    IMUTÁVEL (sem policy de UPDATE/DELETE pra usuário autenticado —
--    só INSERT/SELECT). Backfill inicial: cada `EntregaAnexo` existente
--    vira uma versão (já é append-only por categoria+versao, então não
--    há perda nem reordenação de histórico).
create table public.campanha_entrega_versoes (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.campanha_entregas(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index campanha_entrega_versoes_entrega_id_idx on public.campanha_entrega_versoes(entrega_id);

comment on table public.campanha_entrega_versoes is
  'Fase 1 do Portal do Cliente: uma linha imutável por versão de entrega enviada. Backfill inicial copiado de EntregaAnexo (categoria+versao); envios futuros devem gravar aqui em vez de só no array de anexos.';

-- 3. campanha_entrega_eventos — histórico/decisões (aprovação, ajuste,
--    reabertura, etc.), também IMUTÁVEL. Backfill inicial copiado de
--    `Influ.activityEvents[]` filtrado por entregaId — o campo já é
--    tipado e append-only na aplicação hoje (ver InfluActivityEvent em
--    InfluencerBoard.tsx), então o backfill é uma cópia sem perda,
--    nunca uma inferência.
create table public.campanha_entrega_eventos (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.campanha_entregas(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index campanha_entrega_eventos_entrega_id_idx on public.campanha_entrega_eventos(entrega_id);

comment on table public.campanha_entrega_eventos is
  'Fase 1 do Portal do Cliente: log de decisões/eventos por entrega (aprovação, ajuste, reabertura). Nunca UPDATE/DELETE por usuário — sempre um INSERT novo, mesmo espírito de InfluActivityEvent (nunca sobrescreve).';

-- RLS — mesmo padrão já usado em campanha_influenciadores: time via
-- has_permission('campanhas'), cliente (Portal) só leitura via
-- user_can_access_campanha(). Nenhuma policy de escrita pra
-- authenticated nas tabelas de versão/evento (imutáveis por design) —
-- escrita, quando existir, será só via função de servidor
-- (supabaseAdmin), mesmo padrão já documentado pra outras mutações do
-- portal ("dedicated server functions in phase 2, not raw RLS UPDATE").

alter table public.campanha_entregas enable row level security;
alter table public.campanha_entrega_versoes enable row level security;
alter table public.campanha_entrega_eventos enable row level security;

create policy "campanhas read campanha_entregas" on public.campanha_entregas
  for select to authenticated
  using (public.has_permission(auth.uid(), 'campanhas'));
create policy "campanhas insert campanha_entregas" on public.campanha_entregas
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'campanhas'));
create policy "campanhas update campanha_entregas" on public.campanha_entregas
  for update to authenticated
  using (public.has_permission(auth.uid(), 'campanhas'))
  with check (public.has_permission(auth.uid(), 'campanhas'));
create policy "campanhas delete campanha_entregas" on public.campanha_entregas
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'campanhas'));
create policy "org members read own campanha_entregas" on public.campanha_entregas
  for select to authenticated
  using (public.user_can_access_campanha(auth.uid(), campanha_id));

create policy "campanhas read campanha_entrega_versoes" on public.campanha_entrega_versoes
  for select to authenticated
  using (public.has_permission(auth.uid(), 'campanhas'));
create policy "campanhas insert campanha_entrega_versoes" on public.campanha_entrega_versoes
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'campanhas'));
create policy "org members read own campanha_entrega_versoes" on public.campanha_entrega_versoes
  for select to authenticated
  using (
    exists (
      select 1 from public.campanha_entregas e
      where e.id = campanha_entrega_versoes.entrega_id
        and public.user_can_access_campanha(auth.uid(), e.campanha_id)
    )
  );

create policy "campanhas read campanha_entrega_eventos" on public.campanha_entrega_eventos
  for select to authenticated
  using (public.has_permission(auth.uid(), 'campanhas'));
create policy "campanhas insert campanha_entrega_eventos" on public.campanha_entrega_eventos
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'campanhas'));
create policy "org members read own campanha_entrega_eventos" on public.campanha_entrega_eventos
  for select to authenticated
  using (
    exists (
      select 1 from public.campanha_entregas e
      where e.id = campanha_entrega_eventos.entrega_id
        and public.user_can_access_campanha(auth.uid(), e.campanha_id)
    )
  );

-- Realtime (mesmo padrão de projeto_tarefas/campanha_influenciadores).
alter table public.campanha_entregas replica identity full;
alter publication supabase_realtime add table public.campanha_entregas;

-- ============================================================
-- BACKFILL — cópia, nunca move nem apaga o JSONB original.
-- ============================================================

-- 4. Entregas: um INSERT por item de Influ.entregas[]. `id` da entrega
--    é usado como PK aqui de propósito (ver comentário da tabela).
insert into public.campanha_entregas (id, campanha_id, influenciador_id, data, created_at, updated_at, updated_by)
select
  (entrega.value->>'id')::uuid,
  ci.campanha_id,
  ci.id,
  entrega.value,
  coalesce(ci.created_at, now()),
  coalesce(ci.updated_at, now()),
  ci.updated_by
from public.campanha_influenciadores ci,
     jsonb_array_elements(coalesce(ci.data->'entregas', '[]'::jsonb)) as entrega(value)
where entrega.value ? 'id'
on conflict (id) do nothing;

-- 5. Versões: um INSERT por anexo de cada entrega (`EntregaAnexo`),
--    ordenado por categoria+versão pra o `created_at` refletir a ordem
--    real quando o anexo antigo não tinha `criadoEm` (pré-versionamento).
insert into public.campanha_entrega_versoes (entrega_id, data, created_at)
select
  (entrega.value->>'id')::uuid,
  anexo.value,
  coalesce((anexo.value->>'criadoEm')::timestamptz, ci.created_at, now())
from public.campanha_influenciadores ci,
     jsonb_array_elements(coalesce(ci.data->'entregas', '[]'::jsonb)) as entrega(value),
     jsonb_array_elements(coalesce(entrega.value->'anexos', '[]'::jsonb)) as anexo(value)
where entrega.value ? 'id'
  and exists (select 1 from public.campanha_entregas e where e.id = (entrega.value->>'id')::uuid);

-- 6. Eventos: um INSERT por item de Influ.activityEvents[] que já
--    referencia uma entrega (eventos sem entregaId são do perfil como um
--    todo, não de uma entrega específica — ficam de fora desta tabela
--    de propósito, continuam só em Influ.activityEvents).
insert into public.campanha_entrega_eventos (entrega_id, data, created_at)
select
  (evento.value->>'entregaId')::uuid,
  evento.value,
  coalesce((evento.value->>'createdAt')::timestamptz, ci.created_at, now())
from public.campanha_influenciadores ci,
     jsonb_array_elements(coalesce(ci.data->'activityEvents', '[]'::jsonb)) as evento(value)
where evento.value ? 'entregaId'
  and evento.value->>'entregaId' is not null
  and exists (
    select 1 from public.campanha_entregas e
    where e.id = (evento.value->>'entregaId')::uuid
  );
