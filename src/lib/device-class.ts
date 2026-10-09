export type DeviceClass = "desktop" | "mobile" | "tablet";

/** Classifica o aparelho a partir do User-Agent. `null` quando não há UA (não chuta). */
export function classifyDevice(userAgent: string | null | undefined): DeviceClass | null {
  const ua = (userAgent ?? "").trim();
  if (!ua) return null;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  // Android sem "Mobile" é tablet (convenção do Chrome).
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "mobile" : "tablet";
  if (/iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile|Mobile/i.test(ua)) return "mobile";
  return "desktop";
}

export const DEVICE_LABEL: Record<DeviceClass, string> = {
  desktop: "Computador",
  mobile: "Celular",
  tablet: "Tablet",
};

export function deviceLabel(value: string | null | undefined): string | null {
  return value && value in DEVICE_LABEL ? DEVICE_LABEL[value as DeviceClass] : null;
}
