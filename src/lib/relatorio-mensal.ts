import { supabase } from "@/integrations/supabase/client";

export const RELATORIO_MENSAL_BUCKET = "relatorios-mensais";

export type RelatorioMensalNps = {
  score: number; // 0-10
  comentario?: string;
  respondedAt: string;
};

/** Relatório mensal de métricas (PDF) de uma campanha — um por mês
 * (`YYYY-MM`), subido pronto pelo time (fora da plataforma). O cliente
 * visualiza no portal sem precisar baixar e responde um NPS sobre aquele
 * relatório específico. */
export type RelatorioMensal = {
  id: string;
  mes: string; // YYYY-MM
  nome: string;
  storagePath: string;
  uploadedAt: string;
  nps?: RelatorioMensalNps;
};

export function mesLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  if (!y || !m) return mes;
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Sobe o PDF do relatório mensal (uso do time, autenticado) — mesmo
 * padrão de `uploadFinanceiroAnexo`/`uploadEntregaAnexo`. Retorna o path no
 * bucket (não a URL — URLs assinadas são geradas sob demanda, tanto aqui
 * quanto no portal público). */
export async function uploadRelatorioMensalPdf(file: File): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const { error } = await supabase.storage.from(RELATORIO_MENSAL_BUCKET).upload(path, file, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });
  if (error) {
    console.warn("[relatorio-mensal] upload failed", error);
    return null;
  }
  return path;
}

/** URL assinada (1h) pro time visualizar/baixar — chamada sob demanda, não
 * guardada, pra nunca expirar em cache. */
export async function getRelatorioMensalUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(RELATORIO_MENSAL_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error) {
    console.warn("[relatorio-mensal] signed url failed", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

export async function deleteRelatorioMensalPdf(storagePath: string): Promise<void> {
  await supabase.storage.from(RELATORIO_MENSAL_BUCKET).remove([storagePath]);
}
