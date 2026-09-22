-- Root-cause fix for the "duplicate influencer card" bug class in
-- `campanha_influenciadores` (production incident, campanha
-- 9768e6e2-add3-4348-b9c1-28db129c957f): confirmed with live data that 17
-- of 125 rows had `id::text != (data->>'id')` — a stale/never-fixed-up
-- mismatch between the row's real primary key and the `Influ.id` baked
-- into its own JSONB payload.
--
-- Why this causes exact duplicates: every edit in `InfluencerBoard.tsx`
-- flows through `createScopedArrayStore.set()`
-- (`src/lib/scoped-table-store.ts`), which does
-- `.upsert({ id: item.id, <parentColumn>, data: item })` — i.e. it upserts
-- BY `data.id`, trusting it already matches the row's real `id` column.
-- For a mismatched row, that upsert's `id` doesn't match any existing
-- row's real `id`, so Postgres INSERTs a brand-new row instead of
-- UPDATEn the existing one — the original row is orphaned untouched
-- forever (same `created_at`/`updated_at`), and the new self-consistent
-- row carries the edit forward. Two rows for the same person, one frozen
-- in time, one live — exactly the reported "Allan Neumann Vaz" / "allan
-- vaz" duplicate.
--
-- `submitInscricaoCampanha` (`src/lib/inscricao-campanha.functions.ts`)
-- already inserts with `id: influ.id` matching `data.id` correctly — this
-- mismatch was a legacy artifact from before that insert path was
-- consistent. The 12 currently-mismatched-but-not-yet-forked rows were
-- corrected once, out-of-band (`data.id` set to equal the row's real
-- `id`), by hand via `execute_sql` — NOT part of this migration, since a
-- migration should not embed a one-time data fixup tied to a specific
-- production incident's row ids. This migration is the durable, general
-- fix: it makes the row's own primary key the single source of truth for
-- identity going forward, for ALL tables sharing this `{id, parent_id,
-- data jsonb}` shape (the full `ScopedTable` union in
-- `src/lib/scoped-table-store.ts`) — so no future insert/update, from any
-- code path, present or future, can ever re-introduce this mismatch.

create or replace function public.sync_scoped_table_data_id()
returns trigger
language plpgsql
as $$
begin
  new.data = jsonb_set(coalesce(new.data, '{}'::jsonb), '{id}', to_jsonb(new.id::text));
  return new;
end;
$$;

comment on function public.sync_scoped_table_data_id() is
  'Keeps data->>''id'' equal to the row''s real id column on every insert/update, for every {id, parent_id, data jsonb} scoped table (see ScopedTable in src/lib/scoped-table-store.ts). Prevents the id-mismatch bug class that caused duplicate campanha_influenciadores rows (see this migration''s header comment) from ever recurring, regardless of what any insert/update path passes as data.id.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'campanha_influenciadores',
    'campanha_tarefas',
    'campanha_documentos',
    'campanha_cronograma',
    'projeto_influenciadores',
    'projeto_tarefas',
    'projeto_fases'
  ]
  loop
    execute format(
      'drop trigger if exists sync_data_id_trigger on public.%I;
       create trigger sync_data_id_trigger
         before insert or update of id, data on public.%I
         for each row execute function public.sync_scoped_table_data_id();',
      t, t
    );
  end loop;
end $$;
