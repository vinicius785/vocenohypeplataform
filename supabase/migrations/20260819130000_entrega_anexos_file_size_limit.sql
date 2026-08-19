-- Sobe o teto de tamanho do bucket entrega-anexos pra caber vídeo de
-- conteúdo publicado (Reels/TikTok costumam passar de 50MB) — o teto real
-- também depende do limite global do projeto (Storage → Configuration no
-- dashboard do Supabase), que em planos menores fica em 50MB e precisa ser
-- levantado por lá também pra este valor valer de fato.
update storage.buckets set file_size_limit = 314572800 where id = 'entrega-anexos';
