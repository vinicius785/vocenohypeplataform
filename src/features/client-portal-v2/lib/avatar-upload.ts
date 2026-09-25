/**
 * Validação e processamento de avatar — nada daqui confia na extensão do
 * arquivo nem no `File.type` do browser (fácil de forjar/errar); o MIME
 * real é sniffado pelos primeiros bytes ("magic numbers").
 */

export const MAX_AVATAR_BYTES = 8 * 1024 * 1024; // 8MB — dentro da faixa pedida (5-10MB)
export const AVATAR_OUTPUT_SIZE = 512; // lado do quadrado final, em pixels

export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp";

/** Lê os primeiros bytes do arquivo e reconhece o formato real —
 * `File.type`/extensão nunca são a fonte de verdade. */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const isWebp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (isRiff && isWebp) return "image/webp";
  return null;
}

export type AvatarValidationError =
  | { code: "too_large"; maxBytes: number }
  | { code: "invalid_format" };

export function validateAvatarFile(
  sizeBytes: number,
  sniffedType: SniffedImageType | null,
): AvatarValidationError | null {
  if (sizeBytes > MAX_AVATAR_BYTES) return { code: "too_large", maxBytes: MAX_AVATAR_BYTES };
  if (!sniffedType) return { code: "invalid_format" };
  return null;
}

export function avatarValidationMessage(error: AvatarValidationError): string {
  if (error.code === "too_large") {
    return `A imagem deve ter até ${Math.round(error.maxBytes / (1024 * 1024))}MB.`;
  }
  return "Formato não suportado. Envie um arquivo JPG, PNG ou WebP.";
}

const EXTENSION_BY_TYPE: Record<SniffedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionForType(type: SniffedImageType): string {
  return EXTENSION_BY_TYPE[type];
}
