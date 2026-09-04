import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMe } from "@/lib/chat-store";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  ChevronDown,
  EyeOff,
  Maximize,
  Maximize2,
  Mic,
  MicOff,
  Minimize,
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
  setMuted,
  setScreenSharing,
  startCall,
  switchCallDevice,
  useCallState,
  useConnectionQuality,
  useSpeakingPeerIds,
  type CallDevices,
  type CallParticipant,
  type CallState,
} from "@/lib/call-controller";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Estado que já tem `CallBase` (participantes, mudo, câmera, etc) — usado
 * pela tela unificada de chamando/em-chamada e pelo player compacto, que
 * aparecem tanto em `ringing-out` quanto em `in-call`. */
type RingingOrActiveCallState = Extract<CallState, { status: "ringing-out" | "in-call" }>;

type TerminalKind = "missed" | "rejected" | "busy";
type TerminalOutcome = {
  name: string;
  photo?: string;
  kind: TerminalKind;
  retryInvitees: { id: string; name: string; photo?: string }[];
};
type Corner = "tl" | "tr" | "bl" | "br";
type VideoFit = "cover" | "contain";

const EMPTY: CallDevices = { microphones: [], cameras: [], speakers: [] };
const PIP_POS_KEY = "call:pipPos";
const SELF_PREVIEW_KEY = "call:selfPreviewCorner";
const VIDEO_FIT_KEY = "call:videoFit";

function formatDuration(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function readVideoFit(): VideoFit {
  try {
    return localStorage.getItem(VIDEO_FIT_KEY) === "contain" ? "contain" : "cover";
  } catch {
    return "cover";
  }
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [videoFit, setVideoFit] = useState<VideoFit>(readVideoFit);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [selfPreviewHidden, setSelfPreviewHidden] = useState(false);
  const [endedSummary, setEndedSummary] = useState<{ title: string; label: string } | null>(null);
  const [terminalOutcome, setTerminalOutcome] = useState<TerminalOutcome | null>(null);
  const [remoteVideoOn, setRemoteVideoOn] = useState<Record<string, boolean>>({});
  const localRef = useRef<HTMLVideoElement>(null);
  const localScreenRef = useRef<HTMLVideoElement>(null);
  const remoteRefs = useRef(new Map<string, HTMLVideoElement>());
  const remoteScreenRefs = useRef(new Map<string, HTMLVideoElement>());
  const stageRef = useRef<HTMLDivElement>(null);
  // O <video> que carrega o áudio remoto some quando minimiza (a barra
  // minimizada não renderiza vídeo/áudio nenhum) — sem uma trilha de áudio
  // sempre montada, minimizar silenciava a ligação inteira mesmo com o
  // WebRTC continuando conectado por trás. Esses <audio> ficam sempre no ar,
  // visualmente ocultos, e tocam independente do estado de minimizado.
  const hiddenAudioRefs = useRef(new Map<string, HTMLAudioElement>());

  // Refs sempre atualizados com os valores mais recentes — o listener de
  // `call:ended` (registrado uma única vez, deps `[]`) precisa ler o estado
  // atual no momento em que o evento chega, não o que existia quando o
  // efeito rodou pela primeira vez (fecharia sobre dados velhos/vazios).
  const callRef = useRef(call);
  callRef.current = call;
  const participants = useMemo(
    () => (call.status === "idle" ? [] : Object.values(call.participants)),
    [call.status === "idle" ? null : call.participants],
  );
  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  useEffect(() => {
    if (call.status !== "in-call") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [call.status]);

  useEffect(() => {
    if (call.status === "idle") {
      setMoreOpen(false);
      setShareMenuOpen(false);
      setParticipantsOpen(false);
      return;
    }
    setTerminalOutcome(null);
    void listCallDevices()
      .then(setDevices)
      .catch(() => setDevices(EMPTY));
  }, [call.status]);

  useEffect(() => {
    try {
      localStorage.setItem(VIDEO_FIT_KEY, videoFit);
    } catch {
      /* sem persistência, só não lembra da próxima vez */
    }
  }, [videoFit]);

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Some com os controles depois de alguns segundos sem mover o mouse —
  // igual a qualquer plataforma de vídeo madura. Nunca esconde enquanto tem
  // algo importante acontecendo (erro, reconectando, menu aberto), pra não
  // esconder justo a única pista de que algo precisa de atenção.
  useEffect(() => {
    const c = callRef.current;
    const important =
      c.status !== "idle" &&
      (!!c.error || Object.values(c.participants).some((p) => p.status === "reconnecting"));
    if (moreOpen || shareMenuOpen || participantsOpen || important) {
      setControlsVisible(true);
      return;
    }
    let hideTimer: number | null = null;
    const show = () => {
      setControlsVisible(true);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setControlsVisible(false), 3_500);
    };
    show();
    const container = stageRef.current;
    container?.addEventListener("mousemove", show);
    container?.addEventListener("mousedown", show);
    return () => {
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      container?.removeEventListener("mousemove", show);
      container?.removeEventListener("mousedown", show);
    };
    // `call.minimized` precisa estar aqui: minimizar/expandir desmonta e
    // remonta a `<div ref={stageRef}>` (branches diferentes do JSX), então
    // sem isso o efeito nunca reanexava os listeners no novo nó — os
    // controles podiam ficar presos em `opacity-0`/`pointer-events-none`
    // pra sempre depois de expandir de novo, sem nada pra chamar `show()`.
  }, [
    moreOpen,
    shareMenuOpen,
    participantsOpen,
    call.status,
    call.status !== "idle" && call.minimized,
  ]);

  // Atalhos M (mic) / V (câmera) — só durante a chamada, e nunca quando o
  // foco está num campo de texto (não pode roubar digitação de mensagem no
  // Chat, por exemplo). ESC de propósito não faz nada aqui — encerrar só
  // pelo botão específico, nunca sem querer (ESC sai do fullscreen sozinho,
  // comportamento nativo do navegador, sem precisar de código pra isso).
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

  // Fim de chamada: o `call:ended` do engine já reseta `call.status` pra
  // "idle" antes desse evento chegar aqui — chamada atendida vira um banner
  // breve que some sozinho; chamada nunca atendida (recusada/ocupado/sem
  // resposta) vira uma tela que fica até a pessoa decidir (tentar de novo ou
  // voltar), já que a decisão importa mais que a duração.
  useEffect(() => {
    const onEnded = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          reason: "answered" | "rejected" | "missed" | "cancelled";
          busy?: boolean;
          seconds: number;
        }>
      ).detail;
      if (!detail) return;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      if (detail.reason === "answered") {
        setEndedSummary({
          title: "Chamada encerrada",
          label: `Duração: ${formatDuration(detail.seconds)}`,
        });
        window.setTimeout(() => setEndedSummary(null), 4_000);
        return;
      }
      const previous = participantsRef.current;
      const primary = previous[0];
      // "cancelled" (ninguém atendeu a tempo, do lado de quem ligou) e
      // "missed" (do lado de quem recebeu e não agiu) viram a MESMA tela
      // "Não atendeu" — só "rejected" (recusa explícita) tem tela própria.
      const kind: TerminalKind = detail.busy
        ? "busy"
        : detail.reason === "rejected"
          ? "rejected"
          : "missed";
      setTerminalOutcome({
        name: primary?.name ?? "",
        photo: primary?.photo,
        kind,
        retryInvitees: previous.map((p) => ({ id: p.userId, name: p.name, photo: p.photo })),
      });
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
    if (endedSummary)
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
    if (terminalOutcome)
      return (
        <TerminalCallScreen outcome={terminalOutcome} onDismiss={() => setTerminalOutcome(null)} />
      );
    return null;
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
      : call.status === "ringing-out"
        ? `${primaryName} e mais ${participants.length - 1}`
        : `Chamada em grupo · ${participants.length + 1} pessoas`
    : primaryName;
  const friendlyError = call.error ? friendlyCallError(call.error) : undefined;
  const isRingingOut = call.status === "ringing-out";
  const isConnecting = call.status === "in-call" && !call.connectedAt;
  const statusLabel = isRingingOut ? "Chamando..." : isConnecting ? "Conectando..." : undefined;
  // Estado de conexão só aparece quando há algo relevante — nunca um
  // "Conectado"/"Em chamada" parado ali sem função nenhuma.
  const anyReconnecting =
    call.status === "in-call" && participants.some((p) => p.status === "reconnecting");
  const headerNotice = friendlyError ?? (anyReconnecting ? "Reconectando..." : undefined);

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

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void stageRef.current?.requestFullscreen().catch(() => undefined);
  };

  return (
    <TooltipProvider delayDuration={300}>
      {hiddenAudioPool}
      <div ref={stageRef} className="fixed inset-0 z-[100] flex flex-col bg-zinc-950 text-zinc-100">
        <header
          className={`flex shrink-0 items-center justify-between gap-2 px-5 py-3 transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <div className="min-w-0">
            {headerNotice && (
              <p
                className={`flex items-center gap-1.5 text-xs ${friendlyError ? "text-rose-400" : "text-amber-400"}`}
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {headerNotice}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!isRingingOut && !isConnecting && (
              <span className="mr-1 text-xs tabular-nums text-zinc-400">
                {formatDuration(seconds)}
              </span>
            )}
            <HeaderIconButton
              label={`Participantes · ${participants.length + 1}`}
              onClick={() => setParticipantsOpen((v) => !v)}
            >
              <Users className="h-4 w-4" />
            </HeaderIconButton>
            <HeaderIconButton
              label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </HeaderIconButton>
            <HeaderIconButton label="Minimizar chamada" onClick={() => setCallMinimized(true)}>
              <Minimize2 className="h-4 w-4" />
            </HeaderIconButton>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1 px-5 pb-3">
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
            ) : isGroup ? (
              <VideoGrid
                call={call}
                participants={participants}
                localRef={localRef}
                remoteRefs={remoteRefs}
                speakingIds={speakingIds}
                remoteVideoOn={remoteVideoOn}
                videoFit={videoFit}
              />
            ) : (
              <OneOnOneStage
                stageRef={stageRef}
                primary={participants[0]}
                isRingingOut={isRingingOut}
                isError={!!friendlyError}
                statusLabel={friendlyError ?? statusLabel}
                localRef={localRef}
                remoteRefs={remoteRefs}
                speakingIds={speakingIds}
                remoteVideoOn={remoteVideoOn}
                videoFit={videoFit}
                cameraEnabled={call.cameraEnabled}
                selfPreviewHidden={selfPreviewHidden}
                onSelfPreviewHiddenChange={setSelfPreviewHidden}
              />
            )}
          </div>
          {participantsOpen && (
            <ParticipantsPanel
              call={call}
              participants={participants}
              speakingIds={speakingIds}
              onClose={() => setParticipantsOpen(false)}
            />
          )}
        </div>

        <footer
          className={`relative flex shrink-0 items-center justify-center gap-2 pb-6 pt-2 transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <IconButton
            label={call.muted ? "Ativar microfone" : "Desativar microfone"}
            active={call.muted}
            onClick={() => setMuted(!call.muted)}
          >
            {call.muted ? <MicOff /> : <Mic />}
          </IconButton>
          <IconButton
            label={call.cameraEnabled ? "Desativar câmera" : "Ativar câmera"}
            active={!call.cameraEnabled}
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
          <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Mais opções"
                title="Mais opções"
                className={`inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full ${moreOpen ? "bg-white/20 text-zinc-100" : "bg-white/10 text-zinc-200"} hover:opacity-90`}
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              side="top"
              className="z-[110] w-64 border-white/10 bg-zinc-900 text-zinc-100"
            >
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-zinc-100 focus:bg-white/10 focus:text-zinc-100 data-[state=open]:bg-white/10">
                  Configurações de áudio e vídeo
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="z-[110] w-72 border-white/10 bg-zinc-900 text-zinc-100">
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
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-zinc-100 focus:bg-white/10 focus:text-zinc-100 data-[state=open]:bg-white/10">
                  Enquadramento do vídeo
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="z-[110] w-52 border-white/10 bg-zinc-900 text-zinc-100">
                    <DropdownMenuRadioGroup
                      value={videoFit}
                      onValueChange={(v) => setVideoFit(v as VideoFit)}
                    >
                      <DropdownMenuRadioItem
                        value="cover"
                        className="text-zinc-100 focus:bg-white/10 focus:text-zinc-100"
                      >
                        Preencher
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem
                        value="contain"
                        className="text-zinc-100 focus:bg-white/10 focus:text-zinc-100"
                      >
                        Ajustar à tela
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                onClick={() => setParticipantsOpen((v) => !v)}
                className="text-zinc-100 focus:bg-white/10 focus:text-zinc-100"
              >
                <Users className="h-4 w-4" /> Participantes
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={toggleFullscreen}
                className="text-zinc-100 focus:bg-white/10 focus:text-zinc-100"
              >
                {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}{" "}
                Tela cheia
              </DropdownMenuItem>
              {selfPreviewHidden && (
                <DropdownMenuItem
                  onClick={() => setSelfPreviewHidden(false)}
                  className="text-zinc-100 focus:bg-white/10 focus:text-zinc-100"
                >
                  <Camera className="h-4 w-4" /> Mostrar seu preview
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="mx-1 h-8 w-px bg-white/10" aria-hidden="true" />
          <IconButton
            label={isRingingOut ? "Cancelar chamada" : "Encerrar chamada"}
            danger
            onClick={() => endCall(true)}
          >
            <PhoneOff />
          </IconButton>
        </footer>
      </div>
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

/** Área principal unificada pra chamada 1:1, usada tanto em "Chamando..."
 * quanto já conectada — a MESMA composição (card + preview no canto)
 * evolui de avatar pulsando pra vídeo real, em vez de trocar de tela. */
function OneOnOneStage({
  stageRef,
  primary,
  isRingingOut,
  isError,
  statusLabel,
  localRef,
  remoteRefs,
  speakingIds,
  remoteVideoOn,
  videoFit,
  cameraEnabled,
  selfPreviewHidden,
  onSelfPreviewHiddenChange,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  primary?: CallParticipant;
  isRingingOut: boolean;
  isError: boolean;
  statusLabel?: string;
  localRef: React.RefObject<HTMLVideoElement | null>;
  remoteRefs: React.RefObject<Map<string, HTMLVideoElement>>;
  speakingIds: ReadonlySet<string>;
  remoteVideoOn: Record<string, boolean>;
  videoFit: VideoFit;
  cameraEnabled: boolean;
  selfPreviewHidden: boolean;
  onSelfPreviewHiddenChange: (hidden: boolean) => void;
}) {
  const hasRemoteVideo = !isRingingOut && !!primary && remoteVideoOn[primary.userId];
  const muted = !!primary?.muted;
  return (
    <div className="relative h-full overflow-hidden rounded-2xl bg-zinc-900/60">
      {/* O <video> fica sempre montado (só troca a classe "hidden"), nunca
          condicionado a `hasRemoteVideo` — o efeito que liga `srcObject` só
          roda quando `mediaVersion`/câmera/etc mudam, não quando este
          elemento nasce; se ele só existisse depois de ligar a câmera, o
          efeito já teria rodado antes dele existir e nunca voltaria a rodar
          de novo só porque o elemento apareceu — a câmera acendia sem
          imagem nenhuma (tela preta), presa até a próxima mudança de mídia
          qualquer. Mesmo padrão já usado em `VideoTile`. */}
      <video
        ref={(el) => {
          if (!primary) return;
          if (el) remoteRefs.current.set(primary.userId, el);
          else remoteRefs.current.delete(primary.userId);
        }}
        autoPlay
        playsInline
        className={`h-full w-full ${videoFit === "cover" ? "object-cover" : "object-contain"} ${hasRemoteVideo ? "" : "hidden"}`}
      />
      {!hasRemoteVideo && (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <TileAvatar
            name={primary?.name ?? ""}
            photo={primary?.photo}
            xl
            ringing={isRingingOut && !isError}
            speaking={!!primary && speakingIds.has(primary.userId)}
          />
          {statusLabel && (
            <p className={`text-sm ${isError ? "text-rose-400" : "text-zinc-400"}`}>
              {statusLabel}
            </p>
          )}
        </div>
      )}
      {/* Nome pertence ao próprio vídeo/tile, nunca solto no cabeçalho da
          chamada — igual ao padrão já usado em VideoTile pros outros modos. */}
      {primary && (
        <span className="absolute bottom-2.5 left-3 flex items-center gap-1 rounded bg-black/55 px-2 py-1 text-xs font-medium text-zinc-100">
          {primary.name}
          {muted && <MicOff className="h-3 w-3 text-zinc-300" />}
        </span>
      )}
      <SelfPreviewCard
        stageRef={stageRef}
        cameraEnabled={cameraEnabled}
        localRef={localRef}
        speaking={speakingIds.has(LOCAL_SPEAKING_ID)}
        hidden={selfPreviewHidden}
        onHiddenChange={onSelfPreviewHiddenChange}
      />
    </div>
  );
}

const CORNER_CLASS: Record<Corner, string> = {
  tl: "top-4 left-4",
  tr: "top-4 right-4",
  bl: "bottom-24 left-4",
  br: "bottom-24 right-4",
};

/** Card flutuante da própria câmera/avatar — arrastável entre os 4 cantos da
 * área principal (nunca livre, sempre encaixa num deles), nunca sobrepondo a
 * barra de controles (cantos inferiores já têm folga extra pra isso).
 * Ocultar aqui nunca desliga a câmera — só para de mostrar seu próprio
 * preview local, a chamada continua exatamente igual pro outro lado. */
function SelfPreviewCard({
  stageRef,
  cameraEnabled,
  localRef,
  speaking,
  hidden,
  onHiddenChange,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  cameraEnabled: boolean;
  localRef: React.RefObject<HTMLVideoElement | null>;
  speaking?: boolean;
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
}) {
  const me = getMe();
  const [corner, setCorner] = useState<Corner>(() => {
    try {
      const raw = sessionStorage.getItem(SELF_PREVIEW_KEY);
      if (raw === "tl" || raw === "tr" || raw === "bl" || raw === "br") return raw;
    } catch {
      /* usa o padrão */
    }
    return "br";
  });
  const [large, setLarge] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  // O vídeo local, mesmo quando o card está oculto, continua montado (só
  // sem exibição) — desmontar de vez faria `localRef` sumir do outro lugar
  // que também depende dele, e a intenção aqui é só parar de MOSTRAR, nunca
  // interferir na câmera de verdade.
  const size = large ? "h-40 w-60" : "h-24 w-36";

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    setDragPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStart.current && stageRef.current) {
      const rect = stageRef.current.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top) / rect.height;
      const next: Corner = `${relY < 0.5 ? "t" : "b"}${relX < 0.5 ? "l" : "r"}` as Corner;
      setCorner(next);
      try {
        sessionStorage.setItem(SELF_PREVIEW_KEY, next);
      } catch {
        /* sem persistência, só não lembra na próxima chamada */
      }
    }
    dragStart.current = null;
    setDragPos(null);
  };

  return (
    <div
      className={`absolute z-10 ${size} cursor-grab select-none overflow-hidden rounded-xl border border-white/10 bg-zinc-800 shadow-lg transition-[width,height] active:cursor-grabbing ${
        dragPos ? "" : CORNER_CLASS[corner]
      } ${hidden ? "hidden" : ""}`}
      style={dragPos ? { left: dragPos.x - 24, top: dragPos.y - 24 } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {cameraEnabled ? (
        <video ref={localRef} autoPlay muted playsInline className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <TileAvatar name={me.name} photo={me.photo} speaking={speaking} />
        </div>
      )}
      <span className="absolute bottom-1 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-100">
        Você
      </span>
      {hovering && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40">
          <MiniIconButton label={large ? "Reduzir" : "Ampliar"} onClick={() => setLarge((v) => !v)}>
            {large ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
          </MiniIconButton>
          <MiniIconButton label="Ocultar meu preview" onClick={() => onHiddenChange(true)}>
            <EyeOff className="h-3 w-3" />
          </MiniIconButton>
        </div>
      )}
    </div>
  );
}

/** Tela persistente (não some sozinha) pra quando a chamada nunca conecta —
 * recusada, ocupado ou sem resposta. Fica até a pessoa decidir tentar de
 * novo ou voltar, em vez de um erro técnico ou sumir sem feedback. */
function TerminalCallScreen({
  outcome,
  onDismiss,
}: {
  outcome: TerminalOutcome;
  onDismiss: () => void;
}) {
  const label =
    outcome.kind === "rejected"
      ? "Chamada recusada"
      : outcome.kind === "busy"
        ? "Ocupado"
        : "Não atendeu";
  const canRetry = outcome.kind === "missed";
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-100">
      <TileAvatar name={outcome.name} photo={outcome.photo} xl />
      <div className="text-center">
        <p className="text-xl font-semibold">{outcome.name}</p>
        <p className="mt-1 text-sm text-zinc-400">{label}</p>
      </div>
      <div className="mt-2 flex items-center gap-3">
        {canRetry && (
          <button
            onClick={() => {
              onDismiss();
              void startCall(outcome.retryInvitees);
            }}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-medium text-zinc-100 hover:bg-white/20"
          >
            <RotateCcw className="h-4 w-4" /> Tentar novamente
          </button>
        )}
        <button
          onClick={onDismiss}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-medium text-zinc-100 hover:bg-white/20"
        >
          Voltar ao chat
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
  statusLabel?: string;
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
        {statusLabel && (
          <span className={`text-xs ${isError ? "text-rose-500" : "text-muted-foreground"}`}>
            {statusLabel}
          </span>
        )}
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
        <MiniIconButton label="Expandir" onClick={() => setCallMinimized(false)}>
          <Maximize2 />
        </MiniIconButton>
        <MiniIconButton
          label={call.status === "ringing-out" ? "Cancelar chamada" : "Encerrar chamada"}
          danger
          onClick={() => endCall(true)}
        >
          <PhoneOff />
        </MiniIconButton>
      </div>
    </div>
  );
}

/** Faixa lateral de participantes — empurra/reduz a área de vídeo (é uma
 * coluna flex normal, não um modal/overlay por cima), fechada por padrão. */
function ParticipantsPanel({
  call,
  participants,
  speakingIds,
  onClose,
}: {
  call: RingingOrActiveCallState;
  participants: CallParticipant[];
  speakingIds: ReadonlySet<string>;
  onClose: () => void;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-white/10 bg-zinc-900 px-4 py-4 text-zinc-100">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Participantes · {participants.length + 1}</p>
        <HeaderIconButton label="Fechar" onClick={onClose}>
          <ChevronDown className="h-4 w-4 rotate-90" />
        </HeaderIconButton>
      </div>
      <div className="mt-3 space-y-1 overflow-y-auto">
        <ParticipantRow
          name={`${getMe().name} (você)`}
          photo={getMe().photo}
          muted={call.muted}
          speaking={speakingIds.has(LOCAL_SPEAKING_ID)}
        />
        {participants.map((p) => (
          <ParticipantRow
            key={p.userId}
            name={p.name}
            photo={p.photo}
            muted={p.muted}
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
    </div>
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
        <p className="text-xs text-zinc-400">
          {statusLabel ?? (muted ? "Microfone desligado" : "Microfone ligado")}
        </p>
      </div>
    </div>
  );
}

function VideoGrid({
  call,
  participants,
  localRef,
  remoteRefs,
  speakingIds,
  remoteVideoOn,
  videoFit,
}: {
  call: RingingOrActiveCallState;
  participants: CallParticipant[];
  localRef: React.RefObject<HTMLVideoElement | null>;
  remoteRefs: React.RefObject<Map<string, HTMLVideoElement>>;
  speakingIds: ReadonlySet<string>;
  remoteVideoOn: Record<string, boolean>;
  videoFit: VideoFit;
}) {
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
        videoFit={videoFit}
      />
      {participants.map((p) => (
        <VideoTile
          key={p.userId}
          peerId={p.userId}
          name={p.name}
          photo={p.photo}
          cameraOn={remoteVideoOn[p.userId]}
          statusLabel={
            p.status === "ringing"
              ? "Chamando..."
              : p.status === "connecting"
                ? "Conectando..."
                : p.status === "reconnecting"
                  ? "Reconectando..."
                  : p.status === "failed"
                    ? "Desconectado"
                    : undefined
          }
          speaking={speakingIds.has(p.userId)}
          videoFit={videoFit}
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
  call: RingingOrActiveCallState;
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
        {/* Os dois <video> ficam sempre montados (só troca a classe "hidden")
            — o sinal explícito "screen-share" chega mais rápido que o
            próprio track de vídeo via WebRTC, então o card podia nascer
            antes de existir stream nenhuma, e o efeito que liga `srcObject`
            só roda quando muda mídia de verdade (não quando este elemento
            aparece) — resultado: tela preta presa até a próxima mudança de
            mídia qualquer. Mesmo padrão já usado em VideoTile/OneOnOneStage. */}
        <video
          ref={localScreenRef}
          autoPlay
          muted
          playsInline
          className={`h-full w-full object-contain ${screenSharing ? "" : "hidden"}`}
        />
        <video
          ref={(el) => {
            if (!remoteScreenPeer) return;
            if (el) remoteScreenRefs.current.set(remoteScreenPeer.userId, el);
            else remoteScreenRefs.current.delete(remoteScreenPeer.userId);
          }}
          autoPlay
          playsInline
          className={`h-full w-full object-contain ${!screenSharing && remoteScreenPeer ? "" : "hidden"}`}
        />
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
  videoFit = "cover",
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
  videoFit?: VideoFit;
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
        className={`h-full w-full ${videoFit === "cover" ? "object-cover" : "object-contain"} ${!cameraOn ? "hidden" : ""}`}
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
  xl,
  ringing,
  speaking,
}: {
  name: string;
  photo?: string;
  small?: boolean;
  large?: boolean;
  xl?: boolean;
  ringing?: boolean;
  speaking?: boolean;
}) {
  const size = small ? "h-10 w-10" : large ? "h-20 w-20" : xl ? "h-28 w-28" : "h-14 w-14";
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
