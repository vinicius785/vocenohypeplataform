import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AEO_CATEGORIAS,
  AEO_CATEGORIA_LABEL,
  AEO_IDIOMAS,
  type AeoCategoria,
  type AeoIdioma,
  type AeoPrompt,
} from "@/lib/aeo-store";
import { inputCls } from "../aeo-ui-utils";

export function PromptFormDialog({
  open,
  onOpenChange,
  prompt,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: AeoPrompt | null;
  onSave: (patch: {
    idCodigo?: string;
    texto: string;
    categoria: AeoCategoria;
    idioma: AeoIdioma;
    ativo: boolean;
  }) => void;
}) {
  const [texto, setTexto] = useState(prompt?.texto ?? "");
  const [categoria, setCategoria] = useState<AeoCategoria>(prompt?.categoria ?? "A");
  const [idioma, setIdioma] = useState<AeoIdioma>(prompt?.idioma ?? "PT");
  const [ativo, setAtivo] = useState(prompt?.ativo ?? true);

  const submit = () => {
    if (!texto.trim()) return;
    onSave({ texto: texto.trim(), categoria, idioma, ativo });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{prompt ? `Editar ${prompt.idCodigo}` : "Novo prompt"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {prompt && (
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">Código</label>
              <p className="mt-1 text-sm text-foreground">{prompt.idCodigo}</p>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground">Prompt</label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-border bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">
                Categoria
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as AeoCategoria)}
                className={`${inputCls} mt-1 w-full`}
              >
                {AEO_CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c} — {AEO_CATEGORIA_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">Idioma</label>
              <select
                value={idioma}
                onChange={(e) => setIdioma(e.target.value as AeoIdioma)}
                className={`${inputCls} mt-1 w-full`}
              >
                {AEO_IDIOMAS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {prompt && (
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">Status</label>
              <div className="mt-1 inline-flex rounded-md border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setAtivo(true)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium ${ativo ? "bg-foreground text-background" : "text-muted-foreground"}`}
                >
                  Ativo
                </button>
                <button
                  type="button"
                  onClick={() => setAtivo(false)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium ${!ativo ? "bg-foreground text-background" : "text-muted-foreground"}`}
                >
                  Inativo
                </button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={submit}>
            {prompt ? "Salvar" : "Criar prompt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
