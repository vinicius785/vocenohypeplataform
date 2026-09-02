import { useState } from "react";
import { ChevronDown, Check, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { BlogPost } from "@/lib/projetos";
import { buildChecklist, destinoLabel, pendingRequired } from "./types";

type Step =
  | { kind: "pending"; items: string[] }
  | { kind: "confirm-publish" }
  | { kind: "confirm-schedule"; at: string }
  | { kind: "confirm-unpublish" }
  | { kind: "success"; destinos: string[]; scheduled: boolean };

/** CTA principal de publicação — orquestra a validação (checklist), a
 * confirmação e a microanimação de sucesso, tudo dentro do mesmo `Dialog`
 * (troca de conteúdo por etapa, sem empilhar modais). As ações que de fato
 * mudam `status`/`publishDate` do post continuam sendo persistidas pelo
 * mesmo canal de autosave do editor (`onPublishNow`/`onSchedule`/
 * `onUnpublish`, que chamam `patchImmediate` por baixo). */
export function PublishActions({
  post,
  scheduleMode,
  scheduleAt,
  onPreview,
  onPublishNow,
  onSchedule,
  onUnpublish,
  onFocusField,
  onRequestSchedule,
}: {
  post: BlogPost;
  scheduleMode: "now" | "schedule";
  scheduleAt: string;
  onPreview: () => void;
  onPublishNow: () => void;
  onSchedule: (iso: string) => void;
  onUnpublish: () => void;
  onFocusField: (key: "title" | "content" | "author" | "destino" | "portalClientes") => void;
  /** Chamado quando o usuário pede "Agendar" pelo menu mas ainda não
   * escolheu uma data/hora futura na sidebar — em vez de publicar na hora
   * (o que o rótulo do item não prometeu), muda o modo pra "Agendar" e rola
   * até o campo de data, pra ele escolher antes de confirmar. */
  onRequestSchedule: () => void;
}) {
  const [step, setStep] = useState<Step | null>(null);

  const isPublished = post.status === "publicado";
  const willSchedule =
    scheduleMode === "schedule" && !!scheduleAt && new Date(scheduleAt) > new Date();

  const requestPrimaryAction = () => {
    const checklist = buildChecklist(post);
    const pending = pendingRequired(checklist);
    if (pending.length > 0) {
      setStep({ kind: "pending", items: pending.map((p) => p.key) });
      return;
    }
    if (willSchedule) setStep({ kind: "confirm-schedule", at: scheduleAt });
    else setStep({ kind: "confirm-publish" });
  };

  const confirmPublish = () => {
    onPublishNow();
    setStep({ kind: "success", destinos: destinoParts(post), scheduled: false });
  };
  const confirmSchedule = (at: string) => {
    onSchedule(at);
    setStep({ kind: "success", destinos: destinoParts(post), scheduled: true });
  };
  const confirmUnpublish = () => {
    onUnpublish();
    setStep(null);
  };

  return (
    <>
      <div className="ml-auto flex gap-2">
        <button
          onClick={onPreview}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted"
        >
          <Eye className="h-3.5 w-3.5" /> Pré-visualizar
        </button>
        <DropdownMenu>
          <div className="inline-flex overflow-hidden rounded-full bg-foreground text-background">
            <button
              onClick={requestPrimaryAction}
              className="px-3 py-1.5 text-xs font-medium hover:opacity-90"
            >
              {isPublished ? "Atualizar publicação" : "Publicar"}
            </button>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Mais opções de publicação"
                className="border-l border-background/20 px-2 py-1.5 hover:opacity-90"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent align="end">
            {!isPublished && (
              <>
                <DropdownMenuItem onClick={() => setStep({ kind: "confirm-publish" })}>
                  Publicar agora
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (willSchedule) setStep({ kind: "confirm-schedule", at: scheduleAt });
                    else onRequestSchedule();
                  }}
                >
                  Agendar publicação
                </DropdownMenuItem>
              </>
            )}
            {isPublished && (
              <>
                <DropdownMenuItem onClick={() => setStep({ kind: "confirm-unpublish" })}>
                  Despublicar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (willSchedule) setStep({ kind: "confirm-schedule", at: scheduleAt });
                    else onRequestSchedule();
                  }}
                >
                  Agendar alteração
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={!!step} onOpenChange={(open) => !open && setStep(null)}>
        <DialogContent className="max-w-sm">
          {step?.kind === "pending" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">
                {step.items.length} {step.items.length === 1 ? "item precisa" : "itens precisam"}{" "}
                ser resolvido{step.items.length === 1 ? "" : "s"}
              </p>
              <ul className="space-y-1">
                {step.items.map((key) => (
                  <li key={key}>
                    <button
                      onClick={() => {
                        setStep(null);
                        onFocusField(key as Parameters<typeof onFocusField>[0]);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                      {pendingLabel(key)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step?.kind === "confirm-publish" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold">Pronto para publicar?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Este conteúdo será publicado em:
                </p>
              </div>
              <ul className="space-y-1 text-xs">
                {destinoParts(post).map((d) => (
                  <li key={d} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> {d}
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setStep(null)}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmPublish}
                  className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
                >
                  Publicar agora
                </button>
              </div>
            </div>
          )}

          {step?.kind === "confirm-schedule" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold">Agendar publicação?</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatScheduleLabel(step.at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Destinos:</p>
                <ul className="mt-1 space-y-1 text-xs">
                  {destinoParts(post).map((d) => (
                    <li key={d} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> {d}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setStep(null)}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => confirmSchedule(step.at)}
                  className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
                >
                  Agendar
                </button>
              </div>
            </div>
          )}

          {step?.kind === "confirm-unpublish" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold">Despublicar artigo?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  O conteúdo deixará de aparecer nos destinos selecionados. Ele não é excluído.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setStep(null)}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmUnpublish}
                  className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90"
                >
                  Despublicar
                </button>
              </div>
            </div>
          )}

          {step?.kind === "success" && (
            <div className="flex flex-col items-center gap-3 py-2 text-center animate-in fade-in zoom-in-95 duration-700">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Check className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {step.scheduled ? "Publicação agendada!" : "Artigo publicado!"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {step.scheduled
                    ? `Seu conteúdo vai ao ar em ${step.destinos.length} destino${step.destinos.length === 1 ? "" : "s"}.`
                    : `Seu conteúdo foi publicado em ${step.destinos.length} destino${step.destinos.length === 1 ? "" : "s"}.`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(null)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  Voltar ao projeto
                </button>
                <button
                  onClick={() => {
                    setStep(null);
                    onPreview();
                  }}
                  className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
                >
                  Ver artigo
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function destinoParts(post: BlogPost): string[] {
  const label = destinoLabel(post);
  return label === "Sem destino" ? [] : label.split(" + ");
}

function pendingLabel(key: string): string {
  switch (key) {
    case "title":
      return "Adicione um título";
    case "content":
      return "Escreva o conteúdo";
    case "author":
      return "Selecione um autor";
    case "destino":
      return "Selecione um destino";
    case "portalClientes":
      return "Selecione ao menos um cliente do portal";
    default:
      return key;
  }
}

function formatScheduleLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
