import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type {
  EditorialChannel,
  EditorialDraft,
  EditorialFormat,
  EditorialFile,
  EditorialItem,
  EditorialPatch,
  EditorialStatus,
} from "@/lib/marketing-editorial";

/** Acesso ao banco do Calendário Editorial (tabela `marketing_conteudos`). Só busca o período
 * pedido; sem polling. O acesso é decidido pela RLS (time interno com permissão `projetos`). */
type Row = Tables<"marketing_conteudos">;

function fromRow(r: Row): EditorialItem {
  return {
    id: r.id,
    projetoId: r.projeto_id,
    titulo: r.titulo,
    data: r.data,
    hora: r.hora ? r.hora.slice(0, 5) : null,
    canal: r.canal as EditorialChannel,
    formato: r.formato as EditorialFormat,
    status: r.status as EditorialStatus,
    responsavelId: r.responsavel_id,
    descricao: r.descricao,
    tarefaId: r.tarefa_id,
    legenda: r.legenda,
    arquivos: Array.isArray(r.arquivos) ? (r.arquivos as unknown as EditorialFile[]) : [],
  };
}

function toColumns(d: EditorialPatch) {
  const out: Record<string, unknown> = {};
  if (d.titulo !== undefined) out.titulo = d.titulo.trim();
  if (d.data !== undefined) out.data = d.data;
  if (d.hora !== undefined) out.hora = d.hora || null;
  if (d.canal !== undefined) out.canal = d.canal;
  if (d.formato !== undefined) out.formato = d.formato;
  if (d.status !== undefined) out.status = d.status;
  if (d.responsavelId !== undefined) out.responsavel_id = d.responsavelId || null;
  if (d.descricao !== undefined) out.descricao = d.descricao?.trim() || null;
  if (d.tarefaId !== undefined) out.tarefa_id = d.tarefaId || null;
  if (d.legenda !== undefined) out.legenda = d.legenda?.trim() ? d.legenda : null;
  if (d.arquivos !== undefined) out.arquivos = d.arquivos;
  return out;
}

export async function fetchEditorialRange(
  projetoId: string,
  from: string,
  to: string,
): Promise<EditorialItem[]> {
  const { data, error } = await supabase
    .from("marketing_conteudos")
    .select("*")
    .eq("projeto_id", projetoId)
    .gte("data", from)
    .lte("data", to)
    .order("data", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

/** Quantos conteúdos o projeto tem no total (só para decidir entre o estado vazio e o calendário). */
export async function countEditorial(projetoId: string): Promise<number> {
  const { count, error } = await supabase
    .from("marketing_conteudos")
    .select("id", { count: "exact", head: true })
    .eq("projeto_id", projetoId);
  if (error) throw error;
  return count ?? 0;
}

export async function createEditorial(
  projetoId: string,
  draft: EditorialDraft,
): Promise<EditorialItem> {
  const { data, error } = await supabase
    .from("marketing_conteudos")
    .insert({ ...toColumns(draft), projeto_id: projetoId } as never)
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function updateEditorial(id: string, patch: EditorialPatch): Promise<EditorialItem> {
  const { data, error } = await supabase
    .from("marketing_conteudos")
    .update(toColumns(patch) as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteEditorial(id: string): Promise<void> {
  const { error } = await supabase.from("marketing_conteudos").delete().eq("id", id);
  if (error) throw error;
}

/** Mensagem amigável: a tabela pode ainda não existir (migration aplicada à mão no Supabase). */
export function editorialErrorMessage(e: unknown): string {
  const code = (e as { code?: string } | null)?.code;
  if (code === "42P01" || code === "PGRST205") {
    return "O Calendário Editorial ainda não foi ativado no banco (migration pendente).";
  }
  return "Não foi possível acessar o Calendário Editorial. Tente novamente.";
}
