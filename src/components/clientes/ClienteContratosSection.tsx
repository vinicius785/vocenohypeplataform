import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Plus } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/hooks/use-confirm";
import {
  listContratosDoCliente,
  createContrato,
  updateContrato,
  deleteContrato,
} from "@/lib/contratos.functions";
import {
  CONTRATO_STATUS_LABEL,
  CONTRATO_STATUS_LIST,
  type Contrato,
  type ContratoStatus,
} from "@/lib/contratos";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { CAMPANHA_STATUS_LABEL, campanhaStatus } from "@/components/campanhas/campanha-ui";
import { cn, formatIsoDate } from "@/lib/utils";
import { SURFACE, TYPOGRAPHY } from "@/lib/design-tokens";

const STATUS_BADGE_VARIANT: Record<ContratoStatus, "outline" | "success" | "secondary"> = {
  rascunho: "outline",
  em_assinatura: "outline",
  vigente: "success",
  encerrado: "secondary",
  cancelado: "secondary",
};

type FormState = {
  id?: string;
  nome: string;
  tipo: string;
  status: ContratoStatus;
  vigenciaInicio: string;
  vigenciaFim: string;
  valor: string;
  observacoes: string;
  campanhaIds: string[];
};

const EMPTY_FORM: FormState = {
  nome: "",
  tipo: "",
  status: "rascunho",
  vigenciaInicio: "",
  vigenciaFim: "",
  valor: "",
  observacoes: "",
  campanhaIds: [],
};

/**
 * Seção "Contratos" da Central do Cliente (item 7/14 da reconstrução do
 * domínio Comercial/Clientes/Campanhas/Contratos/Financeiro) — primeira UI
 * sobre a entidade Contrato (até aqui só existia tabela + CRUD
 * server-side). Formulário enxuto: só `nome` é obrigatório, igual ao
 * server-side (`CreateContratoInput`) — vigência/valor/observações
 * continuam opcionais em qualquer status, nunca bloqueiam criar/editar.
 */
export function ClienteContratosSection({
  clienteId,
  canManage,
  campanhas,
}: {
  clienteId: string;
  canManage: boolean;
  /** Campanhas do cliente, pra vincular ao contrato (`campanhaIds`) — sem
   * validação server-side de pertencimento (campanhas são JSONB dentro de
   * `clientes.data`, não uma tabela própria pra checar por FK), então essa
   * lista é a única barreira contra vincular id de campanha de outro
   * cliente. Vem sempre do mesmo `cliente.campanhas` já carregado pela
   * página, nunca buscada à parte aqui. */
  campanhas: Campaign[];
}) {
  const listFn = useServerFn(listContratosDoCliente);
  const createFn = useServerFn(createContrato);
  const updateFn = useServerFn(updateContrato);
  const deleteFn = useServerFn(deleteContrato);
  const { confirm, confirmDialog } = useConfirm();

  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const reload = () => {
    void listFn({ data: { clienteId } }).then(setContratos);
  };
  useEffect(reload, [clienteId]); // eslint-disable-line react-hooks/exhaustive-deps -- listFn (useServerFn) não é estável entre renders, incluí-la recarregaria em loop

  const openNew = () => {
    setForm(EMPTY_FORM);
    setOpen(true);
  };
  const openEdit = (c: Contrato) => {
    setForm({
      id: c.id,
      nome: c.nome,
      tipo: c.tipo ?? "",
      status: c.status,
      vigenciaInicio: c.vigenciaInicio ?? "",
      vigenciaFim: c.vigenciaFim ?? "",
      valor: c.valor !== null ? String(c.valor) : "",
      observacoes: c.observacoes ?? "",
      campanhaIds: c.campanhaIds,
    });
    setOpen(true);
  };

  const toggleCampanha = (id: string) => {
    setForm((f) => ({
      ...f,
      campanhaIds: f.campanhaIds.includes(id)
        ? f.campanhaIds.filter((x) => x !== id)
        : [...f.campanhaIds, id],
    }));
  };

  const save = async () => {
    if (!form.nome.trim() || saving) return;
    setSaving(true);
    try {
      const valorNum = form.valor.trim() ? Number(form.valor.replace(",", ".")) : undefined;
      if (form.id) {
        await updateFn({
          data: {
            id: form.id,
            nome: form.nome.trim(),
            tipo: form.tipo.trim() || null,
            status: form.status,
            vigenciaInicio: form.vigenciaInicio || null,
            vigenciaFim: form.vigenciaFim || null,
            valor: valorNum ?? null,
            observacoes: form.observacoes.trim() || null,
            campanhaIds: form.campanhaIds,
          },
        });
      } else {
        await createFn({
          data: {
            clienteId,
            nome: form.nome.trim(),
            tipo: form.tipo.trim() || undefined,
            status: form.status,
            vigenciaInicio: form.vigenciaInicio || undefined,
            vigenciaFim: form.vigenciaFim || undefined,
            valor: valorNum,
            observacoes: form.observacoes.trim() || undefined,
            campanhaIds: form.campanhaIds,
          },
        });
      }
      setOpen(false);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Contrato) => {
    const ok = await confirm(`Excluir o contrato "${c.nome}"? Essa ação não pode ser desfeita.`);
    if (!ok) return;
    await deleteFn({ data: { id: c.id } });
    reload();
  };

  return (
    <section className={cn(SURFACE.card, "p-5 md:p-6")}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Contratos</h2>
        {canManage && (contratos?.length ?? 0) > 0 && (
          <Button variant="outline" size="sm" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Novo contrato
          </Button>
        )}
      </div>

      {contratos === null ? (
        <p className="text-xs text-text-secondary">Carregando…</p>
      ) : contratos.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          compact
          title="Nenhum contrato cadastrado."
          description="Contrato é opcional — cliente e campanhas continuam funcionando sem ele."
          primaryAction={canManage ? { label: "Novo contrato", onClick: openNew } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {contratos.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => canManage && openEdit(c)}
              className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:bg-accent/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{c.nome}</p>
                <p className="truncate text-xs text-text-secondary">
                  {c.vigenciaFim
                    ? `Vigência até ${formatIsoDate(c.vigenciaFim)}`
                    : "Vigência não definida"}
                </p>
                {c.campanhaIds.length > 0 && (
                  <p className="mt-1 truncate text-xs text-text-secondary">
                    {c.campanhaIds
                      .map((id) => campanhas.find((camp) => camp.id === id)?.nome)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[c.status]}>
                {CONTRATO_STATUS_LABEL[c.status]}
              </Badge>
            </button>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar contrato" : "Novo contrato"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-foreground">Nome</span>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Contrato de prestação de serviço"
                autoFocus
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-foreground">Tipo (opcional)</span>
              <Input
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                placeholder="Ex: Prestação de serviço, NDA, recorrência"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-foreground">Status</span>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as ContratoStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRATO_STATUS_LIST.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CONTRATO_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-foreground">Vigência inicial</span>
                <DateField
                  value={form.vigenciaInicio}
                  onChange={(v) => setForm((f) => ({ ...f, vigenciaInicio: v ?? "" }))}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-foreground">Vigência final</span>
                <DateField
                  value={form.vigenciaFim}
                  onChange={(v) => setForm((f) => ({ ...f, vigenciaFim: v ?? "" }))}
                />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-foreground">Valor contratual (opcional)</span>
              <Input
                inputMode="decimal"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                placeholder="Não informado"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-foreground">Observações (opcional)</span>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                rows={2}
              />
            </label>
            <div className="space-y-1 text-sm">
              <span className="font-medium text-foreground">Campanhas cobertas (opcional)</span>
              {campanhas.length === 0 ? (
                <p className="text-xs text-text-secondary">Este cliente ainda não tem campanhas.</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border/60 p-2">
                  {campanhas.map((camp) => (
                    <label
                      key={camp.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/40"
                    >
                      <Checkbox
                        checked={form.campanhaIds.includes(camp.id)}
                        onCheckedChange={() => toggleCampanha(camp.id)}
                      />
                      <span className="min-w-0 flex-1 truncate text-foreground">{camp.nome}</span>
                      <span className="shrink-0 text-xs text-text-secondary">
                        {CAMPANHA_STATUS_LABEL[campanhaStatus(camp)]}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {form.id ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  const c = contratos?.find((x) => x.id === form.id);
                  if (c) void remove(c);
                }}
              >
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={!form.nome.trim() || saving} onClick={() => void save()}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </section>
  );
}
