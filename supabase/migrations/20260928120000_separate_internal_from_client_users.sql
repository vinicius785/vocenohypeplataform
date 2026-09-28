-- Corrige a mistura entre usuários internos (equipe) e usuários do Portal
-- do Cliente. Causa raiz: `profiles`/`user_roles` são criados de forma
-- IDÊNTICA pro trigger `handle_new_user()`, tanto pra um funcionário quanto
-- pra um cliente convidado (`inviteClientUserCore` cria a conta via
-- `auth.admin.createUser`, que dispara o mesmo trigger) — não existe coluna
-- alguma em `profiles`/`user_roles` que diga "isto é interno" ou "isto é
-- cliente". A única fonte real dessa distinção é `organization_members` +
-- `organizations.type` ('internal' | 'client'), que quase nada no código
-- consultava até aqui.
--
-- `getTeamDirectory()` (team.functions.ts) fazia um SELECT sem filtro em
-- `profiles` — essa é a fonte ÚNICA que alimenta a aba Time, o Chat
-- (`localStorage["time:membros"]`) e, por tabela, score/performance. Uma
-- conta de cliente aparecia em todos esses lugares simultaneamente porque
-- é o mesmo cache raiz, não bugs separados.
--
-- Esta migration cria a fonte única reutilizável (`is_internal_team_member`)
-- e fecha os pontos de RLS que hoje expõem dado interno pra qualquer
-- `authenticated` (inclusive cliente): `profiles` (USING (true) puro),
-- `chat_channels`/`chat_messages` (canais "públicos" e canais sintéticos de
-- campanha/projeto, sem linha própria em `chat_channels`, eram legíveis por
-- qualquer autenticado), `chat_status`/`chat_reads`/`chat_deliveries`
-- (presença/recibo sem nenhum escopo), e `performance_events` (o INSERT já
-- exigia `actor_id = auth.uid()`, mas não validava que `person_id` fosse
-- alguém do time — um cliente mandando o próprio id manualmente teria
-- pontuação gravada).

-- ============================================================
-- Fonte única de verdade
-- ============================================================
create or replace function public.is_internal_team_member(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.user_id = _user_id
      and om.status = 'active'
      and o.status = 'active'
      and o.type = 'internal'
  );
$$;
revoke all on function public.is_internal_team_member(uuid) from public;
revoke all on function public.is_internal_team_member(uuid) from anon;
grant execute on function public.is_internal_team_member(uuid) to authenticated;

-- ============================================================
-- profiles: parava de existir qualquer escopo desde
-- 20260722162032_...sql ("authenticated read all profiles" USING (true)) —
-- qualquer autenticado, cliente incluso, lia todas as colunas de todos os
-- perfis. Agora: o próprio perfil, sempre; perfil de outro membro INTERNO,
-- só se quem pergunta também for interno; qualquer perfil, se quem
-- pergunta for admin.
-- ============================================================
drop policy if exists "authenticated read all profiles" on public.profiles;
create policy "profiles visible by context" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin(auth.uid())
    or (public.is_internal_team_member(auth.uid()) and public.is_internal_team_member(profiles.id))
  );

-- ============================================================
-- chat_channels: "canal público" (is_private = false) era literalmente
-- público pra QUALQUER autenticado, não só pro time — um cliente listava
-- todo canal não-privado.
-- ============================================================
drop policy if exists "authenticated read channels" on public.chat_channels;
create policy "authenticated read channels" on public.chat_channels
  for select to authenticated
  using (
    public.is_internal_team_member(auth.uid())
    and ((is_private = false) or (auth.uid() = any (allowed_member_ids)) or is_admin(auth.uid()))
  );

drop policy if exists "authenticated create channels" on public.chat_channels;
create policy "authenticated create channels" on public.chat_channels
  for insert to authenticated
  with check (public.is_internal_team_member(auth.uid()));

-- ============================================================
-- chat_messages: canais sintéticos de campanha/projeto (`camp:<id>`/
-- `proj:<id>`) não têm linha em `chat_channels` — a policy antiga liberava
-- leitura quando NENHUM canal correspondia, ou seja, qualquer autenticado
-- lia TODA mensagem de TODA campanha/projeto. Canais "públicos" de verdade
-- tinham o mesmo problema que em `chat_channels` acima. DMs continuam
-- exatamente como antes (só quem faz parte do par, sempre foi assim,
-- nunca foi o vetor do vazamento) — preserva dados e comportamento
-- existentes, only o lado de canal/campanha/projeto exige ser do time.
-- ============================================================
drop policy if exists "authenticated read messages" on public.chat_messages;
create policy "authenticated read messages" on public.chat_messages
  for select to authenticated
  using (
    (convo_id like 'dm:%' and position(auth.uid()::text in convo_id) > 0)
    or (
      convo_id not like 'dm:%'
      and public.is_internal_team_member(auth.uid())
      and (
        not exists (select 1 from public.chat_channels cc where cc.id::text = chat_messages.convo_id)
        or exists (
          select 1 from public.chat_channels cc
          where cc.id::text = chat_messages.convo_id
            and (cc.is_private = false or auth.uid() = any (cc.allowed_member_ids) or is_admin(auth.uid()))
        )
      )
    )
  );

drop policy if exists "authenticated insert own messages" on public.chat_messages;
create policy "authenticated insert own messages" on public.chat_messages
  for insert to authenticated
  with check (
    (author_id = auth.uid() or author_id is null)
    and (convo_id like 'dm:%' or public.is_internal_team_member(auth.uid()))
  );

-- ============================================================
-- Presença/recibos internos — sem escopo nenhum hoje ("true" pra
-- qualquer autenticado). Só o time efetivamente escreve aqui (o Portal do
-- Cliente nunca chama heartbeat()/markRead() do chat interno), mas a
-- LEITURA ficava aberta pra qualquer um mesmo assim.
-- ============================================================
drop policy if exists "authenticated read status" on public.chat_status;
create policy "authenticated read status" on public.chat_status
  for select to authenticated
  using (public.is_internal_team_member(auth.uid()));

drop policy if exists "authenticated read all reads" on public.chat_reads;
create policy "authenticated read all reads" on public.chat_reads
  for select to authenticated
  using (public.is_internal_team_member(auth.uid()));

drop policy if exists "authenticated read all deliveries" on public.chat_deliveries;
create policy "authenticated read all deliveries" on public.chat_deliveries
  for select to authenticated
  using (public.is_internal_team_member(auth.uid()));

-- ============================================================
-- performance_events: o INSERT já exigia `actor_id = auth.uid()` (não dá
-- pra registrar evento em nome de outro ator), mas não validava
-- `person_id` — um cliente (ou alguém chamando a API direto) podia gravar
-- pontuação pra qualquer id, inclusive o próprio. Score é conceito só de
-- time interno: sem isso, "score: não aplicável" pra cliente dependia
-- só da tela nunca mandar esse id, não de uma garantia real.
-- ============================================================
drop policy if exists "users insert own performance events" on public.performance_events;
create policy "users insert own internal performance events" on public.performance_events
  for insert to authenticated
  with check (auth.uid() = actor_id and public.is_internal_team_member(person_id));
