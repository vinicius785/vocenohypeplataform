/** Helpers puros da migração visual de Clientes — busca/filtro/ordenação
 * operam só sobre campos já carregados em `Cliente[]` (nenhuma chamada
 * remota nova). `Campaign` e `Cliente` já têm status persistido (ver
 * `campanha-ui.ts` e o bloco de status de cliente abaixo, Fase 1 da
 * reconstrução do modelo de status). */
import { initialsOf } from "@/components/metas/metas-ui-utils";
import type { Cliente, ClienteStatus, ClienteActivityEntry } from "@/lib/clientes-store";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { legacyStage, type OpportunityStage } from "@/lib/comercial-engine";
import { normalizeForSearch } from "@/lib/mention-kinds";

export { initialsOf };
export type { ClienteStatus, ClienteActivityEntry };

export const CLIENTE_STATUS_LABEL: Record<ClienteStatus, string> = {
  capture: "Captação",
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
 * campanha (`campanhaStatus`, que assume "planning" por ser mais
 * conservador lá). */
export function clienteStatus(cliente: Cliente): ClienteStatus {
  return cliente.status ?? "active";
}

/** Transições válidas de status de cliente — lista EXAUSTIVA pedida
 * explicitamente na reconstrução do domínio Comercial/Clientes/Campanhas:
 *   Captação → Ativo
 *   Captação → Arquivado
 *   Ativo → Encerrado
 *   Encerrado → Ativo
 *   Encerrado → Arquivado
 *   Arquivado → Captação
 *   Arquivado → Ativo (com confirmação — a UI já confirma toda transição)
 * Deliberadamente SEM "Captação → Encerrado": um cliente que nunca foi
 * ativo deve ser arquivado, nunca encerrado (encerrado = relacionamento
 * que já esteve ativo e terminou). "Ativo → Arquivado" também não está na
 * lista pedida — encerrar é o caminho normal para sair de "Ativo". */
export const CLIENTE_STATUS_TRANSITIONS: Record<ClienteStatus, ClienteStatus[]> = {
  capture: ["active", "archived"],
  active: ["closed"],
  closed: ["active", "archived"],
  archived: ["capture", "active"],
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

/** Sugestão de status do cliente a partir da etapa do lead no funil
 * (Fase 5, "Importação do CRM"). Valores reais de `OPPORTUNITY_STAGES`
 * (`comercial-engine.ts`) — correspondência com a tabela do pedido:
 *   CONTATO_FEITO     ("Contato feito")          → capture
 *   REUNIAO_AGENDADA  ("Reunião agendada")       → capture
 *   PROPOSTA_PREPARO  ("Proposta em preparação") → capture
 *   PROPOSTA_ENVIADA  ("Proposta enviada")       → capture
 *   NEGOCIACAO        ("Negociação")             → capture (etapa comercial "Negociação" != status "Captação")
 *   GANHO             ("Ganho")                  → active
 *   PERDIDO           ("Perdido")                → "not-recommended"
 * Etapas fora da tabela (LEAD_RECEBIDO, REUNIAO_REALIZADA) seguem o mesmo
 * significado de "oportunidade em andamento" → capture. Valores legados
 * (`ganho`, `perdido`, ...) passam por `legacyStage` antes. */
export const LEAD_STAGE_CLIENTE_SUGGESTION: Record<
  OpportunityStage,
  ClienteStatus | "not-recommended"
> = {
  LEAD_RECEBIDO: "capture",
  CONTATO_FEITO: "capture",
  REUNIAO_AGENDADA: "capture",
  REUNIAO_REALIZADA: "capture",
  PROPOSTA_PREPARO: "capture",
  PROPOSTA_ENVIADA: "capture",
  NEGOCIACAO: "capture",
  GANHO: "active",
  PERDIDO: "not-recommended",
};

export function suggestClienteStatusFromLeadStage(
  stage: string | undefined,
): ClienteStatus | "not-recommended" {
  return LEAD_STAGE_CLIENTE_SUGGESTION[legacyStage(stage)];
}

/** Status pré-selecionado na Etapa 2 do wizard. "Criar do zero" → active;
 * "importar do Comercial" → `suggestClienteStatusFromLeadStage`. Para lead
 * perdido ("not-recommended") pré-seleciona "closed" — a UI exige uma
 * confirmação explícita na Etapa 1 antes de deixar avançar com esse lead. */
export function defaultClienteStatusForOrigin(
  origin: "scratch" | "crm-import",
  leadStage?: string,
): ClienteStatus {
  if (origin === "scratch") return "active";
  const s = suggestClienteStatusFromLeadStage(leadStage);
  return s === "not-recommended" ? "closed" : s;
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

/** Filtro de status de cliente. `"operacao"` é o default e mostra só quem está em operação:
 * Captação + Ativos. Encerrados e Arquivados nunca aparecem sem um filtro explícito
 * (`"closed"` / `"archived"`). */
export type ClienteStatusFilter = "operacao" | ClienteStatus;

export const CLIENTE_STATUS_FILTER_LABEL: Record<ClienteStatusFilter, string> = {
  operacao: "Em operação",
  capture: "Captação",
  active: "Ativos",
  closed: "Encerrados",
  archived: "Arquivados",
};

export function matchesClienteStatusFilter(c: Cliente, f: ClienteStatusFilter): boolean {
  const s = clienteStatus(c);
  return f === "operacao" ? s === "capture" || s === "active" : s === f;
}

/** Contagem por filtro de status — alimenta os indicadores clicáveis. */
export function countClientesByStatusFilter(
  clientes: Cliente[],
): Record<ClienteStatusFilter, number> {
  const out: Record<ClienteStatusFilter, number> = {
    operacao: 0,
    capture: 0,
    active: 0,
    closed: 0,
    archived: 0,
  };
  for (const c of clientes) {
    const s = clienteStatus(c);
    out[s] += 1;
    if (s === "capture" || s === "active") out.operacao += 1;
  }
  return out;
}

/** Entrada mais recente de `activity` (histórico real gravado na Fase 3),
 * ou `null` quando não há nenhuma — nunca inventa uma data. */
export function lastClienteActivityAt(c: Cliente): string | null {
  let best: string | null = null;
  for (const e of c.activity ?? []) {
    if (e.createdAt && (!best || e.createdAt > best)) best = e.createdAt;
  }
  return best;
}

/** Entrada de atividade "campanha criada" pra timeline do cliente (item 18
 * da reconstrução do domínio Comercial/Clientes/Campanhas/Contratos/
 * Financeiro: "Timeline unificada por cliente" precisa registrar, entre
 * outros eventos, "Campanha criada"). Usada pelos dois pontos de entrada
 * legítimos de criação de campanha (`ClientesSection.tsx`,
 * `ClienteDetailPage.tsx`) — só quando a campanha é NOVA, nunca numa
 * edição (o chamador decide isso comparando com a lista anterior). */
export function campanhaCreatedActivityEntry(campanhaNome: string): ClienteActivityEntry {
  return {
    id: crypto.randomUUID(),
    author: currentClienteActor(),
    action: `criou a campanha "${campanhaNome || "sem nome"}"`,
    createdAt: new Date().toISOString(),
  };
}

/** Motivo do match — usado pra explicar na UI por que dois cadastros
 * parecem ser o mesmo (item 6 da reconstrução do domínio Comercial/
 * Clientes/Campanhas/Contratos/Financeiro: "Detectar cliente existente por
 * vínculo, empresa, documento, e-mail, telefone e semelhança de nome"). Não
 * há campo de documento/CNPJ no cadastro hoje — fica de fora até existir. */
export type ClienteDuplicateMatchReason = "empresa" | "email" | "telefone" | "nome_parecido";

export type ClienteDuplicateMatch = { cliente: Cliente; reason: ClienteDuplicateMatchReason };

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Compara telefone por dígitos, olhando só os últimos 8 (linha fixa
 * mínima sem DDD) pra tolerar diferenças de formatação/DDI/DDD entre dois
 * cadastros do mesmo número — nunca compara strings vazias entre si (dois
 * cadastros sem telefone não são "duplicados" por isso). */
function samePhone(a: string, b: string): boolean {
  const da = onlyDigits(a);
  const db = onlyDigits(b);
  if (da.length < 8 || db.length < 8) return false;
  return da.slice(-8) === db.slice(-8);
}

/** "Semelhança de nome" tolerante a acento/caixa e a um nome ser prefixo
 * do outro (ex. "Acme" vs "Acme Corporação") — deliberadamente simples
 * (sem distância de edição): o objetivo é um alerta pra revisão humana,
 * nunca um bloqueio automático, então falso positivo ocasional é aceitável
 * e falso negativo é pior que isso. Nomes curtos (<4 chars normalizados)
 * nunca contam, pra não alertar em cada empresa de nome genérico. */
function similarName(a: string, b: string): boolean {
  const na = normalizeForSearch(a).trim();
  const nb = normalizeForSearch(b).trim();
  if (na.length < 4 || nb.length < 4) return false;
  if (na === nb) return true;
  return na.startsWith(nb) || nb.startsWith(na);
}

/** Único ponto de checagem de duplicidade na criação de cliente — usado
 * pelo wizard (`ClienteFormSheet.tsx`) antes de salvar. Verifica, nesta
 * ordem de prioridade (primeiro match encontrado vence): empresa idêntica,
 * e-mail idêntico, telefone igual, nome parecido. Nunca compara contra o
 * próprio registro em edição (o chamador já filtra isso via
 * `clientesExistentes`, que na prática nunca inclui o cliente atual). */
export function findPossibleDuplicateCliente(
  clientes: Cliente[],
  candidate: { empresa: string; email?: string; whatsapp?: string },
): ClienteDuplicateMatch | null {
  const empresa = normalizeForSearch(candidate.empresa.trim());
  const email = (candidate.email ?? "").trim().toLowerCase();
  const whatsapp = candidate.whatsapp ?? "";
  if (!empresa && !email) return null;

  for (const c of clientes) {
    if (empresa && normalizeForSearch(c.empresa.trim()) === empresa) {
      return { cliente: c, reason: "empresa" };
    }
  }
  if (email) {
    for (const c of clientes) {
      if (c.email.trim().toLowerCase() === email) return { cliente: c, reason: "email" };
    }
  }
  if (whatsapp) {
    for (const c of clientes) {
      if (samePhone(c.whatsapp, whatsapp)) return { cliente: c, reason: "telefone" };
    }
  }
  if (candidate.empresa.trim()) {
    for (const c of clientes) {
      if (similarName(c.empresa, candidate.empresa)) {
        return { cliente: c, reason: "nome_parecido" };
      }
    }
  }
  return null;
}

export const CLIENTE_DUPLICATE_REASON_LABEL: Record<ClienteDuplicateMatchReason, string> = {
  empresa: "mesmo nome de empresa",
  email: "mesmo e-mail",
  telefone: "mesmo telefone",
  nome_parecido: "nome parecido",
};

export type ClienteFiltersState = {
  status: ClienteStatusFilter;
  campanha: "todos" | "com" | "sem";
  responsavelInterno: string[];
  contato: "todos" | "com" | "sem";
  sort: ClienteSortKey;
};

export const DEFAULT_CLIENTE_FILTERS: ClienteFiltersState = {
  status: "operacao",
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
  if (f.status !== "operacao") n += 1;
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
    if (!matchesClienteStatusFilter(c, filters.status)) return false;
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
