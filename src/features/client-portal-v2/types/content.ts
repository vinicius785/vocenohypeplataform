import type { PublicEntrega } from "@/lib/portal-types";

export type ContentItem = {
  entrega: PublicEntrega;
  campanhaId: string;
  campanhaNome: string;
  influencerId: string;
  influencerNome: string;
};
