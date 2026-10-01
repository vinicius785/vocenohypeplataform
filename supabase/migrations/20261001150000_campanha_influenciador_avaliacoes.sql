-- Avaliação MANUAL do time sobre um influenciador, presa à PARTICIPAÇÃO
-- numa campanha específica (campanha_influenciadores.id — o mesmo id que
-- campanha_nps_influenciador.influenciador_id já usa como FK), nunca ao
-- cadastro global (banco_influenciadores). Substitui o antigo score
-- automático de "confiabilidade" (calculado on-the-fly a partir de atraso
-- de entregas, nunca armazenado — ver computeReliability em
-- InfluencerBoard.tsx) por uma nota dada por uma pessoa de verdade, com
-- auditoria de quem/quando.
--
-- Diferente de campanha_nps_influenciador: esta tabela NUNCA é pública —
-- só o time interno lê/escreve (via requireSupabaseAuth + permissão
-- 'influenciadores'), nunca por token.

create table public.campanha_influenciador_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  campanha_influenciador_id uuid not null references public.campanha_influenciadores(id) on delete cascade,
  campanha_id uuid not null, -- denormalizado, mesmo padrão de campanha_nps_influenciador
  cumprimento_combinados smallint not null check (cumprimento_combinados between 1 and 5),
  comunicacao smallint not null check (comunicacao between 1 and 5),
  qualidade_entregas smallint not null check (qualidade_entregas between 1 and 5),
  aderencia_briefing smallint not null check (aderencia_briefing between 1 and 5),
  organizacao_profissionalismo smallint not null check (organizacao_profissionalismo between 1 and 5),
  observacao text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (campanha_influenciador_id)
);

create index campanha_influenciador_avaliacoes_campanha_id_idx
  on public.campanha_influenciador_avaliacoes (campanha_id);

create trigger campanha_influenciador_avaliacoes_updated_at
  before update on public.campanha_influenciador_avaliacoes
  for each row execute function public.update_updated_at_column();

alter table public.campanha_influenciador_avaliacoes enable row level security;

-- Só o time interno com permissão 'influenciadores' (ou admin) — nunca
-- pública. Leitura e escrita com a mesma regra (diferente de
-- campanha_nps_influenciador, que restringe escrita a admin-only porque lá
-- a escrita real acontece via token/supabaseAdmin; aqui é o próprio time
-- autenticado gravando direto).
create policy "influenciadores read campanha_influenciador_avaliacoes"
  on public.campanha_influenciador_avaliacoes for select
  to authenticated
  using (
    public.has_permission(auth.uid(), 'influenciadores')
    or public.is_admin(auth.uid())
  );

create policy "influenciadores insert campanha_influenciador_avaliacoes"
  on public.campanha_influenciador_avaliacoes for insert
  to authenticated
  with check (
    (public.has_permission(auth.uid(), 'influenciadores') or public.is_admin(auth.uid()))
    and created_by = auth.uid()
  );

create policy "influenciadores update campanha_influenciador_avaliacoes"
  on public.campanha_influenciador_avaliacoes for update
  to authenticated
  using (
    public.has_permission(auth.uid(), 'influenciadores')
    or public.is_admin(auth.uid())
  )
  with check (
    (public.has_permission(auth.uid(), 'influenciadores') or public.is_admin(auth.uid()))
    and updated_by = auth.uid()
  );

create policy "influenciadores delete campanha_influenciador_avaliacoes"
  on public.campanha_influenciador_avaliacoes for delete
  to authenticated
  using (
    public.has_permission(auth.uid(), 'influenciadores')
    or public.is_admin(auth.uid())
  );
