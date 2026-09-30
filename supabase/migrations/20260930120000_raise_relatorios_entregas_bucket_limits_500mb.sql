-- Aumenta o limite de tamanho de arquivo pra 500MB em dois buckets:
--   relatorios-mensais (era 100MB) — relatórios mensais em PDF
--   entrega-anexos (era 300MB) — anexos de entrega de influenciador,
--     incluindo vídeos (Reels/TikTok grandes já excediam 50-100MB)
-- Pedido explícito do usuário: "aumenta o tamanho de envio de relatorios
-- mensais para 500mb, e o de videos dos influs para 500mb também".

update storage.buckets
set file_size_limit = 524288000 -- 500 * 1024 * 1024
where id in ('relatorios-mensais', 'entrega-anexos');
