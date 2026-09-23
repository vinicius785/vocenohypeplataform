-- Fase 2 da reconstrução de Reuniões: a policy de SELECT em `reunioes`
-- (20260729190000_permission_scoped_rls.sql) só checava a permissão
-- 'reunioes' — qualquer pessoa com essa permissão via RLS lia TODAS as
-- linhas da tabela pelo cliente Supabase direto, sem nenhuma checagem de
-- dono/participante. O front-end já filtra pra "só minhas reuniões"
-- (`ReunioesSection.tsx`), mas isso é só UX: a query real ao Supabase
-- sempre trouxe a tabela inteira pro navegador de qualquer pessoa
-- autenticada com a permissão, incluindo eventos PESSOAIS importados do
-- Google Calendar de outras contas (`origem = 'google'`) — exatamente o
-- que não deveria "aparecer pra todo o workspace só porque foi importado".
--
-- Restringe SELECT de linhas `origem = 'google'` a: quem as criou
-- (dono da conexão Google que importou), quem está em `participanteIds`
-- (convidado de verdade num evento compartilhado), ou admin. Reuniões da
-- própria plataforma (`origem` ausente/diferente de 'google') continuam
-- com o comportamento anterior — `TimeSection.tsx` usa `loadMeetings()`
-- pra resolver título de reunião no ledger de performance do time
-- (`meetingsById`), cruzando reuniões de qualquer criador; travar isso
-- também quebraria esse relatório sem necessidade, já que o problema
-- descrito é especificamente sobre agenda PESSOAL importada do Google.
drop policy if exists "reunioes read reunioes" on public.reunioes;
create policy "reunioes read reunioes" on public.reunioes
  for select to authenticated
  using (
    public.has_permission(auth.uid(), 'reunioes')
    and (
      data->>'origem' is distinct from 'google'
      or data->>'criadorId' = auth.uid()::text
      or data->'participanteIds' ? auth.uid()::text
      or public.is_admin(auth.uid())
    )
  );
