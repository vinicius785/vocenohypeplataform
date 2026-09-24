import { useMemo, useState } from "react";
import { Paperclip, Download, Search } from "lucide-react";
import { usePortalSessionData } from "@/components/portal/portal-session-context";

type FileRow = {
  id: string;
  nome: string;
  tipo: string;
  campanhaId: string;
  campanhaNome: string;
  url: string;
};

/**
 * Central de arquivos — agrega briefings e anexos de entrega já presentes
 * em `ClienteLinkData` (nenhuma tabela nova). Nota honesta: os links de
 * briefing/anexo de entrega hoje são URLs assinadas de 1 ano persistidas
 * no JSONB (anti-padrão já mapeado na auditoria da V2) — corrigir isso é
 * um trabalho de backend fora desta fatia; esta página só lê o que existe.
 */
export function ArquivosV2() {
  const { data } = usePortalSessionData();
  const [query, setQuery] = useState("");

  const files: FileRow[] = useMemo(() => {
    const rows: FileRow[] = [];
    for (const campanha of data.campanhas) {
      for (const influencer of campanha.influencers) {
        if (influencer.briefingAnexoUrl) {
          rows.push({
            id: `briefing:${influencer.id}`,
            nome: influencer.briefingAnexoNome || "Briefing",
            tipo: "Briefing",
            campanhaId: campanha.id,
            campanhaNome: campanha.nome,
            url: influencer.briefingAnexoUrl,
          });
        }
        for (const entrega of influencer.entregas) {
          for (const anexo of entrega.anexos ?? []) {
            rows.push({
              id: `anexo:${anexo.id}`,
              nome: anexo.nome,
              tipo: anexo.categoria,
              campanhaId: campanha.id,
              campanhaNome: campanha.nome,
              url: anexo.url,
            });
          }
        }
      }
      for (const relatorio of campanha.relatorios) {
        if (relatorio.url) {
          rows.push({
            id: `relatorio:${relatorio.id}`,
            nome: relatorio.nome,
            tipo: "Relatório",
            campanhaId: campanha.id,
            campanhaNome: campanha.nome,
            url: relatorio.url,
          });
        }
      }
    }
    return rows;
  }, [data]);

  const filtered = files.filter((f) => f.nome.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Arquivos</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.clienteNome}</p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar arquivo..."
          className="w-full max-w-sm rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum arquivo encontrado.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <Paperclip className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{f.nome}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {f.tipo} · {f.campanhaNome}
                </p>
              </div>
              <a
                href={f.url}
                download
                className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
