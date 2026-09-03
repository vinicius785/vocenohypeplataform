import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMe } from "@/lib/chat-store";
import {
  AlertTriangle,
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
  MoreHorizontal,
  PhoneOff,
  RotateCcw,
  User,
  Users,
  Wifi,
  WifiOff,
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
  LOCAL_SPEAKING_ID,
  rejectCall,
  setCallAudioOutput,
  setCallMinimized,
  setCameraEnabled,
  setDeafened,
  setMuted,
  setScreenSharing,
  startCall,
  switchCallDevice,
  useCallState,
  useConnectionQuality,
  useSpeakingPeerIds,
  type ActiveCallState,
  type CallDevices,
  type CallParticipant,
  type CallState,
} from "@/lib/call-controller";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Estado que já tem `CallBase` (participantes, mudo, câmera, etc) — usado
 * pelas telas de "chamando" e pelo player compacto, que aparecem tanto em
 * `ringing-out` quanto em `in-call`. */
type RingingOrActiveCallState = Extract<CallState, { status: "ringing-out" | "in-call" }>;

const EMPTY: CallDevices = { microphones: [], cameras: [], speakers: [] };
const PIP_POS_KEY = "call:pipPos";

function formatDuration(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Nunca deixa uma string técnica de WebRTC (nome de API, "Failed to
 * execute...", DOMException) chegar na tela — essas já ficam registradas via
 * `console.warn`/`fail()` no engine pra debug, mas quem vê a chamada só
 * precisa de um aviso legível e, quando fizer sentido, um jeito de tentar de
 * novo. Mensagens que o próprio engine já escreveu em português (permissão de
 * microfone, dispositivo desconectado) passam direto, sem alteração. */
const TECHNICAL_ERROR_PATTERN =
  /Failed to execute|RTCPeerConnection|DOMException|InvalidStateError|NotFoundError|OperationError|NotReadableError/i;
function friendlyCallError(raw: string): string {
  return TECHNICAL_ERROR_PATTERN.test(raw) ? "Não foi possível estabelecer a chamada." : raw;
}

export function CallOverlay() {
  const call = useCallState();
  const speakingIds = useSpeakingPeerIds();
  const [now, setNow] = useState(Date.now());
  const [devices, setDevices] = useState(EMPTY);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [endedSummary, setEndedSummary] = useState<{ title: string; label: string } | null>(null);
  const [remoteVideoOn, setRemoteVideoOn] = useState<Record<string, boolean>>({});
  const localRef = useRef<HTMLVideoElement>(null);
  const localScreenRef = useRef<HTMLVideoElement>(null);
  const remoteRefs = useRef(new Map<string, HTMLVideoElement>());
  const remoteScreenRefs = useRef(new Map<string, HTMLVideoElement>());
  // O <video> que carrega o áudio remoto some quando minimiza (a barra
  // minimizada não renderiza vídeo/áudio nenhum) — sem uma trilha de áudio
  // sempre montada, minimizar silenciava a ligação inteira mesmo com o
  // WebRTC continuando conectado por trás. Esses <audio> ficam sempre no ar,
  // visualmente ocultos, e tocam independente do estado de minimizado.
  const hiddenAudioRefs = useRef(new Map<string, HTMLAudioElement>());

  // Ref sempre atualizado com o `call` mais recente — os atalhos de teclado
  // (M/V) só se registram uma vez (não a cada mudança de mudo/câmera), então
  // precisam ler o estado atual por fora do closure da primeira renderização.
  const callRef = useRef(call);
  callRef.current = call;

  useEffect(() => {
    if (call.status !== "in-call") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [call.status]);

  useEffect(() => {
    if (call.status === "idle") {
      setDevicesOpen(false);
      setShareMenuOpen(false);
      setParticipantsOpen(false);
      return;
    }
    void listCallDevices()
      .then(setDevices)
      .catch(() => setDevices(EMPTY));
  }, [call.status]);

  // Atalhos M (mic) / V (câmera) — só durante a chamada, e nunca quando o
  // foco está num campo de texto (não pode roubar digitação de mensagem no
  // Chat, por exemplo). ESC de propósito não faz nada aqui — encerrar só
  // pelo botão específico, nunca sem querer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = callRef.current;
      if (c.status !== "in-call") return;
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === "m") setMuted(!c.muted);
      else if (key === "v") void setCameraEnabled(!c.cameraEnabled);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Banner breve de "chamada encerrada" — o `call:ended` do engine já reseta
  // `call.status` pra "idle" antes desse evento chegar aqui, então o resumo
  // precisa ser guardado à parte pra não sumir instantaneamente sem feedback.
  useEffect(() => {
    const onEnded = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          reason: "answered" | "rejected" | "missed" | "cancelled";
          seconds: number;
        }>
      ).detail;
      if (!detail) return;
      if (detail.reason !== "answered") return; // sem card pra chamada que nunca conectou
      setEndedSummary({
        title: "Chamada encerrada",
        label: `Duração: ${formatDuration(detail.seconds)}`,
      });
      window.setTimeout(() => setEndedSummary(null), 4_000);
    };
    window.addEventListener("call:ended", onEnded);
    return () => window.removeEventListener("call:ended", onEnded);
  }, []);

  const mediaVersion = call.status === "idle" ? 0 : call.mediaVersion;
  const cameraEnabled = call.status !== "idle" && call.cameraEnabled;
  const screenSharing = call.status !== "idle" && call.screenSharing;
  const minimized = call.status !== "idle" && call.minimized;
  useEffect(() => {
    if (call.status === "idle") return;
    // Renegociar (ex: alguém ligou/desligou compartilhamento de tela) pode
    // fazer o navegador pausar sozinho um <audio>/<video> já tocando no meio
    // da troca de SDP, sem disparar nenhum erro — só um evento "pause" que
    // ninguém escutava, deixando a chamada muda até alguém mexer de novo.
    // `onpause` re-tenta tocar sozinho sempre que isso acontecer.
    const playSafely = (el: HTMLMediaElement) => {
      el.onpause = () => {
        if (!el.ended) void el.play().catch(() => undefined);
      };
      void el.play().catch(() => undefined);
    };
    const local = localRef.current;
    const localScreen = localScreenRef.current;
    if (local) {
      local.srcObject = getLocalCallStream();
      playSafely(local);
    }
    if (localScreen) {
      localScreen.srcObject = getLocalScreenStream();
      playSafely(localScreen);
    }
    const nextVideoOn: Record<string, boolean> = {};
    for (const peerId of getActivePeerIds()) {
      const remote = remoteRefs.current.get(peerId);
      const remoteStream = getRemoteCallStream(peerId);
      nextVideoOn[peerId] = !!remoteStream?.getVideoTracks().some((t) => t.enabled);
      if (remote) {
        remote.srcObject = remoteStream;
        // O <video> visível fica mudo — quem toca o áudio é o <audio>
        // oculto sempre montado abaixo, senão minimizar e depois voltar a
        // maximizar tocaria a mesma trilha duas vezes ao mesmo tempo.
        remote.muted = true;
        playSafely(remote);
      }
      const hiddenAudio = hiddenAudioRefs.current.get(peerId);
      if (hiddenAudio) {
        hiddenAudio.srcObject = remoteStream;
        // Trocar a saída de áudio (setSinkId) e tocar o áudio precisam ser
        // independentes — uma falha ao trocar de dispositivo no máximo
        // deixa a saída no padrão do sistema, nunca impede o áudio de tocar.
        void setCallAudioOutput(hiddenAudio).catch(() => undefined);
        playSafely(hiddenAudio);
      }
      const remoteScreen = remoteScreenRefs.current.get(peerId);
      const screenStream = getRemoteScreenStream(peerId);
      if (remoteScreen && screenStream) {
        remoteScreen.srcObject = screenStream;
        playSafely(remoteScreen);
      }
    }
    setRemoteVideoOn(nextVideoOn);
    // `minimized` entra nas dependências de propósito: alternar pro modo
    // compacto desmonta os <video> da view expandida (e vice-versa), então
    // os elementos recém-montados ao voltar têm `srcObject` vazio até esse
    // efeito rodar de novo — sem isso, a câmera "ficava cinza" ao expandir
    // de volta, esperando a próxima mudança de mídia (que podia demorar).
  }, [call.status, mediaVersion, cameraEnabled, screenSharing, minimized]);

  const participants = useMemo(
    () => (call.status === "idle" ? [] : Object.values(call.participants)),
    [call.status === "idle" ? null : call.participants],
  );

  const hiddenAudioPool = (
    <div className="hidden">
      {participants.map((p) => (
        <audio
          key={p.userId}
          ref={(el) => {
            if (el) hiddenAudioRefs.current.set(p.userId, el);
            else hiddenAudioRefs.current.delete(p.userId);
          }}
          autoPlay
        />
      ))}
    </div>
  );

  if (call.status === "idle") {
    if (!endedSummary) return null;
    return (
      <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-2xl backdrop-blur animate-in fade-in slide-in-from-bottom-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <PhoneOff className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{endedSummary.title}</p>
          <p className="text-xs text-muted-foreground">{endedSummary.label}</p>
        </div>
      </div>
    );
  }

  const seconds =
    call.status === "in-call" && call.connectedAt
      ? Math.floor((now - call.connectedAt) / 1_000)
      : 0;
  const isGroup = participants.length > 1;
  const primaryName = call.status === "ringing-in" ? call.hostName : participants[0]?.name || "";
  const title = isGroup
    ? call.status === "ringing-in"
      ? `${call.hostName} e mais ${participants.length - 1}`
      : `Chamada em grupo · ${participants.length + 1} pessoas`
    : primaryName;
  const friendlyError = call.error ? friendlyCallError(call.error) : undefined;
  const statusLabel =
    call.status === "ringing-out"
      ? "Chamando..."
      : call.status === "ringing-in"
        ? "Chamada recebida"
        : call.status === "in-call" && !call.connectedAt
          ? "Conectando..."
          : `Em chamada · ${formatDuration(seconds)}`;

  // Quem está compartilhando é sempre decidido pelo sinal explícito
  // "screen-share" (`p.sharingScreen`), nunca adivinhado a partir da
  // identidade técnica do stream de mídia recebido — essa heurística já
  // confundiu áudio/vídeo comum da chamada com "tela compartilhada" logo ao
  // atender, sem ninguém ter clicado em compartilhar nada.
  const remoteScreenPeer = participants.find((p) => p.sharingScreen);
  const anySharing = screenSharing || !!remoteScreenPeer;

  // Chamada recebida vira uma notificação flutuante discreta, nunca a
  // interface completa — só abre em cheio depois de atender.
  if (call.status === "ringing-in") {
    return (
      <>
        {hiddenAudioPool}
        <IncomingCallToast
          hostName={call.hostName}
          hostPhoto={call.hostPhoto}
          isGroup={isGroup}
          participantCount={participants.length}
          hasVideoIntent={call.cameraEnabled}
        />
      </>
    );
  }

  if (call.status === "ringing-out") {
    if (call.minimized) {
      return (
        <>
          {hiddenAudioPool}
          <CompactCallPlayer
            call={call}
            title={title}
            statusLabel={friendlyError ?? statusLabel}
            isError={!!friendlyError}
            primaryPhoto={participants[0]?.photo}
            localRef={localRef}
            cameraEnabled={call.cameraEnabled}
          />
        </>
      );
    }
    return (
      <>
        {hiddenAudioPool}
        <OutgoingCallScreen
          call={call}
          participants={participants}
          title={title}
          statusLabel={friendlyError ?? statusLabel}
          isError={!!friendlyError}
          localRef={localRef}
        />
      </>
    );
  }

  // in-call
  if (call.minimized) {
    return (
      <>
        {hiddenAudioPool}
        <CompactCallPlayer
          call={call}
          title={title}
          statusLabel={friendlyError ?? statusLabel}
          isError={!!friendlyError}
          primaryPhoto={participants[0]?.photo}
          localRef={localRef}
          cameraEnabled={call.cameraEnabled}
          remoteScreenPeer={remoteScreenPeer}
          screenSharing={screenSharing}
        />
      </>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      {hiddenAudioPool}
      <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950 text-zinc-100">
        <header className="flex shrink-0 items-center justify-between gap-2 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            {(friendlyError || statusLabel !== `Em chamada · ${formatDuration(seconds)}`) && (
              <p
                className={`flex items-center gap-1 text-xs ${friendlyError ? "text-rose-400" : "text-zinc-400"}`}
              >
                {friendlyError && <AlertTriangle className="h-3 w-3 shrink-0" />}
                {friendlyError ?? statusLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <HeaderIconButton
              label={`Participantes · ${participants.length + 1}`}
              onClick={() => setParticipantsOpen(true)}
            >
              <Users className="h-4 w-4" />
            </HeaderIconButton>
            <HeaderIconButton label="Minimizar chamada" onClick={() => setCallMinimized(true)}>
              <Minimize2 className="h-4 w-4" />
            </HeaderIconButton>
          </div>
        </header>

        <div className="min-h-0 flex-1 px-5 pb-3">
          {anySharing ? (
            <ScreenShareLayout
              call={call}
              participants={participants}
              screenSharing={screenSharing}
              remoteScreenPeer={remoteScreenPeer}
              localScreenRef={localScreenRef}
              remoteScreenRefs={remoteScreenRefs}
              remoteRefs={remoteRefs}
              localRef={localRef}
              speakingIds={speakingIds}
              remoteVideoOn={remoteVideoOn}
            />
          ) : (
            <VideoGrid
              call={call}
              participants={participants}
              localRef={localRef}
              remoteRefs={remoteRefs}
              speakingIds={speakingIds}
              remoteVideoOn={remoteVideoOn}
            />
          )}
        </div>

        <footer className="relative flex shrink-0 items-center justify-center gap-2 pb-6 pt-2">
          <IconButton
            label={call.muted ? "Ativar microfone" : "Desativar microfone"}
            active={call.muted}
            onClick={() => setMuted(!call.muted)}
          >
            {call.muted ? <MicOff /> : <Mic />}
          </IconButton>
          <IconButton
            label={call.deafened ? "Reativar áudio" : "Ensurdecer"}
            active={call.deafened}
            onClick={() => setDeafened(!call.deafened)}
          >
            {call.deafened ? <EarOff /> : <Ear />}
          </IconButton>
          <IconButton
            label={call.cameraEnabled ? "Desligar câmera" : "Ativar câmera"}
            active={call.cameraEnabled}
            onClick={() => void setCameraEnabled(!call.cameraEnabled)}
          >
            {call.cameraEnabled ? <Camera /> : <CameraOff />}
          </IconButton>
          {call.screenSharing ? (
            <IconButton
              label="Parar compartilhamento"
              active
              onClick={() => void setScreenSharing(false)}
            >
              <MonitorX />
            </IconButton>
          ) : (
            <DropdownMenu open={shareMenuOpen} onOpenChange={setShareMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Compartilhar tela"
                  title="Compartilhar tela"
                  className="inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-white/10 text-zinc-200 transition-colors hover:bg-white/20 [&_svg]:h-5 [&_svg]:w-5"
                >
                  <MonitorUp />
                </button>
              </DropdownMenuTrigger>
              {/* Radix cuida da colisão sozinho (side="top" + flip automático)
                  — antes disso, um menu posicionado à mão aqui podia sobrepor
                  a faixa de participantes logo acima, quando os dois
                  apareciam perto do rodapé ao mesmo tempo. */}
              <DropdownMenuContent
                side="top"
                align="center"
                className="z-[110] w-56 border-white/10 bg-zinc-900 text-zinc-100"
              >
                <DropdownMenuItem
                  onClick={() => void setScreenSharing(true, false)}
                  className="text-zinc-100 focus:bg-white/10 focus:text-zinc-100"
                >
                  Compartilhar sem áudio
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void setScreenSharing(true, true)}
                  className="text-zinc-100 focus:bg-white/10 focus:text-zinc-100"
                >
                  Compartilhar com áudio
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu open={devicesOpen} onOpenChange={setDevicesOpen}>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Mais opções"
                title="Mais opções"
                className={`inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full ${devicesOpen ? "bg-white/20 text-zinc-100" : "bg-white/10 text-zinc-200"} hover:opacity-90`}
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              side="top"
              className="z-[110] w-72 border-white/10 bg-zinc-900 text-zinc-100"
            >
              <div className="grid gap-3 p-2">
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
              <DropdownMenuItem
                onClick={() => setParticipantsOpen(true)}
                className="text-zinc-100 focus:bg-white/10 focus:text-zinc-100"
              >
                <Users className="h-4 w-4" /> Participantes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="mx-1 h-8 w-px bg-white/10" aria-hidden="true" />
          <IconButton label="Encerrar chamada" danger onClick={() => endCall(true)}>
            <PhoneOff />
          </IconButton>
        </footer>
      </div>
      <ParticipantsPanel
        open={participantsOpen}
        onOpenChange={setParticipantsOpen}
        call={call}
        participants={participants}
        speakingIds={speakingIds}
      />
    </TooltipProvider>
  );
}

function IncomingCallToast({
  hostName,
  hostPhoto,
  isGroup,
  participantCount,
  hasVideoIntent,
}: {
  hostName: string;
  hostPhoto?: string;
  isGroup: boolean;
  participantCount: number;
  hasVideoIntent: boolean;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[190] w-full max-w-[380px] animate-in fade-in slide-in-from-bottom-2">
      <div className="rounded-2xl border border-border bg-background p-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <TileAvatar name={hostName} photo={hostPhoto} ringing />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {isGroup ? `${hostName} e mais ${participantCount - 1}` : hostName}
            </p>
            <p className="text-xs text-muted-foreground">
              {hasVideoIntent ? "Chamada de vídeo" : "Chamada de áudio"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => rejectCall()}
            className="flex-1 cursor-pointer rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Recusar
          </button>
          <button
            onClick={() => void acceptCall()}
            className="flex-1 cursor-pointer rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Atender
          </button>
        </div>
      </div>
    </div>
  );
}

function OutgoingCallScreen({
  call,
  participants,
  title,
  statusLabel,
  isError,
  localRef,
}: {
  call: RingingOrActiveCallState;
  participants: CallParticipant[];
  title: string;
  statusLabel: string;
  isError: boolean;
  localRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const primary = participants[0];
  const others = participants.slice(1);
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-100">
      <div className="text-center">
        <TileAvatar name={primary?.name ?? ""} photo={primary?.photo} large ringing={!isError} />
        <p className="mt-4 text-lg font-semibold">{title}</p>
        <p className={`mt-1 text-sm ${isError ? "text-rose-400" : "text-zinc-400"}`}>
          {statusLabel}
        </p>
        {others.length > 0 && (
          <p className="mt-1 text-xs text-zinc-500">
            e mais {others.map((p) => p.name).join(", ")}
          </p>
        )}
      </div>
      {call.cameraEnabled ? (
        <div className="h-32 w-48 overflow-hidden rounded-xl bg-zinc-800">
          <video ref={localRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <TileAvatar name={getMe().name} photo={getMe().photo} />
          <p className="text-xs text-zinc-500">Você</p>
        </div>
      )}
      <div className="flex items-center gap-3">
        {isError && (
          <button
            onClick={() => {
              const invitees = [
                ...(primary
                  ? [{ id: primary.userId, name: primary.name, photo: primary.photo }]
                  : []),
                ...others.map((p) => ({ id: p.userId, name: p.name, photo: p.photo })),
              ];
              endCall(false);
              void startCall(invitees);
            }}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-medium text-zinc-100 hover:bg-white/20"
          >
            <RotateCcw className="h-4 w-4" /> Tentar novamente
          </button>
        )}
        <button
          onClick={() => endCall(true)}
          className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-full bg-rose-600 px-6 py-3 text-sm font-medium text-white hover:bg-rose-500"
        >
          <PhoneOff className="h-4 w-4" /> Cancelar chamada
        </button>
      </div>
    </div>
  );
}

function CompactCallPlayer({
  call,
  title,
  statusLabel,
  isError,
  primaryPhoto,
  localRef,
  cameraEnabled,
  remoteScreenPeer,
  screenSharing,
}: {
  call: RingingOrActiveCallState;
  title: string;
  statusLabel: string;
  isError: boolean;
  primaryPhoto?: string;
  localRef: React.RefObject<HTMLVideoElement | null>;
  cameraEnabled: boolean;
  remoteScreenPeer?: CallParticipant;
  screenSharing?: boolean;
}) {
  const [pos, setPos] = useState(() => {
    try {
      const raw = sessionStorage.getItem(PIP_POS_KEY);
      if (raw) return JSON.parse(raw) as { right: number; bottom: number };
    } catch {
      /* usa o padrão */
    }
    return { right: 16, bottom: 16 };
  });
  const posRef = useRef(pos);
  const dragRef = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    const next = {
      right: Math.max(8, dragRef.current.right - dx),
      bottom: Math.max(8, dragRef.current.bottom - dy),
    };
    posRef.current = next;
    setPos(next);
  };
  const onPointerUp = () => {
    dragRef.current = null;
    try {
      sessionStorage.setItem(PIP_POS_KEY, JSON.stringify(posRef.current));
    } catch {
      /* sessionStorage indisponível — só não persiste a posição */
    }
  };

  const anySharing = screenSharing || !!remoteScreenPeer;

  return (
    <div
      className="fixed z-[100] flex w-[min(20rem,calc(100vw-2rem))] cursor-grab select-none flex-col gap-2 rounded-xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur active:cursor-grabbing"
      style={{ right: pos.right, bottom: pos.bottom }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold">{title}</p>
        <span className={`text-xs ${isError ? "text-rose-500" : "text-muted-foreground"}`}>
          {statusLabel}
        </span>
      </div>
      <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-lg bg-zinc-900">
        {cameraEnabled && !anySharing ? (
          <video ref={localRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        ) : (
          <TileAvatar name={title} photo={primaryPhoto} large />
        )}
        {anySharing && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-100">
            Compartilhando tela
          </span>
        )}
      </div>
      <div className="flex items-center justify-center gap-2">
        {call.status === "in-call" && (
          <>
            <MiniIconButton
              label={call.muted ? "Ativar microfone" : "Silenciar"}
              active={call.muted}
              onClick={() => setMuted(!call.muted)}
            >
              {call.muted ? <MicOff /> : <Mic />}
            </MiniIconButton>
            <MiniIconButton
              label={call.cameraEnabled ? "Desligar câmera" : "Ligar câmera"}
              active={call.cameraEnabled}
              onClick={() => void setCameraEnabled(!call.cameraEnabled)}
            >
              {call.cameraEnabled ? <Camera /> : <CameraOff />}
            </MiniIconButton>
          </>
        )}
        <MiniIconButton label="Expandir" onClick={() => setCallMinimized(false)}>
          <Maximize2 />
        </MiniIconButton>
        <MiniIconButton label="Encerrar" danger onClick={() => endCall(true)}>
          <PhoneOff />
        </MiniIconButton>
      </div>
    </div>
  );
}

function ParticipantsPanel({
  open,
  onOpenChange,
  call,
  participants,
  speakingIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  call: ActiveCallState;
  participants: CallParticipant[];
  speakingIds: ReadonlySet<string>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="z-[110] w-80 border-l border-white/10 bg-zinc-900 text-zinc-100"
      >
        <SheetHeader>
          <SheetTitle className="text-zinc-100">
            Participantes · {participants.length + 1}
          </SheetTitle>
          <SheetDescription className="text-zinc-400">
            Quem está nesta chamada agora.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-1">
          <ParticipantRow
            name="Você"
            muted={call.muted}
            speaking={speakingIds.has(LOCAL_SPEAKING_ID)}
          />
          {participants.map((p) => (
            <ParticipantRow
              key={p.userId}
              name={p.name}
              photo={p.photo}
              statusLabel={
                p.status === "connecting"
                  ? "Conectando..."
                  : p.status === "reconnecting"
                    ? "Reconectando..."
                    : p.status === "failed"
                      ? "Desconectado"
                      : undefined
              }
              speaking={speakingIds.has(p.userId)}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ParticipantRow({
  name,
  photo,
  muted,
  statusLabel,
  speaking,
}: {
  name: string;
  photo?: string;
  muted?: boolean;
  statusLabel?: string;
  speaking?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2">
      <TileAvatar name={name} photo={photo} small speaking={speaking} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        {statusLabel && <p className="text-xs text-zinc-400">{statusLabel}</p>}
      </div>
      {muted !== undefined && (muted ? <MicOff className="h-4 w-4 text-zinc-500" /> : null)}
    </div>
  );
}

function pickPrimaryLayout(
  participants: CallParticipant[],
  cameraEnabled: boolean,
  remoteVideoOn: Record<string, boolean>,
): "video" | "voice" {
  if (participants.length > 1) return "video";
  const other = participants[0];
  const anyoneOnCamera = cameraEnabled || (other && remoteVideoOn[other.userId]);
  return anyoneOnCamera ? "video" : "voice";
}

function VideoGrid({
  call,
  participants,
  localRef,
  remoteRefs,
  speakingIds,
  remoteVideoOn,
}: {
  call: ActiveCallState;
  participants: CallParticipant[];
  localRef: React.RefObject<HTMLVideoElement | null>;
  remoteRefs: React.RefObject<Map<string, HTMLVideoElement>>;
  speakingIds: ReadonlySet<string>;
  remoteVideoOn: Record<string, boolean>;
}) {
  const layout = pickPrimaryLayout(participants, call.cameraEnabled, remoteVideoOn);
  if (layout === "voice") {
    // Ninguém com câmera ligada — dá protagonismo às pessoas, não a caixas
    // de vídeo vazias/pretas.
    const other = participants[0];
    return (
      <div className="flex h-full items-center justify-center gap-10">
        <div className="text-center">
          <TileAvatar name="Você" large speaking={speakingIds.has(LOCAL_SPEAKING_ID)} />
          <p className="mt-2 text-sm text-zinc-300">Você</p>
        </div>
        {other && (
          <div className="text-center">
            <TileAvatar
              name={other.name}
              photo={other.photo}
              large
              speaking={speakingIds.has(other.userId)}
            />
            <p className="mt-2 text-sm text-zinc-300">{other.name}</p>
            {other.status === "reconnecting" && (
              <p className="text-xs text-amber-400">Reconectando...</p>
            )}
          </div>
        )}
      </div>
    );
  }
  const tileCount = participants.length + 1;
  const cols = tileCount <= 1 ? 1 : tileCount <= 2 ? 2 : tileCount <= 4 ? 2 : 3;
  return (
    <div
      className="grid h-full gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      <VideoTile
        name="Você"
        isSelf
        muted
        cameraOn={call.cameraEnabled}
        videoRef={localRef}
        speaking={speakingIds.has(LOCAL_SPEAKING_ID)}
      />
      {participants.map((p) => (
        <VideoTile
          key={p.userId}
          peerId={p.userId}
          name={p.name}
          photo={p.photo}
          cameraOn={remoteVideoOn[p.userId]}
          statusLabel={
            p.status === "connecting"
              ? "Conectando..."
              : p.status === "reconnecting"
                ? "Reconectando..."
                : p.status === "failed"
                  ? "Desconectado"
                  : undefined
          }
          speaking={speakingIds.has(p.userId)}
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
  speakingIds,
  remoteVideoOn,
}: {
  call: ActiveCallState;
  participants: CallParticipant[];
  screenSharing: boolean;
  remoteScreenPeer?: CallParticipant;
  localScreenRef: React.RefObject<HTMLVideoElement | null>;
  remoteScreenRefs: React.RefObject<Map<string, HTMLVideoElement>>;
  remoteRefs: React.RefObject<Map<string, HTMLVideoElement>>;
  localRef: React.RefObject<HTMLVideoElement | null>;
  speakingIds: ReadonlySet<string>;
  remoteVideoOn: Record<string, boolean>;
}) {
  const [stripCollapsed, setStripCollapsed] = useState(false);
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
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
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-zinc-100">
            {screenSharing
              ? "Você está compartilhando sua tela"
              : `${remoteScreenPeer?.name} está compartilhando a tela`}
          </span>
          {screenSharing && (
            <button
              onClick={() => void setScreenSharing(false)}
              className="cursor-pointer rounded-full bg-rose-600/90 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-rose-500"
            >
              Parar compartilhamento
            </button>
          )}
        </div>
        <button
          onClick={() => setStripCollapsed((v) => !v)}
          className="absolute bottom-2 right-2 cursor-pointer rounded-full bg-black/60 p-1.5 text-zinc-200 hover:bg-black/80"
          aria-label={stripCollapsed ? "Mostrar participantes" : "Ocultar participantes"}
          title={stripCollapsed ? "Mostrar participantes" : "Ocultar participantes"}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${stripCollapsed ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {!stripCollapsed && (
        <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
          <VideoTile
            name="Você"
            isSelf
            muted
            cameraOn={call.cameraEnabled}
            small
            videoRef={localRef}
            speaking={speakingIds.has(LOCAL_SPEAKING_ID)}
          />
          {participants.map((p) => (
            <VideoTile
              key={p.userId}
              peerId={p.userId}
              name={p.name}
              photo={p.photo}
              cameraOn={remoteVideoOn[p.userId]}
              small
              speaking={speakingIds.has(p.userId)}
              videoRef={(el) => {
                if (el) remoteRefs.current.set(p.userId, el);
                else remoteRefs.current.delete(p.userId);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QualityDot({ peerId }: { peerId: string }) {
  const quality = useConnectionQuality(peerId);
  if (quality === "good") return null;
  const label = quality === "bad" ? "Conexão ruim" : "Conexão instável";
  return (
    <span
      className={`absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] ${quality === "bad" ? "text-rose-400" : "text-amber-400"}`}
      title={label}
    >
      {quality === "bad" ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
    </span>
  );
}

function VideoTile({
  peerId,
  name,
  photo,
  isSelf,
  muted,
  cameraOn = true,
  small,
  statusLabel,
  speaking,
  videoRef,
}: {
  peerId?: string;
  name: string;
  photo?: string;
  isSelf?: boolean;
  muted?: boolean;
  cameraOn?: boolean;
  small?: boolean;
  statusLabel?: string;
  speaking?: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null> | ((el: HTMLVideoElement | null) => void);
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-800 transition-shadow ${
        small ? "h-24 w-36" : "min-h-40"
      } ${speaking ? "ring-2 ring-emerald-500/70" : ""}`}
    >
      <video
        ref={videoRef}
        autoPlay
        muted={muted}
        playsInline
        className={`h-full w-full object-cover ${!cameraOn ? "hidden" : ""}`}
      />
      {!cameraOn && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <TileAvatar name={name} photo={photo} large={!small} speaking={speaking} />
        </div>
      )}
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-zinc-100">
        {name}
      </span>
      {statusLabel && (
        <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-amber-400">
          {statusLabel}
        </span>
      )}
      {!statusLabel && !isSelf && peerId && <QualityDot peerId={peerId} />}
    </div>
  );
}

function TileAvatar({
  name,
  photo,
  small,
  large,
  ringing,
  speaking,
}: {
  name: string;
  photo?: string;
  small?: boolean;
  large?: boolean;
  ringing?: boolean;
  speaking?: boolean;
}) {
  const size = small ? "h-10 w-10" : large ? "h-20 w-20" : "h-14 w-14";
  return (
    <div className="relative">
      {ringing && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/40" />}
      {photo ? (
        <img
          src={photo}
          alt={name}
          className={`${size} relative rounded-full object-cover ${speaking ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-900" : ""}`}
        />
      ) : (
        <span
          className={`${size} relative flex items-center justify-center rounded-full bg-zinc-700 font-semibold text-zinc-100 ${speaking ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-900" : ""}`}
        >
          {name ? name.slice(0, 1).toUpperCase() : <User className="h-1/2 w-1/2" />}
        </span>
      )}
    </div>
  );
}

function IconButton({
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
    ? "bg-rose-600 text-white hover:bg-rose-500"
    : positive
      ? "bg-emerald-600 text-white hover:bg-emerald-500"
      : active
        ? "bg-white text-zinc-900 hover:opacity-90"
        : "bg-white/10 text-zinc-200 hover:bg-white/20";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className={`inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full transition-colors [&_svg]:h-5 [&_svg]:w-5 ${tone}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
function MiniIconButton({
  label,
  children,
  onClick,
  active,
  danger,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  const tone = danger
    ? "bg-rose-600 text-white hover:bg-rose-500"
    : active
      ? "bg-foreground text-background"
      : "bg-muted text-foreground hover:bg-muted/70";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5 ${tone}`}
    >
      {children}
    </button>
  );
}
function HeaderIconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
  const [value, setValue] = useState("");
  return (
    <label className="relative space-y-1 text-xs text-zinc-200">
      <span className="font-medium">{label}</span>
      <select
        className="h-9 w-full cursor-pointer appearance-none rounded-md border border-white/10 bg-zinc-800 px-2 pr-7 text-xs text-zinc-100"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (event.target.value) onChange(event.target.value);
        }}
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
