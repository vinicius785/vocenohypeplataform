-- Payload estruturado das respostas do Hypito (cards/ações) — coluna
-- ADITIVA e NULA em `chat_messages`, usada só por mensagens do próprio
-- Hypito (`author_id = HYPITO_AUTHOR_ID`). Mensagens humanas e mensagens
-- antigas do Hypito continuam com `hypito_payload IS NULL` e renderizam
-- como texto simples de sempre — nenhuma migração de dado existente é
-- necessária (pedido: "não migrar mensagens antigas sem necessidade").
--
-- `text` continua a coluna real usada por busca/notificações/histórico/
-- clientes antigos — sempre um resumo legível (`textFallback` do
-- payload), nunca esvaziada. `hypito_payload` só enriquece a exibição
-- quando presente e válido (versão conferida em `hypito-messages.ts`).
--
-- Idempotente (`IF NOT EXISTS`) e reversível
-- (`ALTER TABLE ... DROP COLUMN IF EXISTS hypito_payload` desfaz sem
-- afetar `text`/qualquer outra coluna).
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS hypito_payload jsonb;

NOTIFY pgrst, 'reload schema';
