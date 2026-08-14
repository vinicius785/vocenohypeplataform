import type { Rede } from "@/components/influenciadores/InfluencerBoard";
import { createTableArrayStore } from "./table-array-store";
import type { TierId } from "./pricing";

export type Endereco = {
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  pais?: string;
};

export type BankInflu = {
  id: string;
  nome: string;
  foto?: string;
  nicho?: string;
  /** Faixa de audiência (ver src/lib/pricing.ts) — usada pelo Simulador de
   * Proposta (Comercial) pra estimar custo. Sugerida a partir dos
   * seguidores cadastrados, mas sempre editável manualmente. */
  tier?: TierId;
  redes: Rede[];
  endereco?: Endereco;
};

const store = createTableArrayStore<BankInflu>("banco_influenciadores");

export function initBancoInflusSync(): Promise<void> {
  const p = store.init();
  store.subscribeRealtime();
  return p;
}

export function loadBank(): BankInflu[] {
  return store.get();
}

export function saveBank(list: BankInflu[]) {
  store.set(() => list);
}

export function onBankChange(callback: () => void): () => void {
  return store.subscribe(callback);
}
