/**
 * Redesenha o favicon da aba com um ponto vermelho no canto quando há
 * notificação pendente (mesma fonte de verdade do badge do sino,
 * `NotificationsBell.total` em `AppShell.tsx`). Client-side only — parte
 * do PNG estático (`/favicon-32.png`) num `<canvas>` e troca o `href` de
 * um `<link rel="icon">` dedicado, sem gerar asset novo nem tocar nos
 * `<link>` renderizados por `__root.tsx` (que continuam sendo o fallback
 * caso este módulo nunca rode, ex. JS desabilitado).
 */

const BASE_FAVICON_SRC = "/favicon-32.png";
const FAVICON_SIZE = 32;

let baseImage: HTMLImageElement | null = null;
let baseImageLoading: Promise<HTMLImageElement> | null = null;

function loadBaseImage(): Promise<HTMLImageElement> {
  if (baseImage) return Promise.resolve(baseImage);
  if (baseImageLoading) return baseImageLoading;
  baseImageLoading = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      baseImage = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = BASE_FAVICON_SRC;
  });
  return baseImageLoading;
}

function getDynamicLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>("link[data-dynamic-favicon]");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.setAttribute("data-dynamic-favicon", "true");
    // Anexado por último — navegadores usam o `<link rel="icon">` mais
    // recente no documento, então isso sobrepõe os dois estáticos do
    // `__root.tsx` sem precisar removê-los.
    document.head.appendChild(link);
  }
  return link;
}

/** Chamar sempre que o total de notificações pendentes mudar
 * (`useEffect(() => { void setFaviconBadge(total > 0); }, [total])`). */
export async function setFaviconBadge(active: boolean): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    const img = await loadBaseImage();
    const canvas = document.createElement("canvas");
    canvas.width = FAVICON_SIZE;
    canvas.height = FAVICON_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);
    ctx.drawImage(img, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
    if (active) {
      const radius = FAVICON_SIZE * 0.17;
      const cx = FAVICON_SIZE - radius - 1;
      const cy = radius + 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = FAVICON_SIZE * 0.06;
      ctx.fill();
      ctx.stroke();
    }
    getDynamicLink().href = canvas.toDataURL("image/png");
  } catch {
    // Falha ao carregar o PNG base (offline, CSP, etc.) — não é crítico,
    // a aba só fica sem o indicador visual até a próxima tentativa.
  }
}
