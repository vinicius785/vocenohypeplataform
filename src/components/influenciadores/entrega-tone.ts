import type { EntregaTone } from "@/lib/influencer-next-action";

/** Cor só como sinal semântico, na mesma família do Início: verde concluído, âmbar aguardando,
 * laranja ajuste pedido, azul em andamento. */
export const ENTREGA_TONE_DOT: Record<EntregaTone, string> = {
  ok: "bg-emerald-500",
  waiting: "bg-amber-500",
  adjust: "bg-orange-500",
  progress: "bg-sky-500",
  neutral: "bg-muted-foreground/50",
};
