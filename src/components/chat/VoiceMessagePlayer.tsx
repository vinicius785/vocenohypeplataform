import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, AlertCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  updateMessageAttachmentMeta,
  retryVoiceMessage,
  type ChatAttachment,
  type ChatMessage,
} from "@/lib/chat-store";
import {
  VOICE_WAVEFORM_BARS,
  VOICE_RATES,
  type VoiceRate,
  formatVoiceTime,
  requestVoicePlayback,
  releaseVoicePlayback,
  getSessionVoiceRate,
  setSessionVoiceRate,
} from "@/lib/voice-messages";

/** Só usado quando o attachment não tem `peaks`/`durationMs` persistidos
 * (mensagem antiga, de antes deste recurso) — decodifica uma vez e devolve
 * pro chamador persistir. Nunca roda de novo pra um mesmo attachment depois
 * que a persistência funciona (o attachment passa a chegar com os campos
 * prontos nas próximas cargas). */
function useLegacyAudioMeta(
  url: string,
  skip: boolean,
): { durationMs: number; peaks: number[] } | null {
  const [meta, setMeta] = useState<{ durationMs: number; peaks: number[] } | null>(null);
  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    (async () => {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const ctx = new AC();
        const audioBuf = await ctx.decodeAudioData(buf);
        const raw = audioBuf.getChannelData(0);
        const blockSize = Math.max(1, Math.floor(raw.length / VOICE_WAVEFORM_BARS));
        const out: number[] = [];
        for (let i = 0; i < VOICE_WAVEFORM_BARS; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) sum += Math.abs(raw[i * blockSize + j] ?? 0);
          out.push(sum / blockSize);
        }
        const max = Math.max(...out, 0.0001);
        void ctx.close();
        if (!cancelled) {
          setMeta({ durationMs: Math.round(audioBuf.duration * 1000), peaks: out.map((v) => v / max) });
        }
      } catch {
        if (!cancelled) setMeta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, skip]);
  return meta;
}

const FALLBACK_PEAKS = Array.from(
  { length: VOICE_WAVEFORM_BARS },
  (_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 1.7)),
);

export function VoiceMessagePlayer({
  message,
  attachment,
  compact,
}: {
  message: ChatMessage;
  attachment: ChatAttachment;
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [rate, setRate] = useState(getSessionVoiceRate());
  const [ratePopoverOpen, setRatePopoverOpen] = useState(false);
  const healedRef = useRef(false);

  const hasMeta = attachment.durationMs != null && !!attachment.peaks;
  const legacyMeta = useLegacyAudioMeta(attachment.url, hasMeta || !!attachment.uploading || !!attachment.uploadError);

  useEffect(() => {
    if (!legacyMeta || healedRef.current || !attachment.path) return;
    healedRef.current = true;
    void updateMessageAttachmentMeta(message.id, attachment.path, legacyMeta.durationMs, legacyMeta.peaks);
  }, [legacyMeta, message.id, attachment.path]);

  const durationMs = attachment.durationMs ?? legacyMeta?.durationMs ?? 0;
  const peaks = attachment.peaks ?? legacyMeta?.peaks ?? FALLBACK_PEAKS;
  const playbackId = attachment.path || message.id;

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrent(el.currentTime * 1000);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
      releaseVoicePlayback(playbackId);
    };
    // O gerenciador de "só um áudio por vez" pausa outros players chamando
    // `el.pause()` diretamente no elemento — sem ouvir o evento nativo
    // `pause` aqui, o estado React `playing` desse OUTRO player ficava
    // "preso" em true, mostrando o ícone de pausa mesmo com o áudio já
    // parado de verdade.
    const onPause = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("pause", onPause);
    };
  }, [playbackId]);

  useEffect(() => {
    return () => releaseVoicePlayback(playbackId);
  }, [playbackId]);

  if (attachment.uploading) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1.5 pl-1.5 pr-3 text-xs text-muted-foreground">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </span>
        Enviando…
      </div>
    );
  }

  if (attachment.uploadError) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/5 py-1.5 pl-1.5 pr-2.5 text-xs text-destructive">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1">Falha ao enviar</span>
        <button
          type="button"
          onClick={() => void retryVoiceMessage(message.id)}
          className="cursor-pointer rounded-full border border-destructive/40 px-2 py-0.5 font-medium hover:bg-destructive/10"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      releaseVoicePlayback(playbackId);
    } else {
      requestVoicePlayback(playbackId, () => el.pause());
      void el.play();
      setPlaying(true);
    }
  };

  const seekToRatio = (ratio: number) => {
    const el = audioRef.current;
    if (!el || !durationMs) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    el.currentTime = (clamped * durationMs) / 1000;
    setCurrent(clamped * durationMs);
  };

  const ratioFromEvent = (e: { clientX: number }, rect: DOMRect) => (e.clientX - rect.left) / rect.width;

  const progress = durationMs > 0 ? current / durationMs : 0;

  const cycleRate = (next: VoiceRate) => {
    setRate(next);
    setSessionVoiceRate(next);
    setRatePopoverOpen(false);
  };

  const timeLabel = playing || current > 0 ? `${formatVoiceTime(current)} / ${formatVoiceTime(durationMs)}` : formatVoiceTime(durationMs);

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1.5 pl-1.5 pr-2.5 ${compact ? "max-w-[220px]" : "max-w-xs"}`}
    >
      <audio ref={audioRef} src={attachment.url} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar mensagem de voz" : "Tocar mensagem de voz"}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-95"
      >
        {playing ? (
          <Pause className="h-3 w-3 fill-current" />
        ) : (
          <Play className="ml-0.5 h-3 w-3 fill-current" />
        )}
      </button>
      <div
        role="slider"
        aria-label="Buscar posição na mensagem de voz"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") seekToRatio(progress + 0.05);
          if (e.key === "ArrowLeft") seekToRatio(progress - 0.05);
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seekToRatio(ratioFromEvent(e, rect));
        }}
        onMouseDown={(e) => {
          const target = e.currentTarget;
          const rect = target.getBoundingClientRect();
          seekToRatio(ratioFromEvent(e, rect));
          const onMove = (ev: MouseEvent) => seekToRatio(ratioFromEvent(ev, rect));
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
        className="flex h-6 flex-1 cursor-pointer items-center gap-[2px]"
      >
        {peaks.map((lvl, i) => {
          const played = peaks.length > 0 && i / peaks.length < progress;
          return (
            <span
              key={i}
              className={`w-[2.5px] shrink-0 rounded-full transition-colors ${
                played ? "bg-foreground" : "bg-muted-foreground/40"
              }`}
              style={{ height: `${Math.max(20, lvl * 100)}%` }}
            />
          );
        })}
      </div>
      <span className="shrink-0 whitespace-nowrap text-right text-[10px] tabular-nums text-muted-foreground">
        {timeLabel}
      </span>
      <Popover open={ratePopoverOpen} onOpenChange={setRatePopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Velocidade de reprodução"
            className={`shrink-0 cursor-pointer rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors ${
              rate !== 1
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {rate}x
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-1" align="end">
          <div className="flex gap-0.5">
            {VOICE_RATES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => cycleRate(r)}
                className={`cursor-pointer rounded px-2 py-1 text-xs font-medium tabular-nums ${
                  r === rate ? "bg-foreground text-background" : "text-foreground hover:bg-muted"
                }`}
              >
                {r}x
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
