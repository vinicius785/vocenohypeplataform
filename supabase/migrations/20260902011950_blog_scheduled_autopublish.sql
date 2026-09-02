-- Publicação automática de artigos de blog agendados. O "banco de dados"
-- do blog não é uma tabela própria: `BlogPost[]` mora dentro do jsonb
-- `projetos.data.blog` (ver src/lib/projetos.ts). Como o trabalho de
-- "publicar" é só trocar status/publishedAt, isso é feito 100% em SQL via
-- pg_cron, sem edge function.
create extension if not exists pg_cron;

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
                     'publishedAt', to_jsonb(now())
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

select cron.schedule(
  'publicar-blog-agendado',
  '* * * * *',
  $$select public.publish_scheduled_blog_posts();$$
);
