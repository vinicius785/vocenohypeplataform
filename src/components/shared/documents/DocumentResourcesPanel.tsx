import { useMemo, useState } from "react";
import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  FilterChips,
  FilterGroup,
  FilterPill,
  FilterPopover,
  FilterRow,
  FilterSearch,
  FilterToolbar,
} from "@/components/shared/FilterToolbar";
import { useConfirm } from "@/hooks/use-confirm";
import {
  NO_FILTERS,
  SOURCE_LABEL,
  countActiveFilters,
  filterResources,
  presentSourceTypes,
  sortResources,
  type DocumentFilters,
  type DocumentInput,
  type DocumentResource,
} from "@/lib/document-resources";
import { DocumentResourceCard } from "./DocumentResourceCard";
import {
  DocumentResourceFormDialog,
  type DocumentCategoryOption,
} from "./DocumentResourceFormDialog";

/**
 * Experiência ÚNICA de DOCUMENTOS/RECURSOS — Projetos, Campanhas e Comercial usam este mesmo
 * painel (busca + filtros + "Adicionar" + galeria de cards + vazio + formulário). Cada contexto só
 * fornece os dados já convertidos para `DocumentResource`, o que o contexto permite
 * (`categories`, `allowPin`, `allowFileUpload`) e as ações de persistência; o painel não conhece
 * nenhuma tabela nem permissão.
 *
 * Responsivo ao contêiner (`@container`): 1 coluna no estreito, 2 no médio, 3 no amplo — sem
 * overflow horizontal.
 */
export function DocumentResourcesPanel({
  documents,
  contextLabel,
  emptyTitle,
  emptyDescription,
  categories,
  allowPin = false,
  allowFileUpload = false,
  maxFileBytes,
  onCreate,
  onUpdate,
  onDelete,
  onTogglePin,
}: {
  documents: DocumentResource[];
  /** Complemento de frase, ex.: "ao projeto", "à campanha", "ao Comercial". */
  contextLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  categories?: DocumentCategoryOption[];
  allowPin?: boolean;
  allowFileUpload?: boolean;
  maxFileBytes?: number;
  onCreate: (input: DocumentInput) => void;
  onUpdate: (id: string, input: DocumentInput) => void;
  onDelete: (id: string) => void;
  onTogglePin?: (id: string) => void;
}) {
  const [filters, setFilters] = useState<DocumentFilters>(NO_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentResource | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const categoryLabel = useMemo(
    () => new Map((categories ?? []).map((c) => [c.value, c.label])),
    [categories],
  );
  const sourceTypes = useMemo(() => presentSourceTypes(documents), [documents]);
  const visible = useMemo(
    () => sortResources(filterResources(documents, filters), allowPin),
    [documents, filters, allowPin],
  );

  const chips = [
    ...(filters.category
      ? [
          {
            id: "categoria",
            label: categoryLabel.get(filters.category) ?? filters.category,
            onRemove: () => setFilters((f) => ({ ...f, category: null })),
          },
        ]
      : []),
    ...(filters.sourceType
      ? [
          {
            id: "tipo",
            label: SOURCE_LABEL[filters.sourceType],
            onRemove: () => setFilters((f) => ({ ...f, sourceType: null })),
          },
        ]
      : []),
  ];
  const clearFilters = () => setFilters((f) => ({ ...f, category: null, sourceType: null }));

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const remove = async (d: DocumentResource) => {
    const ok = await confirm(
      `Você está prestes a excluir "${d.title}".\nEsta ação não pode ser desfeita.`,
      {
        title: "Excluir documento?",
        confirmLabel: "Excluir",
        destructive: true,
      },
    );
    if (ok) onDelete(d.id);
  };

  return (
    <div className="@container space-y-4">
      <FilterToolbar>
        <FilterRow>
          <FilterSearch
            value={filters.query}
            onChange={(query) => setFilters((f) => ({ ...f, query }))}
            placeholder="Buscar por nome ou link"
          />
          {(categories?.length || sourceTypes.length > 1) && (
            <FilterPopover
              title="Filtrar documentos"
              activeCount={countActiveFilters(filters)}
              onClear={clearFilters}
            >
              {categories && categories.length > 0 && (
                <FilterGroup label="Categoria">
                  <FilterPill
                    active={filters.category === null}
                    onClick={() => setFilters((f) => ({ ...f, category: null }))}
                  >
                    Todas
                  </FilterPill>
                  {categories.map((c) => (
                    <FilterPill
                      key={c.value}
                      active={filters.category === c.value}
                      onClick={() => setFilters((f) => ({ ...f, category: c.value }))}
                    >
                      {c.label}
                    </FilterPill>
                  ))}
                </FilterGroup>
              )}
              {sourceTypes.length > 1 && (
                <FilterGroup label="Tipo">
                  <FilterPill
                    active={filters.sourceType === null}
                    onClick={() => setFilters((f) => ({ ...f, sourceType: null }))}
                  >
                    Todos
                  </FilterPill>
                  {sourceTypes.map((s) => (
                    <FilterPill
                      key={s}
                      active={filters.sourceType === s}
                      onClick={() => setFilters((f) => ({ ...f, sourceType: s }))}
                    >
                      {SOURCE_LABEL[s]}
                    </FilterPill>
                  ))}
                </FilterGroup>
              )}
            </FilterPopover>
          )}
          <Button variant="primary" size="sm" className="sm:ml-auto" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </Button>
        </FilterRow>
        <FilterChips chips={chips} onClear={clearFilters} />
      </FilterToolbar>

      {documents.length === 0 ? (
        <EmptyState
          compact
          icon={<FolderOpen className="h-5 w-5" />}
          title={emptyTitle}
          description={emptyDescription}
          primaryAction={{ label: "Adicionar documento", onClick: openCreate }}
        />
      ) : visible.length === 0 ? (
        <EmptyState compact title="Nenhum resultado para esta busca ou filtro." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 @md:grid-cols-2 @2xl:grid-cols-3">
          {visible.map((d) => (
            <li key={d.id} className="min-w-0">
              <DocumentResourceCard
                doc={d}
                categoryLabel={d.category ? categoryLabel.get(d.category) : undefined}
                canEdit
                canPin={allowPin && !!onTogglePin}
                onEdit={() => {
                  setEditing(d);
                  setFormOpen(true);
                }}
                onTogglePin={() => onTogglePin?.(d.id)}
                onDelete={() => void remove(d)}
              />
            </li>
          ))}
        </ul>
      )}

      <DocumentResourceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        categories={categories}
        allowFileUpload={allowFileUpload}
        maxFileBytes={maxFileBytes}
        contextLabel={contextLabel}
        onSubmit={(input) => (editing ? onUpdate(editing.id, input) : onCreate(input))}
      />
      {confirmDialog}
    </div>
  );
}
