import type { ChatAttachment, ChatMessage } from "./chat-store";
import { URL_RE } from "./linkify";

export const VOICE_WAVEFORM_BARS = 40;
export const MAX_RECORDING_MS = 10 * 60 * 1000;

function getAudioContextCtor(): typeof AudioContext | undefined {
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

/** Decodifica um Blob de áudio (gravado agora, local — sem rede) pra extrair
 * duração real (nunca sofre do bug de `Infinity`/`NaN` do container
 * webm/opus, já que vem de amostras decodificadas, não do metadata do
 * container) e os peaks da waveform, normalizados 0-1, tamanho fixo
 * `VOICE_WAVEFORM_BARS`. `null` se a decodificação falhar (navegador sem
 * suporte, blob corrompido etc.) — quem chama cai pro fallback existente. */
export async function computeAudioMeta(
  blob: Blob,
  bars: number = VOICE_WAVEFORM_BARS,
): Promise<{ durationMs: number; peaks: number[] } | null> {
  const AC = getAudioContextCtor();
  if (!AC) return null;
  try {
    const buf = await blob.arrayBuffer();
    const ctx = new AC();
    const audioBuf = await ctx.decodeAudioData(buf);
    const raw = audioBuf.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(raw.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) sum += Math.abs(raw[i * blockSize + j] ?? 0);
      peaks.push(sum / blockSize);
    }
    const max = Math.max(...peaks, 0.0001);
    void ctx.close();
    return {
      durationMs: Math.round(audioBuf.duration * 1000),
      peaks: peaks.map((v) => v / max),
    };
  } catch {
    return null;
  }
}

/** Mesmo formato usado no player antigo (`fmtAudioTime`), só que recebendo
 * ms — evita reconverter em vários lugares. */
export function formatVoiceTime(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "0:00";
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Mensagens antigas (antes deste recurso) e qualquer áudio anexado pelo
 * seletor de arquivos que não tenha sido marcado explicitamente como
 * "file" são tratados como voz — hoje só existe o caminho do microfone. */
export function isVoiceAttachment(a: ChatAttachment): boolean {
  return a.type.startsWith("audio/") && a.kind !== "file";
}

/** Texto de prévia compartilhado entre lista de conversas, citação de
 * resposta, banner de "respondendo a" e notificação/toast — nunca mostra
 * nome de arquivo cru pra mensagem de voz, e nunca inventa texto quando não
 * há nada (mensagem só com anexo não-áudio mostra o nome do arquivo). */
const MENTION_SHARE_LABEL: Record<string, string> = {
  task: "compartilhou uma tarefa",
  project: "compartilhou um projeto",
  campaign: "compartilhou uma campanha",
  client: "compartilhou um cliente",
};

export function messagePreviewLabel(
  m: Pick<ChatMessage, "text" | "attachments" | "mentions">,
): string {
  // Mensagem cujo texto é SÓ um link (o caso comum de colar uma URL sozinha)
  // nunca deve mostrar a URL crua na navegação — link de OAuth/Drive/Meet
  // facilmente passa de 100 caracteres, e mesmo truncado pelo `text-overflow:
  // ellipsis` do item da lista, o pedaço visível não diz nada útil. Resume
  // como "enviou um link", igual aos outros tipos de anexo abaixo. Mensagem
  // com texto ALÉM do link (ex: "olha isso: https://...") mantém o texto
  // normal — só o caso de "é só um link" precisa desse resumo.
  const trimmed = m.text?.trim();
  if (trimmed) {
    const matches = trimmed.match(URL_RE);
    if (matches?.length === 1 && matches[0] === trimmed) return "🔗 enviou um link";
    return m.text!;
  }
  const first = m.attachments?.[0];
  if (first) {
    if (isVoiceAttachment(first)) {
      return first.durationMs
        ? `🎙 Mensagem de voz · ${formatVoiceTime(first.durationMs)}`
        : "🎙 Mensagem de voz";
    }
    return `📎 ${first.name}`;
  }
  // Sem texto e sem anexo, mas com uma menção de tarefa/projeto/campanha/
  // cliente — é uma mensagem que só compartilha esse item (ver
  // `TaskMentionCard` em ChatSection.tsx), não uma mensagem vazia.
  const firstShareable = m.mentions?.find((mn) => mn.kind in MENTION_SHARE_LABEL);
  if (firstShareable) return MENTION_SHARE_LABEL[firstShareable.kind];
  return "";
}

// ---------- Reprodução única: pausa qualquer outro áudio em andamento ----------
type ActivePlayback = { id: string; stop: () => void };
let active: ActivePlayback | null = null;

export function requestVoicePlayback(id: string, stop: () => void): void {
  if (active && active.id !== id) active.stop();
  active = { id, stop };
}

export function releaseVoicePlayback(id: string): void {
  if (active?.id === id) active = null;
}

// ---------- Velocidade lembrada durante a sessão (não persiste no banco) ----------
export const VOICE_RATES = [0.5, 1, 1.5, 2] as const;
export type VoiceRate = (typeof VOICE_RATES)[number];
let sessionRate: VoiceRate = 1;
export function getSessionVoiceRate(): VoiceRate {
  return sessionRate;
}
export function setSessionVoiceRate(rate: VoiceRate): void {
  sessionRate = rate;
}
