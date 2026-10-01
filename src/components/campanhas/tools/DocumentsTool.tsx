import { useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import type { CampaignDoc } from "@/lib/campanha-scoped-store";
import { CampaignToolShell, ToolEmpty, ToolSectionTitle } from "./CampaignToolShell";
import { CAMPAIGN_TOOLS } from "./campaign-tools";

/** Campanha → Ferramentas → Documentos. Mesma lógica de antes (links +
 * anexos em data URL, persistidos via `onChange` → `saveCampanhaDocs`);
 * só a apresentação mudou para o `CampaignToolShell`. */
export function DocumentsTool({
  open,
  onOpenChange,
  campanhaNome,
  docs,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaNome: string;
  docs: CampaignDoc[];
  onChange: (next: CampaignDoc[]) => void;
}) {
  const meta = CAMPAIGN_TOOLS.documentos;
  const [adding, setAdding] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const tituloRef = useRef<HTMLInputElement>(null);

  const startAdding = () => {
    setAdding(true);
    requestAnimationFrame(() => tituloRef.current?.focus());
  };

  const addLink = () => {
    const u = url.trim();
    if (!u) return;
    onChange([
      ...docs,
      {
        id: crypto.randomUUID(),
        tipo: "link",
        titulo: titulo.trim() || u,
        url: u,
        criadoEm: new Date().toISOString(),
      },
    ]);
    setTitulo("");
    setUrl("");
  };

  const addFile = (file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      onChange([
        ...docs,
        {
          id: crypto.randomUUID(),
          tipo: "anexo",
          titulo: titulo.trim() || file.name,
          url: String(r.result),
          arquivoNome: file.name,
          criadoEm: new Date().toISOString(),
        },
      ]);
      setTitulo("");
    };
    r.readAsDataURL(file);
  };

  const remove = (id: string) => onChange(docs.filter((d) => d.id !== id));
  const showForm = adding;

  return (
    <CampaignToolShell
      open={open}
      onOpenChange={onOpenChange}
      size={meta.size}
      campanhaNome={campanhaNome}
      icon={meta.icon}
      title={meta.label}
      description={meta.description}
      actions={
        !showForm && (
          <Button variant="primary" size="sm" onClick={startAdding}>
            <Plus /> Adicionar documento
          </Button>
        )
      }
    >
      <div className="space-y-5">
        {showForm && (
          <section className="space-y-3 border-b border-border pb-5">
            <ToolSectionTitle
              action={
                <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                  Concluir
                </Button>
              }
            >
              Novo documento
            </ToolSectionTitle>
            <Input
              ref={tituloRef}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título (opcional)"
              aria-label="Título do documento (opcional)"
            />
            <div className="flex flex-wrap gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLink()}
                placeholder="Colar link (https://…)"
                aria-label="Link do documento"
                className="min-w-[200px] flex-1"
              />
              <Button variant="primary" onClick={addLink} disabled={!url.trim()}>
                <LinkIcon /> Adicionar link
              </Button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  addFile(e.target.files?.[0]);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Paperclip /> Anexar arquivo
              </Button>
            </div>
          </section>
        )}

        {docs.length === 0 ? (
          <ToolEmpty
            icon={FileText}
            title="Não há documentos nesta campanha."
            description="Adicione arquivos ou links de referência para centralizar os materiais."
            action={showForm ? undefined : { label: "Adicionar documento", onClick: startAdding }}
          />
        ) : (
          <section className="space-y-2">
            <ToolSectionTitle>
              {docs.length} {docs.length === 1 ? "documento" : "documentos"}
            </ToolSectionTitle>
            <ul className="divide-y divide-border">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {d.tipo === "link" ? (
                      <LinkIcon className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{d.titulo}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {d.tipo === "link" ? d.url : (d.arquivoNome ?? "Arquivo")}
                    </p>
                  </div>
                  <a
                    href={d.url}
                    target={d.tipo === "link" ? "_blank" : undefined}
                    rel="noreferrer"
                    download={d.tipo === "anexo" ? d.arquivoNome : undefined}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label={d.tipo === "link" ? `Abrir ${d.titulo}` : `Baixar ${d.titulo}`}
                    title={d.tipo === "link" ? "Abrir" : "Baixar"}
                  >
                    {d.tipo === "link" ? (
                      <ExternalLink className="h-4 w-4" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </a>
                  <IconButton
                    label={`Remover ${d.titulo}`}
                    onClick={() => remove(d.id)}
                    className="hover:text-destructive"
                  >
                    <X />
                  </IconButton>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </CampaignToolShell>
  );
}
