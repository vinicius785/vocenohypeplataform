/** Helpers puros da migração visual de Clientes — busca/filtro/ordenação
 * operam só sobre campos já carregados em `Cliente[]` (nenhuma chamada
 * remota nova). `Campaign` e `Cliente` já têm status persistido (ver
 * `campanha-ui.ts` e o bloco de status de cliente abaixo, Fase 1 da
 * reconstrução do modelo de status). */
import { initialsOf } from "@/components/metas/metas-ui-utils";
import type { Cliente, ClienteStatus, ClienteActivityEntry } from "@/lib/clientes-store";
import type { Campaign } from "@/components/VincularCampanhaDialog";

export { initialsOf };
export type { ClienteStatus, ClienteActivityEntry };

export const CLIENTE_STATUS_LABEL: Record<ClienteStatus, string> = {
  negotiating: "Negociando",
  active: "Ativo",
  closed: "Encerrado",
  archived: "Arquivado",
};

/** Clientes criados antes desta fase nunca tiveram `status` gravado — a
 * migration de backfill (`clientes_status`) cobre os que já existiam no
 * banco quando ela rodou. Ausência é tratada como `"active"`: decisão de
 * produto explícita, pois TODOS os clientes existentes hoje são
 * operacionalmente ativos (confirmado em auditoria — nenhum sinal de
 * "negociando" nos dados atuais), diferente do critério usado para
 * campanha (`campanhaStatus`, que assume "negotiation" por ser mais
 * conservador lá). */
export function clienteStatus(cliente: Cliente): ClienteStatus {
  return cliente.status ?? "active";
}

/** Transições válidas de status de cliente (Fase 2 da reconstrução do
 * modelo de status) — mesmo padrão de `CAMPANHA_STATUS_TRANSITIONS`
 * (`campanha-ui.ts`), mas simplificado: aqui só a lista de destinos válidos,
 * sem `actionLabel`/`confirmMessage`, porque nesta fase não existe ainda o
 * dialog de mudança de status pós-criação (Fase 3) que consumiria isso como
 * ações de UI. "archived" não tem transições diretas listadas porque a
 * restauração depende de `statusBeforeArchive` (igual campanha). */
export const CLIENTE_STATUS_TRANSITIONS: Record<ClienteStatus, ClienteStatus[]> = {
  negotiating: ["active", "closed", "archived"],
  active: ["closed", "archived"],
  closed: ["active", "archived"],
  archived: [],
};

/** Nome de quem está agindo, pra auditoria de troca de status — mesma
 * convenção já usada em `currentCampanhaActor()` (`campanha-ui.ts`), lida do
 * mesmo `config:perfil` do localStorage. Duplicada aqui (em vez de
 * importada) porque `campanha-ui.ts` importa `Cliente` deste módulo
 * indiretamente via `Campaign`/`clientes-store` — importar de lá criaria
 * risco de ciclo sem ganho real. */
export function currentClienteActor(): string {
  if (typeof window === "undefined") return "Você";
  try {
    const raw = window.localStorage.getItem("config:perfil");
    if (raw) {
      const name = ((JSON.parse(raw) as { nome?: string }).nome ?? "").trim();
      if (name) return name;
    }
  } catch {
    /* ignore */
  }
  return "Você";
}

/** Monta o patch de uma troca de status de cliente — função pura usada pelo
 * dialog de mudança de status (Fase 3, `ClienteStatusControl.tsx`). Registra
 * os mesmos campos de auditoria usados em `Campaign` (`statusChangedAt/By`,
 * `archivedAt/By`, `statusBeforeArchive`) e anexa uma entrada em `activity`
 * (mesma forma/texto de `buildStatusChangePatch` de campanha). */
export function buildClienteStatusChangePatch(
  cliente: Cliente,
  next: ClienteStatus,
  reason?: string,
): Partial<Cliente> {
  const current = clienteStatus(cliente);
  const author = currentClienteActor();
  const now = new Date().toISOString();
  const trimmed = reason?.trim();
  const entry: ClienteActivityEntry = {
    id: crypto.randomUUID(),
    author,
    action: `alterou o status de ${CLIENTE_STATUS_LABEL[current]} para ${CLIENTE_STATUS_LABEL[next]}`,
    createdAt: now,
    ...(trimmed ? { reason: trimmed } : {}),
  };
  const patch: Partial<Cliente> = {
    status: next,
    statusChangedAt: now,
    statusChangedBy: author,
    activity: [...(cliente.activity ?? []), entry],
  };
  if (next === "archived") {
    patch.archivedAt = now;
    patch.archivedBy = author;
    patch.statusBeforeArchive = current;
  } else if (current === "archived") {
    patch.statusBeforeArchive = undefined;
  }
  return patch;
}

/** Campanhas que tornam sensível encerrar/arquivar o cliente (Fase 3): só
 * importa quando o destino é "closed"/"archived"; aí retorna as campanhas
 * com status "active". Lista vazia = segue o fluxo normal. Nunca bloqueia
 * sozinha — a UI pede confirmação explícita mostrando essas campanhas. */
export function activeCampaignsBlockingClienteStatus(
  cliente: Cliente,
  next: ClienteStatus,
  statusOf: (c: Campaign) => string,
): Campaign[] {
  if (next !== "closed" && next !== "archived") return [];
  return (cliente.campanhas ?? []).filter((c) => statusOf(c) === "active");
}

/** Destino da restauração de um cliente arquivado — o status de antes de
 * arquivar, ou "active" quando não foi gravado (arquivados antes da Fase 3). */
export function clienteRestoreTarget(cliente: Cliente): ClienteStatus {
  const prev = cliente.statusBeforeArchive;
  return prev && prev !== "archived" ? prev : "active";
}

/** Regra de default do status inicial no wizard de criação (Etapa 2, Fase
 * 2): "criar do zero" mantém o comportamento atual (`"active"`); "importar
 * do Comercial" usa `"negotiating"` por padrão, EXCETO quando o lead de
 * origem já está marcado como ganho no funil (`stage === "GANHO"`,
 * `OPPORTUNITY_STAGES` em `comercial-engine.ts`), caso em que o default é
 * `"active"`. Nunca esconde as outras opções — isso é decidido pela UI do
 * wizard, esta função só calcula o default pré-selecionado. Recebe só o
 * `stage` (não o `Lead` inteiro) pra ficar testável sem depender do tipo
 * completo de `comercial.ts`. */
export function defaultClienteStatusForOrigin(
  origin: "scratch" | "crm-import",
  leadStage?: string,
): ClienteStatus {
  if (origin === "scratch") return "active";
  return leadStage === "GANHO" ? "active" : "negotiating";
}

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
