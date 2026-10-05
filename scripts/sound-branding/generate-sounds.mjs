// Gerador da família sonora Você no Hype — síntese aditiva (sinos/pluck suaves) + reverb curto,
// normalizada por RMS e com limitador. Saída: MP3 mono 44,1 kHz / 128 kbps.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { readFileSync } from "node:fs";
import vm from "node:vm";
// lame.all.js é um script global (não um módulo): avalia e pega o `lamejs` resultante.
vm.runInThisContext(
  readFileSync(require.resolve("lamejs/lame.all.js"), "utf8") + "\n;globalThis.lamejs = lamejs;",
);
const lamejs = globalThis.lamejs;

const SR = 44100;
const OUT = process.argv[2];

// Harmonia de MPB/bossa nova em Ré maior: acordes com sétima maior e nona (Dmaj7(9), Em7(9)),
// tocados num "violão de nylon" sintetizado. Notas por número MIDI (A4 = 69).
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const M = {
  D3: 50,
  A3: 57,
  B3: 59,
  D4: 62,
  E4: 64,
  Fs4: 66,
  G4: 67,
  A4: 69,
  B4: 71,
  Cs5: 73,
  D5: 74,
  E5: 76,
  Fs5: 78,
  A5: 81,
};

const alloc = (secs) => new Float64Array(Math.ceil(secs * SR));

/** Uma nota de sino/pluck: parciais com decaimento próprio, ataque de 3 ms, leve chorus. */
function note(buf, freq, t0, { len = 0.5, amp = 0.5, bright = 1, attack = 0.003, ring = 1 } = {}) {
  const partials = [
    [1, 1.0, 1.0],
    [2, 0.32 * bright, 0.62],
    [3.01, 0.16 * bright, 0.42],
    [4.15, 0.08 * bright, 0.3],
  ];
  const detunes = [1, 1.0016];
  const start = Math.floor(t0 * SR);
  const n = Math.floor(len * SR);
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / SR;
    const env = t < attack ? t / attack : 1;
    let s = 0;
    for (const [mult, a, decayScale] of partials) {
      const tau = (len / 4.2) * decayScale * ring;
      const d = Math.exp(-t / tau);
      for (const dt of detunes) s += Math.sin(2 * Math.PI * freq * mult * dt * t) * a * d * 0.5;
    }
    buf[start + i] += s * env * amp;
  }
}

/** Entrada suave (swell) para a assinatura da Reunião: dupla de sines com ataque lento. */
function swell(buf, freq, t0, { len = 0.5, amp = 0.2, attack = 0.12 } = {}) {
  const start = Math.floor(t0 * SR);
  const n = Math.floor(len * SR);
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / attack) * Math.exp(-Math.max(0, t - attack) / (len / 3.2));
    buf[start + i] += Math.sin(2 * Math.PI * freq * t) * env * amp;
    buf[start + i] += Math.sin(2 * Math.PI * freq * 2 * t) * env * amp * 0.18;
  }
}

/** Reverb curto estilo Schroeder (4 combs + 2 allpass) — dá "ar" sem alongar o som. */
function reverb(x, wet = 0.14) {
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((d) => ({ d: Math.floor(d * SR), g: 0.72 }));
  const out = new Float64Array(x.length);
  for (const c of combs) {
    const line = new Float64Array(c.d);
    let p = 0;
    for (let i = 0; i < x.length; i++) {
      const y = x[i] + line[p] * c.g;
      line[p] = y;
      p = (p + 1) % c.d;
      out[i] += line[p === 0 ? c.d - 1 : p - 1] * 0.25;
    }
  }
  // allpass x2
  for (const dly of [0.005, 0.0017]) {
    const d = Math.floor(dly * SR);
    const line = new Float64Array(d);
    let p = 0;
    for (let i = 0; i < out.length; i++) {
      const buffered = line[p];
      const inp = out[i] + buffered * 0.5;
      line[p] = inp;
      out[i] = buffered - inp * 0.5;
      p = (p + 1) % d;
    }
  }
  const mix = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) mix[i] = x[i] * (1 - wet * 0.5) + out[i] * wet;
  return mix;
}

function fade(buf, ms = 45) {
  const n = Math.floor((ms / 1000) * SR);
  for (let i = 0; i < n; i++) buf[buf.length - 1 - i] *= i / n;
}

/** Corta o silêncio do fim, aplica o fade e devolve o buffer final. */
function trim(buf, floor = 0.0008) {
  let end = buf.length;
  while (end > 0 && Math.abs(buf[end - 1]) < floor) end--;
  const out = buf.slice(0, Math.min(buf.length, end + Math.floor(0.02 * SR)));
  fade(out);
  return out;
}

/** RMS (dBFS) só sobre o trecho "ativo" (acima de −45 dBFS) — proxy de volume percebido. */
function activeRmsDb(b) {
  let sum = 0,
    n = 0;
  for (const v of b)
    if (Math.abs(v) > 0.0056) {
      sum += v * v;
      n++;
    }
  return 10 * Math.log10(sum / Math.max(1, n));
}

function normalize(b, targetRmsDb = -21, peakCeilDb = -1.2) {
  const gain = 10 ** ((targetRmsDb - activeRmsDb(b)) / 20);
  let peak = 0;
  for (let i = 0; i < b.length; i++) {
    b[i] *= gain;
    peak = Math.max(peak, Math.abs(b[i]));
  }
  const ceil = 10 ** (peakCeilDb / 20);
  if (peak > ceil) {
    // limitador suave (tanh) em vez de corte seco
    const k = ceil / Math.tanh(peak / ceil);
    for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] / ceil) * k;
  }
  return b;
}

/** Corda de violão de nylon: parciais harmônicas com decaimento rápido nos agudos + "toque" do dedo. */
function nylon(buf, midi, t0, { len = 1.0, amp = 0.5 } = {}) {
  const f = hz(midi);
  const start = Math.floor(t0 * SR);
  const n = Math.floor(len * SR);
  const parts = [
    [1, 1.0, 1.0],
    [2, 0.55, 0.62],
    [3, 0.3, 0.42],
    [4, 0.16, 0.3],
    [5, 0.08, 0.22],
    [6, 0.04, 0.16],
  ];
  let seed = 4242 + midi;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / SR;
    const attack = Math.min(1, t / 0.002);
    let v = 0;
    for (const [m, a, d] of parts) {
      v += Math.sin(2 * Math.PI * f * m * t) * a * Math.exp(-t / ((len / 3.2) * d));
    }
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const nail = (seed / 0xffffffff - 0.5) * Math.exp(-t / 0.003) * 0.18;
    buf[start + i] += (v * 0.3 + nail) * attack * amp;
  }
}

/** Acorde dedilhado/arpejado para cima (como a mão direita no violão). */
function strum(buf, midis, t0, { gap = 0.03, len = 1.2, amp = 0.4 } = {}) {
  midis.forEach((m, i) => nylon(buf, m, t0 + i * gap, { len, amp: amp * (1 - i * 0.04) }));
}

// ---------------- Os três sons (violão de nylon; cada um cita uma obra da MPB) ----------------

// CHAT — Tim Maia, "Azul da Cor do Mar" (em Lá): a abertura A7M → Bm7. Curtíssimo.
function chat() {
  const b = alloc(0.8);
  strum(b, [45, 56, 61, 64], 0, { gap: 0.012, len: 0.22, amp: 0.5 }); // A7M
  strum(b, [47, 57, 62, 66], 0.14, { gap: 0.012, len: 0.3, amp: 0.55 }); // Bm7
  return lowpass(lowpass(b, 3200), 3200);
}

// COMERCIAL — Jorge Vercillo, "Monalisa" (em Fá♯ menor): a introdução F#m7 → F#m7(11) → B7(4) → B7,
// o quarto que "pede" resolução e se resolve no fim.
function commercial() {
  const b = alloc(1.3);
  const chord = (t, midis, len, amp) => strum(b, midis, t, { gap: 0.014, len, amp });
  chord(0.0, [42, 54, 57, 61], 0.28, 0.4); // F#m7
  chord(0.16, [42, 52, 57, 59], 0.28, 0.4); // F#m7(11)
  chord(0.32, [47, 54, 57, 64], 0.28, 0.42); // B7(4)
  chord(0.5, [47, 54, 57, 63], 0.38, 0.45); // B7
  return lowpass(lowpass(b, 4200), 4200);
}

// ATUALIZAÇÃO — Djavan, "Oceano" (em Ré): a abertura D → G7M → A7 e a volta ao D, subindo.
function update() {
  const b = alloc(1.6);
  const chord = (t, midis, len, amp) => strum(b, midis, t, { gap: 0.014, len, amp });
  chord(0.0, [50, 57, 62, 66], 0.28, 0.4); // D
  chord(0.15, [43, 59, 62, 66], 0.28, 0.4); // G7M
  chord(0.3, [45, 52, 55, 61], 0.28, 0.42); // A7
  chord(0.47, [50, 57, 62, 66, 74], 0.5, 0.45); // D (resolução, nota aguda)
  return lowpass(lowpass(b, 4000), 4000);
}

// REUNIÃO — Roberto Carlos, "Detalhes" (em Lá): a introdução A → A7M → A#º, e o caminho Bm7 → E7 → A.
function meeting() {
  const b = alloc(1.9);
  const chord = (t, midis, len, amp) => strum(b, midis, t, { gap: 0.03, len, amp });
  chord(0.0, [45, 57, 61, 64], 0.4, 0.38); // A
  chord(0.16, [45, 56, 61, 64], 0.4, 0.38); // A7M
  chord(0.32, [46, 52, 55, 61], 0.4, 0.38); // A#º
  chord(0.5, [47, 54, 57, 62], 0.4, 0.4); // Bm7
  chord(0.68, [40, 47, 50, 56], 0.4, 0.4); // E7
  chord(0.86, [45, 57, 61, 64, 69], 0.5, 0.42); // A (resolução)
  return lowpass(lowpass(b, 3600), 3600);
}

/** Passa-baixa de um polo (aplicado duas vezes = ~12 dB/oit): tira o brilho agudo. */
function lowpass(x, fc) {
  const a = Math.exp((-2 * Math.PI * fc) / SR);
  const y = new Float64Array(x.length);
  let prev = 0;
  for (let i = 0; i < x.length; i++) {
    prev = (1 - a) * x[i] + a * prev;
    y[i] = prev;
  }
  return y;
}

function encodeMp3(samples) {
  const enc = new lamejs.Mp3Encoder(1, SR, 128);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++)
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
  const chunks = [];
  const block = 1152;
  for (let i = 0; i < pcm.length; i += block) {
    const out = enc.encodeBuffer(pcm.subarray(i, i + block));
    if (out.length) chunks.push(Buffer.from(out));
  }
  const end = enc.flush();
  if (end.length) chunks.push(Buffer.from(end));
  return Buffer.concat(chunks);
}

const defs = {
  "chat-notification": chat,
  "commercial-notification": commercial,
  "meeting-notification": meeting,
  "update-notification": update,
};
for (const [name, fn] of Object.entries(defs)) {
  let b = fn();
  // Chat: quase sem cauda (reverb mínimo e corte mais cedo) — é o som mais repetido.
  const isChat = name.startsWith("chat");
  b = reverb(b, name.startsWith("meeting") ? 0.18 : isChat ? 0.04 : 0.12);
  b = trim(b, isChat ? 0.01 : 0.0008);
  normalize(b);
  let peak = 0;
  for (const v of b) peak = Math.max(peak, Math.abs(v));
  const mp3 = encodeMp3(b);
  writeFileSync(`${OUT}/${name}.mp3`, mp3);
  console.log(
    `${name}.mp3  ${(b.length / SR).toFixed(2)} s  RMS ${activeRmsDb(b).toFixed(1)} dBFS  pico ${(20 * Math.log10(peak)).toFixed(1)} dBFS  ${(mp3.length / 1024).toFixed(1)} KB`,
  );
}
