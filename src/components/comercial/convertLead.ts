import type { Lead } from "@/lib/comercial";
import { clientesStore, type Cliente } from "@/lib/clientes-store";
import { createClienteComOrganizacao } from "@/lib/clientes.functions";
import { DEFAULT_FEATURES, upsertProjeto } from "@/lib/projetos";
import { formatDateToIso } from "@/lib/utils";

/** Converte um lead GANHO em Cliente + Projeto — extraído de
 * `ComercialSection.tsx` sem alteração de comportamento (mesmo formato de
 * `Cliente`/`Project` já usado lá).
 *
 * Async desde a correção do bug de `organization_id`: um `Cliente` novo
 * precisa de uma organização dedicada no Portal (mesmo motivo e mesma
 * server function usados por `ClientesSection.tsx::saveCliente` — ver o
 * comentário em `clientes.functions.ts::createClienteComOrganizacao`), que
 * é uma chamada de servidor, não uma escrita local síncrona. `clienteId`/
 * `projectId` continuam gerados aqui e retornados de imediato (o chamador
 * já depende disso pra encadear o resto do fluxo), só a criação do
 * `Cliente` em si é assíncrona. */
export async function convertLeadToClienteEProjeto(
  lead: Lead,
): Promise<{ clienteId: string; projectId: string }> {
  const clienteId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const novoCliente: Cliente = {
    id: clienteId,
    empresa: lead.company || lead.name,
    responsavel: lead.contact || "",
    responsavelInterno: lead.responsible || "",
    email: lead.email || "",
    whatsapp: lead.phone || "",
    clienteDesde: formatDateToIso(new Date()),
    campanhas: [],
    // Fase 1 da reconstrução do modelo de status de cliente: todo cliente
    // novo nasce com status explícito (não implícito) — por enquanto
    // sempre "active", já que a etapa de escolha de status na criação é
    // trabalho de fase futura, fora do escopo desta migração.
    status: "active",
    orcamentoSugerido: lead.proposta?.precoFinal ?? (lead.value > 0 ? lead.value : undefined),
  };
  await createClienteComOrganizacao({
    data: { id: clienteId, empresa: novoCliente.empresa, cliente: novoCliente },
  });
  clientesStore.hydrateOne(novoCliente);
  upsertProjeto({
    id: projectId,
    name: lead.company || lead.name,
    description: lead.notes || "",
    features: DEFAULT_FEATURES,
    createdAt: Date.now(),
    milestones: [],
    tasks: [],
    docs: [],
  });
  return { clienteId, projectId };
}
