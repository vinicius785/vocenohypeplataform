import { useCallback, useEffect, useRef, useState } from "react";
import { findTrack, type FocusTrack } from "@/lib/focus-audio-tracks";

export type AmbientPlayerStatus = "idle" | "playing" | "paused" | "error";

/** Converte nota MIDI pra frequência (afinação igual, A4=440Hz) — usado
 * pelos geradores de Lo-fi e Música clássica pra descrever acordes/
 * melodias como números de nota em vez de frequências cruas. */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Progressão de acordes (graus i-vi-IV-V, comum em lo-fi/clássico), em
// notas MIDI — registro grave/médio pro pad de Lo-fi, oitava acima pro
// arpejo de Música clássica. Composição original gerada por síntese, não
// reproduz nenhuma obra existente (item 11/18: nunca usar música de
// terceiros, só timbre/padrão próprio gerado ao vivo).
const CHORD_PROGRESSION_LOW = [
  [48, 52, 55, 59], // Cmaj7
  [45, 48, 52, 55], // Am7
  [41, 45, 48, 52], // Fmaj7
  [43, 47, 50, 53], // G7
];
const CHORD_PROGRESSION_HIGH = [
  [60, 64, 67, 72], // C
  [57, 60, 64, 69], // Am
  [53, 57, 60, 65], // F
  [55, 59, 62, 67], // G
];

type LiveNode = { stop?: (t?: number) => void; disconnect: () => void };

/** Player de áudio ambiente INDEPENDENTE do cronômetro do Pomodoro (item
 * 11: "o áudio não deve reiniciar ao pausar o Pomodoro"; "timer e áudio
 * devem ter controles independentes"). Cada instância mantém seu próprio
 * `AudioContext`; Lo-fi, Música clássica e Chuva são sintetizados ao
 * vivo (osciladores/ruído filtrado), sem nenhum arquivo de áudio de
 * terceiros nem serviço externo.
 *
 * Autoplay (item 11/13): nunca chama `play()`/retoma o `AudioContext`
 * sozinho — `play()` só existe pra ser chamado a partir de um clique
 * real do usuário (o próprio `AudioContext` do navegador já bloqueia
 * `resume()` fora de um gesto, então isso é reforçado pela plataforma,
 * não só por convenção aqui). */
export function useAmbientAudio() {
  const [trackId, setTrackId] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(0.6);
  const [muted, setMutedState] = useState(false);
  const [status, setStatus] = useState<AmbientPlayerStatus>("idle");

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<LiveNode[]>([]);
  const schedulerRef = useRef<number | null>(null);

  const stopGraph = useCallback(() => {
    if (schedulerRef.current !== null) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    for (const n of nodesRef.current) {
      try {
        n.stop?.();
      } catch {
        /* já parado */
      }
      try {
        n.disconnect();
      } catch {
        /* já desconectado */
      }
    }
    nodesRef.current = [];
  }, []);

  // Libera o AudioContext ao desmontar — item 11: "interromper e limpar
  // recursos de áudio corretamente".
  useEffect(() => {
    return () => {
      stopGraph();
      void ctxRef.current?.close();
      ctxRef.current = null;
      masterGainRef.current = null;
    };
  }, [stopGraph]);

  const ensureContext = useCallback((): { ctx: AudioContext; master: GainNode } => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (!masterGainRef.current) {
      const g = ctx.createGain();
      g.gain.value = muted ? 0 : volume;
      g.connect(ctx.destination);
      masterGainRef.current = g;
    }
    return { ctx, master: masterGainRef.current };
  }, [muted, volume]);

  const buildNoiseBuffer = useCallback((ctx: AudioContext, seconds: number): AudioBuffer => {
    const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }, []);

  /** Toca um acorde (lista de notas MIDI) com envelope de pad — ataque
   * lento, sustentação suave, soltura longa — dois osciladores levemente
   * dessintonizados por nota pra dar corpo, tudo passando por um filtro
   * passa-baixa quente (~1.4kHz). */
  const playPadChord = useCallback(
    (ctx: AudioContext, master: GainNode, notes: number[], duration: number) => {
      const now = ctx.currentTime;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1400;
      filter.connect(master);
      nodesRef.current.push(filter);

      for (const note of notes) {
        const freq = midiToFreq(note);
        for (const detune of [-4, 4]) {
          const osc = ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.value = freq;
          osc.detune.value = detune;

          const gain = ctx.createGain();
          const peak = 0.05;
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(peak, now + 1.2);
          gain.gain.setValueAtTime(peak, now + duration - 1.5);
          gain.gain.linearRampToValueAtTime(0, now + duration);

          osc.connect(gain).connect(filter);
          osc.start(now);
          osc.stop(now + duration + 0.1);
          nodesRef.current.push(osc, gain);
        }
      }
    },
    [],
  );

  /** Lo-fi: progressão de acordes quentes (pad) + leve textura de ruído
   * filtrado (chiado de "vinil"), em loop — nenhum arquivo, só síntese
   * ao vivo com timbre/padrão original. */
  const playLofi = useCallback(
    (ctx: AudioContext, master: GainNode) => {
      // Textura contínua de fundo (bem baixa) — dá o "calor" de vinil.
      const noiseBuffer = buildNoiseBuffer(ctx, 6);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 2200;
      noiseFilter.Q.value = 0.5;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.015;
      noise.connect(noiseFilter).connect(noiseGain).connect(master);
      noise.start();
      nodesRef.current.push(noise, noiseFilter, noiseGain);

      const chordDuration = 4.6;
      let i = 0;
      const next = () => {
        playPadChord(
          ctx,
          master,
          CHORD_PROGRESSION_LOW[i % CHORD_PROGRESSION_LOW.length],
          chordDuration,
        );
        i++;
      };
      next();
      schedulerRef.current = window.setInterval(next, chordDuration * 1000);
    },
    [buildNoiseBuffer, playPadChord],
  );

  /** Música clássica: arpejo original (padrão tipo "baixo de Alberti")
   * sobre a mesma progressão de acordes, timbre de piano simples
   * (ataque rápido, decaimento suave) — composição própria gerada ao
   * vivo, nunca reproduz nenhuma obra existente. */
  const playClassical = useCallback((ctx: AudioContext, master: GainNode) => {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 3200;
    filter.connect(master);
    nodesRef.current.push(filter);

    const pattern = [0, 2, 1, 2]; // índice dentro do acorde: raiz, 5ª, 3ª, 5ª
    let chordIdx = 0;
    let stepIdx = 0;
    const noteDuration = 0.42;

    const playNote = () => {
      const chord = CHORD_PROGRESSION_HIGH[chordIdx % CHORD_PROGRESSION_HIGH.length];
      const note = chord[pattern[stepIdx % pattern.length]];
      const freq = midiToFreq(note);
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const peak = 0.09;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(Math.max(peak * 0.25, 0.001), now + 0.25);
      gain.gain.linearRampToValueAtTime(0, now + noteDuration * 1.6);
      osc.connect(gain).connect(filter);
      osc.start(now);
      osc.stop(now + noteDuration * 1.6 + 0.05);
      nodesRef.current.push(osc, gain);

      stepIdx++;
      if (stepIdx % pattern.length === 0) chordIdx++;
    };

    playNote();
    schedulerRef.current = window.setInterval(playNote, noteDuration * 1000);
  }, []);

  /** Chuva: corpo contínuo de ruído filtrado (o "chiado" de fundo) +
   * gotas esparsas geradas por probabilidade a cada tick (pequenos
   * estouros de ruído com frequência/ganho aleatórios) — dá textura de
   * chuva sem precisar de nenhum arquivo gravado. Loop contínuo, sem
   * corte perceptível (item 4: "som contínuo e suave", "loop sem corte
   * perceptível"). */
  const playRain = useCallback(
    (ctx: AudioContext, master: GainNode) => {
      const bodyBuffer = buildNoiseBuffer(ctx, 6);
      const body = ctx.createBufferSource();
      body.buffer = bodyBuffer;
      body.loop = true;
      const bodyLowpass = ctx.createBiquadFilter();
      bodyLowpass.type = "lowpass";
      bodyLowpass.frequency.value = 2600;
      const bodyHighpass = ctx.createBiquadFilter();
      bodyHighpass.type = "highpass";
      bodyHighpass.frequency.value = 200;
      const bodyGain = ctx.createGain();
      bodyGain.gain.value = 0.05;
      body.connect(bodyHighpass).connect(bodyLowpass).connect(bodyGain).connect(master);
      body.start();
      nodesRef.current.push(body, bodyHighpass, bodyLowpass, bodyGain);

      const dropletBuffer = buildNoiseBuffer(ctx, 0.1);
      const spawnDroplet = () => {
        if (Math.random() > 0.35) return;
        const now = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = dropletBuffer;
        const bandpass = ctx.createBiquadFilter();
        bandpass.type = "bandpass";
        bandpass.frequency.value = 1500 + Math.random() * 3000;
        bandpass.Q.value = 4;
        const gain = ctx.createGain();
        const peak = 0.015 + Math.random() * 0.02;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peak, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.06);
        src.connect(bandpass).connect(gain).connect(master);
        src.start(now);
        src.stop(now + 0.08);
        nodesRef.current.push(src, bandpass, gain);
      };
      schedulerRef.current = window.setInterval(spawnDroplet, 80);
    },
    [buildNoiseBuffer],
  );

  const playGenerated = useCallback(
    (generator: "lofi" | "classical" | "rain") => {
      const { ctx, master } = ensureContext();
      stopGraph();
      if (generator === "lofi") playLofi(ctx, master);
      else if (generator === "classical") playClassical(ctx, master);
      else playRain(ctx, master);
      setStatus("playing");
    },
    [ensureContext, playClassical, playLofi, playRain, stopGraph],
  );

  const play = useCallback(
    (id: string) => {
      const track = findTrack(id);
      if (!track) {
        setStatus("error");
        return;
      }
      setTrackId(id);
      try {
        if (track.kind === "silence") {
          stopGraph();
          setStatus("idle");
          return;
        }
        const { ctx } = ensureContext();
        // `resume()` só funciona por já estar dentro do handler de um
        // clique do usuário — nunca chamado fora de uma ação explícita.
        void ctx.resume();
        if (track.kind === "generated" && track.generator) {
          playGenerated(track.generator);
        } else {
          // Reservado pra quando existirem faixas `kind: "file"` reais
          // no registro — não há nenhuma hoje (ver focus-audio-tracks.ts).
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    },
    [ensureContext, playGenerated, stopGraph],
  );

  const pause = useCallback(() => {
    stopGraph();
    setStatus(trackId && findTrack(trackId)?.kind !== "silence" ? "paused" : "idle");
  }, [stopGraph, trackId]);

  const setVolume = useCallback(
    (v: number) => {
      setVolumeState(v);
      if (masterGainRef.current) masterGainRef.current.gain.value = muted ? 0 : v;
    },
    [muted],
  );

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      const next = !m;
      if (masterGainRef.current) masterGainRef.current.gain.value = next ? 0 : volume;
      return next;
    });
  }, [volume]);

  const selectTrack: (id: string, wasPlaying: boolean) => void = useCallback(
    (id, wasPlaying) => {
      setTrackId(id);
      if (wasPlaying) play(id);
      else {
        stopGraph();
        setStatus("idle");
      }
    },
    [play, stopGraph],
  );

  const currentTrack: FocusTrack | null = findTrack(trackId);

  return {
    trackId,
    currentTrack,
    volume,
    muted,
    status,
    play,
    pause,
    setVolume,
    toggleMute,
    selectTrack,
    setInitial: (id: string | null, vol: number, isMuted: boolean) => {
      setTrackId(id);
      setVolumeState(vol);
      setMutedState(isMuted);
    },
  };
}
