import { useMemo, useState } from "react";
import { FileText, Download, Eye } from "lucide-react";
import { usePortalSessionData } from "@/components/portal/portal-session-context";

type ReportRow = {
  id: string;
  campanhaId: string;
  campanhaNome: string;
  nome: string;
  mes: string;
  uploadedAt: string;
  url: string | null;
};

/**
 * Central de relatórios — lista todos os `relatorios` já presentes em
 * `ClienteLinkData` (mesmo dado da V1, `url` já é uma signed URL fresca
 * gerada a cada load pelo `buildClienteLinkData`, não algo persistido).
 * Limitação honesta: não existe hoje nenhuma tabela de "relatório lido"
 * por usuário — o destaque "novo" é uma heurística por data de upload
 * (≤7 dias), não um registro real de visualização por usuário.
 */
export function RelatoriosV2() {
  const { data } = usePortalSessionData();
  const [campaignFilter, setCampaignFilter] = useState<string>("todas");

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
  const sorted = [...filtered].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  const isNew = (uploadedAt: string) =>
    Date.now() - new Date(uploadedAt).getTime() < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Relatórios</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.clienteNome}</p>
      </header>

      <select
        value={campaignFilter}
        onChange={(e) => setCampaignFilter(e.target.value)}
        className="w-fit rounded-lg border border-border bg-card px-3 py-2 text-sm"
      >
        <option value="todas">Todas as campanhas</option>
        {data.campanhas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum relatório disponível ainda.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((r) => (
            <div
              key={`${r.campanhaId}:${r.id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{r.nome}</p>
                  {isNew(r.uploadedAt) && (
                    <span className="shrink-0 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                      Novo
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {r.campanhaNome} · {r.mes} · {new Date(r.uploadedAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              {r.url ? (
                <div className="flex shrink-0 gap-1">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Eye className="h-3.5 w-3.5" /> Ver
                  </a>
                  <a
                    href={r.url}
                    download
                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">Indisponível</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
