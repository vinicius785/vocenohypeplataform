import { useMemo, useState } from "react";
import { usePortalNavigate, usePortalRuntime } from "../runtime/portal-runtime";
import { FileText, MoreVertical, Download } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { PortalPageHeader } from "../components/shared/PortalPageHeader";
import { PortalListPanel, PortalListRow } from "../components/shared/PortalListPanel";
import { PortalFilterSelect, PortalFilterToolbar } from "../components/shared/PortalFilterToolbar";
import { ClientFileViewer } from "../components/files/ClientFileViewer";
import type { ClientFile } from "../types/files";
import {
  competenceLabel,
  dateBR,
  filterAndSortReports,
  groupByMonth,
  type ReportRow,
  type ReportSort,
} from "../lib/relatorios-model";

/**
 * Central de relatórios — mesmo sistema visual de `CampanhasV2.tsx`
 * (fonte da verdade): `PortalPageHeader` pro título/subtítulo,
 * `portalFieldBase` pros filtros (mesma altura/borda/foco dos controles
 * de Campanhas), `PortalListPanel`/`PortalListRow` pra lista (linha
 * inteira clicável, chevron discreto — nunca mais um botão azul enorme
 * competindo por atenção em cada card). Dado vem do mesmo
 * `ClienteLinkData` de sempre — nenhuma tabela nova. `url` já é uma
 * signed URL de 1h gerada a cada load; quando expira dentro da mesma
 * sessão, o viewer regenera sob demanda via `getFreshRelatorioUrlSession`.
 */
export function RelatoriosV2({ openFileId }: { openFileId?: string }) {
  const { data } = usePortalSessionData();
  const navigate = usePortalNavigate();
  const { api } = usePortalRuntime();
  const [campaignFilter, setCampaignFilter] = useState<string>("todas");
  const [sortBy, setSortBy] = useState<ReportSort>("recentes");

  const reports: ReportRow[] = useMemo(() => {
    return data.campanhas.flatMap((c) =>
      c.relatorios.map((r) => ({
        id: r.id,
        campanhaId: c.id,
        campanhaNome: c.nome,
        nome: r.nome,
        mes: r.mes,
        uploadedAt: r.uploadedAt,
        url: r.url,
      })),
    );
  }, [data]);

  const sorted = useMemo(
    () => filterAndSortReports(reports, campaignFilter, sortBy),
    [reports, campaignFilter, sortBy],
  );
  const groups = useMemo(() => groupByMonth(sorted), [sorted]);
  const campaignsWithReports = data.campanhas.filter((c) => c.relatorios.length > 0);

  const toClientFile = (r: ReportRow): ClientFile => ({
    id: r.id,
    friendlyName: r.nome,
    url: r.url,
    category: "Relatório",
    campanhaNome: r.campanhaNome,
    competenciaLabel: competenceLabel(r.mes),
    createdAt: r.uploadedAt,
    regenerate: async () => {
      const result = await api.freshRelatorioUrl({
        campanhaId: r.campanhaId,
        relatorioId: r.id,
      });
      return result.url;
    },
  });

  const openFile = (id: string) =>
    navigate({ to: "/portal-v2/relatorios", search: { arquivo: id } });
  const closeFile = () => navigate({ to: "/portal-v2/relatorios", search: {} });
  const activeReport = sorted.find((r) => r.id === openFileId);

  return (
    <PageContainer className="max-w-4xl space-y-5">
      <PortalPageHeader
        title="Relatórios"
        description="Acompanhe os resultados das suas campanhas."
      />

      {reports.length > 0 && (
        <PortalFilterToolbar
          onClear={campaignFilter !== "todas" ? () => setCampaignFilter("todas") : undefined}
        >
          {campaignsWithReports.length > 1 && (
            <PortalFilterSelect
              label="Filtrar por campanha"
              value={campaignFilter}
              onChange={setCampaignFilter}
            >
              <option value="todas">Todas as campanhas</option>
              {campaignsWithReports.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </PortalFilterSelect>
          )}
          <PortalFilterSelect
            label="Ordenar relatórios"
            value={sortBy}
            onChange={(v) => setSortBy(v as ReportSort)}
          >
            <option value="recentes">Mais recentes</option>
            <option value="antigos">Mais antigos</option>
            <option value="campanha">Campanha A–Z</option>
          </PortalFilterSelect>
        </PortalFilterToolbar>
      )}

      {reports.length === 0 ? (
        <EmptyState
          compact
          icon={<FileText className="h-5 w-5" />}
          title="Nenhum relatório disponível"
          description="Os relatórios das suas campanhas aparecerão aqui."
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          compact
          icon={<FileText className="h-5 w-5" />}
          title="Nenhum relatório corresponde ao filtro selecionado."
          secondaryAction={{ label: "Limpar filtros", onClick: () => setCampaignFilter("todas") }}
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([mes, items]) => (
            <section key={mes} aria-label={competenceLabel(mes)}>
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                {competenceLabel(mes)}
              </p>
              <PortalListPanel>
                {items.map((r) => (
                  <PortalListRow
                    key={`${r.campanhaId}:${r.id}`}
                    icon={<FileText className="h-4 w-4" />}
                    onClick={() => r.url && openFile(r.id)}
                    title={r.nome}
                    meta={
                      <>
                        {r.campanhaNome}
                        {dateBR(r.uploadedAt) ? ` · Disponível em ${dateBR(r.uploadedAt)}` : ""}
                      </>
                    }
                    trailing={
                      r.url ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Mais ações para ${r.nome}`}
                              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <a href={r.url} download className="flex items-center gap-2">
                                <Download className="h-3.5 w-3.5" /> Baixar arquivo
                              </a>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : undefined
                    }
                  />
                ))}
              </PortalListPanel>
            </section>
          ))}
        </div>
      )}

      <ClientFileViewer
        file={activeReport ? toClientFile(activeReport) : null}
        onClose={closeFile}
      />
    </PageContainer>
  );
}
