import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye, FileText, Paperclip } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { getFreshRelatorioUrlSession } from "@/lib/portal-auth.functions";
import { CampaignSection } from "./CampaignSection";
import { ClientFileViewer } from "../files/ClientFileViewer";
import type { ClientFile } from "../../types/files";
import type { PublicCampanha } from "@/lib/portal-types";

/** Relatórios e arquivos — unificados numa seção, separados visualmente
 * em duas listas só quando ambas têm itens (nunca duas áreas grandes
 * quando só uma tem conteúdo). "Visualizar" abre o MESMO
 * `ClientFileViewer` das páginas de Relatórios/Arquivos — nunca uma
 * aba nova nem download direto ao clicar. */
export function ClientCampaignResources({
  campaign,
  highlightReportId,
}: {
  campaign: PublicCampanha;
  /** Relatório pra destacar visualmente (deep link `?relatorio=`) —
   * nunca uma segunda página, só um anel de foco na linha certa. */
  highlightReportId?: string;
}) {
  const freshUrlFn = useServerFn(getFreshRelatorioUrlSession);
  const [openFile, setOpenFile] = useState<ClientFile | null>(null);

  const reports = campaign.relatorios;
  const files = campaign.influencers.flatMap((i) => [
    ...(i.briefingAnexoUrl
      ? [
          {
            id: `briefing:${i.id}`,
            nome: i.briefingAnexoNome || "Briefing",
            url: i.briefingAnexoUrl,
          },
        ]
      : []),
    ...i.entregas.flatMap((e) =>
      (e.anexos ?? []).map((a) => ({ id: `anexo:${a.id}`, nome: a.nome, url: a.url })),
    ),
  ]);

  if (reports.length === 0 && files.length === 0) {
    return (
      <CampaignSection icon={<FileText className="h-4 w-4" />} title="Relatórios e arquivos">
        <EmptyState
          compact
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          title="Nenhum relatório ou arquivo nesta campanha ainda"
        />
      </CampaignSection>
    );
  }

  return (
    <CampaignSection icon={<FileText className="h-4 w-4" />} title="Relatórios e arquivos">
      <div className="space-y-4">
        {reports.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Relatórios
            </p>
            <div className="space-y-1.5">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 dark:shadow-none ${
                    r.id === highlightReportId ? "ring-2 ring-brand" : ""
                  }`}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.nome}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {r.mes} · {new Date(r.uploadedAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {r.url && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenFile({
                            id: r.id,
                            friendlyName: r.nome,
                            url: r.url,
                            category: "Relatório",
                            campanhaNome: campaign.nome,
                            competenciaLabel: r.mes,
                            createdAt: r.uploadedAt,
                            regenerate: async () => {
                              const result = await freshUrlFn({
                                data: { campanhaId: campaign.id, relatorioId: r.id },
                              });
                              return result.url;
                            },
                          })
                        }
                        aria-label={`Visualizar ${r.nome}`}
                        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <a
                        href={r.url}
                        download
                        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {files.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Arquivos
            </p>
            <div className="space-y-1.5">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 dark:shadow-none"
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {f.nome}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenFile({
                        id: f.id,
                        friendlyName: f.nome,
                        url: f.url,
                        campanhaNome: campaign.nome,
                      })
                    }
                    aria-label={`Visualizar ${f.nome}`}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={f.url}
                    download
                    className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ClientFileViewer file={openFile} onClose={() => setOpenFile(null)} />
    </CampaignSection>
  );
}
