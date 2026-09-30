import type { Lead } from "@/lib/comercial";
import { clientesStore, type Cliente } from "@/lib/clientes-store";
import { createClienteComOrganizacao } from "@/lib/clientes.functions";
import { DEFAULT_FEATURES, upsertProjeto } from "@/lib/projetos";
import { formatDateToIso } from "@/lib/utils";

/** Converte uma oportunidade (lead) em Cliente + Projeto — reconstrução do
 * domínio Comercial/Clientes/Campanhas/Contratos/Financeiro, item 3.2/3.3:
 * "converter" NUNCA ativa silenciosamente. O cliente sempre nasce em
 * "capture" (Captação), mesmo quando a oportunidade já está "Ganho" — a
 * ativação de verdade é uma ação separada e explícita (a transição
 * capture→active já existente em `ClienteStatusControl.tsx`, com sua
 * própria confirmação). Antes desta correção, este caminho colocava o
 * cliente direto em "active" sem nenhuma confirmação — divergente do outro
 * caminho de conversão (`ClienteFormSheet.tsx`'s "Importar do Comercial"),
 * que já derivava o status a partir da etapa do lead. Os dois caminhos
 * agora concordam: todo lead convertido vira Captação, nunca Ativo direto.
 *
 * `crmLeadId` também passa a ser gravado aqui — antes só o outro caminho
 * de conversão fazia isso, criando uma segunda divergência (um cliente
 * convertido por aqui não tinha como saber de qual oportunidade veio).
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
    status: "capture",
    crmLeadId: lead.id,
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
