-- Sem REPLICA IDENTITY FULL, o payload `old` de um DELETE via realtime só
-- traz a chave primária (id) — não traz `campanha_id`/`projeto_id`. O
-- código em src/lib/scoped-table-store.ts usa exatamente essa coluna pra
-- achar em qual "balde" (Map por parent id) remover a linha apagada; sem
-- ela, a remoção silenciosamente não acontece no cache de quem já estava
-- com a aba aberta, e a tarefa/influenciador/documento apagado continua
-- aparecendo (ex: tarefas "atrasadas" que já foram excluídas há tempo).
ALTER TABLE public.campanha_tarefas REPLICA IDENTITY FULL;
ALTER TABLE public.campanha_influenciadores REPLICA IDENTITY FULL;
ALTER TABLE public.campanha_documentos REPLICA IDENTITY FULL;
ALTER TABLE public.projeto_influenciadores REPLICA IDENTITY FULL;
