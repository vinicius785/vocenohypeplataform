import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapContratoRow, CONTRATO_STATUS_LIST, type Contrato, type ContratoRow } from "./contratos";

const CONTRATO_COLUMNS =
  "id,cliente_id,nome,tipo,status,vigencia_inicio,vigencia_fim,data_assinatura,valor,arquivo_url,campanha_ids,responsavel_interno,observacoes,renovacao,criado_por,created_at,updated_at";

export const listContratosDoCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ clienteId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<Contrato[]> => {
    const { data: rows, error } = await context.supabase
      .from("contratos")
      .select(CONTRATO_COLUMNS)
      .eq("cliente_id", data.clienteId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => mapContratoRow(r as ContratoRow));
  });

/** Único campo obrigatório é `nome` — nada de vigência/valor/arquivo é
 * exigido na criação (item 14: "Não exigir contrato para criar cliente ou
 * campanha em Planejamento" já garante que contrato nunca bloqueia essas
 * duas ações; este schema garante que o PRÓPRIO contrato também nasce
 * enxuto). Valores ausentes chegam como `undefined`/omitidos, nunca `0`
 * ou string vazia forçada — o banco já default `status = 'rascunho'` e
 * `campanha_ids = '{}'` quando omitidos. */
const CreateContratoInput = z.object({
  clienteId: z.string().uuid(),
  nome: z.string().trim().min(1, "Nome do contrato é obrigatório."),
  tipo: z.string().trim().optional(),
  status: z.enum(CONTRATO_STATUS_LIST as [string, ...string[]]).optional(),
  vigenciaInicio: z.string().optional(),
  vigenciaFim: z.string().optional(),
  dataAssinatura: z.string().optional(),
  valor: z.number().optional(),
  arquivoUrl: z.string().optional(),
  campanhaIds: z.array(z.string()).optional(),
  responsavelInterno: z.string().trim().optional(),
  observacoes: z.string().trim().optional(),
  renovacao: z.string().trim().optional(),
  criadoPor: z.string().trim().optional(),
});

export const createContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateContratoInput.parse(raw))
  .handler(async ({ data, context }): Promise<Contrato> => {
    const { data: row, error } = await context.supabase
      .from("contratos")
      .insert({
        cliente_id: data.clienteId,
        nome: data.nome,
        tipo: data.tipo ?? null,
        status: data.status ?? "rascunho",
        vigencia_inicio: data.vigenciaInicio ?? null,
        vigencia_fim: data.vigenciaFim ?? null,
        data_assinatura: data.dataAssinatura ?? null,
        valor: data.valor ?? null,
        arquivo_url: data.arquivoUrl ?? null,
        campanha_ids: data.campanhaIds ?? [],
        responsavel_interno: data.responsavelInterno ?? null,
        observacoes: data.observacoes ?? null,
        renovacao: data.renovacao ?? null,
        criado_por: data.criadoPor ?? null,
      })
      .select(CONTRATO_COLUMNS)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Falha ao criar contrato.");
    return mapContratoRow(row as ContratoRow);
  });

const UpdateContratoInput = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(1).optional(),
  tipo: z.string().trim().nullable().optional(),
  status: z.enum(CONTRATO_STATUS_LIST as [string, ...string[]]).optional(),
  vigenciaInicio: z.string().nullable().optional(),
  vigenciaFim: z.string().nullable().optional(),
  dataAssinatura: z.string().nullable().optional(),
  valor: z.number().nullable().optional(),
  arquivoUrl: z.string().nullable().optional(),
  campanhaIds: z.array(z.string()).optional(),
  responsavelInterno: z.string().trim().nullable().optional(),
  observacoes: z.string().trim().nullable().optional(),
  renovacao: z.string().trim().nullable().optional(),
});

export const updateContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateContratoInput.parse(raw))
  .handler(async ({ data, context }): Promise<Contrato> => {
    const { id, ...rest } = data;
    const payload: Partial<
      Omit<ContratoRow, "id" | "cliente_id" | "created_at" | "updated_at" | "campanha_ids">
    > & { campanha_ids?: string[] } = {};
    if (rest.nome !== undefined) payload.nome = rest.nome;
    if (rest.tipo !== undefined) payload.tipo = rest.tipo;
    if (rest.status !== undefined) payload.status = rest.status;
    if (rest.vigenciaInicio !== undefined) payload.vigencia_inicio = rest.vigenciaInicio;
    if (rest.vigenciaFim !== undefined) payload.vigencia_fim = rest.vigenciaFim;
    if (rest.dataAssinatura !== undefined) payload.data_assinatura = rest.dataAssinatura;
    if (rest.valor !== undefined) payload.valor = rest.valor;
    if (rest.arquivoUrl !== undefined) payload.arquivo_url = rest.arquivoUrl;
    if (rest.campanhaIds !== undefined) payload.campanha_ids = rest.campanhaIds;
    if (rest.responsavelInterno !== undefined)
      payload.responsavel_interno = rest.responsavelInterno;
    if (rest.observacoes !== undefined) payload.observacoes = rest.observacoes;
    if (rest.renovacao !== undefined) payload.renovacao = rest.renovacao;
    const { data: row, error } = await context.supabase
      .from("contratos")
      .update(payload)
      .eq("id", id)
      .select(CONTRATO_COLUMNS)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Falha ao atualizar contrato.");
    return mapContratoRow(row as ContratoRow);
  });

/** Exclusão é admin-only na RLS (`"clientes/contratos delete contratos"`,
 * `is_admin` puro) — um contrato formal não deve sumir por engano de quem
 * só tem permissão de "clientes"/"contratos"; encerrar/cancelar via status
 * é o caminho normal, exclusão é exceção administrativa. */
export const deleteContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("contratos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
