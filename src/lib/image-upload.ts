/**
 * Resize an image file client-side and return it as a JPEG data URL.
 * Shared by Marketing (blog/editorial/tráfego pago) so cover/creative
 * images use real file upload instead of pasting a URL — same approach
 * already used for project covers (src/components/ProjetosSection.tsx).
 */
export function resizeImageToDataUrl(
  file: File,
  { maxWidth = 1600, maxHeight = 900, quality = 0.78 } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Arquivo não é uma imagem."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Não foi possível processar a imagem."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = () => reject(new Error("Imagem inválida."));
      image.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
