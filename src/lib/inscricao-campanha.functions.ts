import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Cliente } from "@/lib/clientes-store";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import type { Influ, InfluAttachment } from "@/components/influenciadores/InfluencerBoard";
import { getEffectiveInscricaoPage } from "@/lib/inscricao-page";
import { normalizeSocialInput, isDuplicateProfile } from "@/lib/social-profiles";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/** Mídia kit aceita só o que o pedido especifica — mais restrito que
 * `ALLOWED_UPLOAD_CONTENT_TYPES` (que também aceita doc/xls/ppt/csv pra
 * outros fluxos de anexo). */
const MEDIA_KIT_EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Confere a assinatura real dos primeiros bytes — nunca confia só no
 * `contentType` declarado pelo navegador nem na extensão do nome do
 * arquivo (pedido, seção 9: "não confiar apenas no nome do arquivo"). */
function matchesFileSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") {
    return buffer.subarray(0, 4).toString("ascii") === "%PDF";
  }
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return sig.every((b, i) => buffer[i] === b);
  }
  if (mimeType === "image/webp") {
    return (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D+/g, "");
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

// `profileUrl`/`isPrimary` são aditivos (múltiplos perfis por rede
// social) — opcionais pra aceitar tanto o formato antigo (sem esses
// campos) quanto o novo, sem quebrar nenhum cliente.
const RedeInput = z.object({
  plataforma: z.string().min(1),
  handle: z.string().min(1),
  seguidores: z.string().optional(),
  profileUrl: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

const RespostaInput = z.object({
  questionId: z.string().min(1),
  label: z.string().min(1),
  value: z.union([z.string(), z.array(z.string())]),
  fieldType: z
    .enum([
      "texto_curto",
      "texto_longo",
      "numero",
      "moeda",
      "sim_nao",
      "selecao_unica",
      "selecao_multipla",
      "data",
      "link",
    ])
    .optional(),
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

    let midiaKit: InfluAttachment[] | undefined;
    if (data.anexo) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(data.anexo.dataUrl);
      if (!match) throw new Error("Arquivo inválido.");
      const contentType = match[1];
      const extension = MEDIA_KIT_EXTENSION_BY_MIME[contentType];
      if (!extension) {
        throw new Error("Mídia kit aceita apenas PDF, JPG, JPEG, PNG ou WEBP.");
      }
      const buffer = Buffer.from(match[2], "base64");
      // Nunca confia só no `contentType` declarado nem na extensão do nome
      // — confere a assinatura real dos bytes antes de subir pro Storage
      // (pedido, seção 9).
      if (!matchesFileSignature(buffer, contentType)) {
        throw new Error("O arquivo enviado não corresponde a um PDF/imagem válido.");
      }
      const safeName = data.anexo.nome.replace(/[^\w.-]+/g, "_");
      const path = `inscricao/${data.token}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("entrega-anexos")
        .upload(path, buffer, { contentType });
      if (uploadError) throw new Error(uploadError.message);
      // Guarda a CHAVE permanente, nunca uma URL assinada — a URL de
      // visualização/download é sempre gerada sob demanda
      // (`getInfluAttachmentUrl`), então nunca expira "de vez" sem chance
      // de regenerar (pedido, seção 9/16).
      midiaKit = [
        {
          id: crypto.randomUUID(),
          name: data.anexo.nome,
          mimeType: contentType,
          extension,
          sizeBytes: buffer.byteLength,
          storagePath: path,
          bucket: "entrega-anexos",
          checksum: createHash("sha256").update(buffer).digest("hex"),
          source: "inscricao_page",
          uploadedAt: new Date().toISOString(),
        },
      ];
    }

    // "Mês de referência" — só existe pra campanhas recorrentes (o link
    // é reaproveitado mês após mês, então quem publica escolhe pra qual
    // ciclo cada leva de inscrições é). Nunca vem do client: é sempre o
    // que o time configurou na campanha, lido aqui no servidor.
    const cicloMes =
      found.campanha.pagClienteTipo === "Recorrente" ? page.mesReferencia : undefined;

    const now = new Date().toISOString();
    const normalizedEmail = normalizeEmail(data.email);
    const normalizedPhone = normalizePhoneDigits(data.telefone);
    const normalizedRedes = data.redes.map((r) => ({
      plataforma: r.plataforma,
      ...normalizeSocialInput(r.plataforma, r.handle),
    }));

    const redes = data.redes.map((r, i) => ({
      id: crypto.randomUUID(),
      plataforma: r.plataforma,
      handle: normalizeSocialInput(r.plataforma, r.handle).handle || r.handle.trim(),
      seguidores: r.seguidores?.trim() || undefined,
      profileUrl: r.profileUrl?.trim() || normalizeSocialInput(r.plataforma, r.handle).profileUrl,
      isPrimary: r.isPrimary,
      order: i,
    }));

    const inscricaoRespostas =
      data.respostas.length > 0
        ? data.respostas.map((r) => ({ ...r, submittedAt: now }))
        : undefined;

    // Dedup DENTRO da mesma campanha (pedido, seção 1) — nunca cruza pra
    // outras campanhas nem pro banco global de influenciadores. Match
    // seguro = pelo menos 1 chave normalizada bate E nenhuma chave
    // preenchida em AMBOS os lados diverge (senão vira um flag de revisão
    // manual em vez de fusão automática).
    const { data: existingRows, error: fetchError } = await supabaseAdmin
      .from("campanha_influenciadores")
      .select("id, data")
      .eq("campanha_id", found.campanha.id);
    if (fetchError) throw new Error(fetchError.message);

    type ExistingRow = { id: string; data: Influ };
    let matched: ExistingRow | null = null;
    let conflicting: ExistingRow | null = null;
    for (const row of (existingRows ?? []) as ExistingRow[]) {
      const existing = row.data;
      const existingEmail = existing.email ? normalizeEmail(existing.email) : null;
      const existingPhone = existing.telefone ? normalizePhoneDigits(existing.telefone) : null;
      const emailMatches = Boolean(existingEmail && existingEmail === normalizedEmail);
      const phoneMatches = Boolean(existingPhone && existingPhone === normalizedPhone);
      const socialMatches = normalizedRedes.some((nr) =>
        (existing.redes ?? []).some(
          (er) =>
            er.plataforma === nr.plataforma && isDuplicateProfile([er], nr.plataforma, nr.handle),
        ),
      );
      if (!emailMatches && !phoneMatches && !socialMatches) continue;
      const emailConflicts = Boolean(existingEmail && existingEmail !== normalizedEmail);
      const phoneConflicts = Boolean(existingPhone && existingPhone !== normalizedPhone);
      if (emailConflicts || phoneConflicts) {
        conflicting = row;
        continue;
      }
      matched = row;
      break;
    }

    if (matched) {
      // Já existe uma candidatura segura pra vincular — acrescenta só as
      // redes REALMENTE novas, nunca sobrescreve resposta/mídia kit já
      // existente silenciosamente (pedido, seção 1).
      const existing = matched.data;
      const newRedes = redes.filter(
        (r) => !isDuplicateProfile(existing.redes ?? [], r.plataforma, r.handle),
      );
      const mergedRedes = [...(existing.redes ?? []), ...newRedes].map((r, i) => ({
        ...r,
        order: i,
      }));
      const updated: Influ = {
        ...existing,
        redes: mergedRedes,
        nicho: existing.nicho ?? data.nicho?.trim() ?? undefined,
        inscricaoMensagem: existing.inscricaoMensagem ?? data.mensagem?.trim() ?? undefined,
        midiaKit: existing.midiaKit && existing.midiaKit.length > 0 ? existing.midiaKit : midiaKit,
        inscricaoRespostas: existing.inscricaoRespostas ?? inscricaoRespostas,
        inscricaoMeta: existing.inscricaoMeta ?? {
          submittedAt: now,
          origin: "inscricao_page",
          formVersion: "1",
        },
        inscricaoSnapshot: existing.inscricaoSnapshot ?? { ...data, anexo: undefined },
        updatedAt: now,
      };
      const { error } = await supabaseAdmin
        .from("campanha_influenciadores")
        .update({ data: updated as unknown as never })
        .eq("id", matched.id);
      if (error) throw new Error(error.message);
      return { ok: true, merged: true };
    }

    const influ: Influ = {
      id: crypto.randomUUID(),
      nome: data.nome.trim(),
      telefone: data.telefone.trim(),
      email: data.email.trim(),
      nicho: data.nicho?.trim() || undefined,
      redes,
      entregas: [],
      status: "INSCRITO",
      statusUpdatedAt: now,
      // A partir desta rodada, `observacoes` é só texto escrito manualmente
      // pelo time — a mensagem do candidato e o mídia kit têm campos
      // próprios (pedido, seção 11).
      observacoes: undefined,
      inscricaoMensagem: data.mensagem?.trim() || undefined,
      midiaKit,
      createdAt: now,
      updatedAt: now,
      submittedVia: "inscricao_page",
      inscricaoRespostas,
      inscricaoMeta: { submittedAt: now, origin: "inscricao_page", formVersion: "1" },
      inscricaoSnapshot: { ...data, anexo: undefined },
      duplicateReviewFlags: conflicting
        ? [
            {
              reason: `Dados parcialmente coincidentes com a candidatura ${conflicting.id} (e-mail ou telefone diferem) — revisar antes de tratar como a mesma pessoa.`,
              detectedAt: now,
            },
          ]
        : undefined,
      cicloMes,
    };

    const { error } = await supabaseAdmin.from("campanha_influenciadores").insert({
      id: influ.id,
      campanha_id: found.campanha.id,
      data: influ as unknown as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true, merged: false };
  });

const AttachmentUrlInput = z.object({
  campanhaInfluId: z.string().uuid(),
  attachmentId: z.string().uuid(),
  /** `true` pro botão "Baixar" — Supabase já monta o `Content-Disposition:
   * attachment` com o nome original via a opção `download` do próprio
   * `createSignedUrl`, sem precisar de uma rota HTTP própria (que exigiria
   * reimplementar a leitura de sessão que `requireSupabaseAuth` já faz
   * pra `createServerFn`). `false`/ausente pro botão "Visualizar" (URL
   * simples, pra abrir inline no iframe/img). */
  download: z.boolean().optional(),
});

/** URL de visualização/download sob demanda — nunca persistida (pedido,
 * seção 9/16: "salvar uma chave permanente e gerar URL segura somente ao
 * visualizar ou baixar"). Autenticado — diferente de `submitInscricaoCampanha`,
 * que é público, esta função é usada de dentro do board (time logado). */
export const getInfluAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AttachmentUrlInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("campanha_influenciadores")
      .select("data")
      .eq("id", data.campanhaInfluId)
      .maybeSingle();
    if (error || !row) return { ok: false as const, reason: "unavailable" as const };
    const influ = row.data as Influ;
    const attachment = influ.midiaKit?.find((a) => a.id === data.attachmentId);
    if (!attachment) return { ok: false as const, reason: "unavailable" as const };
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(attachment.bucket)
      .createSignedUrl(
        attachment.storagePath,
        60 * 10,
        data.download ? { download: attachment.name } : undefined,
      );
    if (signError || !signed) return { ok: false as const, reason: "unavailable" as const };
    return {
      ok: true as const,
      url: signed.signedUrl,
      name: attachment.name,
      mimeType: attachment.mimeType,
    };
  });
