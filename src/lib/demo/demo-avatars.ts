/**
 * Avatares CARTOON dos influenciadores fictícios da Demo — SVG gerado por código
 * (determinístico, sem arquivo externo, sem foto de pessoa real). Entram no campo `foto` como
 * `data:image/svg+xml`: funciona em `<img>`, não depende de bucket nem de URL assinada e um SVG
 * carregado por `<img>` não executa script.
 */

export type AvatarHair =
  | "curto"
  | "longo-ondulado"
  | "longo-liso"
  | "rabo"
  | "coque"
  | "bone"
  | "crespo";

export type AvatarSpec = {
  /** Fundo em degradê. */
  bg: [string, string];
  skin: string;
  hair: string;
  hairStyle: AvatarHair;
  shirt: string;
  /** Cor do boné (estilo `bone`). */
  cap?: string;
  beard?: boolean;
  glasses?: boolean;
  freckles?: boolean;
  earrings?: boolean;
};

const INK = "#2b1d14";

/** Escurece um `#rrggbb` (para sombra de pescoço/orelha). */
export function shade(hex: string, amount = 0.14): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function hairBack(style: AvatarHair, c: string): string {
  switch (style) {
    case "longo-ondulado":
      return `<path d="M56 92C40 132 50 170 72 184L128 184C150 170 160 132 144 92C146 48 122 32 100 32C78 32 54 48 56 92Z" fill="${c}"/>`;
    case "longo-liso":
      return `<path d="M58 90C48 140 54 176 66 188L134 188C146 176 152 140 142 90C142 50 120 34 100 34C80 34 58 50 58 90Z" fill="${c}"/>`;
    case "rabo":
      return `<path d="M132 62C158 58 172 84 160 110C154 124 142 124 140 112C150 100 150 84 134 80Z" fill="${c}"/>`;
    case "coque":
      return `<circle cx="100" cy="30" r="17" fill="${c}"/><circle cx="100" cy="30" r="7" fill="${shade(c, 0.2)}" opacity=".5"/>`;
    case "crespo":
      return `<circle cx="100" cy="70" r="52" fill="${c}"/><circle cx="62" cy="86" r="18" fill="${c}"/><circle cx="138" cy="86" r="18" fill="${c}"/>`;
    default:
      return "";
  }
}

function hairFront(style: AvatarHair, c: string, cap?: string): string {
  switch (style) {
    case "bone": {
      const k = cap ?? "#ef4444";
      return (
        `<path d="M60 74C60 40 140 40 140 74Z" fill="${k}"/>` +
        `<path d="M54 76L152 76C152 86 108 88 54 82Z" fill="${shade(k, 0.2)}"/>` +
        `<path d="M62 82C60 92 62 96 64 100L70 92Z M138 82C140 92 138 96 136 100L130 92Z" fill="${c}"/>`
      );
    }
    case "curto":
      return `<path d="M61 90C56 52 80 40 100 40C124 40 146 54 139 90C132 72 120 64 100 62C80 64 68 72 61 90Z" fill="${c}"/>`;
    case "crespo":
      return `<path d="M62 84C64 56 82 46 100 46C120 46 138 56 138 84C126 70 114 64 100 64C86 64 74 70 62 84Z" fill="${c}"/>`;
    case "rabo":
      return `<path d="M62 88C58 52 80 42 100 42C124 42 144 54 138 88C128 72 116 62 98 60C84 66 70 74 62 88Z" fill="${c}"/><rect x="134" y="74" width="9" height="6" rx="3" fill="#f43f5e" transform="rotate(-20 138 77)"/>`;
    case "coque":
      return `<path d="M62 88C58 52 80 42 100 42C124 42 144 54 138 88C128 72 116 62 98 60C84 66 70 74 62 88Z" fill="${c}"/>`;
    default:
      // longo-ondulado / longo-liso: franja de lado
      return `<path d="M62 88C58 54 80 42 100 42C124 42 144 54 138 88C128 72 114 62 96 60C84 68 70 76 62 88Z" fill="${c}"/>`;
  }
}

export function buildCartoonAvatarSvg(spec: AvatarSpec, uid = "a"): string {
  const { skin, hair } = spec;
  const dark = shade(skin, 0.14);
  const hasBeard = Boolean(spec.beard);
  const parts: string[] = [];

  parts.push(
    `<defs><linearGradient id="bg${uid}" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${spec.bg[0]}"/><stop offset="1" stop-color="${spec.bg[1]}"/>` +
      `</linearGradient><clipPath id="c${uid}"><circle cx="100" cy="100" r="100"/></clipPath></defs>`,
  );
  parts.push(`<g clip-path="url(#c${uid})">`);
  parts.push(`<rect width="200" height="200" fill="url(#bg${uid})"/>`);
  parts.push(hairBack(spec.hairStyle, hair));
  // ombros e camiseta
  parts.push(
    `<path d="M14 204C22 164 64 150 100 150C136 150 178 164 186 204Z" fill="${spec.shirt}"/>` +
      `<path d="M82 150C88 164 112 164 118 150Z" fill="${shade(spec.shirt, 0.25)}" opacity=".55"/>`,
  );
  // pescoço
  parts.push(`<rect x="86" y="120" width="28" height="36" rx="12" fill="${dark}"/>`);
  // orelhas
  parts.push(
    `<circle cx="61" cy="96" r="8" fill="${skin}"/><circle cx="139" cy="96" r="8" fill="${skin}"/>` +
      `<circle cx="61" cy="96" r="3.5" fill="${dark}" opacity=".5"/><circle cx="139" cy="96" r="3.5" fill="${dark}" opacity=".5"/>`,
  );
  if (spec.earrings) {
    parts.push(
      `<circle cx="60" cy="108" r="3.2" fill="#fbbf24"/><circle cx="140" cy="108" r="3.2" fill="#fbbf24"/>`,
    );
  }
  // cabeça
  parts.push(`<ellipse cx="100" cy="94" rx="39" ry="45" fill="${skin}"/>`);
  if (hasBeard) {
    parts.push(
      `<path d="M63 102C64 138 136 138 137 102C130 120 70 120 63 102Z" fill="${hair}"/>` +
        `<path d="M86 118C92 112 108 112 114 118C108 122 92 122 86 118Z" fill="${hair}"/>`,
    );
  }
  parts.push(hairFront(spec.hairStyle, hair, spec.cap));
  // sobrancelhas
  parts.push(
    `<path d="M72 80C77 76 87 76 92 80" stroke="${hair}" stroke-width="3.4" stroke-linecap="round" fill="none"/>` +
      `<path d="M108 80C113 76 123 76 128 80" stroke="${hair}" stroke-width="3.4" stroke-linecap="round" fill="none"/>`,
  );
  // olhos
  parts.push(
    `<ellipse cx="82" cy="92" rx="7.5" ry="8.5" fill="#fff"/><ellipse cx="118" cy="92" rx="7.5" ry="8.5" fill="#fff"/>` +
      `<circle cx="83" cy="93" r="4.4" fill="${INK}"/><circle cx="119" cy="93" r="4.4" fill="${INK}"/>` +
      `<circle cx="84.6" cy="91.2" r="1.5" fill="#fff"/><circle cx="120.6" cy="91.2" r="1.5" fill="#fff"/>`,
  );
  if (spec.glasses) {
    parts.push(
      `<circle cx="82" cy="92" r="13" fill="#ffffff" fill-opacity=".12" stroke="#1f2937" stroke-width="3"/>` +
        `<circle cx="118" cy="92" r="13" fill="#ffffff" fill-opacity=".12" stroke="#1f2937" stroke-width="3"/>` +
        `<path d="M95 91C98 88 102 88 105 91" stroke="#1f2937" stroke-width="3" fill="none"/>`,
    );
  }
  // nariz, boca, bochechas
  parts.push(
    `<path d="M97 104C98 110 102 110 103 104" stroke="${dark}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`,
  );
  parts.push(
    hasBeard
      ? `<path d="M90 119C96 126 104 126 110 119" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none"/>`
      : `<path d="M88 117C94 126 106 126 112 117Z" fill="#fff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  );
  parts.push(
    `<circle cx="72" cy="108" r="6" fill="#fb7185" opacity=".28"/><circle cx="128" cy="108" r="6" fill="#fb7185" opacity=".28"/>`,
  );
  if (spec.freckles) {
    parts.push(
      [
        [76, 104],
        [82, 108],
        [72, 110],
        [124, 104],
        [118, 108],
        [128, 110],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="${shade(skin, 0.38)}"/>`)
        .join(""),
    );
  }
  parts.push("</g>");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${parts.join("")}</svg>`;
}

/** `data:` URL pronta para `<img src>`. */
export function cartoonAvatarDataUrl(spec: AvatarSpec, uid = "a"): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildCartoonAvatarSvg(spec, uid))}`;
}
