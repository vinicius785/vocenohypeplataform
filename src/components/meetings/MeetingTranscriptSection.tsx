import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { wordCount } from "@/lib/meeting-attendance";
import type { Meeting } from "@/lib/reunioes-store";

/** Seção de PRIMEIRO NÍVEL do detalhe da reunião: disponível (com tamanho e data) ou vazia, sempre
 * com a ação visível. O texto completo nunca fica dentro do drawer: abre num diálogo maior. */
export function MeetingTranscriptSection({
  meeting,
  canEdit,
  onSave,
}: {
  meeting: Meeting;
  canEdit: boolean;
  onSave: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [startEditing, setStartEditing] = useState(false);
  const text = meeting.transcricao?.trim() ?? "";
  const has = text.length > 0;
  const updated = meeting.transcricaoAtualizadaEm
    ? new Date(meeting.transcricaoAtualizadaEm).toLocaleDateString("pt-BR")
    : null;

  const openDialog = (edit: boolean) => {
    setStartEditing(edit);
    setOpen(true);
  };

  return (
    <section aria-label="Transcrição" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          Transcrição
        </h3>
        {has && <span className="text-sm text-text-secondary">Disponível</span>}
      </div>
      {has ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-secondary">
            {wordCount(text).toLocaleString("pt-BR")} palavras
            {updated ? ` · atualizada em ${updated}` : ""}
          </p>
          <Button variant="outline" size="sm" onClick={() => openDialog(false)}>
            <FileText className="h-3.5 w-3.5" /> Abrir transcrição
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-secondary">Nenhuma transcrição adicionada.</p>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => openDialog(true)}>
              <FileText className="h-3.5 w-3.5" /> Adicionar transcrição
            </Button>
          )}
        </div>
      )}

      <TranscriptDialog
        open={open}
        onOpenChange={setOpen}
        title={meeting.titulo}
        text={meeting.transcricao ?? ""}
        canEdit={canEdit}
        startEditing={startEditing}
        onSave={(t) => {
          onSave(t);
          setOpen(false);
        }}
      />
    </section>
  );
}

function TranscriptDialog({
  open,
  onOpenChange,
  title,
  text,
  canEdit,
  startEditing,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text: string;
  canEdit: boolean;
  startEditing: boolean;
  onSave: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!open) return;
    setEditing(startEditing && canEdit);
    setDraft(text);
  }, [open, startEditing, canEdit, text]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Transcrição</DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
        </DialogHeader>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Cole aqui a transcrição da reunião..."
            aria-label="Texto da transcrição"
            className="min-h-[50vh] w-full flex-1 resize-none rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/30 p-4">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {text}
            </p>
          </div>
        )}
        <DialogFooter className="gap-2">
          {editing ? (
            <>
              <Button
                variant="ghost"
                onClick={() => (text ? setEditing(false) : onOpenChange(false))}
              >
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => onSave(draft)}>
                Salvar transcrição
              </Button>
            </>
          ) : (
            <>
              {canEdit && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Editar
                </Button>
              )}
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
