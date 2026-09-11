import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SemanticTone } from "@/lib/design-tokens";
import { EmptyState } from "./EmptyState";
import { SkeletonTableRow } from "./SkeletonPatterns";
import { sortRows, type SortDirection } from "./data-table-utils";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  getValue: (row: T) => unknown;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
};

export type DataTableAction<T> = {
  label: string;
  onClick: (row: T) => void;
  destructive?: boolean;
};

const PAGE_SIZE = 5;

/**
 * Fundação sobre `ui/table.tsx` (não migra nenhuma tabela real ainda —
 * ver auditoria: 12 arquivos com `<table>` cru, o primitivo shadcn tinha
 * zero consumidores). Estratégia mobile explícita: LINHA VIRA CARD (não
 * rolagem interna) — decisão registrada no relatório final pra
 * confirmação, porque cards combinam melhor com "premium, não painel
 * administrativo" do que uma tabela minúscula rolável.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  getRowId = (row: T) => row.id,
  selectable = false,
  actions,
  isLoading = false,
  emptyTitle = "Nada por aqui ainda",
  emptyDescription,
  getStatus,
  paginate = true,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId?: (row: T) => string;
  selectable?: boolean;
  actions?: DataTableAction<T>[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  getStatus?: (row: T) => { label: string; tone: SemanticTone } | undefined;
  paginate?: boolean;
}) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    return sortRows(rows, col.getValue, sortDirection);
  }, [rows, columns, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const pagedRows = paginate
    ? sortedRows.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)
    : sortedRows;

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonTableRow key={i} columns={columns.length} />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  // Estratégia mobile: cada linha vira um card compacto — nunca tabela
  // com rolagem horizontal (decisão registrada, ver docstring acima).
  if (isMobile) {
    return (
      <div className="space-y-2">
        {pagedRows.map((row) => {
          const status = getStatus?.(row);
          return (
            <div key={getRowId(row)} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  {columns.slice(0, 2).map((col) => (
                    <p key={col.key} className="truncate text-sm font-medium text-foreground">
                      {col.render ? col.render(row) : String(col.getValue(row) ?? "—")}
                    </p>
                  ))}
                </div>
                {status && (
                  <Badge variant={status.tone === "neutral" ? "secondary" : status.tone}>
                    {status.label}
                  </Badge>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {columns.slice(2).map((col) => (
                  // Label e valor em linhas separadas (não "Label: valor" numa
                  // linha só) — combinados, o texto não cabia na metade do
                  // card em 320px e cortava o valor monetário (achado ao vivo
                  // nesta etapa; valor nunca pode ser cortado).
                  <div key={col.key} className="min-w-0">
                    <p className="truncate text-text-secondary/80">{col.header}</p>
                    <p className="truncate font-medium text-foreground">
                      {col.render ? col.render(row) : String(col.getValue(row) ?? "—")}
                    </p>
                  </div>
                ))}
              </div>
              {actions && actions.length > 0 && (
                <div className="mt-3 flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        Ações
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {actions.map((action) => (
                        <DropdownMenuItem key={action.label} onClick={() => action.onClick(row)}>
                          {action.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          );
        })}
        {paginate && totalPages > 1 && (
          <PaginationFooter page={pageSafe} totalPages={totalPages} onChange={setPage} />
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && <TableHead className="w-10" />}
            {columns.map((col) => (
              <TableHead key={col.key} className={cn(col.align === "right" && "text-right")}>
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"
                  >
                    {col.header}
                    {sortKey === col.key ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            ))}
            {getStatus && <TableHead>Status</TableHead>}
            {actions && actions.length > 0 && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRows.map((row) => {
            const id = getRowId(row);
            const status = getStatus?.(row);
            return (
              <TableRow key={id} data-state={selected.has(id) ? "selected" : undefined}>
                {selectable && (
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => toggleSelect(id)}
                      aria-label="Selecionar linha"
                      className="h-4 w-4 cursor-pointer accent-brand"
                    />
                  </TableCell>
                )}
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(col.align === "right" && "text-right tabular-nums")}
                  >
                    {col.render ? col.render(row) : String(col.getValue(row) ?? "—")}
                  </TableCell>
                ))}
                {getStatus && (
                  <TableCell>
                    {status && (
                      <Badge variant={status.tone === "neutral" ? "secondary" : status.tone}>
                        {status.label}
                      </Badge>
                    )}
                  </TableCell>
                )}
                {actions && actions.length > 0 && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Mais ações">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {actions.map((action) => (
                          <DropdownMenuItem
                            key={action.label}
                            onClick={() => action.onClick(row)}
                            className={
                              action.destructive
                                ? "text-destructive focus:text-destructive"
                                : undefined
                            }
                          >
                            {action.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {paginate && totalPages > 1 && (
        <div className="border-t border-border px-4 py-2.5">
          <PaginationFooter page={pageSafe} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

function PaginationFooter({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3 text-xs text-text-secondary">
      <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <span>
        Página {page + 1} de {totalPages}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
      >
        Próxima
      </Button>
    </div>
  );
}
