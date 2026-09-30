import { useSyncExternalStore, useRef } from "react";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { createTableArrayStore } from "./table-array-store";

export type Cliente = {
  id: string;
  photo?: string;
  empresa: string;
  responsavel: string;
  responsavelInterno: string;
  email: string;
  whatsapp: string;
  clienteDesde: string;
  campanhas?: Campaign[];
  /** Token do portal público fixo do cliente (/portal/$token) — gerado uma
   * vez, na lazy, na primeira vez que alguém pede o link. Mostra TODAS as
   * campanhas do cliente (por isso mora aqui, não em `Campaign`). */
  publicToken?: string;
  /** Preço final calculado no Simulador de Proposta (Comercial) e copiado
   * na conversão do lead — pré-preenche o orçamento ao montar uma nova
   * campanha pra este cliente, mas continua 100% editável à mão. */
  orcamentoSugerido?: number;
  /** Preenchido quando o cliente nasceu de "Importar do CRM"
   * (`ClienteFormSheet`) — id do `Lead` de origem, pra manter o vínculo
   * cliente↔CRM sem duplicar dado. Aditivo: clientes criados antes disso
   * simplesmente não têm o campo. */
  crmLeadId?: string;
  /** Status do ciclo de vida do CLIENTE (Fase 1 da reconstrução do modelo de
   * status) — independente do status de cada `Campaign`. Ausência é tratada
   * como `"active"` por `clienteStatus()` (`cliente-ui.ts`): todo cliente
   * existente antes desta fase é operacionalmente ativo hoje (confirmado em
   * auditoria + backfill da migration), então "sem status" nunca deve virar
   * "negociando" por omissão. */
  status?: ClienteStatus;
  /** Auditoria de troca de status (Fase 2 da reconstrução do modelo de
   * status) — mesmos nomes de campo usados em `Campaign` (`campanha-ui.ts`)
   * para consistência. `buildClienteStatusChangePatch()` em `cliente-ui.ts`
   * é a função pura que calcula esses valores; ainda não há UI de troca de
   * status pós-criação (isso é Fase 3) nem histórico completo de atividade
   * — só os campos de auditoria simples, análogos aos de campanha. */
  statusChangedAt?: string;
  statusChangedBy?: string;
  archivedAt?: string;
  archivedBy?: string;
  statusBeforeArchive?: ClienteStatus;
  /** Histórico de mudanças de status (Fase 3) — mesma forma de
   * `Campaign.activity` (`CampanhaActivityEntry`), gravado por
   * `buildClienteStatusChangePatch()` a cada troca. */
  activity?: ClienteActivityEntry[];
  /** Contexto comercial opcional, preenchido só quando o status inicial é
   * "capture" (Etapa 4 do wizard de criação, Fase 2). Todos texto livre
   * de propósito — sem forecast estruturado (faixa de orçamento/probabilidade
   * ficam fora de escopo desta fase). */
  proximoPasso?: string;
  previsaoFechamento?: string;
  observacaoNegociacao?: string;
};

export type ClienteActivityEntry = {
  id: string;
  author: string;
  action: string;
  createdAt: string;
  reason?: string;
};

export type ClienteStatus = "capture" | "active" | "closed" | "archived";

const store = createTableArrayStore<Cliente>("clientes");

export function initClientesSync(): Promise<void> {
  const p = store.init();
  store.subscribeRealtime();
  return p;
}

export const clientesStore = {
  get: store.get,
  set: store.set,
  subscribe: store.subscribe,
  hydrateOne: store.hydrateOne,
};

export function useClientes() {
  return useSyncExternalStore(clientesStore.subscribe, clientesStore.get, clientesStore.get);
}

/**
 * Assinatura seletiva com cache referencial: só re-renderiza quando a fatia
 * derivada muda. Use para consumir apenas o subset necessário (um cliente por
 * id, contagem, lista de campanhas) sem reagir a toda mutação global.
 */
export function useClientesSelector<T>(
  selector: (s: Cliente[]) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const lastRef = useRef<{ value: T; has: boolean }>({
    value: undefined as unknown as T,
    has: false,
  });
  const getSnapshot = () => {
    const next = selector(clientesStore.get());
    if (lastRef.current.has && isEqual(lastRef.current.value, next)) {
      return lastRef.current.value;
    }
    lastRef.current = { value: next, has: true };
    return next;
  };
  return useSyncExternalStore(clientesStore.subscribe, getSnapshot, getSnapshot);
}
