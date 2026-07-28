import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Camera,
  CameraOff,
  ChevronDown,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MonitorX,
  Phone,
  PhoneOff,
  Settings2,
} from "lucide-react";
import {
  acceptCall,
  endCall,
  getLocalCallStream,
  getLocalScreenStream,
  getRemoteCallStream,
  getRemoteScreenStream,
  listCallDevices,
  rejectCall,
  setCallAudioOutput,
  setCallMinimized,
  setCameraEnabled,
  setMuted,
  setScreenSharing,
  switchCallDevice,
  useCallState,
  type CallDevices,
} from "@/lib/call-controller";
const EMPTY: CallDevices = { microphones: [], cameras: [], speakers: [] };

export function CallOverlay() {
  const call = useCallState();
  const [now, setNow] = useState(Date.now());
  const [devices, setDevices] = useState(EMPTY);
  const [settings, setSettings] = useState(false);
  const [shareMenu, setShareMenu] = useState(false);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteScreenRef = useRef<HTMLVideoElement>(null);
  const localScreenRef = useRef<HTMLVideoElement>(null);
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
  useEffect(() => {
    if (call.status === "idle") return;
    const remote = remoteRef.current;
    const local = localRef.current;
    const remoteScreen = remoteScreenRef.current;
    const localScreen = localScreenRef.current;
    if (remote) {
      remote.srcObject = getRemoteCallStream();
      void setCallAudioOutput(remote)
        .then(() => remote.play())
        .catch(() => undefined);
    }
    if (local) {
      local.srcObject = getLocalCallStream();
      void local.play().catch(() => undefined);
    }
    if (remoteScreen) {
      remoteScreen.srcObject = getRemoteScreenStream();
      void remoteScreen.play().catch(() => undefined);
    }
    if (localScreen) {
      localScreen.srcObject = getLocalScreenStream();
      void localScreen.play().catch(() => undefined);
    }
  }, [
    call.status,
    call.status === "idle" ? 0 : call.mediaVersion,
    call.status === "idle" ? false : call.cameraEnabled,
    call.status === "idle" ? false : call.screenSharing,
  ]);
  if (call.status === "idle") return null;
  const seconds =
    call.status === "in-call" && call.connectedAt
      ? Math.floor((now - call.connectedAt) / 1_000)
      : 0;
  const duration = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const label =
    call.error ||
    (call.status === "ringing-out"
      ? "Chamando..."
      : call.status === "ringing-in"
        ? "Chamada recebida"
        : call.status === "connecting"
          ? "Conectando..."
          : `Em chamada · ${duration}`);
  if (call.minimized && call.status !== "ringing-in")
    return (
      <div className="fixed bottom-4 right-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-lg border border-border bg-background p-3 shadow-xl">
        <Avatar name={call.peerName} photo={call.peerPhoto} small />
        <button className="min-w-0 flex-1 text-left" onClick={() => setCallMinimized(false)}>
          <p className="truncate text-sm font-semibold">{call.peerName}</p>
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
  const active = call.status === "connecting" || call.status === "in-call";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/60 p-4">
      <section
        className="relative w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-background shadow-xl"
        aria-label="Chamada"
      >
        {call.status !== "ringing-in" && (
          <button
            className="absolute right-3 top-3 z-10 rounded-md bg-background/80 p-2"
            onClick={() => setCallMinimized(true)}
            aria-label="Minimizar chamada"
            title="Minimizar chamada"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        )}
        <div className="relative flex aspect-video min-h-72 items-center justify-center bg-muted">
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          {getRemoteScreenStream() && (
            <video
              ref={remoteScreenRef}
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full bg-background object-contain"
            />
          )}
          <div className="relative text-center">
            <Avatar name={call.peerName} photo={call.peerPhoto} />
            <h3 className="mt-3 text-base font-semibold">{call.peerName}</h3>
            <p
              className={`mt-1 text-sm ${call.error ? "text-destructive" : "text-muted-foreground"}`}
            >
              {label}
            </p>
          </div>
          {call.cameraEnabled && (
            <video
              ref={localRef}
              autoPlay
              muted
              playsInline
              className="absolute bottom-3 right-3 h-28 w-40 rounded-md border border-border bg-background object-cover shadow-lg"
            />
          )}
          {call.screenSharing && (
            <video
              ref={localScreenRef}
              autoPlay
              muted
              playsInline
              className="absolute bottom-3 left-3 h-28 w-40 rounded-md border border-border bg-background object-contain shadow-lg"
            />
          )}
        </div>
        {settings && active && (
          <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-3">
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
              onChange={(id) =>
                void switchCallDevice("audioOut", id).then(
                  () => remoteRef.current && setCallAudioOutput(remoteRef.current),
                )
              }
            />
          </div>
        )}
        <footer className="relative flex items-center justify-center gap-3 border-t border-border p-4">
          {call.status === "ringing-in" ? (
            <Icon label="Atender" positive onClick={() => void acceptCall()}>
              <Phone />
            </Icon>
          ) : active ? (
            <>
              <Icon
                label={call.muted ? "Ativar microfone" : "Silenciar"}
                active={call.muted}
                onClick={() => setMuted(!call.muted)}
              >
                {call.muted ? <MicOff /> : <Mic />}
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
                  <div className="absolute bottom-full left-1/2 z-10 mb-2 w-48 -translate-x-1/2 rounded-md border border-border bg-background p-1 shadow-lg">
                    <button
                      className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                      onClick={() => {
                        setShareMenu(false);
                        void setScreenSharing(true, false);
                      }}
                    >
                      Compartilhar sem áudio
                    </button>
                    <button
                      className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
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
          ) : null}
          <Icon
            label={call.status === "ringing-in" ? "Recusar" : "Encerrar"}
            danger
            onClick={() => (call.status === "ringing-in" ? rejectCall() : endCall(true))}
          >
            <PhoneOff />
          </Icon>
        </footer>
      </section>
    </div>
  );
}
function Avatar({ name, photo, small }: { name: string; photo?: string; small?: boolean }) {
  const size = small ? "h-10 w-10" : "h-20 w-20";
  return photo ? (
    <img src={photo} alt={name} className={`${size} mx-auto rounded-full object-cover`} />
  ) : (
    <span
      className={`${size} mx-auto flex items-center justify-center rounded-full bg-background text-xl font-semibold`}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
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
    ? "bg-destructive text-destructive-foreground"
    : positive
      ? "bg-primary text-primary-foreground"
      : active
        ? "bg-accent text-accent-foreground"
        : "border border-border bg-muted";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${tone} hover:opacity-90 [&_svg]:h-5 [&_svg]:w-5`}
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
    <label className="relative space-y-1 text-xs">
      <span className="font-medium">{label}</span>
      <select
        className="h-9 w-full appearance-none rounded-md border border-border bg-background px-2 pr-7 text-xs"
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
      <ChevronDown className="pointer-events-none absolute bottom-2.5 right-2 h-3.5 w-3.5 text-muted-foreground" />
    </label>
  );
}
