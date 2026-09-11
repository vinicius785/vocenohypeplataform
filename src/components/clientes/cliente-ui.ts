/** Helpers puros da migração visual de Clientes — busca/filtro/ordenação
 * operam só sobre campos já carregados em `Cliente[]` (nenhuma chamada
 * remota nova) e nenhum cálculo aqui inventa dado que não existe (ex.:
 * `Campaign` não tem status, então não existe "campanha ativa" real). */
import { initialsOf } from "@/components/metas/metas-ui-utils";
import type { Cliente } from "@/lib/clientes-store";

export { initialsOf };

export function waLink(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

export function mailtoLink(email: string): string | null {
  const trimmed = email.trim();
  return trimmed ? `mailto:${trimmed}` : null;
}

export type ClienteSortKey = "nome" | "recente" | "antigo" | "campanhas";

export type ClienteFiltersState = {
  campanha: "todos" | "com" | "sem";
  responsavelInterno: string[];
  contato: "todos" | "com" | "sem";
  sort: ClienteSortKey;
};

export const DEFAULT_CLIENTE_FILTERS: ClienteFiltersState = {
  campanha: "todos",
  responsavelInterno: [],
  contato: "todos",
  sort: "nome",
};

export const CLIENTE_SORT_LABEL: Record<ClienteSortKey, string> = {
  nome: "Nome (A–Z)",
  recente: "Cliente mais recente",
  antigo: "Cliente há mais tempo",
  campanhas: "Mais campanhas",
};

export function countActiveClienteFilters(f: ClienteFiltersState): number {
  let n = 0;
  if (f.campanha !== "todos") n += 1;
  if (f.responsavelInterno.length) n += 1;
  if (f.contato !== "todos") n += 1;
  return n;
}

function matchesSearch(c: Cliente, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const campanhaNomes = (c.campanhas ?? []).map((k) => k.nome).join(" ");
  const haystack = [c.empresa, c.responsavel, c.responsavelInterno, campanhaNomes]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function filterClientes(
  clientes: Cliente[],
  query: string,
  filters: ClienteFiltersState,
): Cliente[] {
  return clientes.filter((c) => {
    if (!matchesSearch(c, query)) return false;
    const count = c.campanhas?.length ?? 0;
    if (filters.campanha === "com" && count === 0) return false;
    if (filters.campanha === "sem" && count > 0) return false;
    if (
      filters.responsavelInterno.length > 0 &&
      !filters.responsavelInterno.includes(c.responsavelInterno || "")
    ) {
      return false;
    }
    if (filters.contato === "com" && !c.responsavel.trim()) return false;
    if (filters.contato === "sem" && c.responsavel.trim()) return false;
    return true;
  });
}

export function sortClientes(clientes: Cliente[], sort: ClienteSortKey): Cliente[] {
  const sorted = [...clientes];
  switch (sort) {
    case "nome":
      sorted.sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR"));
      break;
    case "recente":
      // "Cliente desde" mais recente primeiro — sem data vai por último,
      // nunca tratado como "mais recente que todo mundo".
      sorted.sort((a, b) => {
        if (!a.clienteDesde && !b.clienteDesde) return 0;
        if (!a.clienteDesde) return 1;
        if (!b.clienteDesde) return -1;
        return b.clienteDesde.localeCompare(a.clienteDesde);
      });
      break;
    case "antigo":
      sorted.sort((a, b) => {
        if (!a.clienteDesde && !b.clienteDesde) return 0;
        if (!a.clienteDesde) return 1;
        if (!b.clienteDesde) return -1;
        return a.clienteDesde.localeCompare(b.clienteDesde);
      });
      break;
    case "campanhas":
      sorted.sort((a, b) => (b.campanhas?.length ?? 0) - (a.campanhas?.length ?? 0));
      break;
  }
  return sorted;
}
