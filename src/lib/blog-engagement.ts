import { supabase } from "@/integrations/supabase/client";

export type BlogComment = {
  id: string;
  authorLabel: string;
  authorKind: "team" | "cliente";
  body: string;
  createdAt: string;
};

export type BlogEngagement = {
  likeCount: number;
  likedByMe: boolean;
  comments: BlogComment[];
};

const AVATAR_COLORS = [
  "bg-rose-500 text-white",
  "bg-sky-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-500 text-white",
  "bg-violet-500 text-white",
  "bg-teal-500 text-white",
  "bg-fuchsia-500 text-white",
  "bg-orange-500 text-white",
];
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Nome/foto do usuário logado, salvos localmente em Configurações — mesma
 * fonte usada pra autoria de comentários em Tarefas/Influenciadores. */
function getCurrentAuthorName(): string {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("config:perfil");
      if (raw) {
        const p = JSON.parse(raw) as { nome?: string };
        const name = (p.nome ?? "").trim();
        if (name) return name;
      }
    } catch {
      /* ignore */
    }
  }
  return "Você";
}

function mapComment(row: {
  id: string;
  author_label: string;
  author_kind: string;
  body: string;
  created_at: string;
}): BlogComment {
  return {
    id: row.id,
    authorLabel: row.author_label,
    authorKind: row.author_kind === "cliente" ? "cliente" : "team",
    body: row.body,
    createdAt: row.created_at,
  };
}

/** Lado VI (time logado) — lê/escreve direto via client autenticado, RLS
 * `authenticated` já libera CRUD completo em `blog_likes`/`blog_comments`. */
export async function loadEngagementVI(postId: string): Promise<BlogEngagement> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [likesRes, commentsRes] = await Promise.all([
    supabase.from("blog_likes").select("liker_key").eq("post_id", postId),
    supabase
      .from("blog_comments")
      .select("id, author_label, author_kind, body, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
  ]);
  if (likesRes.error) throw new Error(likesRes.error.message);
  if (commentsRes.error) throw new Error(commentsRes.error.message);
  const likerKey = user ? `user:${user.id}` : null;
  return {
    likeCount: likesRes.data.length,
    likedByMe: likerKey ? likesRes.data.some((r) => r.liker_key === likerKey) : false,
    comments: commentsRes.data.map(mapComment),
  };
}

export async function toggleLikeVI(postId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const likerKey = `user:${user.id}`;
  const { data: existing, error: findError } = await supabase
    .from("blog_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("liker_key", likerKey)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) {
    const { error } = await supabase.from("blog_likes").delete().eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from("blog_likes").insert({
    post_id: postId,
    liker_key: likerKey,
    liker_label: getCurrentAuthorName(),
  });
  if (error) throw new Error(error.message);
}

export async function addCommentVI(postId: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;
  const { error } = await supabase.from("blog_comments").insert({
    post_id: postId,
    author_label: getCurrentAuthorName(),
    author_kind: "team",
    body: trimmed,
  });
  if (error) throw new Error(error.message);
}
