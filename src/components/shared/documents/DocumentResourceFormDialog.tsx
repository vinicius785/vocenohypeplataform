import { useEffect, useRef, useState } from "react";
import { Link as LinkIcon, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { resolveTitle, type DocumentInput, type DocumentResource } from "@/lib/document-resources";

export type DocumentCategoryOption = { value: string; label: string };

/** Formulário ÚNICO de adicionar/editar documento (Projetos, Campanhas e Comercial). Com `initial`
 * é edição (título, link e categoria); sem ele é criação, com a opção "Arquivo" quando o contexto
 * permite anexar. O anexo fica inline no registro (data URL), como sempre foi — por isso o limite
 * opcional de tamanho. */
export function DocumentResourceFormDialog({
  open,
  onOpenChange,
  initial,
  categories,
  allowFileUpload,
  maxFileBytes,
  contextLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: DocumentResource | null;
  categories?: DocumentCategoryOption[];
  allowFileUpload?: boolean;
  maxFileBytes?: number;
  /** Ex.: "ao projeto", "à campanha", "ao Comercial". */
  contextLabel: string;
  onSubmit: (input: DocumentInput) => void;
}) {
  const editing = !!initial;
  const [mode, setMode] = useState<"link" | "file">("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  // Reinicia o formulário a cada abertura (criação limpa; edição pré-preenchida).
  useEffect(() => {
    if (!open) return;
    setMode(initial?.kind ?? "link");
    setTitle(initial?.title ?? "");
    setUrl(initial?.kind === "file" ? "" : (initial?.url ?? ""));
    setCategory(initial?.category ?? categories?.[categories.length - 1]?.value ?? "");
    setFile(null);
    requestAnimationFrame(() => urlRef.current?.focus());
  }, [open, initial, categories]);

  const isFileMode = (editing ? initial?.kind : mode) === "file";
  const canSubmit = isFileMode ? editing || !!file : !!url.trim();

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (maxFileBytes && f.size > maxFileBytes) {
      toast.error(
        `Arquivo muito grande (máx. ${Math.round(maxFileBytes / 1024 / 1024)} MB). Use um link.`,
      );
      return;
    }
    const r = new FileReader();
    r.onload = () => setFile({ name: f.name, dataUrl: String(r.result) });
    r.readAsDataURL(f);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (isFileMode) {
      onSubmit({
        kind: "file",
        title: resolveTitle({
          title,
          url: file?.dataUrl ?? initial?.url ?? "",
          fileName: file?.name ?? initial?.fileName,
        }),
        url: file?.dataUrl ?? initial?.url ?? "",
        fileName: file?.name ?? initial?.fileName,
        category: category || undefined,
      });
    } else {
      onSubmit({
        kind: "link",
        title: resolveTitle({ title, url }),
        url: url.trim(),
        category: category || undefined,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar documento" : "Adicionar documento"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Altere o nome, o link ou a categoria."
              : `Links e materiais de referência ${contextLabel}.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {!editing && allowFileUpload && (
            <SegmentedControl
              aria-label="Tipo de documento"
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "link", label: "Link", icon: <LinkIcon className="h-3 w-3" /> },
                { value: "file", label: "Arquivo", icon: <Paperclip className="h-3 w-3" /> },
              ]}
            />
          )}

          {isFileMode ? (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">Arquivo</span>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip /> {file || initial?.fileName ? "Trocar arquivo" : "Escolher arquivo"}
                </Button>
                <span className="min-w-0 truncate text-xs text-text-secondary">
                  {file?.name ?? initial?.fileName ?? "Nenhum arquivo escolhido"}
                </span>
              </div>
            </div>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-foreground">Link</span>
              <Input
                ref={urlRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://… (Drive, Docs, Figma, Notion…)"
                aria-label="Link do documento"
              />
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-foreground">Nome (opcional)</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome do material"
              aria-label="Nome do documento"
            />
          </label>

          {categories && categories.length > 0 && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-foreground">Categoria</span>
              <NativeSelect
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full"
              >
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}

          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {editing ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
