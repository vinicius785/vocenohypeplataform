import {
  FileText,
  Figma,
  HardDrive,
  Link as LinkIcon,
  Notebook,
  Palette,
  Paperclip,
  Presentation,
  Sheet,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import type { DocSourceType, DocumentResource } from "@/lib/document-resources";

/** Ícone por origem — os mesmos já usados em Projetos; nenhuma miniatura inventada. */
export const SOURCE_ICON: Record<DocSourceType, LucideIcon> = {
  google_docs: FileText,
  google_sheets: Sheet,
  google_slides: Presentation,
  google_drive: HardDrive,
  figma: Figma,
  miro: StickyNote,
  notion: Notebook,
  canva: Palette,
  link: LinkIcon,
  file: Paperclip,
};

/** Abre um link numa nova aba; para anexo (data URL) dispara o download com o nome original. */
export function openDocumentResource(d: DocumentResource) {
  if (d.kind === "link") {
    window.open(d.url, "_blank", "noopener,noreferrer");
    return;
  }
  const a = document.createElement("a");
  a.href = d.url;
  a.download = d.fileName ?? d.title;
  a.click();
}
