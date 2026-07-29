-- Mesma causa raiz encontrada antes com clientes/projetos/reunioes/leads/profiles:
-- essas tabelas nunca foram adicionadas à publicação supabase_realtime, então
-- as subscriptions client-side (createScopedArrayStore/createTableArrayStore
-- .subscribeRealtime()) nunca recebiam eventos — atividade/comentários de
-- influenciador, tarefas e documentos de campanha, financeiro e marketing
-- só apareciam depois de um reload completo.
alter publication supabase_realtime add table public.campanha_influenciadores;
alter publication supabase_realtime add table public.projeto_influenciadores;
alter publication supabase_realtime add table public.campanha_tarefas;
alter publication supabase_realtime add table public.campanha_documentos;
alter publication supabase_realtime add table public.financeiro_lancamentos;
alter publication supabase_realtime add table public.banco_influenciadores;
alter publication supabase_realtime add table public.marketing_tasks;
