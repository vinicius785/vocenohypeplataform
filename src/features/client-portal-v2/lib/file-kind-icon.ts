import { FileText, Film, Image as ImageIcon, Music, Paperclip } from "lucide-react";
import type { ClientFileKind } from "./client-file-format";

/** Ícone por tipo de arquivo — só os tipos que `inferFileKind` realmente detecta. */
export const FILE_KIND_ICON: Record<ClientFileKind, typeof FileText> = {
  pdf: FileText,
  text: FileText,
  image: ImageIcon,
  video: Film,
  audio: Music,
  unsupported: Paperclip,
};
