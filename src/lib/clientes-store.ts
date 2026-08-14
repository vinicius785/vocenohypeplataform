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
};

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
