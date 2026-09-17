-- Vínculo opcional de um canal do Chat com um projeto/campanha — upgrade
-- do Hypito, seção 5: "@Hypito" dentro de um canal só cria tarefa quando
-- o canal já tem um projeto/campanha vinculado (decisão explícita do
-- produto: nunca adivinhar o escopo a partir do nome/conteúdo do canal).
--
-- Coluna ADITIVA e NULA em `chat_channels` — canais existentes continuam
-- sem vínculo (`linked_scope IS NULL`), nenhuma migração de dado
-- necessária. Formato: `{ "type": "project"|"campaign", "id": "...",
-- "name": "..." }`, mesmo shape reduzido de `HypitoEntityRef`
-- (`hypito-messages.ts`) sem o campo `meta`.
--
-- Idempotente (`IF NOT EXISTS`) e reversível
-- (`ALTER TABLE ... DROP COLUMN IF EXISTS linked_scope`).
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS linked_scope jsonb;

NOTIFY pgrst, 'reload schema';
