-- Curtidas e comentários em artigos do Blog (Mural interno + Portal do
-- cliente). `post_id` referencia `BlogPost.id`, que vive dentro do JSONB de
-- `projetos` (não é uma FK de verdade, artigos não são uma tabela própria).
-- Portal do cliente não tem sessão Supabase (token, não `auth.uid()`), então
-- escreve via server functions com o client de service-role, no mesmo
-- padrão já usado por todo o resto de `cliente-link.functions.ts` — por
-- isso a RLS de escrita aqui só libera `authenticated` (uso do VI), o
-- service-role contorna RLS normalmente pro VC.
create table public.blog_likes (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  liker_key text not null,
  liker_label text not null,
  created_at timestamptz not null default now(),
  unique (post_id, liker_key)
);

create table public.blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  author_label text not null,
  author_kind text not null check (author_kind in ('team', 'cliente')),
  body text not null,
  created_at timestamptz not null default now()
);

create index blog_likes_post_id_idx on public.blog_likes (post_id);
create index blog_comments_post_id_created_at_idx on public.blog_comments (post_id, created_at);

alter table public.blog_likes enable row level security;
alter table public.blog_comments enable row level security;

-- Time (VI) lê e escreve direto com sessão Supabase. Portal (VC) não tem
-- `anon` policy nenhuma aqui — sempre passa pelas server functions com
-- service-role, igual todo o resto de `cliente-link.functions.ts`.
create policy "blog_likes authenticated full access" on public.blog_likes
  for all to authenticated using (true) with check (true);
create policy "blog_comments authenticated full access" on public.blog_comments
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.blog_likes;
alter publication supabase_realtime add table public.blog_comments;
