import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

const TOPIC = "workspace-calls-v2";
const ICE: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
};
type Signal = {
  type: "invite" | "accept" | "reject" | "hangup" | "offer" | "answer" | "ice";
  callId: string;
  fromUserId: string;
  toUserId: string;
  fromName?: string;
  fromPhoto?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
export type CallState =
  | { status: "idle" }
  | {
      status: "ringing-out" | "ringing-in" | "connecting" | "in-call";
      callId: string;
      peerId: string;
      peerName: string;
      peerPhoto?: string;
      startedAt: number;
      connectedAt?: number;
      minimized: boolean;
      muted: boolean;
      cameraEnabled: boolean;
      screenSharing: boolean;
      mediaVersion: number;
      error?: string;
    };
export type CallDevice = { deviceId: string; label: string; kind: MediaDeviceKind };
export type CallDevices = {
  microphones: CallDevice[];
  cameras: CallDevice[];
  speakers: CallDevice[];
};

let state: CallState = { status: "idle" };
const listeners = new Set<() => void>();
const setState = (next: CallState) => {
  state = next;
  listeners.forEach((listener) => listener());
};
const patch = (next: Partial<Exclude<CallState, { status: "idle" }>>) => {
  if (state.status !== "idle") setState({ ...state, ...next } as CallState);
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
let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;
let remoteScreenStream: MediaStream | null = null;
let remoteStreamId: string | null = null;
let pendingIce: RTCIceCandidateInit[] = [];
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
export const getRemoteCallStream = () => remoteStream;
export const getLocalScreenStream = () => screenStream;
export const getRemoteScreenStream = () => remoteScreenStream;

async function send(signal: Omit<Signal, "fromUserId">) {
  if (!channel || !ready) throw new Error("Canal de chamadas indisponível");
  await ready;
  const result = await channel.send({
    type: "broadcast",
    event: "signal",
    payload: { ...signal, fromUserId: userId } satisfies Signal,
  });
  if (result !== "ok") throw new Error("Falha ao enviar o sinal da chamada");
}

function stopRing() {
  if (ringInterval !== null) window.clearInterval(ringInterval);
  ringInterval = null;
  void audioContext?.close().catch(() => undefined);
  audioContext = null;
}
function startRing() {
  stopRing();
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new AC();
    audioContext = context;
    const beep = async () => {
      if (context.state === "suspended") await context.resume().catch(() => undefined);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(620, context.currentTime);
      oscillator.frequency.setValueAtTime(780, context.currentTime + 0.18);
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
function cleanup() {
  stopRing();
  if (callTimeout !== null) window.clearTimeout(callTimeout);
  callTimeout = null;
  pc?.close();
  pc = null;
  localStream?.getTracks().forEach((track) => track.stop());
  remoteStream?.getTracks().forEach((track) => track.stop());
  screenStream?.getTracks().forEach((track) => track.stop());
  remoteScreenStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  remoteStream = null;
  screenStream = null;
  remoteScreenStream = null;
  remoteStreamId = null;
  pendingIce = [];
}
function mediaChanged() {
  if (state.status !== "idle") patch({ mediaVersion: state.mediaVersion + 1 });
}

async function createPeer(peerId: string, callId: string) {
  if (pc) return pc;
  const connection = new RTCPeerConnection(ICE);
  pc = connection;
  remoteStream = new MediaStream();
  connection.onicecandidate = ({ candidate }) => {
    if (candidate)
      void send({ type: "ice", callId, toUserId: peerId, candidate: candidate.toJSON() });
  };
  connection.ontrack = ({ track, streams }) => {
    const incoming = streams[0];
    if (!incoming) {
      remoteStream?.addTrack(track);
      mediaChanged();
      return;
    }
    if (remoteStreamId === null || incoming.id === remoteStreamId) {
      remoteStreamId = incoming.id;
      remoteStream = incoming;
    } else {
      remoteScreenStream = incoming;
      track.onended = () => {
        remoteScreenStream = null;
        mediaChanged();
      };
    }
    mediaChanged();
  };
  connection.onconnectionstatechange = () => {
    if (connection.connectionState === "connected" && state.status !== "idle")
      patch({ status: "in-call", connectedAt: state.connectedAt ?? Date.now(), error: undefined });
    if (connection.connectionState === "failed")
      patch({ error: "Não foi possível estabelecer a conexão." });
  };
  return connection;
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
    pc?.addTrack(track, localStream!);
  });
  mediaChanged();
}
async function offer() {
  if (!pc || state.status === "idle") return;
  const description = await pc.createOffer();
  await pc.setLocalDescription(description);
  await send({ type: "offer", callId: state.callId, toUserId: state.peerId, sdp: description });
}
async function setRemote(description: RTCSessionDescriptionInit) {
  if (!pc) return;
  await pc.setRemoteDescription(description);
  for (const candidate of pendingIce.splice(0))
    await pc.addIceCandidate(candidate).catch(() => undefined);
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

async function handle(signal: Signal) {
  if (signal.toUserId !== userId || signal.fromUserId === userId) return;
  if (signal.type === "invite") {
    if (state.status !== "idle") {
      if (state.callId !== signal.callId)
        void send({ type: "reject", callId: signal.callId, toUserId: signal.fromUserId });
      return;
    }
    setState({
      status: "ringing-in",
      callId: signal.callId,
      peerId: signal.fromUserId,
      peerName: signal.fromName || "Membro",
      peerPhoto: signal.fromPhoto,
      startedAt: Date.now(),
      minimized: false,
      muted: false,
      cameraEnabled: false,
      screenSharing: false,
      mediaVersion: 0,
    });
    startRing();
    callTimeout = window.setTimeout(rejectCall, 45_000);
    return;
  }
  if (state.status === "idle" || signal.callId !== state.callId) return;
  if (signal.type === "reject" || signal.type === "hangup") {
    finish();
    return;
  }
  if (signal.type === "accept" && state.status === "ringing-out") {
    stopRing();
    patch({ status: "connecting" });
    try {
      await createPeer(state.peerId, state.callId);
      await acquireAudio();
      await offer();
    } catch (error) {
      fail(error);
    }
    return;
  }
  if (signal.type === "offer" && signal.sdp) {
    try {
      await createPeer(state.peerId, state.callId);
      await setRemote(signal.sdp);
      const answer = await pc!.createAnswer();
      await pc!.setLocalDescription(answer);
      await send({ type: "answer", callId: state.callId, toUserId: state.peerId, sdp: answer });
    } catch (error) {
      fail(error);
    }
    return;
  }
  if (signal.type === "answer" && signal.sdp && pc) {
    await setRemote(signal.sdp).catch(fail);
    return;
  }
  if (signal.type === "ice" && signal.candidate) {
    if (pc?.remoteDescription) await pc.addIceCandidate(signal.candidate).catch(() => undefined);
    else pendingIce.push(signal.candidate);
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
}
export async function shutdownCallController() {
  cleanup();
  setState({ status: "idle" });
  if (channel) await supabase.removeChannel(channel);
  channel = null;
  ready = null;
  userId = "";
}
export async function startCall(peerId: string, peerName: string, peerPhoto?: string) {
  if (!userId || !channel) throw new Error("Chamadas ainda estão inicializando.");
  if (peerId === userId || state.status !== "idle") return;
  const callId = crypto.randomUUID();
  setState({
    status: "ringing-out",
    callId,
    peerId,
    peerName,
    peerPhoto,
    startedAt: Date.now(),
    minimized: false,
    muted: false,
    cameraEnabled: false,
    screenSharing: false,
    mediaVersion: 0,
  });
  startRing();
  const invite = () =>
    send({ type: "invite", callId, toUserId: peerId, fromName: userName, fromPhoto: userPhoto });
  try {
    await invite();
    window.setTimeout(
      () => state.status === "ringing-out" && state.callId === callId && void invite(),
      1_200,
    );
    window.setTimeout(
      () => state.status === "ringing-out" && state.callId === callId && void invite(),
      3_000,
    );
    callTimeout = window.setTimeout(() => endCall(true), 45_000);
  } catch (error) {
    fail(error);
  }
}
export async function acceptCall() {
  if (state.status !== "ringing-in") return;
  stopRing();
  if (callTimeout !== null) window.clearTimeout(callTimeout);
  callTimeout = null;
  patch({ status: "connecting", error: undefined });
  try {
    await createPeer(state.peerId, state.callId);
    await acquireAudio();
    await send({ type: "accept", callId: state.callId, toUserId: state.peerId });
  } catch (error) {
    fail(error);
  }
}
export function rejectCall() {
  if (state.status === "ringing-in")
    void send({ type: "reject", callId: state.callId, toUserId: state.peerId });
  finish();
}
export function endCall(notify = true) {
  if (state.status === "idle") return;
  if (notify) void send({ type: "hangup", callId: state.callId, toUserId: state.peerId });
  finish();
}
function finish() {
  if (state.status === "idle") return;
  const previous = state;
  const connected = previous.status === "in-call";
  const seconds =
    connected && previous.connectedAt ? Math.floor((Date.now() - previous.connectedAt) / 1_000) : 0;
  cleanup();
  setState({ status: "idle" });
  window.dispatchEvent(
    new CustomEvent("call:ended", {
      detail: { peerId: previous.peerId, peerName: previous.peerName, connected, seconds },
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
export async function setCameraEnabled(enabled: boolean) {
  if (state.status === "idle" || !pc) return;
  if (!enabled) {
    for (const track of localStream?.getVideoTracks() ?? []) {
      const sender = pc.getSenders().find((item) => item.track === track);
      if (sender) pc.removeTrack(sender);
      localStream?.removeTrack(track);
      track.stop();
    }
    patch({ cameraEnabled: false });
    mediaChanged();
    await offer();
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
    pc.addTrack(track, localStream);
    patch({ cameraEnabled: true, error: undefined });
    mediaChanged();
    await offer();
  } catch (error) {
    fail(error);
  }
}
export async function setScreenSharing(enabled: boolean, withAudio = false) {
  if (state.status === "idle" || !pc) return;
  if (!enabled) {
    for (const track of screenStream?.getTracks() ?? []) {
      const sender = pc.getSenders().find((item) => item.track === track);
      if (sender) pc.removeTrack(sender);
      track.stop();
    }
    screenStream = null;
    patch({ screenSharing: false });
    mediaChanged();
    await offer();
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
      pc!.addTrack(track, stream);
      track.onended = () => void setScreenSharing(false);
    });
    patch({ screenSharing: true, error: undefined });
    mediaChanged();
    await offer();
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
  if (kind === "audioOut" || state.status === "idle" || !pc) return;
  const mediaKind = kind === "audioIn" ? "audio" : "video";
  if (mediaKind === "video" && !state.cameraEnabled) return;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: mediaKind === "audio" ? { deviceId: { exact: deviceId } } : false,
    video: mediaKind === "video" ? { deviceId: { exact: deviceId } } : false,
  });
  const next = mediaKind === "audio" ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
  const previous =
    mediaKind === "audio" ? localStream?.getAudioTracks()[0] : localStream?.getVideoTracks()[0];
  const sender = pc.getSenders().find((item) => item.track?.kind === mediaKind);
  await sender?.replaceTrack(next);
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
