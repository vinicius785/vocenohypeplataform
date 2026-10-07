import { useMemo, useState } from "react";
import { Download, MoreVertical, Paperclip } from "lucide-react";
import { usePortalNavigate } from "../runtime/portal-runtime";
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
import {
  PortalFilterSelect,
  PortalFilterToolbar,
  PortalSearchField,
} from "../components/shared/PortalFilterToolbar";
import { ClientFileViewer } from "../components/files/ClientFileViewer";
import type { ClientFile } from "../types/files";
import { FILE_KIND_ICON } from "../lib/file-kind-icon";
import {
  availableTypeFilters,
  buildFileRows,
  fileKindOf,
  filterFiles,
  hasActiveFileFilter,
  NO_FILE_FILTERS,
  type FileFilters,
  type FileRow,
  type TypeFilter,
} from "../lib/arquivos-model";
import { dateBR } from "../lib/relatorios-model";

/**
 * Biblioteca de arquivos — mesma casca de Relatórios (`PortalPageHeader`, `PortalFilterToolbar`,
 * `PortalListRow`), mas orientada a descoberta: busca larga + campanha + tipo, todos combinados.
 * Agrega briefings, anexos de entrega e relatórios já presentes em `ClienteLinkData` — nenhuma
 * tabela nova. Filtros são estado local (client-side); só o arquivo aberto vai para a URL.
 *
 * Limitação honesta: briefings/anexos de entrega só têm a URL assinada persistida (1 ano), sem
 * `storagePath`, então não regeneram quando expira (relatórios regeneram sob demanda).
 */
export function ArquivosV2({ openFileId }: { openFileId?: string }) {
  const { data } = usePortalSessionData();
  const navigate = usePortalNavigate();
  const [filters, setFilters] = useState<FileFilters>(NO_FILE_FILTERS);
  const patch = (p: Partial<FileFilters>) => setFilters((f) => ({ ...f, ...p }));

  const files = useMemo(() => buildFileRows(data), [data]);
  const availableTypes = useMemo(() => availableTypeFilters(files), [files]);
  const filtered = useMemo(() => filterFiles(files, filters), [files, filters]);
  const active = hasActiveFileFilter(filters);
  const clear = () => setFilters(NO_FILE_FILTERS);
  const campaignsWithFiles = data.campanhas.filter((c) => files.some((f) => f.campanhaId === c.id));

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
    <PageContainer className="max-w-4xl space-y-5">
      <PortalPageHeader
        title="Arquivos"
        description="Encontre documentos e mídias compartilhados nas suas campanhas."
      />

      {files.length > 0 && (
        <PortalFilterToolbar onClear={active ? clear : undefined}>
          <PortalSearchField
            value={filters.query}
            onChange={(query) => patch({ query })}
            placeholder="Buscar arquivo..."
            label="Buscar arquivo"
          />
          {campaignsWithFiles.length > 1 && (
            <PortalFilterSelect
              label="Filtrar por campanha"
              value={filters.campaignId}
              onChange={(campaignId) => patch({ campaignId })}
            >
              <option value="todas">Todas as campanhas</option>
              {campaignsWithFiles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </PortalFilterSelect>
          )}
          <PortalFilterSelect
            label="Filtrar por tipo"
            value={filters.type}
            onChange={(type) => patch({ type: type as TypeFilter })}
          >
            <option value="todos">Todos os tipos</option>
            {availableTypes.has("documentos") && <option value="documentos">Documentos</option>}
            {availableTypes.has("imagens") && <option value="imagens">Imagens</option>}
            {availableTypes.has("videos") && <option value="videos">Vídeos</option>}
            {availableTypes.has("audios") && <option value="audios">Áudios</option>}
            <option value="relatorios">Relatórios</option>
          </PortalFilterSelect>
        </PortalFilterToolbar>
      )}

      {files.length === 0 ? (
        <EmptyState
          compact
          icon={<Paperclip className="h-5 w-5" />}
          title="Nenhum arquivo encontrado"
          description="Os documentos e mídias compartilhados nas suas campanhas aparecerão aqui."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          icon={<Paperclip className="h-5 w-5" />}
          title="Nenhum arquivo corresponde aos filtros selecionados."
          secondaryAction={active ? { label: "Limpar filtros", onClick: clear } : undefined}
        />
      ) : (
        <PortalListPanel>
          {filtered.map((f) => {
            const Icon = FILE_KIND_ICON[fileKindOf(f)];
            const date = dateBR(f.createdAt);
            return (
              <PortalListRow
                key={f.id}
                icon={<Icon className="h-4 w-4" />}
                onClick={() => openFile(f.id)}
                title={f.nome}
                meta={`${f.categoria} · ${f.campanhaNome}${date ? ` · Enviado em ${date}` : ""}`}
                trailing={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Mais ações para ${f.nome}`}
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
