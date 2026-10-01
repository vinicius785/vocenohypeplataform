import { useMemo, useRef, useState } from "react";
import { Download, Eye, EyeOff, FileBarChart, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { useConfirm } from "@/hooks/use-confirm";
import { formatIsoDate } from "@/lib/utils";
import {
  type RelatorioMensal,
  mesLabel,
  uploadRelatorioMensalPdf,
  getRelatorioMensalUrl,
  deleteRelatorioMensalPdf,
} from "@/lib/relatorio-mensal";
import { CampaignToolShell, ToolEmpty, ToolInlineError } from "./CampaignToolShell";
import { CAMPAIGN_TOOLS } from "./campaign-tools";

/**
 * Campanha → Ferramentas → Relatórios mensais. Lógica idêntica à que vivia
 * inline em `CampanhasSection` (upload do PDF no storage, gravação em
 * `campanha.relatoriosMensais` via `onChange`, URL assinada pra visualizar
 * no iframe interno, remoção com confirmação) — só mudou a apresentação.
 */
export function ReportsTool({
  open,
  onOpenChange,
  campanhaNome,
  relatoriosMensais,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaNome: string;
  /** Lista crua (`campanha.relatoriosMensais`). */
  relatoriosMensais: RelatorioMensal[] | undefined;
  onChange: (next: RelatorioMensal[]) => void;
}) {
  const meta = CAMPAIGN_TOOLS.relatorioMensal;
  const relatorios = useMemo(
    () => [...(relatoriosMensais ?? [])].sort((a, b) => b.mes.localeCompare(a.mes)),
    [relatoriosMensais],
  );
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, confirmDialog } = useConfirm();

  const upload = async (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Só é possível anexar arquivos PDF.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const storagePath = await uploadRelatorioMensalPdf(file);
      const novo: RelatorioMensal = {
        id: crypto.randomUUID(),
        mes,
        nome: file.name,
        storagePath,
        uploadedAt: new Date().toISOString(),
      };
      onChange([...(relatoriosMensais ?? []), novo]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao subir o relatório.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (r: RelatorioMensal) => {
    const ok = await confirm("Remover este relatório mensal?");
    if (!ok) return;
    await deleteRelatorioMensalPdf(r.storagePath);
    onChange((relatoriosMensais ?? []).filter((x) => x.id !== r.id));
    if (viewingId === r.id) setViewingId(null);
  };

  const toggleView = async (r: RelatorioMensal) => {
    if (viewingId === r.id) {
      setViewingId(null);
      return;
    }
    if (!urls[r.id]) {
      const url = await getRelatorioMensalUrl(r.storagePath);
      if (!url) {
        setError("Não foi possível abrir o relatório.");
        return;
      }
      setUrls((prev) => ({ ...prev, [r.id]: url }));
    }
    setViewingId(r.id);
  };

  return (
    <>
      {confirmDialog}
      <CampaignToolShell
        open={open}
        onOpenChange={onOpenChange}
        size={meta.size}
        campanhaNome={campanhaNome}
        icon={meta.icon}
        title={meta.label}
        description={meta.description}
        actions={
          <>
            <Input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              aria-label="Mês de referência do novo relatório"
              className="h-8 w-full text-xs sm:w-40"
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="max-sm:flex-1"
            >
              {uploading ? <Loader2 className="animate-spin" /> : <Plus />}
              {uploading ? "Enviando…" : "Adicionar relatório"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            Escolha o mês e envie o PDF. O cliente vê o relatório no portal, sem precisar baixar.
          </p>
          {error && <ToolInlineError>{error}</ToolInlineError>}

          {relatorios.length === 0 ? (
            <ToolEmpty
              icon={FileBarChart}
              title="Nenhum relatório enviado ainda."
              description="Envie o PDF de resultados do mês para que o cliente acompanhe pelo portal."
              action={{ label: "Adicionar relatório", onClick: () => fileRef.current?.click() }}
            />
          ) : (
            <ul className="divide-y divide-border">
              {relatorios.map((r) => {
                const viewing = viewingId === r.id && urls[r.id];
                return (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <FileBarChart className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {mesLabel(r.mes)}
                        </p>
                        <p className="truncate text-xs text-text-secondary">
                          {r.nome} · enviado {formatIsoDate(r.uploadedAt.slice(0, 10))}
                        </p>
                        {r.nps && (
                          <p className="mt-0.5 text-xs text-text-secondary">
                            NPS do cliente:{" "}
                            <span className="font-semibold text-foreground">{r.nps.score}</span>
                            {r.nps.comentario ? ` — "${r.nps.comentario}"` : ""}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void toggleView(r)}
                        aria-expanded={!!viewing}
                      >
                        {viewing ? <EyeOff /> : <Eye />}
                        {viewing ? "Ocultar" : "Visualizar"}
                      </Button>
                      {urls[r.id] && (
                        <a
                          href={urls[r.id]}
                          download={r.nome}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          <Download /> Baixar
                        </a>
                      )}
                      <IconButton
                        label={`Remover relatório de ${mesLabel(r.mes)}`}
                        onClick={() => void remove(r)}
                        className="hover:text-destructive"
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                    {viewing && (
                      <iframe
                        src={urls[r.id]}
                        title={r.nome}
                        className="mt-3 h-[60vh] w-full rounded-lg border border-border"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CampaignToolShell>
    </>
  );
}
