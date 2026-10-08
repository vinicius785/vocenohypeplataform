import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getClienteOrganizationId,
  listOrganizationCampaigns,
  listOrganizationMembers,
} from "@/lib/organization-invites.functions";

export type PortalMember = Awaited<ReturnType<typeof listOrganizationMembers>>[number];
export type PortalCampaign = { id: string; nome: string };

export type ClientePortalData = {
  /** `null` = ainda não carregou OU o cliente não tem organização. Veja `status`. */
  organizationId: string | null;
  members: PortalMember[] | null;
  campaigns: PortalCampaign[];
  status: "loading" | "ready" | "error";
  /** Recarrega só os membros (depois de convidar/alterar/suspender...). */
  refreshMembers: () => Promise<PortalMember[] | null>;
};

/**
 * ÚNICA fonte de organização + membros + campanhas liberáveis da Central do Cliente. Antes a página
 * e a seção de acessos buscavam os mesmos dados cada uma por conta própria; agora a página chama
 * este hook uma vez e distribui (seção de acessos, histórico e contagens).
 */
export function useClientePortalData(clienteId: string): ClientePortalData {
  const getOrgIdFn = useServerFn(getClienteOrganizationId);
  const listMembersFn = useServerFn(listOrganizationMembers);
  const listCampaignsFn = useServerFn(listOrganizationCampaigns);
  const fns = useRef({ getOrgIdFn, listMembersFn, listCampaignsFn });
  fns.current = { getOrgIdFn, listMembersFn, listCampaignsFn };

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [members, setMembers] = useState<PortalMember[] | null>(null);
  const [campaigns, setCampaigns] = useState<PortalCampaign[]>([]);
  const [status, setStatus] = useState<ClientePortalData["status"]>("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const { organizationId: orgId } = await fns.current.getOrgIdFn({ data: { clienteId } });
        if (cancelled) return;
        setOrganizationId(orgId);
        if (!orgId) {
          setMembers([]);
          setCampaigns([]);
          setStatus("ready");
          return;
        }
        const [list, camps] = await Promise.all([
          fns.current.listMembersFn({ data: { organizationId: orgId } }),
          fns.current.listCampaignsFn({ data: { organizationId: orgId } }),
        ]);
        if (cancelled) return;
        setMembers(list);
        setCampaigns(camps);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clienteId]);

  const refreshMembers = useCallback(async () => {
    if (!organizationId) return null;
    const list = await fns.current.listMembersFn({ data: { organizationId } });
    setMembers(list);
    return list;
  }, [organizationId]);

  return { organizationId, members, campaigns, status, refreshMembers };
}
