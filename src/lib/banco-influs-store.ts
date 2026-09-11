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
  telefone?: string;
  email?: string;
  redes: Rede[];
  /** Id (de `redes[].id`) da rede considerada principal — só afeta exibição
   * (qual rede aparece em destaque no card/cabeçalho); sem valor, usa a
   * primeira rede cadastrada. */
  redePrincipalId?: string;
  endereco?: Endereco;
  /** Observações globais sobre o influenciador (não específicas de uma
   * campanha) — ex: preferências de contato, restrições de conteúdo. */
  observacoes?: string;
  /** Arquivamento reversível — sai da listagem padrão sem apagar histórico
   * nem exigir confirmação destrutiva (diferente de excluir). */
  arquivado?: boolean;
  createdAt?: string;
  updatedAt?: string;
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
