import { useEffect, useRef, useState } from "react";
import { ChevronDown, Flag, Loader2, MapPin, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TaskOptionPicker } from "@/components/tasks/task-ui";
import {
  createProblem,
  PartialProblemError,
  PROBLEM_AREAS,
  PROBLEM_KIND_LABEL,
  PROBLEM_KINDS,
  PROBLEM_PRIORITIES,
  PROBLEM_PRIORITY_LABEL,
  type ProblemKind,
  type ProblemPriority,
} from "@/lib/problems";
import { onOpenReportProblem, type ReportContext } from "@/lib/problem-context";
import { KIND_ICON, PROBLEM_PRIORITY_TONE, ProblemPriorityFlag } from "./problem-ui";

const PICKER =
  "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring";

/** Disparado quando um report é criado — a página da Central recarrega. */
export const PROBLEM_CREATED_EVENT = "problems:created";

/**
 * "Reportar problema" — painel lateral único (nunca uma página). Montado
 * uma vez no AppShell e aberto por `openReportProblem()` de qualquer
 * lugar; já chega com área, rota, módulo, tarefa e dados do dispositivo
 * (metadados internos, não aparecem no formulário além da área).
 */
export function ReportProblemSheet() {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<ReportContext | null>(null);
  const [kind, setKind] = useState<ProblemKind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState<string>("Outro");
  const [priority, setPriority] = useState<ProblemPriority>("normal");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      onOpenReportProblem((c) => {
        setCtx(c);
        setKind("bug");
        setTitle("");
        setDescription("");
        setArea(c.defaultArea);
        setPriority("normal");
        setFiles([]);
        setOpen(true);
      }),
    [],
  );

  const valid = title.trim().length >= 3 && description.trim().length >= 5;

  const submit = async () => {
    if (!valid || !ctx || submitting) return;
    setSubmitting(true);
    try {
      await createProblem({
        kind,
        title,
        description,
        area,
        priority,
        files,
        diagnostics: ctx.diagnostics,
      });
      toast.success("Report enviado. Você pode acompanhar em Problemas.");
      window.dispatchEvent(new CustomEvent(PROBLEM_CREATED_EVENT));
      setOpen(false);
    } catch (err) {
      if (err instanceof PartialProblemError) {
        toast.warning(err.message);
        window.dispatchEvent(new CustomEvent(PROBLEM_CREATED_EVENT));
        setOpen(false);
      } else {
        toast.error(err instanceof Error ? err.message : "Não foi possível enviar o report.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !submitting && setOpen(o)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle>Reportar problema</SheetTitle>
          <SheetDescription>
            Conte o que aconteceu. Onde você estava já foi registrado automaticamente.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Tipo</span>
            <SegmentedControl
              aria-label="Tipo do report"
              size="sm"
              value={kind}
              onChange={setKind}
              options={PROBLEM_KINDS.map((k) => {
                const Icon = KIND_ICON[k];
                return {
                  value: k,
                  label: PROBLEM_KIND_LABEL[k],
                  icon: <Icon aria-hidden className="h-3 w-3" />,
                };
              })}
            />
          </div>

          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Título</span>
            <Input
              autoFocus
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Descreva resumidamente o problema"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Descrição</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Explique o que aconteceu, o que você esperava e, se souber, como reproduzir."
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">Área</span>
              <TaskOptionPicker
                value={area}
                ariaLabel="Área"
                widthClass="w-56"
                searchable
                searchPlaceholder="Buscar área..."
                options={PROBLEM_AREAS.map((a) => ({ value: a as string, label: a }))}
                onSelect={setArea}
                trigger={
                  <button type="button" className={PICKER}>
                    <span className="truncate">{area}</span>
                    <ChevronDown aria-hidden className="h-4 w-4 shrink-0 opacity-60" />
                  </button>
                }
              />
            </div>
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">Prioridade</span>
              <TaskOptionPicker
                value={priority}
                ariaLabel="Prioridade"
                widthClass="w-44"
                options={PROBLEM_PRIORITIES.map((p) => ({
                  value: p,
                  label: PROBLEM_PRIORITY_LABEL[p],
                  icon: (
                    <Flag
                      aria-hidden
                      className={`h-3.5 w-3.5 shrink-0 ${PROBLEM_PRIORITY_TONE[p]}`}
                    />
                  ),
                }))}
                onSelect={setPriority}
                trigger={
                  <button type="button" className={PICKER}>
                    <ProblemPriorityFlag priority={priority} />
                    <ChevronDown aria-hidden className="h-4 w-4 shrink-0 opacity-60" />
                  </button>
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Anexos</span>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                  >
                    <Paperclip aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <button
                      type="button"
                      aria-label={`Remover ${f.name}`}
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.txt,.csv,.xlsx,.docx,.zip"
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setFiles((prev) => [...prev, ...picked]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <Paperclip aria-hidden className="h-3.5 w-3.5" /> Adicionar imagem ou arquivo
            </button>
          </div>

          {ctx && (
            <p className="flex items-start gap-1.5 rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              <MapPin aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">
                Contexto registrado: {ctx.defaultArea}. Navegador, dispositivo e versão também são
                enviados para diagnóstico.
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!valid || submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Enviando..." : "Enviar report"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
