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
import { PortalPageHeader } from "../components/shared/PortalPageHeader";
import { PortalListPanel, PortalListRow } from "../components/shared/PortalListPanel";
import { portalFieldBase } from "../components/shared/portal-field-styles";
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
 * Central de arquivos — mesmo sistema visual de `CampanhasV2.tsx`
 * (fonte da verdade): `PortalPageHeader`, `portalFieldBase` nos filtros,
 * `PortalListPanel`/`PortalListRow` na lista (linha inteira clicável,
 * chevron discreto — nunca mais densidade de painel administrativo nem
 * "Visualizar" repetido em cada linha). Agrega briefings, anexos de
 * entrega e relatórios já presentes em `ClienteLinkData` — nenhuma
 * tabela nova.
 *
 * Limitação honesta, não escondida: briefings/anexos de entrega hoje só
 * têm a URL já assinada persistida (1 ano, anti-padrão pré-existente —
 * ver auditoria), sem `storagePath` guardado, então não há como emitir
 * uma URL nova quando essa expira (diferente de relatórios, que
 * regeneram sob demanda). Corrigir isso é modelo de dado fora do escopo
 * desta rodada.
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
      <PortalPageHeader
        title="Arquivos"
        description="Encontre documentos e mídias compartilhados nas suas campanhas."
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar arquivo"
              className={`${portalFieldBase} w-56 pl-9`}
            />
          </div>
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className={portalFieldBase}
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
            className={portalFieldBase}
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
        <PortalListPanel>
          {filtered.map((f) => {
            const kind = inferFileKind(f.url);
            const Icon = TYPE_ICON[kind];
            return (
              <PortalListRow
                key={f.id}
                icon={<Icon className="h-4.5 w-4.5" />}
                onClick={() => openFile(f.id)}
                title={f.nome}
                meta={
                  <>
                    <div>
                      {f.categoria} · {f.campanhaNome}
                      {f.influencerNome ? ` · ${f.influencerNome}` : ""}
                    </div>
                    {f.createdAt && (
                      <div>Enviado em {new Date(f.createdAt).toLocaleDateString("pt-BR")}</div>
                    )}
                  </>
                }
                trailing={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Mais ações para ${f.nome}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <a href={f.url} download className="flex items-center gap-2">
                          <Download className="h-3.5 w-3.5" /> Baixar arquivo
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              />
            );
          })}
        </PortalListPanel>
      )}

      <ClientFileViewer file={activeFile ? toClientFile(activeFile) : null} onClose={closeFile} />
    </PageContainer>
  );
}
