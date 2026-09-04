import { useEffect, useRef, useState } from "react";
import { Trash2, Pause, Play, Send, Loader2 } from "lucide-react";
import { sendVoiceMessage } from "@/lib/chat-store";
import { computeAudioMeta, MAX_RECORDING_MS } from "@/lib/voice-messages";

const LIVE_BARS = 24;
const WARN_BEFORE_MS = 30_000;

function pickMimeType(): string {
  return MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
}

type RecState = "starting" | "recording" | "paused" | "error";

function fmtTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Modo de gravação do composer — substitui a barra de texto normal enquanto
 * ativo (item 11 do pedido). Começa a gravar assim que monta (o "clique no
 * microfone" que monta este componente já é a decisão de gravar, igual ao
 * comportamento anterior). `onDone` volta pro modo texto sem enviar nada;
 * `onSent` volta pro modo texto porque a mensagem já foi enviada (a mensagem
 * em si aparece imediatamente no chat com estado de upload, ver
 * `sendVoiceMessage`/`VoiceMessagePlayer`).
 */
export function VoiceRecorderBar({
  convoId,
  replyToId,
  onDone,
  onSent,
}: {
  convoId: string;
  replyToId?: string;
  onDone: () => void;
  onSent: () => void;
}) {
  const [state, setState] = useState<RecState>("starting");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(LIVE_BARS).fill(0.08));
  const [errorMsg, setErrorMsg] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("audio/webm");
  const startedAtRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pausedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sendingRef = useRef(false);

  const cleanupMedia = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current) void audioCtxRef.current.close();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const mime = pickMimeType();
        mimeRef.current = mime;
        const recorder = new MediaRecorder(stream, { mimeType: mime });
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorderRef.current = recorder;
        recorder.start();
        startedAtRef.current = Date.now();
        setState("recording");

        // Timer — respeita pausa (não avança enquanto pausado).
        tickRef.current = setInterval(() => {
          const now = Date.now();
          const paused = pausedAtRef.current > 0;
          const elapsed = (paused ? pausedAtRef.current : now) - startedAtRef.current - pausedAccumRef.current;
          setElapsedMs(elapsed);
          if (!paused && elapsed >= MAX_RECORDING_MS) {
            void finalizeAndSend();
          }
        }, 200);

        // Waveform ao vivo (item 13) — não precisa ser sofisticado, só
        // reagir ao volume captado.
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyserRef.current = analyser;
          const data = new Uint8Array(analyser.frequencyBinCount);
          const loop = () => {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / data.length);
            const level = Math.min(1, 0.08 + rms * 3.2);
            setLevels((prev) => [...prev.slice(1), level]);
            rafRef.current = requestAnimationFrame(loop);
          };
          rafRef.current = requestAnimationFrame(loop);
        }
      } catch (err) {
        console.warn("[chat] mic access failed", err);
        if (!cancelled) {
          setState("error");
          setErrorMsg("Permita o acesso ao microfone no navegador para gravar mensagens de voz.");
        }
      }
    })();
    return () => {
      cancelled = true;
      cleanupMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => {
    recorderRef.current?.stop();
    cleanupMedia();
    onDone();
  };

  const togglePause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (state === "recording" && "pause" in recorder) {
      recorder.pause();
      pausedAtRef.current = Date.now();
      setState("paused");
    } else if (state === "paused" && "resume" in recorder) {
      pausedAccumRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = 0;
      recorder.resume();
      setState("recording");
    }
  };

  const finalizeAndSend = async () => {
    const recorder = recorderRef.current;
    if (!recorder || sendingRef.current) return;
    sendingRef.current = true;
    if (tickRef.current) clearInterval(tickRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeRef.current }));
      recorder.stop();
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current) void audioCtxRef.current.close();

    if (blob.size === 0) {
      onDone();
      return;
    }
    const meta = await computeAudioMeta(blob);
    void sendVoiceMessage({
      convoId,
      blob,
      durationMs: meta?.durationMs ?? elapsedMs,
      peaks: meta?.peaks ?? [],
      mimeType: mimeRef.current,
      replyToId,
    });
    onSent();
  };

  if (state === "error") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
        <span className="flex-1">{errorMsg}</span>
        <button
          type="button"
          onClick={onDone}
          aria-label="Fechar"
          className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium hover:bg-muted"
        >
          Fechar
        </button>
      </div>
    );
  }

  if (state === "starting") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Aguardando microfone…
      </div>
    );
  }

  const remaining = MAX_RECORDING_MS - elapsedMs;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5">
      <button
        type="button"
        onClick={cancel}
        aria-label="Cancelar gravação"
        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <span className="w-10 shrink-0 text-xs font-medium tabular-nums text-foreground">
        {fmtTimer(elapsedMs)}
      </span>
      <div className="flex h-8 flex-1 items-center gap-[3px] overflow-hidden">
        {levels.map((lvl, i) => (
          <span
            key={i}
            className={`w-[3px] shrink-0 rounded-full transition-[height] duration-75 ${
              state === "paused" ? "bg-muted-foreground/40" : "bg-foreground"
            }`}
            style={{ height: `${Math.max(10, lvl * 100)}%` }}
          />
        ))}
      </div>
      {remaining < WARN_BEFORE_MS && (
        <span className="shrink-0 whitespace-nowrap text-[10px] text-destructive">
          {fmtTimer(Math.max(0, remaining))}
        </span>
      )}
      {state === "paused" && (
        <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">Pausado</span>
      )}
      {"pause" in (recorderRef.current ?? {}) && (
        <button
          type="button"
          onClick={togglePause}
          aria-label={state === "paused" ? "Continuar gravação" : "Pausar gravação"}
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {state === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
      )}
      <button
        type="button"
        onClick={() => void finalizeAndSend()}
        aria-label="Enviar mensagem de voz"
        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-foreground text-background hover:opacity-90"
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
