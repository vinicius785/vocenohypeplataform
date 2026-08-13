import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  X,
  Target,
  Calendar,
  ChevronDown,
  ChevronUp,
  Check,
  TrendingUp,
  Pencil,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SectionHeader } from "./SectionHeader";
import { useConfirm } from "@/hooks/use-confirm";
import { getMe } from "@/lib/chat-store";
import {
  META_AREAS,
  metaStatus,
  metaProgresso,
  loadMetas,
  saveMetas,
  onMetasChange,
  type Meta,
  type MetaArea,
  type MetaStatus,
} from "@/lib/metas-store";

const STATUS_LABEL: Record<MetaStatus, string> = {
  em_andamento: "Em andamento",
  concluida: "Concluída",
  atrasada: "Atrasada",
  cancelada: "Cancelada",
};

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
function colorFor(name: string): string {
  const colors = [
    "bg-rose-500",
    "bg-sky-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-violet-500",
    "bg-teal-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function readTeamMembers(): { name: string; photo?: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("time:membros");
    const arr = raw ? (JSON.parse(raw) as Array<{ name?: string; photo?: string }>) : [];
    const seen = new Set<string>();
    const out: { name: string; photo?: string }[] = [];
    for (const m of arr) {
      const name = (m.name ?? "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, photo: m.photo });
    }
    return out;
  } catch {
    return [];
  }
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR");
}

export function MetasSection() {
  const [list, setList] = useState<Meta[]>(() => loadMetas());
  const [areaFilter, setAreaFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [responsavelFilter, setResponsavelFilter] = useState("");
  const [dialog, setDialog] = useState<{ mode: "new" | "edit"; data?: Meta } | null>(null);
  const [updateDialog, setUpdateDialog] = useState<Meta | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { confirm, confirmDialog } = useConfirm();
  const members = useMemo(() => readTeamMembers(), []);

  const persist = (next: Meta[]) => {
    setList(next);
    saveMetas(next);
  };
  useEffect(() => onMetasChange(() => setList(loadMetas())), []);

  const withStatus = useMemo(() => list.map((m) => ({ meta: m, status: metaStatus(m) })), [list]);

  const filtered = useMemo(
    () =>
      withStatus.filter(({ meta, status }) => {
        if (areaFilter && meta.area !== areaFilter) return false;
        if (statusFilter && status !== statusFilter) return false;
        if (responsavelFilter && meta.responsavel !== responsavelFilter) return false;
        return true;
      }),
    [withStatus, areaFilter, statusFilter, responsavelFilter],
  );

  const responsaveisEmUso = useMemo(
    () => Array.from(new Set(list.map((m) => m.responsavel).filter((r): r is string => !!r))),
    [list],
  );

  const kpis = {
    total: list.length,
    emAndamento: withStatus.filter((x) => x.status === "em_andamento").length,
    concluidas: withStatus.filter((x) => x.status === "concluida").length,
    atrasadas: withStatus.filter((x) => x.status === "atrasada").length,
  };

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = (m: Meta) => {
    if (dialog?.mode === "edit") {
      persist(list.map((x) => (x.id === m.id ? m : x)));
    } else {
      persist([...list, m]);
    }
    setDialog(null);
  };

  const remove = async (m: Meta) => {
    const ok = await confirm(`Excluir a meta "${m.titulo}"?`);
    if (!ok) return;
    persist(list.filter((x) => x.id !== m.id));
  };

  const logUpdate = (m: Meta, valor: number | undefined, nota: string) => {
    const me = getMe();
    const entry = {
      id: crypto.randomUUID(),
      valor,
      nota: nota.trim() || undefined,
      author: me.name,
      initials: initialsOf(me.name) || "?",
      color: colorFor(me.name),
      createdAt: new Date().toISOString(),
    };
    const updated: Meta = {
      ...m,
      valorAtual: valor ?? m.valorAtual,
      updatedAt: entry.createdAt,
      atualizacoes: [...(m.atualizacoes ?? []), entry],
    };
    persist(list.map((x) => (x.id === m.id ? updated : x)));
    setUpdateDialog(null);
  };

  const toggleConcluida = (m: Meta) => {
    const me = getMe();
    const nextConcluida = !m.concluida;
    const entry = {
      id: crypto.randomUUID(),
      author: me.name,
      initials: initialsOf(me.name) || "?",
      color: colorFor(me.name),
      nota: nextConcluida ? "Marcou como concluída" : "Reabriu a meta",
      createdAt: new Date().toISOString(),
    };
    persist(
      list.map((x) =>
        x.id === m.id
          ? {
              ...x,
              concluida: nextConcluida,
              updatedAt: entry.createdAt,
              atualizacoes: [...(x.atualizacoes ?? []), entry],
            }
          : x,
      ),
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <SectionHeader
        title="Metas"
        subtitle="Metas do time, com progresso, prazo e responsável."
        kpis={[
          { label: "TOTAL", value: kpis.total },
          {
            label: "EM ANDAMENTO",
            value: kpis.emAndamento,
            tone: "text-sky-600 dark:text-sky-400",
          },
          {
            label: "CONCLUÍDAS",
            value: kpis.concluidas,
            tone: "text-emerald-600 dark:text-emerald-400",
          },
          {
            label: "ATRASADAS",
            value: kpis.atrasadas,
            tone: kpis.atrasadas > 0 ? "text-rose-600 dark:text-rose-400" : undefined,
          },
        ]}
        action={
          <button
            type="button"
            onClick={() => setDialog({ mode: "new" })}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Nova meta
          </button>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Todas as áreas</option>
          {META_AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABEL) as MetaStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {responsaveisEmUso.length > 0 && (
          <select
            value={responsavelFilter}
            onChange={(e) => setResponsavelFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Todos os responsáveis</option>
            {responsaveisEmUso.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        {(areaFilter || statusFilter || responsavelFilter) && (
          <button
            type="button"
            onClick={() => {
              setAreaFilter("");
              setStatusFilter("");
              setResponsavelFilter("");
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Limpar filtros
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {list.length === 0
              ? "Nenhuma meta cadastrada ainda."
              : "Nenhum resultado pra esse filtro."}
          </p>
          {list.length === 0 && (
            <button
              type="button"
              onClick={() => setDialog({ mode: "new" })}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Plus className="h-4 w-4" /> Criar a primeira meta
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered
            .sort((a, b) => (a.meta.prazo ?? "9999").localeCompare(b.meta.prazo ?? "9999"))
            .map(({ meta, status }) => {
              const progresso = metaProgresso(meta);
              const member = members.find((mm) => mm.name === meta.responsavel);
              const isExpanded = expanded.has(meta.id);
              return (
                <div
                  key={meta.id}
                  className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card"
                >
                  <div className="flex-1 p-6 sm:p-7">
                    <div className="flex items-start gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-foreground ring-1 ring-border`}
                        >
                          {member?.photo ? (
                            <img src={member.photo} alt="" className="h-full w-full object-cover" />
                          ) : meta.responsavel ? (
                            initialsOf(meta.responsavel) || "?"
                          ) : (
                            <Target className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {meta.responsavel || "Sem responsável"}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {meta.area} · {STATUS_LABEL[status]}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setDialog({ mode: "edit", data: meta })}
                          aria-label="Editar meta"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(meta)}
                          aria-label="Excluir meta"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <h3 className="mt-5 text-2xl font-light tracking-tighter text-foreground">
                      {meta.titulo}
                    </h3>
                    {meta.descricao && (
                      <p className="mt-1.5 text-sm text-muted-foreground">{meta.descricao}</p>
                    )}

                    <div className="mt-6">
                      {meta.tipo === "numerica" ? (
                        <p>
                          <span className="text-5xl font-light tracking-tight text-foreground">
                            {progresso}%
                          </span>
                          <span className="text-base font-medium text-muted-foreground">
                            {" "}
                            concluído
                          </span>
                        </p>
                      ) : (
                        <p className="text-2xl font-light tracking-tighter text-foreground">
                          {meta.concluida ? "Concluída" : "Em aberto"}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground transition-[width] duration-300"
                        style={{ width: `${progresso}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {meta.tipo === "numerica" &&
                        `${(meta.valorAtual ?? 0).toLocaleString("pt-BR")} / ${(meta.valorAlvo ?? 0).toLocaleString("pt-BR")}${meta.unidade ? ` ${meta.unidade}` : ""}`}
                      {meta.prazo && (
                        <span className="inline-flex items-center gap-1">
                          {meta.tipo === "numerica" && " · "}
                          <Calendar className="h-3 w-3" /> {fmtDate(meta.prazo)}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex px-6 pb-6 sm:px-7 sm:pb-7">
                    {meta.tipo === "binaria" ? (
                      <button
                        type="button"
                        onClick={() => toggleConcluida(meta)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-6 py-2.5 text-center text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {meta.concluida ? "Reabrir meta" : "Marcar concluída"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setUpdateDialog(meta)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-6 py-2.5 text-center text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                        Atualizar progresso
                      </button>
                    )}
                  </div>

                  {(meta.atualizacoes?.length ?? 0) > 0 && (
                    <div className="border-t border-border px-6 py-3 sm:px-7">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(meta.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        {meta.atualizacoes!.length} atualizaç
                        {meta.atualizacoes!.length === 1 ? "ão" : "ões"}
                      </button>
                      {isExpanded && (
                        <ul className="mt-2 space-y-1.5">
                          {[...meta.atualizacoes!].reverse().map((a) => (
                            <li key={a.id} className="flex items-start gap-2 text-xs">
                              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-foreground">
                                {a.initials}
                              </span>
                              <div className="min-w-0 flex-1">
                                <span className="text-foreground">
                                  {a.author}
                                  {a.valor !== undefined
                                    ? ` atualizou para ${a.valor.toLocaleString("pt-BR")}`
                                    : ""}
                                  {a.nota ? ` — ${a.nota}` : ""}
                                </span>
                                <span className="ml-1.5 text-muted-foreground">
                                  {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      <MetaDialog
        open={!!dialog}
        initial={dialog?.data}
        members={members}
        onClose={() => setDialog(null)}
        onSave={save}
      />
      <UpdateProgressDialog
        meta={updateDialog}
        onClose={() => setUpdateDialog(null)}
        onSave={logUpdate}
      />
      {confirmDialog}
    </div>
  );
}

function MetaDialog({
  open,
  initial,
  members,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: Meta;
  members: { name: string; photo?: string }[];
  onClose: () => void;
  onSave: (m: Meta) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [area, setArea] = useState<MetaArea>("Marketing");
  const [tipo, setTipo] = useState<"numerica" | "binaria">("numerica");
  const [valorAlvo, setValorAlvo] = useState("");
  const [valorAtual, setValorAtual] = useState("");
  const [unidade, setUnidade] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [prazo, setPrazo] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitulo(initial?.titulo ?? "");
    setDescricao(initial?.descricao ?? "");
    setArea(initial?.area ?? "Marketing");
    setTipo(initial?.tipo ?? "numerica");
    setValorAlvo(initial?.valorAlvo != null ? String(initial.valorAlvo) : "");
    setValorAtual(initial?.valorAtual != null ? String(initial.valorAtual) : "");
    setUnidade(initial?.unidade ?? "");
    setResponsavel(initial?.responsavel ?? "");
    setPrazo(initial?.prazo ?? "");
  }, [open, initial]);

  const submit = () => {
    if (!titulo.trim()) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      titulo: titulo.trim(),
      descricao: descricao.trim() || undefined,
      area,
      tipo,
      valorAlvo: tipo === "numerica" && valorAlvo ? Number(valorAlvo) : undefined,
      valorAtual: tipo === "numerica" && valorAtual ? Number(valorAtual) : undefined,
      unidade: tipo === "numerica" ? unidade.trim() || undefined : undefined,
      concluida: tipo === "binaria" ? (initial?.concluida ?? false) : undefined,
      responsavel: responsavel || undefined,
      prazo: prazo || undefined,
      cancelada: initial?.cancelada,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      atualizacoes: initial?.atualizacoes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col">
        <DialogTitle>{initial ? "Editar meta" : "Nova meta"}</DialogTitle>
        <DialogDescription className="sr-only">
          Cadastro de meta do time, com área, prazo e forma de acompanhamento.
        </DialogDescription>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Título</label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Fechar 5 clientes novos"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Descrição (opcional)
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              className="mt-1 w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground">Área</label>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value as MetaArea)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {META_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground">Prazo</label>
              <input
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Responsável</label>
            <select
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Sem responsável definido</option>
              {members.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Como medir
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipo("numerica")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium ${
                  tipo === "numerica"
                    ? "border-foreground bg-muted"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                Número (progresso)
              </button>
              <button
                type="button"
                onClick={() => setTipo("binaria")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium ${
                  tipo === "binaria"
                    ? "border-foreground bg-muted"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                Feito / não feito
              </button>
            </div>
          </div>
          {tipo === "numerica" && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-muted-foreground">Atual</label>
                <input
                  type="number"
                  value={valorAtual}
                  onChange={(e) => setValorAtual(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground">Meta</label>
                <input
                  type="number"
                  value={valorAlvo}
                  onChange={(e) => setValorAlvo(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground">Unidade</label>
                <input
                  type="text"
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  placeholder="clientes"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <X className="h-4 w-4" /> Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!titulo.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UpdateProgressDialog({
  meta,
  onClose,
  onSave,
}: {
  meta: Meta | null;
  onClose: () => void;
  onSave: (m: Meta, valor: number | undefined, nota: string) => void;
}) {
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");

  useEffect(() => {
    if (meta) {
      setValor(meta.valorAtual != null ? String(meta.valorAtual) : "");
      setNota("");
    }
  }, [meta]);

  if (!meta) return null;

  return (
    <Dialog open={!!meta} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <Target className="h-4 w-4" /> Atualizar progresso
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {meta.titulo}
        </DialogDescription>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Valor atual{meta.unidade ? ` (${meta.unidade})` : ""}
            </label>
            <input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              autoFocus
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Nota (opcional)
            </label>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="O que mudou desde a última atualização?"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave(meta, valor ? Number(valor) : undefined, nota)}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
