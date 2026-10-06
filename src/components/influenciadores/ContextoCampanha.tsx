import { useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { CockpitTitle, QuietButton } from "./InfluencerCockpit";

/** Peças de apresentação do recurso "Contexto da campanha" (só layout; dados e regras de
 * visibilidade no portal continuam no board). */

/** Texto editável em leitura/edição contextual: o que se lê é o que fica; "Editar" abre um campo
 * pequeno com Cancelar/Salvar. `emphasis` = destaque maior (motivo da escolha). */
export function ContextoTexto({
  title,
  question,
  description,
  value,
  placeholder,
  emptyText,
  addLabel,
  emphasis = false,
  boxed = true,
  hideTitle = false,
  onSave,
}: {
  title: string;
  question?: string;
  description?: string;
  value: string;
  placeholder?: string;
  emptyText: string;
  addLabel: string;
  emphasis?: boolean;
  boxed?: boolean;
  hideTitle?: boolean;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const open = () => {
    setDraft(value);
    setEditing(true);
  };
  const commit = () => {
    const next = draft.trim();
    if (next !== value.trim()) onSave(next);
    setEditing(false);
  };
  const action = editing ? null : (
    <QuietButton onClick={open}>{value ? "Editar" : addLabel}</QuietButton>
  );
  return (
    <section aria-label={title} className="space-y-2">
      {hideTitle ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-text-secondary">{title}</p>
          {action}
        </div>
      ) : (
        <CockpitTitle action={action}>{title}</CockpitTitle>
      )}
      {(question || description) && !editing && (
        <div>
          {question && <p className="text-sm font-medium text-foreground">{question}</p>}
          {description && <p className="text-xs text-text-secondary">{description}</p>}
        </div>
      )}
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            rows={emphasis ? 4 : 3}
            placeholder={placeholder}
            aria-label={title}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
            }}
            className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <div className="flex justify-end gap-3">
            <QuietButton onClick={() => setEditing(false)}>Cancelar</QuietButton>
            <button
              type="button"
              onClick={commit}
              className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90"
            >
              Salvar
            </button>
          </div>
        </div>
      ) : value ? (
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-foreground",
            emphasis ? "text-base leading-relaxed" : "text-sm leading-relaxed",
            boxed && "rounded-lg bg-muted/30 px-3.5 py-3",
          )}
        >
          {value}
        </p>
      ) : (
        <p className="text-sm text-text-secondary">{emptyText}</p>
      )}
    </section>
  );
}

/** Briefing (texto) + materiais (arquivo) lado a lado no desktop, empilhados no celular. Só mostra
 * o que existe; sem nada, um estado vazio compacto com as duas ações. */
export function BriefingEMateriais({
  texto,
  arquivo,
  onSaveTexto,
  onRemoveArquivo,
  renderUpload,
}: {
  texto: string;
  arquivo?: { nome: string; url: string };
  onSaveTexto: (v: string) => void;
  onRemoveArquivo: () => void;
  /** Botão que abre o seletor e sobe o arquivo (cada chamada é uma ação "Adicionar"/"Substituir"). */
  renderUpload: (label: string) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const vazio = !texto && !arquivo && !editing;
  return (
    <section aria-label="Briefing e materiais" className="space-y-2">
      <CockpitTitle>Briefing e materiais</CockpitTitle>
      {vazio ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-sm text-text-secondary">Nenhum briefing ou material.</p>
          <QuietButton onClick={() => setEditing(true)}>Adicionar briefing</QuietButton>
          {renderUpload("Adicionar arquivo")}
        </div>
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 gap-x-8 gap-y-4",
            (texto || editing) && arquivo && "md:grid-cols-2",
          )}
        >
          {(texto || editing) && (
            <ContextoTexto
              title="Briefing"
              hideTitle
              boxed={false}
              value={texto}
              emptyText=""
              addLabel="Adicionar"
              placeholder="Ex.: focar no tom descontraído, evitar mencionar concorrentes..."
              onSave={onSaveTexto}
            />
          )}
          {arquivo ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-secondary">Materiais</p>
              <div className="flex items-center gap-2.5 rounded-lg bg-muted/30 px-3 py-2.5">
                <FileText className="h-5 w-5 shrink-0 text-text-secondary" strokeWidth={1.5} />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {arquivo.nome || "Anexo"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <a
                  href={arquivo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-text-secondary underline-offset-2 hover:text-foreground hover:underline"
                >
                  Abrir
                </a>
                {renderUpload("Substituir")}
                <QuietButton onClick={onRemoveArquivo}>Remover</QuietButton>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs font-medium text-text-secondary">Materiais</p>
              {renderUpload("Adicionar arquivo")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
