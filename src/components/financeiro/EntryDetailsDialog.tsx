import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { ArquivoMaterial } from "@/components/influenciadores/ContextoCampanha";
import { StateDot } from "@/components/influenciadores/InfluencerFinanceiro";
import { EntregaHistorico } from "@/components/influenciadores/EntregaV2";
import {
  type Entry,
  type FinanceiroAnexo,
  type FinanceiroAnexoCategoria,
  type Source,
  fmtBRL,
  formatIsoDate,
  loadFinanceiroMembers,
  todayISO,
  uploadFinanceiroAnexo,
} from "@/lib/financeiro-entries";
import { loadCampanhaInflus } from "@/lib/campanha-scoped-store";
import { maskTail, type PaymentTone } from "@/lib/influencer-finance";
import { cn } from "@/lib/utils";
import { CopyPixButton, STATUS_LABEL, openFinanceiroAnexo } from "./shared";
import {
  canMarkPaid,
  docGroups,
  entryHistorico,
  entryPhase,
  partialSummary,
  statusLine,
} from "./entry-detail";

const SOURCE_LABEL: Record<Source, string> = {
  manual: "Lançamento manual",
  influenciador: "Pagamento a influenciador",
  salario: "Salário (recorrência dia 15)",
  campanha: "Receita de campanha",
};

const PHASE_TONE: Record<ReturnType<typeof entryPhase>, PaymentTone> = {
  aberto: "info",
  vencido: "alert",
  quitado: "ok",
  cancelado: "neutral",
};

/** Grupo com título pequeno e conteúdo — sem moldura. */
function Group({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Linha rótulo → valor (rótulo secundário, valor em destaque). */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-text-secondary">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-foreground">{children}</dd>
    </div>
  );
}

const linkBtn =
  "text-xs font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** Um documento financeiro (nota fiscal / comprovante): cartão padrão do sistema quando existe,
 * estado vazio com a ação quando não. */
function DocumentoFinanceiro({
  categoria,
  rotuloVazio,
  anexos,
  onChange,
}: {
  categoria: FinanceiroAnexoCategoria;
  rotuloVazio: string;
  anexos: FinanceiroAnexo[];
  /** Recebe a lista COMPLETA de anexos já atualizada. */
  onChange: (next: FinanceiroAnexo[]) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replacing, setReplacing] = useState<string | null>(null);

  const pick = async (file: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Máximo de 10 MB.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const url = await uploadFinanceiroAnexo(file);
      if (!url) {
        setError("Não foi possível enviar o arquivo.");
        return;
      }
      const novo: FinanceiroAnexo = {
        id: crypto.randomUUID(),
        categoria,
        nome: file.name,
        url,
        criadoEm: todayISO(),
      };
      const sem = replacing ? anexos.filter((a) => a.id !== replacing) : anexos;
      await onChange([...sem, novo]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o arquivo.");
    } finally {
      setBusy(false);
      setReplacing(null);
    }
  };
  const abrir = (id: string | null) => {
    setReplacing(id);
    inputRef.current?.click();
  };

  return (
    <div className="min-w-0 space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (inputRef.current) inputRef.current.value = "";
          void pick(f);
        }}
      />
      <p className="text-sm font-medium text-foreground">{categoria}</p>
      {anexos.length > 0 ? (
        <div className="space-y-2">
          {anexos.map((a) => (
            <ArquivoMaterial
              key={a.id}
              nome={a.nome}
              url={a.url}
              meta={`${/\.pdf$/i.test(a.nome) ? "PDF" : /\.(png|jpe?g|webp)$/i.test(a.nome) ? "Imagem" : "Arquivo"}${a.criadoEm ? ` · anexado em ${formatIsoDate(a.criadoEm)}` : ""}`}
              onOpen={() => openFinanceiroAnexo(a.url, a.nome)}
              onRemove={
                a.id === "legacy-invoice"
                  ? undefined
                  : () => void onChange(anexos.filter((x) => x.id !== a.id))
              }
              renderUpload={(label) =>
                a.id === "legacy-invoice" ? null : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => abrir(a.id)}
                    className={linkBtn}
                  >
                    {busy && replacing === a.id ? "Enviando..." : label}
                  </button>
                )
              }
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-sm text-text-secondary">{rotuloVazio}</p>
          <button type="button" disabled={busy} onClick={() => abrir(null)} className={linkBtn}>
            {busy ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Enviando...
              </span>
            ) : (
              `Anexar ${categoria.toLowerCase()}`
            )}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function EntryDetailsDialog({
  entry,
  onClose,
  onEdit,
  onMarkPaid,
  onAnexosChange,
}: {
  entry: Entry;
  onClose: () => void;
  onEdit?: () => void;
  /** Ausente quando o status já é terminal (recebido/pago/cancelado). */
  onMarkPaid?: () => void;
  /** Anexar/substituir/remover nota fiscal e comprovante (qualquer lançamento, inclusive gerados). */
  onAnexosChange?: (anexos: FinanceiroAnexo[]) => Promise<void> | void;
}) {
  const [showBank, setShowBank] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const phase = entryPhase(entry);
  const quitado = phase === "quitado";
  const bank = entry.bank;
  const bankFilled = !!bank && Object.values(bank).some((v) => v && String(v).trim() !== "");
  const responsavelNome = entry.responsavelId
    ? loadFinanceiroMembers().find((m) => m.id === entry.responsavelId)?.name
    : undefined;
  const docs = docGroups(entry);
  const partial = partialSummary(entry);
  const receita = entry.kind === "receita";

  // Para pagamento a influenciador, a atividade financeira dele (vencimento, remuneração, dados…).
  const influActivity = useMemo(() => {
    if (entry.source !== "influenciador" || !entry.campanhaId || !entry.influenciadorId) return [];
    const influ = loadCampanhaInflus(entry.campanhaId).find((i) => i.id === entry.influenciadorId);
    return (influ?.activity ?? [])
      .filter((a) => a.area === "financeiro")
      .map((a) => ({ id: a.id, action: a.action, author: a.author, createdAt: a.createdAt }));
  }, [entry.source, entry.campanhaId, entry.influenciadorId]);
  const eventos = useMemo(() => entryHistorico(entry, influActivity), [entry, influActivity]);

  const detalhes: [string, React.ReactNode][] = [
    ["Competência", formatIsoDate(entry.competencia)],
    ["Vencimento", formatIsoDate(entry.vencimento)],
    ["Categoria", entry.category],
    ["Tipo", receita ? "Receita" : "Despesa"],
    ["Origem", SOURCE_LABEL[entry.source]],
  ];
  if (entry.formaPagamento) detalhes.push(["Forma de pagamento prevista", entry.formaPagamento]);
  if (entry.recurrence)
    detalhes.push([
      "Recorrência",
      `${entry.recurrence.frequency} · ocorrência ${entry.recurrence.occurrenceIndex + 1}`,
    ]);
  const contexto: [string, string][] = [];
  if (entry.clienteNome) contexto.push(["Cliente", entry.clienteNome]);
  if (entry.campanhaNome) contexto.push(["Campanha", entry.campanhaNome]);
  if (entry.influencerName) contexto.push(["Influenciador", entry.influencerName]);
  if (entry.memberName) contexto.push(["Membro", entry.memberName]);
  if (responsavelNome) contexto.push(["Responsável", responsavelNome]);

  const mask = (v: string) => (showBank ? v : maskTail(v));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do lançamento"
        onClick={(ev) => ev.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-xl"
      >
        {/* Cabeçalho fixo: o que é, quanto, situação e a data que importa. */}
        <header className="shrink-0 border-b border-border px-6 pb-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              {receita ? "Receita" : "Despesa"} · {SOURCE_LABEL[entry.source]}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-1.5 cursor-pointer rounded-md p-1.5 text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <h2 className="mt-2 text-base font-semibold leading-snug text-foreground">
            {entry.description}
          </h2>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[28px] font-semibold leading-9 tabular-nums text-foreground">
              {receita ? "+" : "−"} {fmtBRL(entry.amount)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              <StateDot tone={PHASE_TONE[phase]} />
              {STATUS_LABEL[entry.status]}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">{statusLine(entry)}</p>
        </header>

        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-6">
          {/* PRÓXIMA AÇÃO (só se existir) — a única ação preenchida da tela. */}
          {onMarkPaid && canMarkPaid(entry) && (
            <section
              aria-label="Próxima ação"
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1 basis-48">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  <StateDot tone={phase === "vencido" ? "alert" : "pending"} />
                  Próxima ação
                </p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {receita ? "Marcar como recebido" : "Marcar como pago"}
                </p>
                <p className="text-xs text-text-secondary">
                  {partial
                    ? `Saldo restante de ${fmtBRL(partial.remaining)} (já ${receita ? "recebido" : "pago"}: ${fmtBRL(partial.paid)}).`
                    : phase === "vencido"
                      ? `Venceu em ${formatIsoDate(entry.vencimento)}.`
                      : `${receita ? "Recebimento" : "Pagamento"} vence em ${formatIsoDate(entry.vencimento)}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={onMarkPaid}
                className="shrink-0 cursor-pointer rounded-md bg-foreground px-3.5 py-2 text-xs font-semibold text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {receita ? "Marcar como recebido" : "Marcar como pago"}
              </button>
            </section>
          )}

          {/* PAGAMENTO — só quando já houve (total ou parcial). */}
          {entry.payment && (
            <Group title={receita ? "Recebimento" : "Pagamento"}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Fact label={receita ? "Recebido em" : "Pago em"}>
                  {formatIsoDate(entry.payment.pagamento)}
                </Fact>
                <Fact label="Valor confirmado">{fmtBRL(entry.payment.paidAmount)}</Fact>
                {entry.payment.paymentMethod && (
                  <Fact label="Forma">{entry.payment.paymentMethod}</Fact>
                )}
                {partial && <Fact label="Saldo restante">{fmtBRL(partial.remaining)}</Fact>}
              </dl>
              {entry.payment.paymentNote && (
                <p className="text-xs text-text-secondary">{entry.payment.paymentNote}</p>
              )}
            </Group>
          )}

          <Group title="Detalhes">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {detalhes.map(([k, v]) => (
                <Fact key={k} label={k}>
                  {v}
                </Fact>
              ))}
            </dl>
            {entry.observacoes && (
              <p className="text-sm text-text-secondary">{entry.observacoes}</p>
            )}
          </Group>

          {contexto.length > 0 && (
            <Group title="Contexto">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {contexto.map(([k, v]) => (
                  <Fact key={k} label={k}>
                    {v}
                  </Fact>
                ))}
              </dl>
            </Group>
          )}

          {(entry.cobrancaHistorico?.length || entry.proximaCobranca) && (
            <Group title="Cobrança">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {entry.cobrancaHistorico && entry.cobrancaHistorico.length > 0 && (
                  <Fact label="Último contato">
                    {formatIsoDate(
                      entry.cobrancaHistorico[entry.cobrancaHistorico.length - 1].data,
                    )}
                  </Fact>
                )}
                {entry.proximaCobranca && (
                  <Fact label="Próxima cobrança">{formatIsoDate(entry.proximaCobranca)}</Fact>
                )}
              </dl>
            </Group>
          )}

          {bankFilled && bank && (
            <Group
              title="Dados bancários"
              action={
                <button type="button" onClick={() => setShowBank((v) => !v)} className={linkBtn}>
                  {showBank ? "Ocultar dados" : "Mostrar dados"}
                </button>
              }
            >
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {bank.titular && <Fact label="Titular">{bank.titular}</Fact>}
                {bank.cpfCnpj && <Fact label="CPF/CNPJ">{mask(bank.cpfCnpj)}</Fact>}
                {bank.banco && <Fact label="Banco">{bank.banco}</Fact>}
                {bank.agencia && <Fact label="Agência">{mask(bank.agencia)}</Fact>}
                {bank.conta && (
                  <Fact label={bank.tipoConta ? `Conta (${bank.tipoConta})` : "Conta"}>
                    {mask(bank.conta)}
                  </Fact>
                )}
                {bank.pixChave && (
                  <Fact label={bank.pixTipo ? `PIX (${bank.pixTipo})` : "PIX"}>
                    {showBank ? <CopyPixButton value={bank.pixChave} /> : maskTail(bank.pixChave)}
                  </Fact>
                )}
              </dl>
            </Group>
          )}

          {/* DOCUMENTOS: nota fiscal sempre visível; comprovante quando já pago ou já existe. */}
          {(onAnexosChange || docs.notaFiscal.length > 0 || docs.comprovante.length > 0) && (
            <Group title="Documentos">
              <div
                className={cn(
                  "grid grid-cols-1 gap-x-6 gap-y-5",
                  (quitado || docs.comprovante.length > 0) && "md:grid-cols-2",
                )}
              >
                <DocumentoFinanceiro
                  categoria="Nota fiscal"
                  rotuloVazio="Nenhuma nota fiscal anexada."
                  anexos={docs.notaFiscal}
                  onChange={(next) =>
                    onAnexosChange?.([
                      ...(entry.anexos ?? []).filter((a) => a.categoria !== "Nota fiscal"),
                      ...next.filter((a) => a.categoria === "Nota fiscal"),
                    ])
                  }
                />
                {(quitado || docs.comprovante.length > 0) && (
                  <DocumentoFinanceiro
                    categoria="Comprovante"
                    rotuloVazio="Nenhum comprovante anexado."
                    anexos={docs.comprovante}
                    onChange={(next) =>
                      onAnexosChange?.([
                        ...(entry.anexos ?? []).filter((a) => a.categoria !== "Comprovante"),
                        ...next.filter((a) => a.categoria === "Comprovante"),
                      ])
                    }
                  />
                )}
              </div>
            </Group>
          )}

          <EntregaHistorico
            eventos={eventos}
            showAll={showAllHistory}
            onToggleAll={() => setShowAllHistory((v) => !v)}
            feedbackAberto={null}
            onToggleFeedback={() => {}}
            limit={4}
            titulo="Histórico"
          />

          {!entry.editable && (
            <p className="text-xs text-text-secondary">
              Lançamento gerado automaticamente: ajuste valor e vencimento na origem (campanha,
              influenciador ou salário do membro).
            </p>
          )}
        </div>

        {onEdit && (
          <footer className="flex shrink-0 items-center justify-end border-t border-border px-6 py-3">
            <button type="button" onClick={onEdit} className={linkBtn}>
              Editar lançamento
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}
