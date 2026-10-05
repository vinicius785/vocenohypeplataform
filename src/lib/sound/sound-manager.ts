import { SOUND_MANIFEST, type SoundKind } from "./sound-manifest";
import { isSoundAllowed, loadSoundPrefs, withinCooldown, type SoundPrefs } from "./sound-prefs";

/**
 * Ponto ÚNICO de áudio da plataforma: `playSound("chat" | "commercial" | "meeting")`.
 *
 * - Um só `AudioContext` e um `GainNode` (volume do usuário × ganho do som); cada arquivo é buscado
 *   e decodificado UMA vez, sob demanda (nada é baixado na inicialização) e reaproveitado.
 * - Autoplay: o contexto só é criado/retomado depois de um gesto do usuário (`primeSounds`). Antes
 *   disso, ou se o navegador recusar, `playSound` simplesmente não toca — sem erro, sem exceção.
 * - Asset oficial ausente ou ilegível ⇒ cai no som anterior da plataforma (`legacy`); nunca no silêncio
 *   por causa disso e nunca em um som novo improvisado.
 * - Cooldown por tipo (rajadas de chat não tocam dez vezes); reunião não tem cooldown.
 */

type Ctx = AudioContext;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundKind, number>();
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let userIdResolver: () => string = () => "";

/** Como saber quem está logado — as preferências são por usuário. Registrado pelo AppShell. */
export function setSoundUserResolver(resolve: () => string) {
  userIdResolver = resolve;
}

/** Preferências do usuário atual (lidas na hora: mudar nas Configurações vale imediatamente). */
export function currentSoundPrefs(): SoundPrefs {
  return loadSoundPrefs(userIdResolver());
}

function prefs(): SoundPrefs {
  return currentSoundPrefs();
}

function getCtx(): Ctx | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

async function loadBuffer(src: string): Promise<AudioBuffer | null> {
  const c = getCtx();
  if (!c) return null;
  let p = buffers.get(src);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(src);
        const type = res.headers.get("content-type") ?? "";
        // Servidor devolvendo página (404 disfarçado) ou erro: o asset não existe.
        if (!res.ok || type.includes("text/html")) return null;
        return await c.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
    buffers.set(src, p);
  }
  return p;
}

function playBuffer(buf: AudioBuffer, gain: number, volume: number) {
  const c = ctx;
  if (!c || !master) return;
  const g = c.createGain();
  g.gain.value = gain;
  master.gain.value = volume;
  const node = c.createBufferSource();
  node.buffer = buf;
  node.connect(g).connect(master);
  node.start();
}

/** Lembrete de reunião ANTES da identidade sonora: tríade ascendente (comportamento anterior). */
function playLegacyMeetingTriad(volume: number) {
  const c = ctx;
  if (!c || !master) return;
  master.gain.value = volume;
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const start = c.currentTime + i * 0.16;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    o.connect(g).connect(master!);
    o.start(start);
    o.stop(start + 0.32);
  });
}

async function resolveAndPlay(kind: SoundKind, volume: number) {
  const spec = SOUND_MANIFEST[kind];
  const official = await loadBuffer(spec.src);
  if (official) return playBuffer(official, spec.gain, volume);
  if (spec.legacy.kind === "file") {
    const legacy = await loadBuffer(spec.legacy.src);
    if (legacy) playBuffer(legacy, spec.gain, volume);
    return;
  }
  playLegacyMeetingTriad(volume);
}

/** Chamado num gesto do usuário (clique/tecla): cria/retoma o contexto e aquece só os sons ligados. */
export function primeSounds() {
  const c = getCtx();
  if (!c) return;
  void c.resume().catch(() => undefined);
  const p = prefs();
  if (!p.enabled) return;
  // Aquecimento leve e sem som: busca/decodifica apenas os tipos que o usuário deixou ligados.
  for (const kind of ["chat", "commercial", "meeting"] as SoundKind[]) {
    if (p[kind]) void loadBuffer(SOUND_MANIFEST[kind].src);
  }
}

/** Toca o som do evento, respeitando preferências, cooldown e as regras de autoplay. */
export function playSound(kind: SoundKind): void {
  try {
    const p = prefs();
    if (!isSoundAllowed(p, kind)) return;
    const c = getCtx();
    if (!c || c.state !== "running") {
      // Sem gesto prévio o navegador mantém o contexto suspenso: tenta retomar e segue sem erro.
      void c?.resume().catch(() => undefined);
      return;
    }
    const now = Date.now();
    if (withinCooldown(now, lastPlayed.get(kind) ?? null, SOUND_MANIFEST[kind].cooldownMs)) return;
    lastPlayed.set(kind, now);
    void resolveAndPlay(kind, p.volume).catch(() => undefined);
  } catch {
    /* som é complemento: nunca quebra a aplicação */
  }
}

/** "▶ Testar" nas configurações: ignora cooldown e o interruptor do TIPO, mas respeita o volume.
 * (É uma ação explícita do usuário, então também serve de gesto para liberar o áudio.) */
export async function testSound(kind: SoundKind): Promise<void> {
  const c = getCtx();
  if (!c) return;
  try {
    await c.resume();
    await resolveAndPlay(kind, prefs().volume);
  } catch {
    /* ignora */
  }
}
