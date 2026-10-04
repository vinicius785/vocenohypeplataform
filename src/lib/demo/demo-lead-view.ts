import type { DemoAccessState, DemoSessionView } from "./demo-types";

/**
 * Apresentação da Demo no lead do CRM — lógica PURA (sem React, sem servidor): dado o estado
 * da sessão, diz o rótulo, o tom do selo, o resumo e quais ações existem.
 */

export type DemoCardAction =
  | "abrir"
  | "copiar_link"
  | "abrir_cliente"
  | "reiniciar"
  | "renovar"
  | "novo_link"
  | "revogar"
  | "encerrar";

export type DemoCardTone = "success" | "warning" | "danger" | "secondary";

export type DemoCardView = {
  statusLabel: string;
  tone: DemoCardTone;
  summary: string;
  /** Ações do menu •••, na ordem de exibição. "Abrir campanha" é o botão principal. */
  menu: DemoCardAction[];
  /** Pode criar uma nova demo para este lead (a atual está encerrada). */
  canCreateNew: boolean;
  /** O link funciona agora: faz sentido copiá-lo e abri-lo como cliente. */
  canShareLink: boolean;
};

export const DEMO_ACTION_LABEL: Record<DemoCardAction, string> = {
  abrir: "Abrir campanha",
  copiar_link: "Copiar link",
  abrir_cliente: "Abrir como cliente",
  reiniciar: "Reiniciar demonstração",
  renovar: "Renovar validade do link",
  novo_link: "Gerar novo link",
  revogar: "Revogar acesso",
  encerrar: "Encerrar demonstração",
};

/** Ações que pedem confirmação, com o texto que diz o que acontece. */
export const DEMO_ACTION_CONFIRM: Partial<
  Record<
    DemoCardAction,
    { title: string; message: string; confirmLabel: string; destructive: boolean }
  >
> = {
  reiniciar: {
    title: "Reiniciar a demonstração?",
    message:
      "A campanha volta ao cenário inicial: comentários, aprovações e alterações feitas na demonstração serão desfeitos. O link e a validade continuam os mesmos.",
    confirmLabel: "Reiniciar",
    destructive: true,
  },
  novo_link: {
    title: "Gerar um novo link?",
    message: "O link atual deixa de funcionar. Quem o recebeu precisará do novo link.",
    confirmLabel: "Gerar novo link",
    destructive: false,
  },
  revogar: {
    title: "Revogar o acesso do cliente?",
    message:
      "O link deixa de funcionar agora. A campanha e o histórico continuam disponíveis para o time.",
    confirmLabel: "Revogar acesso",
    destructive: true,
  },
  encerrar: {
    title: "Encerrar a demonstração?",
    message:
      "O cliente perde o acesso e a demonstração não pode ser reaberta. A campanha continua visível para o time.",
    confirmLabel: "Encerrar",
    destructive: true,
  },
};

/** `dd/mm` no fuso de Brasília (determinístico, independe do fuso do navegador). */
export function formatDemoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

const DAY_MS = 86_400_000;

function daysLeftLabel(expiresIso: string, now: Date): string {
  const left = Math.ceil((Date.parse(expiresIso) - now.getTime()) / DAY_MS);
  if (left <= 1) return "expira hoje ou amanhã";
  return `${left} dias restantes`;
}

const BY_ACCESS: Record<DemoAccessState, (s: DemoSessionView, now: Date) => DemoCardView> = {
  ativo: (s, now) => ({
    statusLabel: "Ativa",
    tone: "success",
    summary: `Link válido até ${formatDemoDate(s.token_expires_at)} · ${daysLeftLabel(s.token_expires_at, now)}`,
    menu: ["abrir_cliente", "renovar", "novo_link", "reiniciar", "revogar", "encerrar"],
    canCreateNew: false,
    canShareLink: true,
  }),
  expirado: (s) => ({
    statusLabel: "Link expirado",
    tone: "warning",
    summary: `Expirou em ${formatDemoDate(s.token_expires_at)}. Renove para o cliente voltar a acessar.`,
    menu: ["renovar", "novo_link", "reiniciar", "encerrar"],
    canCreateNew: false,
    canShareLink: false,
  }),
  revogado: (s) => ({
    statusLabel: "Acesso revogado",
    tone: "danger",
    summary: `Revogado em ${formatDemoDate(s.access_revoked_at)}. Gere um novo link para o cliente voltar a acessar.`,
    menu: ["novo_link", "reiniciar", "encerrar"],
    canCreateNew: false,
    canShareLink: false,
  }),
  encerrado: (s) => ({
    statusLabel: "Encerrada",
    tone: "secondary",
    summary: `Encerrada em ${formatDemoDate(s.closed_at)}. A campanha continua visível só para o time.`,
    menu: [],
    canCreateNew: true,
    canShareLink: false,
  }),
};

export function describeDemo(session: DemoSessionView, now: Date): DemoCardView {
  return BY_ACCESS[session.access](session, now);
}

/** Mensagem de sucesso (toast) de cada ação. */
export const DEMO_ACTION_SUCCESS: Record<
  Exclude<DemoCardAction, "abrir" | "abrir_cliente">,
  string
> = {
  copiar_link: "Link copiado",
  reiniciar: "Demonstração reiniciada",
  renovar: "Validade renovada",
  novo_link: "Novo link gerado",
  revogar: "Acesso revogado",
  encerrar: "Demonstração encerrada",
};
