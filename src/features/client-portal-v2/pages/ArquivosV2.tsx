import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  FileText,
  Film,
  Image as ImageIcon,
  Music,
  Paperclip,
  Search,
  MoreVertical,
  Eye,
  Download,
} from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { inferFileKind, type ClientFileKind } from "../lib/client-file-format";
import { ClientFileViewer } from "../components/files/ClientFileViewer";
import type { ClientFile } from "../types/files";

type FileRow = {
  id: string;
  nome: string;
  categoria: string;
  campanhaId: string;
  campanhaNome: string;
  influencerNome?: string;
  url: string;
  createdAt?: string;
};

type TypeFilter = "todos" | "documentos" | "imagens" | "videos" | "audios" | "relatorios";

const KIND_TO_FILTER: Record<ClientFileKind, TypeFilter> = {
  pdf: "documentos",
  text: "documentos",
  image: "imagens",
  video: "videos",
  audio: "audios",
  unsupported: "documentos",
};

const TYPE_ICON: Record<ClientFileKind, typeof FileText> = {
  pdf: FileText,
  text: FileText,
  image: ImageIcon,
  video: Film,
  audio: Music,
  unsupported: Paperclip,
};

/**
 * Central de arquivos — reestruturada pra seguir o padrão visual do
 * Portal V2 e abrir no `ClientFileViewer` compartilhado (nunca mais
 * download direto ao clicar). Agrega briefings, anexos de entrega e
 * relatórios já presentes em `ClienteLinkData` — nenhuma tabela nova.
 *
 * Limitação honesta, não escondida: briefings/anexos de entrega hoje só
 * têm a URL já assinada persistida (1 ano, anti-padrão pré-existente —
 * ver auditoria), sem `storagePath` guardado, então não há como emitir
 * uma URL nova quando essa expira (diferente de relatórios, que têm
 * `storagePath` e regeneram sob demanda). Corrigir isso é trabalho de
 * modelo de dados fora do escopo desta rodada.
 */
export function ArquivosV2({ openFileId }: { openFileId?: string }) {
  const { data } = usePortalSessionData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("todas");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");

  const files: FileRow[] = useMemo(() => {
    const rows: FileRow[] = [];
    for (const campanha of data.campanhas) {
      for (const influencer of campanha.influencers) {
        if (influencer.briefingAnexoUrl) {
          rows.push({
            id: `briefing:${influencer.id}`,
            nome: influencer.briefingAnexoNome || "Briefing",
            categoria: "Briefing",
            campanhaId: campanha.id,
            campanhaNome: campanha.nome,
            influencerNome: influencer.nome,
            url: influencer.briefingAnexoUrl,
          });
        }
        for (const entrega of influencer.entregas) {
          for (const anexo of entrega.anexos ?? []) {
            rows.push({
              id: `anexo:${anexo.id}`,
              nome: anexo.nome,
              categoria: anexo.categoria,
              campanhaId: campanha.id,
              campanhaNome: campanha.nome,
              influencerNome: influencer.nome,
              url: anexo.url,
              createdAt: anexo.criadoEm,
            });
          }
        }
      }
      for (const relatorio of campanha.relatorios) {
        if (relatorio.url) {
          rows.push({
            id: `relatorio:${relatorio.id}`,
            nome: relatorio.nome,
            categoria: "Relatório",
            campanhaId: campanha.id,
            campanhaNome: campanha.nome,
            url: relatorio.url,
            createdAt: relatorio.uploadedAt,
          });
        }
      }
    }
    return rows;
  }, [data]);

  const availableTypes = useMemo(() => {
    const set = new Set<TypeFilter>();
    for (const f of files) set.add(KIND_TO_FILTER[inferFileKind(f.url)]);
    return set;
  }, [files]);

  const filtered = files.filter((f) => {
    if (query && !f.nome.toLowerCase().includes(query.toLowerCase())) return false;
    if (campaignFilter !== "todas" && f.campanhaId !== campaignFilter) return false;
    if (typeFilter !== "todos") {
      const kind = inferFileKind(f.url);
      if (
        typeFilter === "relatorios"
          ? f.categoria !== "Relatório"
          : KIND_TO_FILTER[kind] !== typeFilter
      ) {
        return false;
      }
    }
    return true;
  });

  const hasActiveFilter =
    query.trim().length > 0 || campaignFilter !== "todas" || typeFilter !== "todos";

  const toClientFile = (f: FileRow): ClientFile => ({
    id: f.id,
    friendlyName: f.nome,
    url: f.url,
    category: f.categoria,
    campanhaNome: f.campanhaNome,
    influencerNome: f.influencerNome,
    createdAt: f.createdAt,
  });

  const openFile = (id: string) => navigate({ to: "/portal-v2/arquivos", search: { arquivo: id } });
  const closeFile = () => navigate({ to: "/portal-v2/arquivos", search: {} });
  const activeFile = files.find((f) => f.id === openFileId);

  return (
    <PageContainer className="space-y-6">
      <header>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground md:text-[32px]">
          Arquivos
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Encontre documentos e mídias compartilhados nas suas campanhas.
        </p>
      </header>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar arquivo"
              className="h-9 w-56 rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
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
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="h-9 rounded-md border border-border bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="todos">Todos os tipos</option>
            {availableTypes.has("documentos") && <option value="documentos">Documentos</option>}
            {availableTypes.has("imagens") && <option value="imagens">Imagens</option>}
            {availableTypes.has("videos") && <option value="videos">Vídeos</option>}
            {availableTypes.has("audios") && <option value="audios">Áudios</option>}
            <option value="relatorios">Relatórios</option>
          </select>
        </div>
      )}

      {files.length === 0 ? (
        <EmptyState
          icon={<Paperclip className="h-5 w-5" />}
          title="Nenhum arquivo encontrado"
          description="Os documentos e mídias compartilhados nas suas campanhas aparecerão aqui."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Paperclip className="h-5 w-5" />}
          title="Nenhum arquivo corresponde aos filtros selecionados."
          secondaryAction={
            hasActiveFilter
              ? {
                  label: "Limpar filtros",
                  onClick: () => {
                    setQuery("");
                    setCampaignFilter("todas");
                    setTypeFilter("todos");
                  },
                }
              : undefined
          }
        />
      ) : (
        <div className="divide-y divide-border/70 rounded-2xl bg-card dark:shadow-none">
          {filtered.map((f) => {
            const kind = inferFileKind(f.url);
            const Icon = TYPE_ICON[kind];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => openFile(f.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{f.nome}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {f.categoria} · {f.campanhaNome}
                    {f.influencerNome ? ` · ${f.influencerNome}` : ""}
                  </p>
                  {f.createdAt && (
                    <p className="truncate text-xs text-text-secondary">
                      Enviado em {new Date(f.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
                <span className="hidden shrink-0 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground sm:flex sm:h-8">
                  <Eye className="h-3.5 w-3.5" />
                  Visualizar
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Mais ações para ${f.nome}`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <a
                        href={f.url}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2"
                      >
                        <Download className="h-3.5 w-3.5" /> Baixar arquivo
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </button>
            );
          })}
        </div>
      )}

      <ClientFileViewer file={activeFile ? toClientFile(activeFile) : null} onClose={closeFile} />
    </PageContainer>
  );
}
