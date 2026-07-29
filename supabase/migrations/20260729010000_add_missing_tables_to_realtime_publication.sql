-- clientes, projetos, reunioes, leads e profiles nunca foram adicionados à
-- publicação supabase_realtime — por isso as subscriptions client-side
-- (table-array-store.subscribeRealtime, etc.) nunca recebiam eventos e só
-- viam dados novos após um reload completo (que reexecuta o beforeLoad e
-- busca tudo do zero).
alter publication supabase_realtime add table public.clientes;
alter publication supabase_realtime add table public.projetos;
alter publication supabase_realtime add table public.reunioes;
alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.profiles;
