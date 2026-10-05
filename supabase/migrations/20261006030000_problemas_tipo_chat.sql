-- Central de Problemas: novo tipo de registro "Chat".
-- É só uma classificação (mesmo fluxo dos demais tipos); o banco precisa aceitar o valor.
-- Idempotente e independente de a migration 20261003100000 já ter sido aplicada: recria a
-- constraint com os cinco tipos.
alter table public.bug_reports drop constraint if exists bug_reports_kind_check;
alter table public.bug_reports
  add constraint bug_reports_kind_check
  check (kind in ('bug', 'sugestao', 'problema', 'duvida', 'chat'));
