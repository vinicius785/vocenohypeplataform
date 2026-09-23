-- Fase B da reconstrução da integração Google Calendar: visibilidade e
-- confiança. Antes a tela de Configurações só checava se existia uma
-- linha em `google_calendar_connections` — nunca se o refresh_token
-- ainda era válido. Se o usuário revogasse acesso pelo Google, ou o
-- token expirasse, a UI continuava mostrando "Conectado" pra sempre,
-- silenciosamente, sem nenhuma forma de descobrir o problema.
alter table public.google_calendar_connections
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_error text,
  add column if not exists token_invalid boolean not null default false;

comment on column public.google_calendar_connections.token_invalid is
  'true quando a última tentativa de renovar o access_token falhou (refresh_token revogado/expirado/inválido) — a UI usa isso pra mostrar "Atenção necessária" e oferecer reconexão, em vez de continuar mostrando "Conectado" indefinidamente.';
comment on column public.google_calendar_connections.last_synced_at is
  'Última vez que um ciclo de sincronização (cron, disparo imediato ou manual) processou esta conexão — não implica que algo tenha mudado, só que a checagem rodou.';
