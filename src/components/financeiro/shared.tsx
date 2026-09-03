import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, X, Check, Copy } from "lucide-react";
import {
  type FinanceiroAnexo,
  type FinanceiroAnexoCategoria,
  uploadFinanceiroAnexo,
  todayISO,
} from "@/lib/financeiro-entries";

export const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Compacto, sem card — só um divisor vertical entre itens. Usado na linha
 * de KPIs (hoje 3, em breve 6 com comparação de período). */
export function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-l border-border pl-6 first:border-l-0 first:pl-0">
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      {sub}
    </div>
  );
}

/** Card com ícone + título usado nos diálogos de lançamento (detalhes e
 * formulário) — mesma moldura em toda seção, em vez de cada bloco ter seu
 * próprio estilo de cabeçalho/borda. */
export function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-background p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
            {icon}
          </span>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Anexos podem ser uma data URL antiga (nota fiscal legada, base64 —
 * `entryAnexos()` em `financeiro-entries.ts`) ou uma URL assinada do
 * Supabase Storage (comprovantes/notas fiscais novos, `uploadFinanceiroAnexo`).
 * Navegadores modernos bloqueiam abrir uma `data:` URL diretamente numa nova
 * aba via `<a target="_blank">` (mostra "about:blank#blocked", proteção
 * contra phishing) — convertendo pra Blob primeiro contorna o bloqueio.
 * Mesmo problema e mesma solução já usados em `TaskBoard.tsx`. */
export function openFinanceiroAnexo(url: string, filename: string): void {
  if (!url.startsWith("data:")) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const [header, base64] = url.split(",");
  const mime = header.match(/data:(.*?)(;base64)?$/)?.[1] || "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener,noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="flex items-center gap-1.5 truncate text-foreground">
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        {value}
      </p>
    </div>
  );
}

/** Chave PIX vem só pra leitura na maioria dos casos — copiar na mão pra
 * fazer o pagamento é o fluxo real, por isso o botão fica junto do valor
 * em vez de precisar selecionar o texto manualmente. */
export function CopyPixButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
      title="Copiar chave PIX"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

/** Box de upload por categoria (Comprovante / Nota fiscal) — usado tanto no
 * formulário de criar/editar quanto direto nos detalhes do lançamento, sem
 * precisar entrar em modo de edição pra anexar ou abrir um arquivo. */
export function FinanceiroAnexoBox({
  categoria,
  anexos,
  onChange,
}: {
  categoria: FinanceiroAnexoCategoria;
  anexos: FinanceiroAnexo[];
  onChange: (next: FinanceiroAnexo[]) => void;
}) {
  const items = anexos.filter((a) => a.categoria === categoria);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handlePick = async (file: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Máx 10MB.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const url = await uploadFinanceiroAnexo(file);
      if (!url) {
        setError("Falha ao subir.");
        return;
      }
      onChange([
        ...anexos,
        { id: crypto.randomUUID(), categoria, nome: file.name, url, criadoEm: todayISO() },
      ]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{categoria}</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (inputRef.current) inputRef.current.value = "";
            void handlePick(file);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Paperclip className="h-3 w-3" />
          )}
          {uploading ? "Enviando..." : "Adicionar"}
        </button>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1.5 text-xs"
            >
              <button
                type="button"
                onClick={() => openFinanceiroAnexo(a.url, a.nome)}
                className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left hover:underline"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{a.nome}</span>
              </button>
              <button
                type="button"
                onClick={() => onChange(anexos.filter((x) => x.id !== a.id))}
                className="shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
                aria-label="Remover anexo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">Nenhum arquivo ainda.</p>
      )}
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

/** Rótulo/tom por status — regra de cor do pedido: verde só pra
 * recebido/pago, vermelho só pra vencido, âmbar neutro pra a_receber/
 * a_pagar, cinza pra cancelado. Nunca "toda despesa vermelha". */
export const STATUS_LABEL: Record<string, string> = {
  a_receber: "A receber",
  recebido: "Recebido",
  a_pagar: "A pagar",
  pago: "Pago",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

export function statusTone(status: string): string {
  if (status === "recebido" || status === "pago") return "bg-emerald-500/10 text-emerald-600";
  if (status === "vencido") return "bg-rose-500/10 text-rose-600";
  if (status === "cancelado") return "bg-muted text-muted-foreground";
  return "bg-amber-500/10 text-amber-600";
}
