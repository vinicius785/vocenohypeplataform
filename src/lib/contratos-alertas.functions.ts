import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isContratoProximoDoVencimento, mapContratoRow, type ContratoRow } from "./contratos";

const ListContratosVencendoInput = z.object({ withinDays: z.number().int().positive().max(365) });

/**
 * Contratos "vigentes" que vencem dentro da janela informada, com o nome
 * da empresa já resolvido — alimenta o indicador "Contratos próximos do
 * vencimento" da página global de Clientes (item 19 da reconstrução do
 * domínio Comercial/Clientes/Campanhas/Contratos/Financeiro). Consulta
 * TODOS os clientes de uma vez (join simples) em vez de N chamadas de
 * `listContratosDoCliente`, uma por cliente.
 */
export const listContratosProximosDoVencimento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListContratosVencendoInput.parse(raw))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      {
        clienteId: string;
        clienteEmpresa: string;
        contratoId: string;
        contratoNome: string;
        vigenciaFim: string;
      }[]
    > => {
      const { data: rows, error } = await context.supabase
        .from("contratos")
        .select(
          "id,cliente_id,nome,tipo,status,vigencia_inicio,vigencia_fim,data_assinatura,valor,arquivo_url,campanha_ids,responsavel_interno,observacoes,renovacao,criado_por,created_at,updated_at,clientes(data)",
        )
        .eq("status", "vigente")
        .not("vigencia_fim", "is", null);
      if (error) throw new Error(error.message);

      const now = new Date();
      const out: {
        clienteId: string;
        clienteEmpresa: string;
        contratoId: string;
        contratoNome: string;
        vigenciaFim: string;
      }[] = [];
      for (const row of rows ?? []) {
        const contrato = mapContratoRow(row as unknown as ContratoRow);
        if (!isContratoProximoDoVencimento(contrato, data.withinDays, now)) continue;
        const clienteData = (row as unknown as { clientes?: { data?: { empresa?: string } } })
          .clientes?.data;
        out.push({
          clienteId: contrato.clienteId,
          clienteEmpresa: clienteData?.empresa ?? "Cliente",
          contratoId: contrato.id,
          contratoNome: contrato.nome,
          vigenciaFim: contrato.vigenciaFim ?? "",
        });
      }
      return out;
    },
  );
