-- Fase A da reconstrução da integração Google Calendar: trava de
-- concorrência. Antes só existia UM disparador (o setInterval de 3min no
-- navegador) — agora existem potencialmente vários ao mesmo tempo (cron
-- externo a cada 5-10min, cron diário da Vercel como rede de segurança,
-- disparo imediato ao criar/editar/excluir reunião, e o próprio polling
-- do navegador mantido como reforço). Sem uma trava, dois disparos
-- concorrentes já causavam duplicação de evento no Google (ver comentário
-- em `findGoogleEventId`/`insertError.code === "23505"` — mitigado, mas
-- nunca prevenido na origem). Singleton (mesmo padrão de
-- `shared_calendar_connection`, já removida): uma linha só, sempre
-- `id = true`.
create table public.google_calendar_sync_state (
  id boolean primary key default true,
  running boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  last_result jsonb,
  constraint google_calendar_sync_state_singleton check (id)
);
insert into public.google_calendar_sync_state (id, running) values (true, false);

alter table public.google_calendar_sync_state enable row level security;
-- Sem policies pra authenticated/anon — só o service role (usado pelo
-- runner de sync, chamado de server functions e do endpoint de cron) lê
-- e escreve aqui, mesmo padrão de `google_calendar_connections`.
