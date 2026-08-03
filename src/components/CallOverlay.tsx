import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Camera,
  CameraOff,
  ChevronDown,
  Ear,
  EarOff,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MonitorX,
  Phone,
  PhoneOff,
  Settings2,
  User,
} from "lucide-react";
import {
  acceptCall,
  endCall,
  getActivePeerIds,
  getLocalCallStream,
  getLocalScreenStream,
  getRemoteCallStream,
  getRemoteScreenStream,
  listCallDevices,
  rejectCall,
  setCallAudioOutput,
  setCallMinimized,
  setCameraEnabled,
  setDeafened,
  setMuted,
  setScreenSharing,
  switchCallDevice,
  useCallState,
  type ActiveCallState,
  type CallDevices,
  type CallParticipant,
} from "@/lib/call-controller";
const EMPTY: CallDevices = { microphones: [], cameras: [], speakers: [] };

export function CallOverlay() {
  const call = useCallState();
  const [now, setNow] = useState(Date.now());
  const [devices, setDevices] = useState(EMPTY);
  const [settings, setSettings] = useState(false);
  const [shareMenu, setShareMenu] = useState(false);
  const localRef = useRef<HTMLVideoElement>(null);
  const localScreenRef = useRef<HTMLVideoElement>(null);
  const remoteRefs = useRef(new Map<string, HTMLVideoElement>());
  const remoteScreenRefs = useRef(new Map<string, HTMLVideoElement>());

  useEffect(() => {
    if (call.status !== "in-call") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [call.status]);

  useEffect(() => {
    if (call.status === "idle") {
      setSettings(false);
      setShareMenu(false);
      return;
    }
    void listCallDevices()
      .then(setDevices)
      .catch(() => setDevices(EMPTY));
  }, [call.status]);

  const mediaVersion = call.status === "idle" ? 0 : call.mediaVersion;
  const cameraEnabled = call.status !== "idle" && call.cameraEnabled;
  const screenSharing = call.status !== "idle" && call.screenSharing;
  useEffect(() => {
    if (call.status === "idle") return;
    const local = localRef.current;
    const localScreen = localScreenRef.current;
    if (local) {
      local.srcObject = getLocalCallStream();
      void local.play().catch(() => undefined);
    }
    if (localScreen) {
      localScreen.srcObject = getLocalScreenStream();
      void localScreen.play().catch(() => undefined);
    }
    for (const peerId of getActivePeerIds()) {
      const remote = remoteRefs.current.get(peerId);
      if (remote) {
        remote.srcObject = getRemoteCallStream(peerId);
        void setCallAudioOutput(remote)
          .then(() => remote.play())
          .catch(() => undefined);
      }
      const remoteScreen = remoteScreenRefs.current.get(peerId);
      const screenStream = getRemoteScreenStream(peerId);
      if (remoteScreen && screenStream) {
        remoteScreen.srcObject = screenStream;
        void remoteScreen.play().catch(() => undefined);
      }
    }
  }, [call.status, mediaVersion, cameraEnabled, screenSharing]);

  const participants = useMemo(
    () => (call.status === "idle" ? [] : Object.values(call.participants)),
    [call.status === "idle" ? null : call.participants],
  );

  if (call.status === "idle") return null;

  const seconds =
    call.status === "in-call" && call.connectedAt
      ? Math.floor((now - call.connectedAt) / 1_000)
      : 0;
  const duration = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const isGroup = participants.length > 1;
  const primaryName = call.status === "ringing-in" ? call.hostName : participants[0]?.name || "";
  const title = isGroup
    ? call.status === "ringing-in"
      ? `${call.hostName} e mais ${participants.length - 1}`
      : `Chamada em grupo · ${participants.length + 1} pessoas`
    : primaryName;
  const label =
    call.error ||
    (call.status === "ringing-out"
      ? "Chamando..."
      : call.status === "ringing-in"
        ? "Chamada recebida"
        : call.status === "in-call" && !call.connectedAt
          ? "Conectando..."
          : `Em chamada · ${duration}`);

  const remoteScreenPeer = participants.find((p) => getRemoteScreenStream(p.userId));
  const anySharing = screenSharing || !!remoteScreenPeer;

  if (call.minimized && call.status !== "ringing-in")
    return (
      <div className="fixed bottom-4 right-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur">
        <TileAvatar name={primaryName} photo={participants[0]?.photo} small />
        <button className="min-w-0 flex-1 text-left" onClick={() => setCallMinimized(false)}>
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </button>
        <Icon label="Expandir" onClick={() => setCallMinimized(false)}>
          <Maximize2 />
        </Icon>
        <Icon label="Encerrar" danger onClick={() => endCall(true)}>
          <PhoneOff />
        </Icon>
      </div>
    );

  const active = call.status === "in-call";
  const isRinging = call.status === "ringing-in" || call.status === "ringing-out";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <section
        className={`relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-zinc-900 text-zinc-100 shadow-2xl ${
          isRinging ? "max-w-xs" : "max-w-3xl"
        }`}
        aria-label="Chamada"
      >
        <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className={`text-xs ${call.error ? "text-rose-400" : "text-zinc-400"}`}>{label}</p>
          </div>
          {call.status !== "ringing-in" && (
            <button
              className="rounded-md p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              onClick={() => setCallMinimized(true)}
              aria-label="Minimizar chamada"
              title="Minimizar chamada (a ligação continua)"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          )}
        </header>

        <div
          className={isRinging ? "bg-black p-4" : "min-h-72 flex-1 overflow-y-auto bg-black p-3"}
        >
          {isRinging ? (
            <RingingGrid
              hostId={call.hostId}
              hostName={call.hostName}
              hostPhoto={call.hostPhoto}
              isHost={call.isHost}
              participants={participants}
            />
          ) : anySharing ? (
            <ScreenShareLayout
              call={call}
              participants={participants}
              screenSharing={screenSharing}
              remoteScreenPeer={remoteScreenPeer}
              localScreenRef={localScreenRef}
              remoteScreenRefs={remoteScreenRefs}
              remoteRefs={remoteRefs}
              localRef={localRef}
            />
          ) : (
            <VideoGrid
              call={call}
              participants={participants}
              localRef={localRef}
              remoteRefs={remoteRefs}
            />
          )}
        </div>

        {settings && active && (
          <div className="grid gap-3 border-t border-white/10 bg-zinc-900 p-4 sm:grid-cols-3">
            <DeviceSelect
              label="Microfone"
              devices={devices.microphones}
              onChange={(id) => void switchCallDevice("audioIn", id)}
            />
            <DeviceSelect
              label="Câmera"
              devices={devices.cameras}
              onChange={(id) => void switchCallDevice("videoIn", id)}
            />
            <DeviceSelect
              label="Saída de áudio"
              devices={devices.speakers}
              onChange={(id) => void switchCallDevice("audioOut", id)}
            />
          </div>
        )}

        <footer className="relative flex items-center justify-center gap-3 border-t border-white/10 bg-zinc-900 p-4">
          {call.status === "ringing-in" ? (
            <>
              <Icon label="Recusar" danger onClick={() => rejectCall()}>
                <PhoneOff />
              </Icon>
              <Icon label="Atender" positive onClick={() => void acceptCall()}>
                <Phone />
              </Icon>
            </>
          ) : (
            <>
              {active && (
                <>
                  <Icon
                    label={call.muted ? "Ativar microfone" : "Silenciar"}
                    active={call.muted}
                    onClick={() => setMuted(!call.muted)}
                  >
                    {call.muted ? <MicOff /> : <Mic />}
                  </Icon>
                  <Icon
                    label={call.deafened ? "Reativar áudio" : "Ensurdecer"}
                    active={call.deafened}
                    onClick={() => setDeafened(!call.deafened)}
                  >
                    {call.deafened ? <EarOff /> : <Ear />}
                  </Icon>
                  <Icon
                    label={call.cameraEnabled ? "Desligar câmera" : "Ligar câmera"}
                    active={call.cameraEnabled}
                    onClick={() => void setCameraEnabled(!call.cameraEnabled)}
                  >
                    {call.cameraEnabled ? <Camera /> : <CameraOff />}
                  </Icon>
                  <div className="relative">
                    <Icon
                      label={call.screenSharing ? "Parar compartilhamento" : "Compartilhar tela"}
                      active={call.screenSharing}
                      onClick={() =>
                        call.screenSharing
                          ? void setScreenSharing(false)
                          : setShareMenu((value) => !value)
                      }
                    >
                      {call.screenSharing ? <MonitorX /> : <MonitorUp />}
                    </Icon>
                    {shareMenu && !call.screenSharing && (
                      <div className="absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-md border border-white/10 bg-zinc-800 p-1 shadow-lg">
                        <button
                          className="w-full rounded px-2 py-1.5 text-left text-xs text-zinc-100 hover:bg-white/10"
                          onClick={() => {
                            setShareMenu(false);
                            void setScreenSharing(true, false);
                          }}
                        >
                          Compartilhar sem áudio
                        </button>
                        <button
                          className="w-full rounded px-2 py-1.5 text-left text-xs text-zinc-100 hover:bg-white/10"
                          onClick={() => {
                            setShareMenu(false);
                            void setScreenSharing(true, true);
                          }}
                        >
                          Compartilhar com áudio
                        </button>
                      </div>
                    )}
                  </div>
                  <Icon
                    label="Escolher dispositivos"
                    active={settings}
                    onClick={() => setSettings((value) => !value)}
                  >
                    <Settings2 />
                  </Icon>
                </>
              )}
              <Icon label="Encerrar" danger onClick={() => endCall(true)}>
                <PhoneOff />
              </Icon>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function RingingGrid({
  hostId,
  hostName,
  hostPhoto,
  isHost,
  participants,
}: {
  hostId: string;
  hostName: string;
  hostPhoto?: string;
  isHost: boolean;
  participants: CallParticipant[];
}) {
  // Ligando: mostra todo mundo sendo chamado (host nunca aparece em
  // `participants`, já que sou eu). Recebendo: quem ligou já é mostrado em
  // destaque acima, então tira ele da lista de baixo pra não duplicar —
  // "outros" só sobra quando é uma chamada em grupo (mais convidados).
  const others = isHost ? participants : participants.filter((p) => p.userId !== hostId);
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-2">
      {!isHost && (
        <div className="text-center">
          <TileAvatar name={hostName} photo={hostPhoto} large ringing />
          <p className="mt-3 text-base font-semibold">{hostName}</p>
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-4">
          {others.map((p) => (
            <div key={p.userId} className="text-center">
              <TileAvatar name={p.name} photo={p.photo} ringing={p.status === "ringing"} />
              <p className="mt-1.5 max-w-20 truncate text-xs text-zinc-300">{p.name}</p>
              <p className="text-[10px] text-zinc-500">
                {p.status === "failed"
                  ? "Recusou"
                  : p.status === "ringing"
                    ? "Chamando..."
                    : "Entrando"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VideoGrid({
  call,
  participants,
  localRef,
  remoteRefs,
}: {
  call: ActiveCallState;
  participants: CallParticipant[];
  localRef: React.RefObject<HTMLVideoElement | null>;
  remoteRefs: React.RefObject<Map<string, HTMLVideoElement>>;
}) {
  const tileCount = participants.length + 1;
  const cols = tileCount <= 1 ? 1 : tileCount <= 2 ? 2 : tileCount <= 4 ? 2 : 3;
  return (
    <div
      className="grid h-full gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      <VideoTile name="Você" isSelf muted cameraOn={call.cameraEnabled} videoRef={localRef} />
      {participants.map((p) => (
        <VideoTile
          key={p.userId}
          name={p.name}
          photo={p.photo}
          statusLabel={
            p.status === "connecting"
              ? "Conectando..."
              : p.status === "failed"
                ? "Falhou"
                : undefined
          }
          videoRef={(el) => {
            if (el) remoteRefs.current.set(p.userId, el);
            else remoteRefs.current.delete(p.userId);
          }}
        />
      ))}
    </div>
  );
}

function ScreenShareLayout({
  call,
  participants,
  screenSharing,
  remoteScreenPeer,
  localScreenRef,
  remoteScreenRefs,
  remoteRefs,
  localRef,
}: {
  call: ActiveCallState;
  participants: CallParticipant[];
  screenSharing: boolean;
  remoteScreenPeer?: CallParticipant;
  localScreenRef: React.RefObject<HTMLVideoElement | null>;
  remoteScreenRefs: React.RefObject<Map<string, HTMLVideoElement>>;
  remoteRefs: React.RefObject<Map<string, HTMLVideoElement>>;
  localRef: React.RefObject<HTMLVideoElement | null>;
}) {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative min-h-56 flex-1 overflow-hidden rounded-lg bg-black">
        {screenSharing ? (
          <video
            ref={localScreenRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-contain"
          />
        ) : (
          remoteScreenPeer && (
            <video
              ref={(el) => {
                if (el) remoteScreenRefs.current.set(remoteScreenPeer.userId, el);
              }}
              autoPlay
              playsInline
              className="h-full w-full object-contain"
            />
          )
        )}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[11px] font-medium text-zinc-100">
          {screenSharing ? "Sua tela" : `Tela de ${remoteScreenPeer?.name}`}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <VideoTile
          name="Você"
          isSelf
          muted
          cameraOn={call.cameraEnabled}
          small
          videoRef={localRef}
        />
        {participants.map((p) => (
          <VideoTile
            key={p.userId}
            name={p.name}
            photo={p.photo}
            small
            videoRef={(el) => {
              if (el) remoteRefs.current.set(p.userId, el);
              else remoteRefs.current.delete(p.userId);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function VideoTile({
  name,
  photo,
  isSelf,
  muted,
  cameraOn = true,
  small,
  statusLabel,
  videoRef,
}: {
  name: string;
  photo?: string;
  isSelf?: boolean;
  muted?: boolean;
  cameraOn?: boolean;
  small?: boolean;
  statusLabel?: string;
  videoRef: React.RefObject<HTMLVideoElement | null> | ((el: HTMLVideoElement | null) => void);
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-800 ${
        small ? "h-24 w-36" : "min-h-40"
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        muted={muted}
        playsInline
        className={`h-full w-full object-cover ${isSelf && !cameraOn ? "hidden" : ""}`}
      />
      {(isSelf ? !cameraOn : true) && (
        <div
          className={`${isSelf && cameraOn ? "hidden" : "flex"} absolute inset-0 flex-col items-center justify-center gap-2`}
        >
          <TileAvatar name={name} photo={photo} large={!small} />
        </div>
      )}
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-zinc-100">
        {name}
      </span>
      {statusLabel && (
        <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300">
          {statusLabel}
        </span>
      )}
    </div>
  );
}

function TileAvatar({
  name,
  photo,
  small,
  large,
  ringing,
}: {
  name: string;
  photo?: string;
  small?: boolean;
  large?: boolean;
  ringing?: boolean;
}) {
  const size = small ? "h-10 w-10" : large ? "h-20 w-20" : "h-14 w-14";
  return (
    <div className="relative">
      {ringing && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/40" />}
      {photo ? (
        <img src={photo} alt={name} className={`${size} relative rounded-full object-cover`} />
      ) : (
        <span
          className={`${size} relative flex items-center justify-center rounded-full bg-zinc-700 font-semibold text-zinc-100`}
        >
          {name ? name.slice(0, 1).toUpperCase() : <User className="h-1/2 w-1/2" />}
        </span>
      )}
    </div>
  );
}
function Icon({
  label,
  children,
  onClick,
  active,
  danger,
  positive,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  positive?: boolean;
}) {
  const tone = danger
    ? "bg-rose-600 text-white"
    : positive
      ? "bg-emerald-600 text-white"
      : active
        ? "bg-white/20 text-zinc-100"
        : "bg-white/10 text-zinc-200";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${tone} hover:opacity-90 [&_svg]:h-5 [&_svg]:w-5`}
    >
      {children}
    </button>
  );
}
function DeviceSelect({
  label,
  devices,
  onChange,
}: {
  label: string;
  devices: CallDevices["microphones"];
  onChange: (id: string) => void;
}) {
  return (
    <label className="relative space-y-1 text-xs text-zinc-200">
      <span className="font-medium">{label}</span>
      <select
        className="h-9 w-full appearance-none rounded-md border border-white/10 bg-zinc-800 px-2 pr-7 text-xs text-zinc-100"
        defaultValue=""
        onChange={(event) => event.target.value && onChange(event.target.value)}
      >
        <option value="">Padrão do sistema</option>
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute bottom-2.5 right-2 h-3.5 w-3.5 text-zinc-400" />
    </label>
  );
}
