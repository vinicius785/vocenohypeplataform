import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

const TOPIC = "workspace-calls-v3";

/**
 * TURN é obrigatório pra chamadas funcionarem de verdade entre redes com NAT
 * restritivo (4G, wifi corporativo) — só STUN (Google) falha silenciosamente
 * nesses casos, travando em "Conectando...". Configurável via `.env`:
 *   VITE_TURN_URLS=turn:host:3478,turns:host:5349
 *   VITE_TURN_USERNAME=...
 *   VITE_TURN_CREDENTIAL=...
 * Sem essas variáveis, cai para STUN-only (funciona na mesma rede/NAT
 * permissivo, mas não é garantido entre redes diferentes).
 */
function buildIceConfig(): RTCConfiguration {
  const stun = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrls = (import.meta.env.VITE_TURN_URLS as string | undefined)
    ?.split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;
  if (!turnUrls?.length || !turnUsername || !turnCredential) {
    console.warn(
      "[call] Nenhum servidor TURN configurado (VITE_TURN_URLS/VITE_TURN_USERNAME/VITE_TURN_CREDENTIAL) — chamadas entre redes com NAT restritivo podem falhar.",
    );
    return { iceServers: stun, iceCandidatePoolSize: 4 };
  }
  return {
    iceServers: [...stun, { urls: turnUrls, username: turnUsername, credential: turnCredential }],
    iceCandidatePoolSize: 4,
  };
}
const ICE = buildIceConfig();

/** Até quantas pessoas (além de quem está montando a chamada) podem entrar
 * numa chamada em grupo — mesh P2P: cada participante conecta com todos os
 * outros diretamente, então o custo de CPU/banda de cada um cresce com esse
 * número. 4 é o equilíbrio combinado com o usuário. */
export const MAX_GROUP_PARTICIPANTS = 4;

type Signal =
  | {
      type: "invite";
      callId: string;
      fromUserId: string;
      toUserId: string;
      fromName: string;
      fromPhoto?: string;
      /** Roster completo (todo mundo convidado, exceto quem recebe este invite) — permite
       * a UI de "chamando" mostrar todo mundo que está sendo chamado, mesmo em grupo. */
      roster: { userId: string; name: string; photo?: string }[];
    }
  | { type: "accept" | "reject" | "hangup"; callId: string; fromUserId: string; toUserId: string }
  | {
      type: "offer" | "answer";
      callId: string;
      fromUserId: string;
      toUserId: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "ice";
      callId: string;
      fromUserId: string;
      toUserId: string;
      candidate: RTCIceCandidateInit;
    }
  // Mandado pelo host pro recém-chegado, com quem já está na sala — o
  // recém-chegado é quem sempre inicia a oferta pros já presentes (evita
  // duas ofertas cruzadas pro mesmo par).
  | {
      type: "peer-list";
      callId: string;
      fromUserId: string;
      toUserId: string;
      peers: { userId: string; name: string; photo?: string }[];
    }
  // Mandado pelo host pra quem já está na sala, avisando que alguém novo
  // entrou (pra esperar a oferta que vem dele).
  | {
      type: "peer-joined";
      callId: string;
      fromUserId: string;
      toUserId: string;
      peer: { userId: string; name: string; photo?: string };
    };

export type CallParticipantStatus = "ringing" | "connecting" | "connected" | "failed";
export type CallParticipant = {
  userId: string;
  name: string;
  photo?: string;
  status: CallParticipantStatus;
};

type CallBase = {
  callId: string;
  isHost: boolean;
  hostId: string;
  hostName: string;
  hostPhoto?: string;
  startedAt: number;
  connectedAt?: number;
  minimized: boolean;
  muted: boolean;
  deafened: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  mediaVersion: number;
  error?: string;
  /** Participantes conhecidos (exceto eu mesmo), por id. */
  participants: Record<string, CallParticipant>;
};
export type CallState =
  | { status: "idle" }
  | ({ status: "ringing-out" } & CallBase)
  | ({ status: "ringing-in" } & CallBase)
  | ({ status: "in-call" } & CallBase);
export type ActiveCallState = Extract<CallState, { status: "in-call" }>;
export type CallDevice = { deviceId: string; label: string; kind: MediaDeviceKind };
export type CallDevices = {
  microphones: CallDevice[];
  cameras: CallDevice[];
  speakers: CallDevice[];
};

/** `Omit<Union, K>` não distribui sobre uniões no TS (colapsa pra
 * interseção das chaves) — precisamos da versão distributiva pra `send()`
 * continuar aceitando cada variante de `Signal` com seus campos próprios. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

let state: CallState = { status: "idle" };
const listeners = new Set<() => void>();
const setState = (next: CallState) => {
  state = next;
  listeners.forEach((listener) => listener());
};
const patch = (next: Partial<Exclude<CallState, { status: "idle" }>>) => {
  if (state.status !== "idle") setState({ ...state, ...next } as CallState);
};
const patchParticipant = (peerId: string, next: Partial<CallParticipant>) => {
  if (state.status === "idle") return;
  const existing = state.participants[peerId];
  if (!existing) return;
  patch({ participants: { ...state.participants, [peerId]: { ...existing, ...next } } });
};
export function useCallState() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

let userId = "";
let userName = "";
let userPhoto: string | undefined;
let channel: ReturnType<typeof supabase.channel> | null = null;
let ready: Promise<void> | null = null;

/** Um link WebRTC com um único outro participante — em chamada 1:1 há só um;
 * em grupo, um por participante conectado (mesh: todo mundo com todo mundo). */
type PeerLink = {
  pc: RTCPeerConnection;
  remoteStream: MediaStream;
  remoteStreamId: string | null;
  remoteScreenStream: MediaStream | null;
  pendingIce: RTCIceCandidateInit[];
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  iceFailureRetried: boolean;
  connectTimeout: number | null;
};
const peers = new Map<string, PeerLink>();

let localStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;
let ringInterval: number | null = null;
let callTimeout: number | null = null;
let audioContext: AudioContext | null = null;
type Prefs = { audioIn?: string; audioOut?: string; videoIn?: string };
const prefs = (): Prefs => {
  try {
    return JSON.parse(localStorage.getItem("config:av") ?? "{}");
  } catch {
    return {};
  }
};
const savePrefs = (next: Partial<Prefs>) =>
  localStorage.setItem("config:av", JSON.stringify({ ...prefs(), ...next }));

export const getLocalCallStream = () => localStream;
export const getLocalScreenStream = () => screenStream;
export const getRemoteCallStream = (peerId: string) => peers.get(peerId)?.remoteStream ?? null;
export const getRemoteScreenStream = (peerId: string) =>
  peers.get(peerId)?.remoteScreenStream ?? null;
/** Lista de ids de participantes com um PeerLink de fato ativo — usada pela UI
 * pra saber quem renderizar mesmo antes de `participants` refletir "connected". */
export const getActivePeerIds = () => Array.from(peers.keys());

async function send(signal: DistributiveOmit<Signal, "fromUserId">) {
  if (!channel || !ready) throw new Error("Canal de chamadas indisponível");
  await ready;
  const result = await channel.send({
    type: "broadcast",
    event: "signal",
    payload: { ...signal, fromUserId: userId } as Signal,
  });
  if (result !== "ok") throw new Error("Falha ao enviar o sinal da chamada");
}
/** Best-effort — usado ao fechar a aba/recarregar, onde não dá pra confiar
 * numa Promise resolvendo a tempo. Não interrompe a chamada em troca de aba
 * ou minimização, só em fechamento real da página. */
function sendBestEffort(signal: DistributiveOmit<Signal, "fromUserId">) {
  try {
    void channel?.send({
      type: "broadcast",
      event: "signal",
      payload: { ...signal, fromUserId: userId } as Signal,
    });
  } catch {
    /* melhor esforço */
  }
}

function stopRing() {
  if (ringInterval !== null) window.clearInterval(ringInterval);
  ringInterval = null;
  void audioContext?.close().catch(() => undefined);
  audioContext = null;
}
function startRing(pattern: "outgoing" | "incoming") {
  stopRing();
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AC();
    audioContext = context;
    const beep = async () => {
      if (context.state === "suspended") await context.resume().catch(() => undefined);
      const [f1, f2] = pattern === "incoming" ? [660, 880] : [520, 660];
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(f1, context.currentTime);
      oscillator.frequency.setValueAtTime(f2, context.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.7);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.72);
    };
    void beep();
    ringInterval = window.setInterval(() => void beep(), 1_400);
  } catch {
    /* visible incoming overlay remains */
  }
}

function closePeer(peerId: string) {
  const link = peers.get(peerId);
  if (!link) return;
  clearConnectTimeout(link);
  link.pc.close();
  link.remoteStream.getTracks().forEach((t) => t.stop());
  link.remoteScreenStream?.getTracks().forEach((t) => t.stop());
  peers.delete(peerId);
}
function cleanup() {
  stopRing();
  if (callTimeout !== null) window.clearTimeout(callTimeout);
  callTimeout = null;
  for (const peerId of Array.from(peers.keys())) closePeer(peerId);
  localStream?.getTracks().forEach((track) => track.stop());
  screenStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  screenStream = null;
}
function mediaChanged() {
  if (state.status !== "idle") patch({ mediaVersion: state.mediaVersion + 1 });
}

/**
 * Cria o link WebRTC com um participante, usando o padrão "perfect
 * negotiation" (polite/impolite) — sem isso, alternar câmera/tela durante a
 * chamada podia cruzar duas ofertas simultâneas (glare) e travar a
 * renegociação silenciosamente. `polite` é decidido de forma determinística
 * (comparação de ids) pra que os dois lados cheguem à mesma conclusão sobre
 * quem cede em caso de colisão, sem precisar combinar isso via sinal.
 */
function createPeerLink(peerId: string, callId: string): PeerLink {
  const existing = peers.get(peerId);
  if (existing) return existing;
  const pc = new RTCPeerConnection(ICE);
  const link: PeerLink = {
    pc,
    remoteStream: new MediaStream(),
    remoteStreamId: null,
    remoteScreenStream: null,
    pendingIce: [],
    polite: userId > peerId,
    makingOffer: false,
    ignoreOffer: false,
    iceFailureRetried: false,
    connectTimeout: null,
  };
  peers.set(peerId, link);

  pc.onicecandidate = ({ candidate }) => {
    if (candidate)
      void send({ type: "ice", callId, toUserId: peerId, candidate: candidate.toJSON() });
  };
  pc.ontrack = ({ track, streams }) => {
    const incoming = streams[0];
    if (!incoming) {
      link.remoteStream.addTrack(track);
      mediaChanged();
      return;
    }
    if (link.remoteStreamId === null || incoming.id === link.remoteStreamId) {
      link.remoteStreamId = incoming.id;
      link.remoteStream = incoming;
    } else {
      link.remoteScreenStream = incoming;
      track.onended = () => {
        link.remoteScreenStream = null;
        mediaChanged();
      };
    }
    mediaChanged();
  };
  pc.onnegotiationneeded = async () => {
    try {
      link.makingOffer = true;
      await pc.setLocalDescription();
      await send({
        type: "offer",
        callId,
        toUserId: peerId,
        sdp: pc.localDescription as RTCSessionDescriptionInit,
      });
    } catch (error) {
      console.warn("[call] falha ao renegociar", error);
    } finally {
      link.makingOffer = false;
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      clearConnectTimeout(link);
      patchParticipant(peerId, { status: "connected" });
      if (state.status !== "idle" && !state.connectedAt)
        patch({ status: "in-call", connectedAt: Date.now(), error: undefined });
    }
    if (pc.connectionState === "failed") {
      if (!link.iceFailureRetried) {
        link.iceFailureRetried = true;
        pc.restartIce();
      } else {
        clearConnectTimeout(link);
        patchParticipant(peerId, { status: "failed" });
      }
    }
  };
  return link;
}

/** Sem isso, qualquer coisa que travasse a negociação sem lançar um erro
 * "pegável" (ICE que nunca resolve nem pra "connected" nem pra "failed" —
 * comum atrás de NAT/firewall difícil, mesmo com TURN) deixava a pessoa
 * presa em "Conectando..." pra sempre, sem nenhum jeito de perceber que
 * travou ou tentar de novo. 20s é folgado o bastante pra ICE real (que
 * normalmente resolve em poucos segundos) sem deixar a UI pendurada. */
function armConnectTimeout(peerId: string, link: PeerLink) {
  clearConnectTimeout(link);
  link.connectTimeout = window.setTimeout(() => {
    link.connectTimeout = null;
    if (link.pc.connectionState !== "connected") {
      patchParticipant(peerId, { status: "failed" });
    }
  }, 20_000);
}
function clearConnectTimeout(link: PeerLink) {
  if (link.connectTimeout !== null) {
    window.clearTimeout(link.connectTimeout);
    link.connectTimeout = null;
  }
}

/**
 * O microfone pode ser derrubado sem nenhum sinal de rede — outro app (ex:
 * WhatsApp Desktop) pode tomar acesso exclusivo do dispositivo de áudio ao
 * ganhar foco, o que o macOS resolve simplesmente encerrando a track local
 * (`track.onended`), sem nunca afetar `RTCPeerConnection.connectionState`.
 * Sem isso, a ligação continuava "conectada" mas muda, parecendo ter caído.
 * Tenta readquirir o microfone e trocar a track em todos os peers ativos.
 */
async function recoverLocalAudio(endedTrack: MediaStreamTrack) {
  localStream?.removeTrack(endedTrack);
  if (state.status === "idle") return;
  try {
    const selected = prefs().audioIn;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: selected ? { deviceId: { exact: selected } } : true,
      video: false,
    });
    const next = stream.getAudioTracks()[0];
    if (!next) return;
    next.enabled = !state.muted;
    for (const link of peers.values()) {
      const sender = link.pc.getSenders().find((s) => s.track === endedTrack);
      if (sender) await sender.replaceTrack(next);
      else link.pc.addTrack(next, localStream ?? (localStream = new MediaStream()));
    }
    localStream ??= new MediaStream();
    localStream.addTrack(next);
    next.onended = () => void recoverLocalAudio(next);
    mediaChanged();
  } catch (err) {
    console.warn("[call] não foi possível readquirir o microfone", err);
    patch({ error: "O microfone foi desconectado. Verifique se outro app está usando-o." });
  }
}
async function acquireAudio() {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error("Chamadas não são suportadas neste navegador.");
  if (localStream?.getAudioTracks().length) return;
  const selected = prefs().audioIn;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: selected ? { deviceId: { exact: selected } } : true,
    video: false,
  });
  localStream ??= new MediaStream();
  stream.getAudioTracks().forEach((track) => {
    localStream!.addTrack(track);
    track.enabled = state.status !== "idle" ? !state.muted : true;
    track.onended = () => void recoverLocalAudio(track);
  });
  mediaChanged();
}
/** Garante que um peer recém-criado já saia com as tracks locais atuais
 * (áudio, e câmera/tela se já ligadas) — usado ao conectar com alguém que
 * entrou depois que eu já tinha mídia ativa.
 *
 * Também é chamada de novo a cada oferta recebida (não só a primeira) —
 * qualquer renegociação do outro lado (ex.: ele ligou a câmera) reusa o
 * mesmo link já conectado e cai aqui de novo. Sem checar `getSenders()`
 * antes, isso tentava adicionar uma track que já tinha sender nesse peer
 * connection, e o WebRTC recusa com "A sender already exists for the
 * track" — travando a renegociação (e a chamada) silenciosamente. */
function attachLocalTracksTo(link: PeerLink) {
  const senderTracks = new Set(link.pc.getSenders().map((s) => s.track));
  for (const track of localStream?.getTracks() ?? []) {
    if (!senderTracks.has(track)) link.pc.addTrack(track, localStream!);
  }
  for (const track of screenStream?.getTracks() ?? []) {
    if (!senderTracks.has(track)) link.pc.addTrack(track, screenStream!);
  }
}

function fail(error: unknown) {
  const message =
    error instanceof DOMException && error.name === "NotAllowedError"
      ? "Permita o acesso ao microfone e à câmera."
      : error instanceof Error
        ? error.message
        : "Falha na chamada.";
  patch({ error: message });
}

/** Conecta com um participante já presente na sala (chamado quando eu acabei
 * de entrar) — sempre sou eu quem inicia a oferta, nunca quem já estava lá,
 * então nunca há duas ofertas cruzadas pro mesmo par. */
async function connectToExistingPeer(peerId: string, callId: string) {
  const link = createPeerLink(peerId, callId);
  armConnectTimeout(peerId, link);
  await acquireAudio();
  attachLocalTracksTo(link);
}

async function handle(signal: Signal) {
  if (signal.toUserId !== userId || signal.fromUserId === userId) return;

  if (signal.type === "invite") {
    if (state.status !== "idle") {
      if (state.callId !== signal.callId)
        void send({ type: "reject", callId: signal.callId, toUserId: signal.fromUserId });
      return;
    }
    const participants: Record<string, CallParticipant> = {
      [signal.fromUserId]: {
        userId: signal.fromUserId,
        name: signal.fromName || "Membro",
        photo: signal.fromPhoto,
        status: "ringing",
      },
    };
    for (const p of signal.roster)
      participants[p.userId] = {
        userId: p.userId,
        name: p.name,
        photo: p.photo,
        status: "ringing",
      };
    setState({
      status: "ringing-in",
      callId: signal.callId,
      isHost: false,
      hostId: signal.fromUserId,
      hostName: signal.fromName || "Membro",
      hostPhoto: signal.fromPhoto,
      startedAt: Date.now(),
      minimized: false,
      muted: false,
      deafened: false,
      cameraEnabled: false,
      screenSharing: false,
      mediaVersion: 0,
      participants,
    });
    startRing("incoming");
    callTimeout = window.setTimeout(rejectCall, 45_000);
    return;
  }

  if (state.status === "idle" || signal.callId !== state.callId) return;

  if (signal.type === "hangup") {
    // Se quem saiu é o host, a chamada acaba pra todo mundo (sem host não
    // há mais roster coordenado); se é só um participante, apenas fecho o
    // link com ele e sigo com os demais.
    if (signal.fromUserId === state.hostId) {
      finish();
      return;
    }
    closePeer(signal.fromUserId);
    const { [signal.fromUserId]: _removed, ...rest } = state.participants;
    patch({ participants: rest });
    if (Object.keys(rest).length === 0 && state.isHost) finish();
    return;
  }
  if (signal.type === "reject") {
    patchParticipant(signal.fromUserId, { status: "failed" });
    // Se ninguém atendeu (todo mundo recusou) e a chamada nunca conectou,
    // encerra sozinha em vez de esperar o timeout de 45s.
    if (
      state.status === "ringing-out" &&
      Object.values(state.participants).every((p) => p.status === "failed")
    )
      finish();
    return;
  }

  if (signal.type === "accept" && (state.status === "ringing-out" || state.status === "in-call")) {
    stopRing();
    patchParticipant(signal.fromUserId, { status: "connecting" });
    if (state.status === "ringing-out") patch({ status: "in-call" });
    try {
      const link = createPeerLink(signal.fromUserId, state.callId);
      armConnectTimeout(signal.fromUserId, link);
      await acquireAudio();
      attachLocalTracksTo(link);
      // Só o host coordena o roster da sala (evita duas fontes de verdade).
      if (state.isHost) {
        const already = Array.from(peers.keys()).filter((id) => id !== signal.fromUserId);
        await send({
          type: "peer-list",
          callId: state.callId,
          toUserId: signal.fromUserId,
          peers: already.map((id) => ({
            userId: id,
            name: state.status !== "idle" ? state.participants[id]?.name || "Membro" : "Membro",
            photo: state.status !== "idle" ? state.participants[id]?.photo : undefined,
          })),
        });
        const joinedName = state.participants[signal.fromUserId]?.name || "Membro";
        const joinedPhoto = state.participants[signal.fromUserId]?.photo;
        for (const id of already) {
          await send({
            type: "peer-joined",
            callId: state.callId,
            toUserId: id,
            peer: { userId: signal.fromUserId, name: joinedName, photo: joinedPhoto },
          });
        }
      }
    } catch (error) {
      fail(error);
      patchParticipant(signal.fromUserId, { status: "failed" });
    }
    return;
  }

  if (signal.type === "peer-list") {
    // Recém-chegado: conecta (e inicia oferta) com todo mundo que já estava.
    for (const p of signal.peers) {
      if (!state.participants[p.userId]) {
        patch({
          participants: {
            ...state.participants,
            [p.userId]: { userId: p.userId, name: p.name, photo: p.photo, status: "connecting" },
          },
        });
      }
      await connectToExistingPeer(p.userId, state.callId).catch((error) => {
        fail(error);
        patchParticipant(p.userId, { status: "failed" });
      });
    }
    return;
  }
  if (signal.type === "peer-joined") {
    // Já estava na sala: só registra o novo participante e espera a oferta
    // dele chegar (evita duas ofertas cruzadas pro mesmo par).
    if (!state.participants[signal.peer.userId]) {
      patch({
        participants: {
          ...state.participants,
          [signal.peer.userId]: { ...signal.peer, status: "connecting" },
        },
      });
    }
    return;
  }

  if (signal.type === "offer" && signal.sdp) {
    try {
      const link = createPeerLink(signal.fromUserId, state.callId);
      if (link.pc.connectionState !== "connected") armConnectTimeout(signal.fromUserId, link);
      const offerCollision =
        signal.type === "offer" && (link.makingOffer || link.pc.signalingState !== "stable");
      link.ignoreOffer = !link.polite && offerCollision;
      if (link.ignoreOffer) return;
      if (offerCollision) {
        await Promise.all([
          link.pc.setLocalDescription({ type: "rollback" }),
          link.pc.setRemoteDescription(signal.sdp),
        ]);
      } else {
        await link.pc.setRemoteDescription(signal.sdp);
      }
      for (const candidate of link.pendingIce.splice(0))
        await link.pc.addIceCandidate(candidate).catch(() => undefined);
      await acquireAudio();
      attachLocalTracksTo(link);
      await link.pc.setLocalDescription();
      await send({
        type: "answer",
        callId: state.callId,
        toUserId: signal.fromUserId,
        sdp: link.pc.localDescription as RTCSessionDescriptionInit,
      });
    } catch (error) {
      fail(error);
      // Uma renegociação (câmera/tela ligando no meio da chamada) que falha
      // não deve derrubar uma ligação que já está de pé — só marca "failed"
      // se a conexão de fato nunca chegou a se estabelecer.
      const link = peers.get(signal.fromUserId);
      if (!link || link.pc.connectionState !== "connected") {
        patchParticipant(signal.fromUserId, { status: "failed" });
      }
    }
    return;
  }
  if (signal.type === "answer" && signal.sdp) {
    const link = peers.get(signal.fromUserId);
    if (!link) return;
    // Resposta atrasada de uma oferta já abandonada (o outro lado colidiu
    // com uma oferta minha e resolveu a colisão com um rollback, ver o
    // ramo "offer" acima) — nesse ponto a conexão já voltou pra "stable" e
    // não está mais esperando resposta nenhuma; aplicar essa answer de
    // qualquer jeito é exatamente o "Called in wrong state: stable" que
    // aparecia como erro visível na chamada. Só aceita a resposta se ainda
    // há uma oferta local pendente de fato.
    if (link.pc.signalingState !== "have-local-offer") return;
    await link.pc.setRemoteDescription(signal.sdp).catch(fail);
    return;
  }
  if (signal.type === "ice" && signal.candidate) {
    const link = peers.get(signal.fromUserId);
    if (!link) return;
    if (link.pc.remoteDescription)
      await link.pc.addIceCandidate(signal.candidate).catch(() => undefined);
    else link.pendingIce.push(signal.candidate);
  }
}

export async function initCallController(id: string, name: string, photo?: string) {
  userName = name;
  userPhoto = photo;
  if (channel && userId === id) return;
  await shutdownCallController();
  userId = id;
  const next = supabase.channel(TOPIC, { config: { broadcast: { self: true, ack: true } } });
  next.on("broadcast", { event: "signal" }, ({ payload }) => void handle(payload as Signal));
  channel = next;
  ready = new Promise<void>((resolve, reject) =>
    next.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        reject(new Error("Canal de chamadas indisponível"));
    }),
  );
  await ready;

  // Melhor esforço: se a aba for fechada/recarregada de fato (não apenas
  // trocada ou minimizada — não escutamos "visibilitychange" de propósito),
  // avisa quem está na chamada em vez de deixar a pessoa "pendurada" até o
  // timeout de 45s ou a conexão falhar sozinha.
  window.addEventListener("pagehide", () => {
    if (state.status === "idle") return;
    if (state.isHost) {
      for (const peerId of Object.keys(state.participants))
        sendBestEffort({ type: "hangup", callId: state.callId, toUserId: peerId });
    } else {
      sendBestEffort({ type: "hangup", callId: state.callId, toUserId: state.hostId });
      for (const peerId of getActivePeerIds())
        if (peerId !== state.hostId)
          sendBestEffort({ type: "hangup", callId: state.callId, toUserId: peerId });
    }
  });
}
export async function shutdownCallController() {
  cleanup();
  setState({ status: "idle" });
  if (channel) await supabase.removeChannel(channel);
  channel = null;
  ready = null;
  userId = "";
}

/** Liga pra uma ou mais pessoas — uma única pessoa é uma chamada 1:1 comum;
 * mais de uma é uma chamada em grupo (mesh, até `MAX_GROUP_PARTICIPANTS`). */
export async function startCall(invitees: { id: string; name: string; photo?: string }[]) {
  if (!userId || !channel) throw new Error("Chamadas ainda estão inicializando.");
  const targets = invitees.filter((i) => i.id !== userId).slice(0, MAX_GROUP_PARTICIPANTS);
  if (targets.length === 0 || state.status !== "idle") return;
  const callId = crypto.randomUUID();
  const participants: Record<string, CallParticipant> = {};
  for (const t of targets)
    participants[t.id] = { userId: t.id, name: t.name, photo: t.photo, status: "ringing" };
  setState({
    status: "ringing-out",
    callId,
    isHost: true,
    hostId: userId,
    hostName: userName,
    hostPhoto: userPhoto,
    startedAt: Date.now(),
    minimized: false,
    muted: false,
    deafened: false,
    cameraEnabled: false,
    screenSharing: false,
    mediaVersion: 0,
    participants,
  });
  startRing("outgoing");
  const roster = targets.map((t) => ({ userId: t.id, name: t.name, photo: t.photo }));
  const inviteAll = () =>
    Promise.all(
      targets.map((t) =>
        send({
          type: "invite",
          callId,
          toUserId: t.id,
          fromName: userName,
          fromPhoto: userPhoto,
          roster: roster.filter((r) => r.userId !== t.id),
        }),
      ),
    );
  try {
    await inviteAll();
    window.setTimeout(
      () => state.status === "ringing-out" && state.callId === callId && void inviteAll(),
      1_200,
    );
    window.setTimeout(
      () => state.status === "ringing-out" && state.callId === callId && void inviteAll(),
      3_000,
    );
    callTimeout = window.setTimeout(() => {
      // Ninguém atendeu ninguém — encerra. Se ao menos uma pessoa entrou
      // (status !== "ringing"), a chamada já está de pé e o timeout não deve
      // derrubá-la.
      if (state.status === "ringing-out") endCall(true);
    }, 45_000);
  } catch (error) {
    fail(error);
  }
}
export async function acceptCall() {
  if (state.status !== "ringing-in") return;
  stopRing();
  if (callTimeout !== null) window.clearTimeout(callTimeout);
  callTimeout = null;
  const hostId = state.hostId;
  const callId = state.callId;
  patch({ status: "in-call", error: undefined });
  patchParticipant(hostId, { status: "connecting" });
  try {
    const link = createPeerLink(hostId, callId);
    armConnectTimeout(hostId, link);
    await acquireAudio();
    attachLocalTracksTo(link);
    await send({ type: "accept", callId, toUserId: hostId });
  } catch (error) {
    fail(error);
    patchParticipant(hostId, { status: "failed" });
  }
}
export function rejectCall() {
  if (state.status === "ringing-in")
    void send({ type: "reject", callId: state.callId, toUserId: state.hostId });
  finish();
}
export function endCall(notify = true) {
  if (state.status === "idle") return;
  if (notify) {
    if (state.isHost) {
      for (const peerId of Object.keys(state.participants))
        void send({ type: "hangup", callId: state.callId, toUserId: peerId }).catch(
          () => undefined,
        );
    } else {
      void send({ type: "hangup", callId: state.callId, toUserId: state.hostId }).catch(
        () => undefined,
      );
      for (const peerId of getActivePeerIds())
        if (peerId !== state.hostId)
          void send({ type: "hangup", callId: state.callId, toUserId: peerId }).catch(
            () => undefined,
          );
    }
  }
  finish();
}
function finish() {
  if (state.status === "idle") return;
  const previous = state;
  const connected = previous.status === "in-call";
  const seconds =
    connected && previous.connectedAt ? Math.floor((Date.now() - previous.connectedAt) / 1_000) : 0;
  const others = Object.values(previous.participants);
  const peerNames = others.map((p) => p.name).join(", ") || previous.hostName;
  // Do meu ponto de vista, "a outra pessoa" é quem eu liguei (se sou o
  // host, numa 1:1) ou quem me ligou (se não sou o host) — usado só pra
  // decidir em qual DM registrar a mensagem de chamada encerrada/perdida.
  const primaryPeerId = previous.isHost ? (others[0]?.userId ?? previous.hostId) : previous.hostId;
  cleanup();
  setState({ status: "idle" });
  window.dispatchEvent(
    new CustomEvent("call:ended", {
      detail: { peerId: primaryPeerId, peerName: peerNames, connected, seconds },
    }),
  );
}
export function setCallMinimized(minimized: boolean) {
  patch({ minimized });
}
export function setMuted(muted: boolean) {
  localStream?.getAudioTracks().forEach((track) => {
    track.enabled = !muted;
  });
  patch({ muted });
}
/** "Ensurdecer" — silencia o áudio de todo mundo que eu recebo, sem afetar
 * o que os outros ouvem de mim (padrão Discord). */
export function setDeafened(deafened: boolean) {
  for (const link of peers.values())
    link.remoteStream.getAudioTracks().forEach((t) => (t.enabled = !deafened));
  patch({ deafened });
}
export async function setCameraEnabled(enabled: boolean) {
  if (state.status === "idle") return;
  if (!enabled) {
    for (const track of localStream?.getVideoTracks() ?? []) {
      for (const link of peers.values()) {
        const sender = link.pc.getSenders().find((item) => item.track === track);
        if (sender) link.pc.removeTrack(sender);
      }
      localStream?.removeTrack(track);
      track.stop();
    }
    patch({ cameraEnabled: false });
    mediaChanged();
    return;
  }
  try {
    const selected = prefs().videoIn;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: selected ? { deviceId: { exact: selected } } : true,
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    localStream ??= new MediaStream();
    localStream.addTrack(track);
    for (const link of peers.values()) link.pc.addTrack(track, localStream);
    patch({ cameraEnabled: true, error: undefined });
    mediaChanged();
  } catch (error) {
    fail(error);
  }
}
export async function setScreenSharing(enabled: boolean, withAudio = false) {
  if (state.status === "idle") return;
  if (!enabled) {
    for (const track of screenStream?.getTracks() ?? []) {
      for (const link of peers.values()) {
        const sender = link.pc.getSenders().find((item) => item.track === track);
        if (sender) link.pc.removeTrack(sender);
      }
      track.stop();
    }
    screenStream = null;
    patch({ screenSharing: false });
    mediaChanged();
    return;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    fail(new Error("Compartilhamento de tela não é suportado neste navegador."));
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: withAudio });
    screenStream = stream;
    stream.getTracks().forEach((track) => {
      for (const link of peers.values()) link.pc.addTrack(track, stream);
      track.onended = () => void setScreenSharing(false);
    });
    patch({ screenSharing: true, error: undefined });
    mediaChanged();
  } catch (error) {
    fail(error);
  }
}
export async function listCallDevices(): Promise<CallDevices> {
  const list = await navigator.mediaDevices.enumerateDevices();
  const map = (kind: MediaDeviceKind, label: string) =>
    list
      .filter((device) => device.kind === kind)
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `${label} ${index + 1}`,
        kind,
      }));
  return {
    microphones: map("audioinput", "Microfone"),
    cameras: map("videoinput", "Câmera"),
    speakers: map("audiooutput", "Saída"),
  };
}
export async function switchCallDevice(kind: "audioIn" | "videoIn" | "audioOut", deviceId: string) {
  savePrefs({ [kind]: deviceId });
  if (kind === "audioOut" || state.status === "idle") return;
  const mediaKind = kind === "audioIn" ? "audio" : "video";
  if (mediaKind === "video" && !state.cameraEnabled) return;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: mediaKind === "audio" ? { deviceId: { exact: deviceId } } : false,
    video: mediaKind === "video" ? { deviceId: { exact: deviceId } } : false,
  });
  const next = mediaKind === "audio" ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
  const previous =
    mediaKind === "audio" ? localStream?.getAudioTracks()[0] : localStream?.getVideoTracks()[0];
  for (const link of peers.values()) {
    const sender = link.pc.getSenders().find((item) => item.track?.kind === mediaKind);
    await sender?.replaceTrack(next);
  }
  if (previous) {
    localStream?.removeTrack(previous);
    previous.stop();
  }
  localStream?.addTrack(next);
  mediaChanged();
}
export async function setCallAudioOutput(element: HTMLMediaElement) {
  const output = prefs().audioOut;
  if (output && "setSinkId" in element)
    await (element as HTMLMediaElement & { setSinkId(id: string): Promise<void> }).setSinkId(
      output,
    );
}
