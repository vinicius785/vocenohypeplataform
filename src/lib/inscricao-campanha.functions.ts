import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Cliente } from "@/lib/clientes-store";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import type { Influ } from "@/components/influenciadores/InfluencerBoard";
import { getEffectiveInscricaoPage } from "@/lib/inscricao-page";

/**
 * Link público de INSCRIÇÃO de influenciadores numa campanha
 * (`/inscricao/$token`) — diferente do portal do cliente: aqui o token mora
 * na `Campaign` (`signupToken`), não no `Cliente`, porque cada campanha tem
 * seu próprio link de inscrição. Público/sem-auth, sempre via service-role
 * (nem `clientes` nem `campanha_influenciadores` têm policy `anon`).
 */

async function findCampanhaBySignupToken(
  token: string,
): Promise<{ clienteId: string; cliente: Cliente; campanha: Campaign } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin.from("clientes").select("id, data");
  if (error) throw new Error(error.message);
  for (const row of (rows ?? []) as { id: string; data: Cliente }[]) {
    const campanha = row.data.campanhas?.find((c) => c.signupToken === token);
    if (campanha) return { clienteId: row.id, cliente: row.data, campanha };
  }
  return null;
}

// Token é `crypto.randomUUID().replace(/-/g, "")` (32 hex chars) — rejeita
// qualquer coisa menor antes de bater no banco.
const TokenInput = z.object({ token: z.string().min(20).max(64) });

/** Mesma lista usada em cliente-link.functions.ts — sem isso, qualquer
 * `contentType` informado no data-URL era aceito (ex: `text/html`,
 * `image/svg+xml`, que podem embutir script). */
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);
function assertAllowedUploadContentType(contentType: string) {
  if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType)) {
    throw new Error("Tipo de arquivo não suportado.");
  }
}

export const getInscricaoCampanhaData = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => TokenInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findCampanhaBySignupToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const { fetchWorkspace } = await import("@/lib/workspace-store");
    const ws = await fetchWorkspace().catch(() => ({ nome: "Você no Hype", logo: "" }));
    return {
      clienteNome: found.cliente.empresa,
      campanha: {
        id: found.campanha.id,
        nome: found.campanha.nome,
        prazo: found.campanha.prazo,
        prazoPag: found.campanha.prazoPag,
      },
      page: getEffectiveInscricaoPage(found.campanha),
      ws,
    };
  });

const RedeInput = z.object({
  plataforma: z.string().min(1),
  handle: z.string().min(1),
  seguidores: z.string().optional(),
});

const RespostaInput = z.object({
  questionId: z.string().min(1),
  label: z.string().min(1),
  value: z.union([z.string(), z.array(z.string())]),
});

const SubmitInscricaoInput = z.object({
  token: z.string().min(1),
  nome: z.string().min(1),
  telefone: z.string().min(1),
  email: z.string().email(),
  nicho: z.string().optional(),
  redes: z.array(RedeInput).default([]),
  mensagem: z.string().optional(),
  anexo: z
    .object({ nome: z.string().min(1), dataUrl: z.string().min(1).max(8_000_000) })
    .nullable()
    .optional(),
  respostas: z.array(RespostaInput).default([]),
});

export const submitInscricaoCampanha = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SubmitInscricaoInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findCampanhaBySignupToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    // Defesa em profundidade: a UI pública já esconde o formulário fora de
    // "PUBLICADA", mas o servidor nunca confia só nisso — nunca aceita uma
    // submissão de uma página em rascunho ou encerrada.
    const page = getEffectiveInscricaoPage(found.campanha);
    if (page.status !== "PUBLICADA") {
      throw new Error(
        page.status === "ENCERRADA"
          ? "As inscrições para esta campanha estão encerradas."
          : "Esta página ainda não está disponível.",
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let anexoUrl: string | undefined;
    if (data.anexo) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(data.anexo.dataUrl);
      if (!match) throw new Error("Arquivo inválido.");
      const contentType = match[1];
      assertAllowedUploadContentType(contentType);
      const buffer = Buffer.from(match[2], "base64");
      const safeName = data.anexo.nome.replace(/[^\w.-]+/g, "_");
      const path = `inscricao/${data.token}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("entrega-anexos")
        .upload(path, buffer, { contentType });
      if (uploadError) throw new Error(uploadError.message);
      const { data: signed } = await supabaseAdmin.storage
        .from("entrega-anexos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (!signed) throw new Error("Não foi possível gerar o link do anexo.");
      anexoUrl = signed.signedUrl;
    }

    const now = new Date().toISOString();
    const observacoesPartes = [
      data.mensagem?.trim(),
      anexoUrl ? `Mídia kit enviado na inscrição (${data.anexo!.nome}): ${anexoUrl}` : undefined,
    ].filter((s): s is string => Boolean(s));
    const influ: Influ = {
      id: crypto.randomUUID(),
      nome: data.nome.trim(),
      telefone: data.telefone.trim(),
      email: data.email.trim(),
      nicho: data.nicho?.trim() || undefined,
      redes: data.redes.map((r) => ({
        id: crypto.randomUUID(),
        plataforma: r.plataforma,
        handle: r.handle.trim(),
        seguidores: r.seguidores?.trim() || undefined,
      })),
      entregas: [],
      status: "INSCRITO",
      statusUpdatedAt: now,
      observacoes: observacoesPartes.length > 0 ? observacoesPartes.join("\n\n") : undefined,
      createdAt: now,
      updatedAt: now,
      submittedVia: "inscricao_page",
      inscricaoRespostas: data.respostas.length > 0 ? data.respostas : undefined,
    };

    const { error } = await supabaseAdmin
      .from("campanha_influenciadores")
      .insert({ campanha_id: found.campanha.id, data: influ });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
