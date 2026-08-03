/**
 * Envio do webhook de blog pro Make — ponto único de integração pra todo o
 * ciclo de vida de um artigo (criar/atualizar, arquivar, apagar). Sempre o
 * mesmo endpoint (BLOG_WEBHOOK_URL), o que muda é o campo `action` no
 * payload. Nunca deve lançar: falha aqui não pode cancelar a operação que já
 * foi concluída com sucesso no banco — só loga.
 */
export type BlogWebhookAction = "upsert" | "archive" | "delete";

export type BlogWebhookArticle = {
  id: string;
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  cover?: string;
  category?: string;
  authorName?: string;
};

function buildPayload(action: BlogWebhookAction, article: BlogWebhookArticle) {
  if (action === "archive" || action === "delete") {
    return { action, id: article.id };
  }
  return {
    action,
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: article.content,
    cover: article.cover,
    category: article.category,
    authorName: article.authorName,
    timestamp: new Date().toISOString(),
  };
}

export async function sendBlogWebhook(
  action: BlogWebhookAction,
  article: BlogWebhookArticle,
): Promise<void> {
  const url = process.env.BLOG_WEBHOOK_URL;
  if (!url) {
    console.warn("[BlogWebhook] BLOG_WEBHOOK_URL não configurada — pulando envio.");
    return;
  }
  const payload = buildPayload(action, article);
  console.log("[BlogWebhook] Sending webhook...", payload);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    console.log("[BlogWebhook] Success", { action, id: article.id, status: res.status });
  } catch (err) {
    console.error("[BlogWebhook] Failed", { action, id: article.id, error: err });
  }
}
