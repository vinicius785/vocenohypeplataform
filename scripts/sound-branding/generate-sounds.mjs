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

// Notas (Hz) — tudo em Lá maior; A5 é a "assinatura" que reaparece nos três sons.
const N = { A4: 440.0, Cs5: 554.37, E5: 659.25, A5: 880.0, Cs6: 1108.73, E6: 1318.51, A6: 1760.0 };

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

// ---------------- Os três sons ----------------

// CHAT — muito curto e grave-médio: duas notas (Lá4 → Mi5, quinta ascendente), sem brilho.
function chat() {
  const b = alloc(0.7);
  note(b, N.A4, 0.0, { len: 0.16, amp: 0.55, bright: 0.45, ring: 0.7 });
  note(b, N.E5, 0.085, { len: 0.3, amp: 0.6, bright: 0.5, ring: 0.8 });
  return lowpass(lowpass(b, 2800), 2800);
}

/** Moeda: transiente curto de ruído + parciais metálicos inarmônicos (tilintar de moeda). */
function coin(buf, freq, t0, { len = 0.22, amp = 0.4 } = {}) {
  const start = Math.floor(t0 * SR);
  const n = Math.floor(len * SR);
  const parts = [
    [1, 1.0, 1.0],
    [2.76, 0.55, 0.7],
    [5.4, 0.3, 0.45],
    [8.93, 0.14, 0.3],
  ];
  let seed = 12345;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / SR;
    const attack = Math.min(1, t / 0.0015);
    let v = 0;
    for (const [m, a, d] of parts) {
      v += Math.sin(2 * Math.PI * freq * m * t) * a * Math.exp(-t / ((len / 3.5) * d));
    }
    // "clique" metálico inicial (ruído filtrado muito curto)
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = (seed / 0xffffffff - 0.5) * Math.exp(-t / 0.0025) * 0.7;
    buf[start + i] += (v * 0.35 + noise) * attack * amp;
  }
}

/** Corpo grave sob a moeda: seno curto em 220 Hz — dá peso (e tira o "tilintar" de brinquedo). */
function thud(buf, t0, { len = 0.09, amp = 0.5 } = {}) {
  const start = Math.floor(t0 * SR);
  const n = Math.floor(len * SR);
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / SR;
    buf[start + i] +=
      Math.sin(2 * Math.PI * 220 * t) * Math.exp(-t / 0.03) * Math.min(1, t / 0.002) * amp;
  }
}

/** Sino de campainha: parciais de sino (1, 2.4, 3.9) com decaimento longo — "ding-dong". */
function bell(buf, freq, t0, { len = 0.9, amp = 0.5, warm = false } = {}) {
  const start = Math.floor(t0 * SR);
  const n = Math.floor(len * SR);
  // `warm`: registro grave e poucos harmônicos agudos — campainha encorpada, sem brilho estridente.
  const parts = warm
    ? [
        [1, 1.0, 1.0],
        [2.0, 0.32, 0.7],
        [2.9, 0.1, 0.4],
      ]
    : [
        [1, 1.0, 1.0],
        [2.4, 0.4, 0.55],
        [3.9, 0.22, 0.35],
        [5.8, 0.1, 0.22],
      ];
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / SR;
    const attack = Math.min(1, t / 0.002);
    let v = 0;
    for (const [m, a, d] of parts) {
      v += Math.sin(2 * Math.PI * freq * m * t) * a * Math.exp(-t / ((len / 3.2) * d));
    }
    buf[start + i] += v * 0.4 * attack * amp;
  }
}

// COMERCIAL — dinheiro, sóbrio e firme: duas moedas pesadas sobre um corpo grave, fechando em
// duas notas médias (Lá4 → Mi5). Sem arpejo brilhante.
function commercial() {
  const b = alloc(1.2);
  thud(b, 0.0, { len: 0.09, amp: 0.34 });
  coin(b, 1568, 0.0, { len: 0.2, amp: 0.5 });
  coin(b, 1976, 0.08, { len: 0.22, amp: 0.55 });
  note(b, N.A4, 0.17, { len: 0.34, amp: 0.55, bright: 0.55, ring: 0.8 });
  note(b, N.E5, 0.27, { len: 0.46, amp: 0.6, bright: 0.6, ring: 0.9 });
  return lowpass(lowpass(b, 6500), 6500);
}

// REUNIÃO — carteiro na campainha: "ding-dong" (Dó♯ → Lá), com a nota final longa e clara.
function meeting() {
  const b = alloc(2.0);
  // Uma oitava abaixo do desenho anterior (Dó♯5 → Lá4) e filtrada: grave, quente, sem agudo estridente.
  bell(b, N.Cs5, 0.0, { len: 0.7, amp: 0.5, warm: true });
  bell(b, N.A4, 0.36, { len: 1.0, amp: 0.66, warm: true });
  return lowpass(lowpass(b, 2600), 2600);
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
};
for (const [name, fn] of Object.entries(defs)) {
  let b = fn();
  // Chat: quase sem cauda (reverb mínimo e corte mais cedo) — é o som mais repetido.
  const isChat = name.startsWith("chat");
  b = reverb(b, name.startsWith("meeting") ? 0.18 : isChat ? 0.04 : 0.13);
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
