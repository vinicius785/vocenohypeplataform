import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Eye, MoreVertical, Download } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { getFreshRelatorioUrlSession } from "@/lib/portal-auth.functions";
import { ClientFileViewer } from "../components/files/ClientFileViewer";
import type { ClientFile } from "../types/files";

type ReportRow = {
  id: string;
  campanhaId: string;
  campanhaNome: string;
  nome: string;
  mes: string;
  uploadedAt: string;
  url: string | null;
};

function competenceLabel(mes: string): string {
  const [year, month] = mes.split("-");
  const MONTHS = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const idx = Number(month) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} de ${year}` : mes;
}

/**
 * Central de relatórios — reestruturada pra seguir o padrão visual do
 * Portal V2 (`PageContainer`, filtros compactos, cards com contexto real)
 * e abrir no `ClientFileViewer` compartilhado em vez de um link "Ver" que
 * só abria a URL crua numa aba nova. Dado vem do mesmo `ClienteLinkData`
 * de sempre — nenhuma tabela nova. `url` já é uma signed URL de 1h
 * gerada a cada load (`buildClienteLinkData`); quando expira dentro da
 * mesma sessão, o viewer regenera sob demanda via
 * `getFreshRelatorioUrlSession` (relatórios são o único tipo de arquivo
 * do portal que guarda `storagePath`, então são os únicos pra quem dá
 * pra emitir uma URL nova com segurança).
 */
export function RelatoriosV2({ openFileId }: { openFileId?: string }) {
  const { data } = usePortalSessionData();
  const navigate = useNavigate();
  const freshUrlFn = useServerFn(getFreshRelatorioUrlSession);
  const [campaignFilter, setCampaignFilter] = useState<string>("todas");
  const [sortBy, setSortBy] = useState<"recentes" | "antigos" | "campanha">("recentes");

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

  const filtered =
    campaignFilter === "todas" ? reports : reports.filter((r) => r.campanhaId === campaignFilter);
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "campanha") return a.campanhaNome.localeCompare(b.campanhaNome);
    return sortBy === "recentes"
      ? b.uploadedAt.localeCompare(a.uploadedAt)
      : a.uploadedAt.localeCompare(b.uploadedAt);
  });

  const groups = useMemo(() => {
    const map = new Map<string, ReportRow[]>();
    for (const r of sorted) {
      const list = map.get(r.mes) ?? [];
      list.push(r);
      map.set(r.mes, list);
    }
    return Array.from(map.entries());
  }, [sorted]);

  const mostRecentId = sorted[0]?.id;

  const toClientFile = (r: ReportRow): ClientFile => ({
    id: r.id,
    friendlyName: r.nome,
    url: r.url,
    category: "Relatório",
    campanhaNome: r.campanhaNome,
    competenciaLabel: competenceLabel(r.mes),
    createdAt: r.uploadedAt,
    regenerate: async () => {
      const result = await freshUrlFn({
        data: { campanhaId: r.campanhaId, relatorioId: r.id },
      });
      return result.url;
    },
  });

  const openFile = (id: string) =>
    navigate({ to: "/portal-v2/relatorios", search: { arquivo: id } });
  const closeFile = () => navigate({ to: "/portal-v2/relatorios", search: {} });
  const activeReport = sorted.find((r) => r.id === openFileId);

  return (
    <PageContainer className="space-y-6">
      <header>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground md:text-[32px]">
          Relatórios
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Acompanhe os resultados das suas campanhas.
        </p>
      </header>

      {reports.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="todas">Todas as campanhas</option>
            {data.campanhas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-9 rounded-md border border-border bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="recentes">Mais recentes</option>
            <option value="antigos">Mais antigos</option>
            <option value="campanha">Campanha A–Z</option>
          </select>
        </div>
      )}

      {reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="Nenhum relatório disponível"
          description="Os relatórios das suas campanhas aparecerão aqui quando forem publicados."
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="Nenhum relatório corresponde aos filtros selecionados."
          secondaryAction={{ label: "Limpar filtros", onClick: () => setCampaignFilter("todas") }}
        />
      ) : (
        <div className="space-y-8">
          {groups.map(([mes, items]) => (
            <div key={mes}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {competenceLabel(mes)}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((r) => (
                  <div
                    key={`${r.campanhaId}:${r.id}`}
                    className="flex flex-col gap-3 rounded-2xl bg-card p-4 dark:shadow-none"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <FileText className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-foreground">{r.nome}</p>
                          {r.id === mostRecentId && (
                            <span className="shrink-0 rounded-full bg-brand-subtle px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                              Mais recente
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-text-secondary">
                          {r.campanhaNome}
                        </p>
                        <p className="truncate text-xs text-text-secondary">
                          Disponibilizado em {new Date(r.uploadedAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!r.url}
                        onClick={() => openFile(r.id)}
                        className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-brand text-sm font-medium text-brand-foreground hover:bg-brand-hover disabled:opacity-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Visualizar
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Mais ações para ${r.nome}`}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {r.url && (
                            <DropdownMenuItem asChild>
                              <a href={r.url} download className="flex items-center gap-2">
                                <Download className="h-3.5 w-3.5" /> Baixar arquivo
                              </a>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
