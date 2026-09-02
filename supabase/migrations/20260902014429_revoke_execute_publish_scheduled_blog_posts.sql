-- `publish_scheduled_blog_posts()` é SECURITY DEFINER e, por padrão, fica
-- exposta via PostgREST (/rest/v1/rpc/...) pros papéis anon/authenticated —
-- ou seja, qualquer chamador (até não autenticado) poderia forçar a
-- publicação antecipada de posts agendados. Só o job do pg_cron (que roda
-- direto no Postgres, não via API) deve poder chamá-la.
revoke execute on function public.publish_scheduled_blog_posts() from public, anon, authenticated;
