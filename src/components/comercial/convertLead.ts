import type { Lead } from "@/lib/comercial";
import { clientesStore } from "@/lib/clientes-store";
import { DEFAULT_FEATURES, upsertProjeto } from "@/lib/projetos";
import { formatDateToIso } from "@/lib/utils";

/** Converte um lead GANHO em Cliente + Projeto — extraído de
 * `ComercialSection.tsx` sem alteração de comportamento (mesmo formato de
 * `Cliente`/`Project` já usado lá). */
export function convertLeadToClienteEProjeto(lead: Lead): {
  clienteId: string;
  projectId: string;
} {
  const clienteId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  clientesStore.set((prev) => [
    ...prev,
    {
      id: clienteId,
      empresa: lead.company || lead.name,
      responsavel: lead.contact || "",
      responsavelInterno: lead.responsible || "",
      email: lead.email || "",
      whatsapp: lead.phone || "",
      clienteDesde: formatDateToIso(new Date()),
      campanhas: [],
      orcamentoSugerido: lead.proposta?.precoFinal ?? (lead.value > 0 ? lead.value : undefined),
    },
  ]);
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
