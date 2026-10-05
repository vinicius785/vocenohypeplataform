import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { captionLimit, type EditorialChannel } from "@/lib/marketing-editorial";
import { cn } from "@/lib/utils";

/** Legenda da publicação: leitura com Copiar e edição no próprio detalhe. O contador só aparece
 * nos canais com limite conhecido. */
export function EditorialCaption({
  value,
  canal,
  saving,
  onSave,
}: {
  value: string | null;
  canal: EditorialChannel;
  saving: boolean;
  onSave: (text: string | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const limit = captionLimit(canal);

  useEffect(() => {
    setDraft(value ?? "");
    setEditing(false);
  }, [value]);

  const copy = () =>
    void navigator.clipboard.writeText(value ?? "").then(
      () => toast.success("Legenda copiada."),
      () => toast.error("Não foi possível copiar."),
    );

  return (
    <section aria-label="Legenda" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          Legenda
        </h3>
        {!editing && (
          <div className="flex items-center gap-1">
            {value && (
              <Button variant="ghost" size="sm" onClick={copy}>
                <Copy className="h-3.5 w-3.5" /> Copiar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              {value ? "Editar" : "Adicionar legenda"}
            </Button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            rows={8}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escreva a legenda da publicação…"
            aria-label="Legenda"
          />
          <div className="flex items-center justify-between gap-2">
            {limit ? (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  draft.length > limit ? "text-danger" : "text-text-secondary",
                )}
              >
                {draft.length.toLocaleString("pt-BR")} / {limit.toLocaleString("pt-BR")}
              </span>
            ) : (
              <span />
            )}
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(value ?? "");
                  setEditing(false);
                }}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={saving}
                onClick={async () => {
                  if (await onSave(draft.trim() ? draft : null)) setEditing(false);
                }}
              >
                Salvar legenda
              </Button>
            </div>
          </div>
        </div>
      ) : value ? (
        <>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {value}
          </p>
          {limit && (
            <p
              className={cn(
                "text-xs tabular-nums",
                value.length > limit ? "text-danger" : "text-text-secondary",
              )}
            >
              {value.length.toLocaleString("pt-BR")} / {limit.toLocaleString("pt-BR")} caracteres
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-text-secondary">Nenhuma legenda ainda.</p>
      )}
    </section>
  );
}
