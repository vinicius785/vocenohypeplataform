import { useState, type ReactNode } from "react";
import { FileText, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CockpitTitle, QuietButton } from "./InfluencerCockpit";

/** Composição do recurso "Contexto da campanha": MÓDULOS (uma superfície sutil cada) que agrupam
 * o que se relaciona; dentro, blocos com rótulo em caixa-alta e a ação no próprio bloco. Só
 * apresentação — dados, patches e regras de visibilidade no portal continuam no board. */

export function Modulo({
  title,
  subtitle,
  prominent = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Módulo principal: título maior e superfície um pouco mais presente. */
  prominent?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-2xl border border-border/60 p-4 sm:p-5",
        prominent ? "bg-card" : "bg-muted/20",
      )}
    >
      <header className="mb-3.5">
        <h2
          className={cn(
            "font-semibold leading-snug text-foreground",
            prominent ? "text-base" : "text-[15px]",
          )}
        >
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-text-secondary">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

/** Texto em leitura/edição contextual. `label` desenha o rótulo do bloco (com a ação à direita);
 * sem `label`, a ação fica logo abaixo do texto. Vazio: contexto + ação integrada. */
export function ContextoTexto({
  label,
  ariaLabel,
  value,
  placeholder,
  emptyText,
  emptyHint,
  emphasis = false,
  onSave,
}: {
  label?: string;
  ariaLabel: string;
  value: string;
  placeholder?: string;
  emptyText: string;
  emptyHint?: string;
  emphasis?: boolean;
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
    if (next !== value.trim()) {
      onSave(next);
      toast.success("Salvo.");
    }
    setEditing(false);
  };
  return (
    <div className="min-w-0 space-y-2">
      {label && <CockpitTitle>{label}</CockpitTitle>}
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            rows={emphasis ? 4 : 3}
            placeholder={placeholder}
            aria-label={ariaLabel}
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
      ) : (
        <button
          type="button"
          onClick={open}
          aria-label={`Editar ${ariaLabel}`}
          className="group relative -mx-2 block w-[calc(100%+1rem)] cursor-pointer rounded-md px-2 py-1 pr-7 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {value ? (
            <span
              className={cn(
                "block whitespace-pre-wrap break-words leading-relaxed text-foreground",
                emphasis ? "text-base" : "text-sm",
              )}
            >
              {value}
            </span>
          ) : (
            <>
              <span className="block text-sm text-text-secondary">{emptyText}</span>
              {emptyHint && <span className="block text-xs text-text-secondary">{emptyHint}</span>}
            </>
          )}
          <Pencil
            aria-hidden
            className="absolute right-2 top-2 h-3 w-3 text-text-secondary opacity-50 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
          />
        </button>
      )}
    </div>
  );
}

export function ArquivoMaterial({
  nome,
  url,
  meta,
  onOpen,
  onRemove,
  renderUpload,
}: {
  nome: string;
  url: string;
  /** Linha pequena sob o nome (padrão: tipo do arquivo). */
  meta?: string;
  /** Abre o arquivo de um jeito próprio (ex.: `data:` URL); sem isso, link normal. */
  onOpen?: () => void;
  /** Sem isto, o menu não oferece "Remover" (ex.: arquivo legado que não pode ser removido daqui). */
  onRemove?: () => void;
  renderUpload: (label: string) => ReactNode;
}) {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(nome)?.[1]?.toUpperCase() ?? "Arquivo";
  return (
    <div className="rounded-lg border border-border/60 bg-background p-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-text-secondary">
          <FileText className="h-4 w-4" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={nome}>
            {nome || "Anexo"}
          </p>
          <p className="text-[11px] text-text-secondary">{meta ?? ext}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Mais ações do material"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                onOpen ? onOpen() : window.open(url, "_blank", "noopener,noreferrer")
              }
            >
              Abrir
            </DropdownMenuItem>
            {onRemove && (
              <DropdownMenuItem
                onSelect={onRemove}
                className="text-destructive focus:text-destructive"
              >
                Remover arquivo
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-2.5 flex items-center gap-4 border-t border-border/60 pt-2.5">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="text-xs font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Abrir
          </button>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Abrir
          </a>
        )}
        {renderUpload("Substituir")}
      </div>
    </div>
  );
}

/** Briefing + materiais: MESMO contexto ("o que preciso saber para executar"), duas colunas com
 * divisor no desktop e empilhados no celular. */
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
  renderUpload: (label: string) => ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-0 md:divide-x md:divide-border/60">
      <div className="md:pr-5">
        <ContextoTexto
          label="Briefing"
          ariaLabel="Briefing"
          value={texto}
          emptyText="Ainda não há briefing para este influenciador."
          emptyHint="O que ele precisa saber e fazer nesta campanha."
          placeholder="Ex.: focar no tom descontraído, evitar mencionar concorrentes..."
          onSave={onSaveTexto}
        />
      </div>
      <div className="min-w-0 space-y-2 border-t border-border/60 pt-5 md:border-t-0 md:pt-0 md:pl-5">
        <CockpitTitle>Materiais</CockpitTitle>
        {arquivo ? (
          <ArquivoMaterial
            nome={arquivo.nome}
            url={arquivo.url}
            onRemove={onRemoveArquivo}
            renderUpload={renderUpload}
          />
        ) : (
          <div className="space-y-1.5">
            <p className="text-sm text-text-secondary">Nenhum material anexado.</p>
            {renderUpload("Adicionar arquivo")}
          </div>
        )}
      </div>
    </div>
  );
}
