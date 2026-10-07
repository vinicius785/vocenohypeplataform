-- Data editorial do artigo = PRIMEIRA publicação (`firstPublishedAt`, em projetos.data.blog[]).
-- O autopublish dos agendados passa a gravar `firstPublishedAt` apenas se ainda não existir
-- (preservando a de uma publicação anterior); `publishedAt` segue sendo a última publicação.
-- Não altera dados existentes: só substitui a função chamada pelo pg_cron.
create or replace function public.publish_scheduled_blog_posts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.projetos proj
  set data = jsonb_set(
        proj.data,
        '{blog}',
        (
          select jsonb_agg(
            case
              when (post->>'status') = 'agendado'
                and (post->>'publishDate') is not null
                and (post->>'publishDate')::timestamptz <= now()
              then post || jsonb_build_object(
                     'status', 'publicado',
                     'publishedAt', to_jsonb(now()),
                     'firstPublishedAt', coalesce(
                       post->'firstPublishedAt',
                       post->'publishedAt',
                       to_jsonb(now())
                     )
                   )
              else post
            end
          )
          from jsonb_array_elements(proj.data->'blog') as post
        )
      ),
      updated_at = now()
  where proj.data ? 'blog'
    and exists (
      select 1
      from jsonb_array_elements(proj.data->'blog') as post
      where (post->>'status') = 'agendado'
        and (post->>'publishDate') is not null
        and (post->>'publishDate')::timestamptz <= now()
    );
end;
$$;
