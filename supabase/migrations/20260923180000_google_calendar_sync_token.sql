-- Fase C da reconstrução da integração Google Calendar: sincronização
-- incremental de verdade. Antes cada ciclo relistava do zero a janela
-- inteira (2 dias atrás → 120 dias à frente, até 1250 eventos) pra
-- descobrir o que mudou — funcional, mas desperdiça cota da API e não
-- escala. Com `sync_token`, o Google devolve só o que mudou desde a
-- última chamada.
alter table public.google_calendar_connections
  add column if not exists sync_token text;

comment on column public.google_calendar_connections.sync_token is
  'nextSyncToken devolvido pelo Google na última página da última sincronização — usado pra pedir só as mudanças desde então. null = precisa de uma sincronização completa (primeira vez, ou depois de um 410 Gone invalidar o token anterior).';
