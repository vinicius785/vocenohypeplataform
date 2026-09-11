import { useEffect, useMemo, useState } from "react";
import { Camera, Plus, Trash2, AlertTriangle, Star } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/use-confirm";
import { formatSeguidores } from "@/lib/format";
import { NICHOS, type Rede } from "@/components/influenciadores/InfluencerBoard";
import { TIERS, suggestTier } from "@/lib/pricing";
import { type BankInflu, type Endereco } from "@/lib/banco-influs-store";

const REDES_OPTS = ["Instagram", "TikTok", "YouTube", "X", "LinkedIn", "Facebook"];

type Step = "identidade" | "redes" | "revisao";
const STEPS: { key: Step; label: string }[] = [
  { key: "identidade", label: "Identidade e contato" },
  { key: "redes", label: "Redes sociais" },
  { key: "revisao", label: "Localização e revisão" },
];

function normalizeHandle(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/^https?:\/\/[^/]+\//, "");
}
function normalizeDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export type DuplicateMatch = {
  influ: BankInflu;
  reasons: ("handle" | "email" | "telefone" | "nome")[];
};

function findDuplicates(
  list: BankInflu[],
  data: { nome: string; email: string; telefone: string; redes: Rede[] },
  excludeId?: string,
): DuplicateMatch[] {
  const handles = new Set(
    data.redes.map((r) => normalizeHandle(r.handle)).filter((h): h is string => !!h),
  );
  const email = data.email.trim().toLowerCase();
  const tel = normalizeDigits(data.telefone);
  const nome = data.nome.trim().toLowerCase();

  const out: DuplicateMatch[] = [];
  for (const other of list) {
    if (other.id === excludeId) continue;
    const reasons: DuplicateMatch["reasons"] = [];
    if (handles.size > 0 && other.redes.some((r) => handles.has(normalizeHandle(r.handle)))) {
      reasons.push("handle");
    }
    if (email && other.email?.trim().toLowerCase() === email) reasons.push("email");
    if (tel && normalizeDigits(other.telefone ?? "") === tel) reasons.push("telefone");
    if (nome && other.nome.trim().toLowerCase() === nome) reasons.push("nome");
    if (reasons.length > 0) out.push({ influ: other, reasons });
  }
  return out;
}

const REASON_LABEL: Record<DuplicateMatch["reasons"][number], string> = {
  handle: "mesmo @handle",
  email: "mesmo e-mail",
  telefone: "mesmo telefone",
  nome: "nome muito parecido",
};

export function BankInfluWizard({
  open,
  initial,
  allInflus,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: BankInflu;
  /** Lista completa do banco — usada só pra checagem de duplicidade. */
  allInflus: BankInflu[];
  onClose: () => void;
  onSave: (i: BankInflu) => void;
}) {
  const [step, setStep] = useState<Step>("identidade");
  const [maxVisited, setMaxVisited] = useState(0);
  const { confirm, confirmDialog } = useConfirm();

  const [nome, setNome] = useState("");
  const [nicho, setNicho] = useState("");
  const [tier, setTier] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [foto, setFoto] = useState<string | undefined>(undefined);
  const [redes, setRedes] = useState<Rede[]>([]);
  const [redePrincipalId, setRedePrincipalId] = useState<string | undefined>(undefined);
  const [endereco, setEndereco] = useState<Endereco>({});
  const [observacoes, setObservacoes] = useState("");
  const [dismissedDupIds, setDismissedDupIds] = useState<Set<string>>(new Set());

  const snapshot = () =>
    JSON.stringify({
      nome,
      nicho,
      tier,
      telefone,
      email,
      foto,
      redes,
      redePrincipalId,
      endereco,
      observacoes,
    });
  const [initialSnapshot, setInitialSnapshot] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("identidade");
    setMaxVisited(0);
    setDismissedDupIds(new Set());
    setNome(initial?.nome ?? "");
    setNicho(initial?.nicho ?? "");
    setTier(initial?.tier ?? "");
    setTelefone(initial?.telefone ?? "");
    setEmail(initial?.email ?? "");
    setFoto(initial?.foto);
    const initRedes =
      initial?.redes && initial.redes.length > 0
        ? initial.redes.map((r) => ({ ...r }))
        : [{ id: crypto.randomUUID(), plataforma: "Instagram", handle: "" }];
    setRedes(initRedes);
    setRedePrincipalId(initial?.redePrincipalId ?? initRedes[0]?.id);
    setEndereco(initial?.endereco ? { ...initial.endereco } : {});
    setObservacoes(initial?.observacoes ?? "");
  }, [open, initial]);

  useEffect(() => {
    if (open) setInitialSnapshot(snapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setFoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const setEnd = (k: keyof Endereco, v: string) => setEndereco((e) => ({ ...e, [k]: v }));

  const maiorSeguidores = Math.max(
    0,
    ...redes.map((r) => Number((r.seguidores ?? "").replace(/\D/g, "")) || 0),
  );

  const duplicates = useMemo(
    () =>
      findDuplicates(allInflus, { nome, email, telefone, redes }, initial?.id).filter(
        (d) => !dismissedDupIds.has(d.influ.id),
      ),
    [allInflus, nome, email, telefone, redes, initial?.id, dismissedDupIds],
  );

  const canAdvance = step !== "identidade" || nome.trim().length > 0;

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const goNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex >= STEPS.length) return;
    setStep(STEPS[nextIndex].key);
    setMaxVisited((m) => Math.max(m, nextIndex));
  };
  const goBack = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex < 0) return;
    setStep(STEPS[prevIndex].key);
  };
  const goTo = (idx: number) => {
    if (idx <= maxVisited) setStep(STEPS[idx].key);
  };

  const isDirty = () => snapshot() !== initialSnapshot;

  const requestClose = async () => {
    if (isDirty() && !(await confirm("Descartar as alterações não salvas neste cadastro?"))) {
      return;
    }
    onClose();
  };

  const submit = () => {
    if (!nome.trim()) return;
    const cleanedEnd: Endereco = Object.fromEntries(
      Object.entries(endereco).filter(([, v]) => v && String(v).trim()),
    );
    const cleanedRedes = redes.filter((r) => r.plataforma || r.handle);
    const now = new Date().toISOString();
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      nome: nome.trim(),
      nicho: nicho || undefined,
      tier: (tier || undefined) as BankInflu["tier"],
      telefone: telefone.trim() || undefined,
      email: email.trim() || undefined,
      foto,
      redes: cleanedRedes,
      redePrincipalId: cleanedRedes.some((r) => r.id === redePrincipalId)
        ? redePrincipalId
        : cleanedRedes[0]?.id,
      endereco: Object.keys(cleanedEnd).length ? cleanedEnd : undefined,
      observacoes: observacoes.trim() || undefined,
      arquivado: initial?.arquivado,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && void requestClose()}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-[560px]"
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            void requestClose();
          }}
        >
          <div className="shrink-0 border-b border-border px-5 py-4">
            <SheetTitle>{initial ? "Editar influenciador" : "Novo influenciador"}</SheetTitle>
            <SheetDescription className="sr-only">
              Cadastro do perfil global no banco de influenciadores, em três etapas.
            </SheetDescription>

            <div className="mt-3 hidden items-center gap-2 sm:flex">
              {STEPS.map((s, idx) => (
                <div key={s.key} className="flex flex-1 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goTo(idx)}
                    disabled={idx > maxVisited}
                    aria-current={step === s.key ? "step" : undefined}
                    className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                      idx > maxVisited ? "cursor-not-allowed text-muted-foreground/50" : ""
                    } ${step === s.key ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                        step === s.key
                          ? "bg-brand text-brand-foreground"
                          : idx < maxVisited || idx <= maxVisited
                            ? "bg-muted text-foreground"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="hidden md:inline">{s.label}</span>
                  </button>
                  {idx < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground sm:hidden">
              Etapa {stepIndex + 1} de {STEPS.length} · {STEPS[stepIndex].label}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {step === "identidade" && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <label className="relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-muted">
                    {foto ? (
                      <img src={foto} alt="" className="h-full w-full object-cover object-center" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Camera className="h-5 w-5" />
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePhoto(f);
                      }}
                    />
                  </label>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-muted-foreground">Nome</label>
                    <input
                      type="text"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Nome do influenciador"
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">Nicho</label>
                    <select
                      value={nicho}
                      onChange={(e) => setNicho(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Selecione</option>
                      {NICHOS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-muted-foreground">
                        Tier
                      </label>
                      {maiorSeguidores > 0 && (
                        <button
                          type="button"
                          onClick={() => setTier(suggestTier(maiorSeguidores))}
                          className="text-[11px] text-brand hover:underline"
                        >
                          Sugerir
                        </button>
                      )}
                    </div>
                    <select
                      value={tier}
                      onChange={(e) => setTier(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Sem tier</option>
                      {TIERS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Telefone
                    </label>
                    <input
                      type="text"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nome@exemplo.com"
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === "redes" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    Redes sociais cadastradas
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setRedes((r) => [
                        ...r,
                        { id: crypto.randomUUID(), plataforma: "Instagram", handle: "" },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                  >
                    <Plus className="h-3 w-3" /> adicionar rede
                  </button>
                </div>
                <div className="space-y-2">
                  {redes.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-center gap-2">
                        <select
                          value={r.plataforma}
                          onChange={(e) =>
                            setRedes((list) =>
                              list.map((x) =>
                                x.id === r.id ? { ...x, plataforma: e.target.value } : x,
                              ),
                            )
                          }
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          {REDES_OPTS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={r.handle}
                          onChange={(e) =>
                            setRedes((list) =>
                              list.map((x) =>
                                x.id === r.id ? { ...x, handle: e.target.value } : x,
                              ),
                            )
                          }
                          placeholder="@handle"
                          className="h-9 flex-1 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatSeguidores(r.seguidores)}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "");
                            setRedes((list) =>
                              list.map((x) => (x.id === r.id ? { ...x, seguidores: digits } : x)),
                            );
                          }}
                          placeholder="Seguidores"
                          title="Seguidores"
                          className="h-9 w-28 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setRedes((list) => list.filter((x) => x.id !== r.id));
                            if (redePrincipalId === r.id) setRedePrincipalId(undefined);
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Remover rede"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRedePrincipalId(r.id)}
                        className={`mt-2 inline-flex items-center gap-1 text-[11px] font-medium ${
                          redePrincipalId === r.id
                            ? "text-brand"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Star
                          className="h-3 w-3"
                          fill={redePrincipalId === r.id ? "currentColor" : "none"}
                        />
                        {redePrincipalId === r.id ? "Rede principal" : "Definir como principal"}
                      </button>
                    </div>
                  ))}
                  {redes.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      Nenhuma rede adicionada ainda.
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === "revisao" && (
              <div className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Endereço (opcional)
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    <input
                      type="text"
                      value={endereco.cep ?? ""}
                      onChange={(e) => setEnd("cep", e.target.value)}
                      placeholder="CEP"
                      className="col-span-3 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring sm:col-span-2"
                    />
                    <input
                      type="text"
                      value={endereco.rua ?? ""}
                      onChange={(e) => setEnd("rua", e.target.value)}
                      placeholder="Rua / Logradouro"
                      className="col-span-6 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring sm:col-span-4"
                    />
                    <input
                      type="text"
                      value={endereco.numero ?? ""}
                      onChange={(e) => setEnd("numero", e.target.value)}
                      placeholder="Número"
                      className="col-span-6 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring sm:col-span-2"
                    />
                    <input
                      type="text"
                      value={endereco.complemento ?? ""}
                      onChange={(e) => setEnd("complemento", e.target.value)}
                      placeholder="Complemento"
                      className="col-span-6 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring sm:col-span-3"
                    />
                    <input
                      type="text"
                      value={endereco.bairro ?? ""}
                      onChange={(e) => setEnd("bairro", e.target.value)}
                      placeholder="Bairro"
                      className="col-span-6 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring sm:col-span-3"
                    />
                    <input
                      type="text"
                      value={endereco.cidade ?? ""}
                      onChange={(e) => setEnd("cidade", e.target.value)}
                      placeholder="Cidade"
                      className="col-span-4 h-9 rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="text"
                      value={endereco.estado ?? ""}
                      onChange={(e) => setEnd("estado", e.target.value)}
                      placeholder="UF"
                      maxLength={2}
                      className="col-span-2 h-9 rounded-md border border-input bg-background px-2.5 text-sm uppercase focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Observações globais (opcional)
                  </label>
                  <textarea
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={3}
                    placeholder="Preferências de contato, restrições, notas gerais..."
                    className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {duplicates.length > 0 && (
                  <div className="rounded-lg border border-warning-border bg-warning-soft p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-warning-soft-foreground">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Possível duplicidade
                    </div>
                    <p className="mt-1 text-xs text-warning-soft-foreground/80">
                      Encontramos{" "}
                      {duplicates.length === 1 ? "um cadastro parecido" : "cadastros parecidos"} no
                      banco. Confira antes de salvar — nada é bloqueado ou mesclado automaticamente.
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {duplicates.map((d) => (
                        <li
                          key={d.influ.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-2 py-1.5 text-xs"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium text-foreground">{d.influ.nome}</span>{" "}
                            <span className="text-muted-foreground">
                              ({d.reasons.map((r) => REASON_LABEL[r]).join(", ")})
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setDismissedDupIds((s) => new Set(s).add(d.influ.id))}
                            className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            Ignorar
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold text-foreground">Revisão</p>
                  <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <dt>Nome</dt>
                      <dd className="text-right text-foreground">{nome || "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Nicho</dt>
                      <dd className="text-right text-foreground">{nicho || "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Redes</dt>
                      <dd className="text-right text-foreground">
                        {redes.filter((r) => r.handle).length || 0} cadastrada(s)
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-3">
            <Button variant="outline" onClick={() => void requestClose()}>
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <Button variant="outline" onClick={goBack}>
                  Voltar
                </Button>
              )}
              {stepIndex < STEPS.length - 1 ? (
                <Button variant="primary" disabled={!canAdvance} onClick={goNext}>
                  Próximo
                </Button>
              ) : (
                <Button variant="primary" disabled={!nome.trim()} onClick={submit}>
                  Salvar
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </>
  );
}
