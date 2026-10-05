/**
 * Identidade sonora da Você no Hype — UMA família, três eventos.
 *
 * Os arquivos oficiais ficam em `public/audio/voce-no-hype/` (ver o README ali: duração, formato e
 * normalização). Enquanto um arquivo oficial não existir, o gerenciador toca o som que a plataforma
 * já tocava antes (`legacy`) — nada novo é inventado para cobrir a ausência.
 */
export type SoundKind = "chat" | "commercial" | "meeting";

export const SOUND_KINDS: SoundKind[] = ["chat", "commercial", "meeting"];

export const SOUND_LABEL: Record<SoundKind, string> = {
  chat: "Chat",
  commercial: "Comercial",
  meeting: "Reuniões",
};

export const SOUND_HINT: Record<SoundKind, string> = {
  chat: "Nova mensagem recebida.",
  commercial: "Novo lead ou notificação comercial.",
  meeting: "Lembrete de reunião prestes a começar.",
};

export type SoundSpec = {
  /** Asset oficial da marca (MP3 curto, normalizado). */
  src: string;
  /** Som usado ENQUANTO o oficial não existe (comportamento anterior da plataforma). */
  legacy: { kind: "file"; src: string } | { kind: "meeting-triad" };
  /** Ganho relativo (1 = o arquivo como está) — equaliza o volume percebido entre os sons. */
  gain: number;
  /** Intervalo mínimo entre dois toques DO MESMO tipo. 0 = nunca suprime (eventos pontuais). */
  cooldownMs: number;
};

export const SOUND_MANIFEST: Record<SoundKind, SoundSpec> = {
  chat: {
    src: "/audio/voce-no-hype/chat-notification.mp3",
    legacy: { kind: "file", src: "/sounds/notification.mp3" },
    gain: 1,
    // Mensagens chegam em rajada: um toque por janela, nunca dez seguidos.
    cooldownMs: 2500,
  },
  commercial: {
    src: "/audio/voce-no-hype/commercial-notification.mp3",
    legacy: { kind: "file", src: "/sounds/notification.mp3" },
    gain: 1,
    cooldownMs: 1500,
  },
  meeting: {
    src: "/audio/voce-no-hype/meeting-notification.mp3",
    legacy: { kind: "meeting-triad" },
    gain: 1,
    // Lembrete de reunião é pontual e importante: nunca é suprimido.
    cooldownMs: 0,
  },
};
