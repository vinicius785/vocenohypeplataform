import { useEffect, useRef, useState } from "react";
import {
  Paperclip,
  Plus,
  Trash2,
  X,
  FileText,
  Users,
  Wallet,
  Coins,
  ShieldCheck,
  Link2,
  Target,
  Check,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const TIPOS = ["Digital", "Celebridade", "Local", "Nicho", "Embaixador"] as const;
const TAMANHOS = ["Nano", "Micro", "Médio", "Macro", "Mega"] as const;
const PRAZOS = ["D+7", "D+15", "D+30", "D+45", "D+60"] as const;
const PAGAMENTOS = ["Valor", "Por Hora", "Comissão", "Permuta", "Outro"] as const;
export type PagTipo = (typeof PAGAMENTOS)[number];

const PAG_CLIENTE_TIPOS = [
  "À vista",
  "50/50 (duas datas)",
  "50/50 (segunda na entrega)",
  "Parcelado",
  "Recorrente",
] as const;
type PagClienteTipo = (typeof PAG_CLIENTE_TIPOS)[number];

type ParcelaCliente = { id: string; data: string; valor: string };

type InfluLinha = {
  id: string;
  tipo: string;
  tamanho: string;
  quantidade: number;
  enviar: number;
};

export type PagamentoConfig = {
  valor?: string;
  porHoraValor?: string;
  porHoraDescricao?: string;
  comissaoPct?: string;
  comissaoSobre?: string;
  permutaDescricao?: string;
  permutaFoto?: string;
  outroDescricao?: string;
  outroValor?: string;
  outroCriterios?: string;
};

const USOS_IMAGEM = [
  "Orgânico (perfil do influenciador)",
  "Pago (whitelisting/impulsionamento)",
  "Materiais próprios do cliente",
] as const;

export type DireitosImagem = {
  permitido: boolean;
  usos: string[];
  duracaoDias?: number; // vazio = indeterminado
  exclusividade: boolean;
  exclusividadeSegmento?: string;
  observacoes?: string;
};

const emptyDireitosImagem: DireitosImagem = {
  permitido: false,
  usos: [],
  exclusividade: false,
};

const GENEROS = ["Feminino", "Masculino", "Não-binário", "Todos"] as const;

export type PublicoAlvo = {
  segmentacao?: string;
  localizacao?: string;
  idadeMin?: number;
  idadeMax?: number;
  generos: string[];
};

const emptyPublicoAlvo: PublicoAlvo = { generos: [] };

export type Campaign = {
  id: string;
  nome: string;
  briefing: string;
  briefingFile?: string;
  briefingLinks?: string[];
  dataInicio?: string;
  prazo: string;
  linhas: InfluLinha[];
  valorCliente: string;
  orcamento: string;
  pagTipos: PagTipo[];
  pagConfig: Record<PagTipo, PagamentoConfig>;
  prazoPag: string;
  pagClienteTipo?: PagClienteTipo;
  pagClienteDataUnica?: string;
  pagClienteData1?: string;
  pagClienteData2?: string;
  pagClienteParcelas?: ParcelaCliente[];
  pagClienteRecorrenteDia?: number; // dia do mês (1-31)
  pagClienteRecorrenteInicio?: string; // data inicial da recorrência
  direitosImagem?: DireitosImagem;
  publicoAlvo?: PublicoAlvo;
};

const newLinha = (): InfluLinha => ({
  id: crypto.randomUUID(),
  tipo: "",
  tamanho: "",
  quantidade: 1,
  enviar: 1,
});
const emptyPagConfig: Record<PagTipo, PagamentoConfig> = {
  Valor: {},
  "Por Hora": {},
  Comissão: {},
  Permuta: {},
  Outro: {},
};

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-tight text-foreground/80">
        {label}
      </label>
      {children}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-background p-5">
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="space-y-4 pl-[38px]">{children}</div>
    </section>
  );
}

type StepKey = "info" | "publico" | "influs" | "pagCliente" | "pagInflu" | "direitos";
const STEPS: { key: StepKey; label: string; icon: React.ComponentType<{ className?: string }> }[] =
  [
    { key: "info", label: "Informações", icon: FileText },
    { key: "publico", label: "Público-alvo", icon: Target },
    { key: "influs", label: "Influenciadores", icon: Users },
    { key: "pagCliente", label: "Pagamento do cliente", icon: Wallet },
    { key: "pagInflu", label: "Pagamento aos influenciadores", icon: Coins },
    { key: "direitos", label: "Direitos de imagem", icon: ShieldCheck },
  ];

export function VincularCampanhaDialog({
  open,
  onOpenChange,
  clienteNome,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clienteNome?: string;
  initial?: Campaign | null;
  onSave?: (c: Campaign) => void;
}) {
  const [nome, setNome] = useState("");
  const [briefing, setBriefing] = useState("");
  const [briefingFile, setBriefingFile] = useState<string | undefined>();
  const [briefingLinks, setBriefingLinks] = useState<string[]>([]);
  const [briefingLinkInput, setBriefingLinkInput] = useState("");
  const [showBriefingLinkBox, setShowBriefingLinkBox] = useState(false);
  const [dataInicio, setDataInicio] = useState("");
  const [prazo, setPrazo] = useState("");
  const [linhas, setLinhas] = useState<InfluLinha[]>([newLinha()]);
  const [valorCliente, setValorCliente] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [pagTipos, setPagTipos] = useState<PagTipo[]>([]);
  const [pagConfig, setPagConfig] = useState<Record<PagTipo, PagamentoConfig>>(emptyPagConfig);
  const [prazoPag, setPrazoPag] = useState("");
  const [pagClienteTipo, setPagClienteTipo] = useState<PagClienteTipo | "">("");
  const [pagClienteDataUnica, setPagClienteDataUnica] = useState("");
  const [pagClienteData1, setPagClienteData1] = useState("");
  const [pagClienteData2, setPagClienteData2] = useState("");
  const [pagClienteParcelas, setPagClienteParcelas] = useState<ParcelaCliente[]>([
    { id: crypto.randomUUID(), data: "", valor: "" },
  ]);
  const [pagClienteRecorrenteDia, setPagClienteRecorrenteDia] = useState<string>("");
  const [pagClienteRecorrenteInicio, setPagClienteRecorrenteInicio] = useState<string>("");
  const [direitosImagem, setDireitosImagem] = useState<DireitosImagem>(emptyDireitosImagem);
  const [publicoAlvo, setPublicoAlvo] = useState<PublicoAlvo>(emptyPublicoAlvo);
  const [step, setStep] = useState<StepKey>("info");
  const briefingRef = useRef<HTMLInputElement>(null);
  const permutaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep("info");
    if (initial) {
      setNome(initial.nome);
      setBriefing(initial.briefing);
      setBriefingFile(initial.briefingFile);
      setBriefingLinks(initial.briefingLinks ?? []);
      setBriefingLinkInput("");
      setShowBriefingLinkBox(false);
      setDataInicio(initial.dataInicio ?? "");
      setPrazo(initial.prazo);
      setLinhas(initial.linhas.length ? initial.linhas : [newLinha()]);
      setValorCliente(initial.valorCliente);
      setOrcamento(initial.orcamento);
      setPagTipos(initial.pagTipos ?? []);
      setPagConfig(initial.pagConfig ?? emptyPagConfig);
      setPrazoPag(initial.prazoPag);
      setPagClienteTipo(initial.pagClienteTipo ?? "");
      setPagClienteDataUnica(initial.pagClienteDataUnica ?? "");
      setPagClienteData1(initial.pagClienteData1 ?? "");
      setPagClienteData2(initial.pagClienteData2 ?? "");
      setPagClienteParcelas(
        initial.pagClienteParcelas?.length
          ? initial.pagClienteParcelas
          : [{ id: crypto.randomUUID(), data: "", valor: "" }],
      );
      setPagClienteRecorrenteDia(
        initial.pagClienteRecorrenteDia ? String(initial.pagClienteRecorrenteDia) : "",
      );
      setPagClienteRecorrenteInicio(initial.pagClienteRecorrenteInicio ?? "");
      setDireitosImagem({ ...emptyDireitosImagem, ...(initial.direitosImagem ?? {}) });
      setPublicoAlvo({ ...emptyPublicoAlvo, ...(initial.publicoAlvo ?? {}) });
    } else {
      setNome("");
      setBriefing("");
      setBriefingFile(undefined);
      setBriefingLinks([]);
      setBriefingLinkInput("");
      setShowBriefingLinkBox(false);
      setDataInicio("");
      setPrazo("");
      setLinhas([newLinha()]);
      setValorCliente("");
      setOrcamento("");
      setPagTipos([]);
      setPagConfig(emptyPagConfig);
      setPrazoPag("");
      setPagClienteTipo("");
      setPagClienteDataUnica("");
      setPagClienteData1("");
      setPagClienteData2("");
      setPagClienteParcelas([{ id: crypto.randomUUID(), data: "", valor: "" }]);
      setPagClienteRecorrenteDia("");
      setPagClienteRecorrenteInicio("");
      setDireitosImagem(emptyDireitosImagem);
      setPublicoAlvo(emptyPublicoAlvo);
    }
  }, [open, initial]);

  const updateLinha = (id: string, patch: Partial<InfluLinha>) =>
    setLinhas((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const addLinha = () =>
    setLinhas((l) => [
      ...l,
      { id: crypto.randomUUID(), tipo: "", tamanho: "", quantidade: 1, enviar: 1 },
    ]);
  const removeLinha = (id: string) => setLinhas((l) => l.filter((x) => x.id !== id));

  const toggleTipo = (t: PagTipo) =>
    setPagTipos((tipos) => (tipos.includes(t) ? tipos.filter((y) => y !== t) : [...tipos, t]));
  const updateConfig = (t: PagTipo, patch: Partial<PagamentoConfig>) =>
    setPagConfig((c) => ({ ...c, [t]: { ...(c[t] ?? {}), ...patch } }));

  const toggleUsoImagem = (u: string) =>
    setDireitosImagem((d) => ({
      ...d,
      usos: d.usos.includes(u) ? d.usos.filter((x) => x !== u) : [...d.usos, u],
    }));

  const toggleGenero = (g: string) =>
    setPublicoAlvo((p) => ({
      ...p,
      generos: p.generos.includes(g) ? p.generos.filter((x) => x !== g) : [...p.generos, g],
    }));

  const onFile = (file: File | undefined, cb: (data: string) => void) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => cb(r.result as string);
    r.readAsDataURL(file);
  };

  const addBriefingLink = () => {
    const url = briefingLinkInput.trim();
    if (!url) return;
    setBriefingLinks((l) => [...l, url]);
    setBriefingLinkInput("");
    setShowBriefingLinkBox(false);
  };
  const removeBriefingLink = (url: string) => setBriefingLinks((l) => l.filter((x) => x !== url));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    onSave?.({
      id: initial?.id ?? crypto.randomUUID(),
      nome,
      briefing,
      briefingFile,
      briefingLinks: briefingLinks.length ? briefingLinks : undefined,
      dataInicio: dataInicio || undefined,
      prazo,
      linhas,
      valorCliente,
      orcamento,
      pagTipos,
      pagConfig,
      prazoPag,
      pagClienteTipo: pagClienteTipo || undefined,
      pagClienteDataUnica: pagClienteDataUnica || undefined,
      pagClienteData1: pagClienteData1 || undefined,
      pagClienteData2: pagClienteData2 || undefined,
      pagClienteParcelas: pagClienteTipo === "Parcelado" ? pagClienteParcelas : undefined,
      pagClienteRecorrenteDia:
        pagClienteTipo === "Recorrente" && pagClienteRecorrenteDia
          ? Math.min(31, Math.max(1, Number(pagClienteRecorrenteDia) || 0)) || undefined
          : undefined,
      pagClienteRecorrenteInicio:
        pagClienteTipo === "Recorrente" ? pagClienteRecorrenteInicio || undefined : undefined,
      direitosImagem,
      publicoAlvo,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden border-border bg-card p-0">
        <div className="border-b border-border/60 px-8 pt-8 pb-6">
          <DialogTitle className="text-xl font-semibold">
            {initial ? "Editar campanha" : "Vincular campanha"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            {clienteNome
              ? `${initial ? "Editando" : "Nova"} campanha para ${clienteNome}.`
              : initial
                ? "Editar campanha."
                : "Nova campanha."}
          </DialogDescription>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 px-8 py-3 [scrollbar-width:thin]">
          {STEPS.map((s, i) => {
            const active = step === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(s.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                    active ? "bg-background/20" : "bg-muted-foreground/15"
                  }`}
                >
                  {i + 1}
                </span>
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-8">
            {step === "info" && (
              <Section icon={FileText} title="Informações da campanha">
                <Field label="Nome da campanha">
                  <input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Lançamento Verão 2026"
                    className={inputCls}
                  />
                </Field>
                <Field label="Briefing da campanha">
                  <textarea
                    value={briefing}
                    onChange={(e) => setBriefing(e.target.value)}
                    rows={3}
                    placeholder="Objetivos, mensagens-chave, referências..."
                    className={`${inputCls} resize-none`}
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => briefingRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      {briefingFile ? "Trocar anexo" : "Anexar arquivo"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBriefingLinkBox((s) => !s)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Adicionar link
                    </button>
                    {briefingFile && (
                      <button
                        type="button"
                        onClick={() => setBriefingFile(undefined)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Remover
                      </button>
                    )}
                    <input
                      ref={briefingRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => onFile(e.target.files?.[0], setBriefingFile)}
                    />
                  </div>
                  {showBriefingLinkBox && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        autoFocus
                        value={briefingLinkInput}
                        onChange={(e) => setBriefingLinkInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addBriefingLink();
                          }
                          if (e.key === "Escape") {
                            setShowBriefingLinkBox(false);
                            setBriefingLinkInput("");
                          }
                        }}
                        placeholder="Colar link (https://…)"
                        className={inputCls}
                      />
                      <button
                        type="button"
                        onClick={addBriefingLink}
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                      >
                        Adicionar
                      </button>
                    </div>
                  )}
                  {briefingLinks.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {briefingLinks.map((url) => (
                        <li
                          key={url}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-1.5"
                        >
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 truncate text-xs text-foreground underline underline-offset-2"
                          >
                            {url}
                          </a>
                          <button
                            type="button"
                            onClick={() => removeBriefingLink(url)}
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label="Remover link"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Início da campanha">
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Prazo para campanha">
                    <input
                      type="date"
                      value={prazo}
                      onChange={(e) => setPrazo(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </Section>
            )}

            {step === "publico" && (
              <Section
                icon={Target}
                title="Público-alvo"
                description="Para quem essa campanha é direcionada."
              >
                <Field label="Segmentação / interesses">
                  <input
                    value={publicoAlvo.segmentacao ?? ""}
                    onChange={(e) => setPublicoAlvo((p) => ({ ...p, segmentacao: e.target.value }))}
                    placeholder="Ex: moda sustentável, tecnologia, maternidade..."
                    className={inputCls}
                  />
                </Field>
                <Field label="Localização">
                  <input
                    value={publicoAlvo.localizacao ?? ""}
                    onChange={(e) => setPublicoAlvo((p) => ({ ...p, localizacao: e.target.value }))}
                    placeholder="Ex: Brasil, capitais, São Paulo (SP)..."
                    className={inputCls}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Idade mínima">
                    <input
                      type="number"
                      min={0}
                      value={publicoAlvo.idadeMin ?? ""}
                      onChange={(e) =>
                        setPublicoAlvo((p) => ({
                          ...p,
                          idadeMin: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                      placeholder="Ex: 18"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Idade máxima">
                    <input
                      type="number"
                      min={0}
                      value={publicoAlvo.idadeMax ?? ""}
                      onChange={(e) =>
                        setPublicoAlvo((p) => ({
                          ...p,
                          idadeMax: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                      placeholder="Ex: 34"
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="Gênero">
                  <div className="flex flex-wrap gap-2">
                    {GENEROS.map((g) => {
                      const active = publicoAlvo.generos.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => toggleGenero(g)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-card text-foreground hover:bg-muted"
                          }`}
                        >
                          {active && <Check className="h-3 w-3" />}
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </Section>
            )}

            {step === "influs" && (
              <Section
                icon={Users}
                title="Influenciadores"
                description="Selecione o tipo, tamanho, quantidade e quantos enviar por linha."
              >
                <div className="space-y-3">
                  {linhas.map((l) => (
                    <div
                      key={l.id}
                      className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_90px_90px_auto]"
                    >
                      <Field label="Tipo">
                        <select
                          value={l.tipo}
                          onChange={(e) => updateLinha(l.id, { tipo: e.target.value })}
                          className={inputCls}
                        >
                          <option value="">Selecione</option>
                          {TIPOS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Tamanho">
                        <select
                          value={l.tamanho}
                          onChange={(e) => updateLinha(l.id, { tamanho: e.target.value })}
                          className={inputCls}
                        >
                          <option value="">Selecione</option>
                          {TAMANHOS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Qtd.">
                        <input
                          type="number"
                          min={1}
                          value={l.quantidade}
                          onChange={(e) =>
                            updateLinha(l.id, { quantidade: Number(e.target.value) })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Enviar">
                        <input
                          type="number"
                          min={1}
                          value={l.enviar}
                          onChange={(e) => updateLinha(l.id, { enviar: Number(e.target.value) })}
                          className={inputCls}
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() => removeLinha(l.id)}
                        disabled={linhas.length === 1}
                        className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                        aria-label="Remover linha"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addLinha}
                    className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar tipo
                  </button>
                </div>
              </Section>
            )}

            {step === "pagCliente" && (
              <Section
                icon={Wallet}
                title="Valores e pagamento do cliente"
                description="Quanto o cliente paga e de que forma."
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Valor pago pelo cliente">
                    <input
                      value={valorCliente}
                      onChange={(e) => setValorCliente(e.target.value)}
                      placeholder="R$ 0,00"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Orçamento para execução">
                    <input
                      value={orcamento}
                      onChange={(e) => setOrcamento(e.target.value)}
                      placeholder="R$ 0,00"
                      className={inputCls}
                    />
                  </Field>
                </div>

                <Field label="Forma de pagamento">
                  <div className="flex flex-wrap gap-2">
                    {PAG_CLIENTE_TIPOS.map((t) => {
                      const active = pagClienteTipo === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setPagClienteTipo(active ? "" : t)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-card text-foreground hover:bg-muted"
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                {pagClienteTipo === "À vista" && (
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
                    <Field label="Data do pagamento">
                      <input
                        type="date"
                        value={pagClienteDataUnica}
                        onChange={(e) => setPagClienteDataUnica(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                )}

                {pagClienteTipo === "50/50 (duas datas)" && (
                  <div className="grid grid-cols-1 gap-4 rounded-lg border border-border/70 bg-muted/30 p-4 sm:grid-cols-2">
                    <Field label="Data dos primeiros 50%">
                      <input
                        type="date"
                        value={pagClienteData1}
                        onChange={(e) => setPagClienteData1(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Data dos últimos 50%">
                      <input
                        type="date"
                        value={pagClienteData2}
                        onChange={(e) => setPagClienteData2(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                )}

                {pagClienteTipo === "50/50 (segunda na entrega)" && (
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
                    <Field label="Data dos primeiros 50%">
                      <input
                        type="date"
                        value={pagClienteData1}
                        onChange={(e) => setPagClienteData1(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Os 50% restantes serão pagos na entrega da campanha.
                    </p>
                  </div>
                )}

                {pagClienteTipo === "Parcelado" && (
                  <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-4">
                    {pagClienteParcelas.map((p, i) => (
                      <div
                        key={p.id}
                        className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <Field label={`Parcela ${i + 1} — data`}>
                          <input
                            type="date"
                            value={p.data}
                            onChange={(e) =>
                              setPagClienteParcelas((arr) =>
                                arr.map((x) =>
                                  x.id === p.id ? { ...x, data: e.target.value } : x,
                                ),
                              )
                            }
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Valor">
                          <input
                            value={p.valor}
                            onChange={(e) =>
                              setPagClienteParcelas((arr) =>
                                arr.map((x) =>
                                  x.id === p.id ? { ...x, valor: e.target.value } : x,
                                ),
                              )
                            }
                            placeholder="R$ 0,00"
                            className={inputCls}
                          />
                        </Field>
                        <button
                          type="button"
                          onClick={() =>
                            setPagClienteParcelas((arr) =>
                              arr.length === 1 ? arr : arr.filter((x) => x.id !== p.id),
                            )
                          }
                          disabled={pagClienteParcelas.length === 1}
                          className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                          aria-label="Remover parcela"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setPagClienteParcelas((arr) => [
                          ...arr,
                          { id: crypto.randomUUID(), data: "", valor: "" },
                        ])
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar parcela
                    </button>
                  </div>
                )}

                {pagClienteTipo === "Recorrente" && (
                  <div className="grid grid-cols-1 gap-4 rounded-lg border border-border/70 bg-muted/30 p-4 sm:grid-cols-2">
                    <Field label="Dia do pagamento (todo mês)">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={pagClienteRecorrenteDia}
                        onChange={(e) => setPagClienteRecorrenteDia(e.target.value)}
                        placeholder="Ex: 5"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Início da recorrência">
                      <input
                        type="date"
                        value={pagClienteRecorrenteInicio}
                        onChange={(e) => setPagClienteRecorrenteInicio(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <p className="col-span-2 text-xs text-muted-foreground">
                      Esta campanha aparecerá como uma única entrada na aba Campanhas e será cobrada
                      mensalmente no dia informado.
                    </p>
                  </div>
                )}
              </Section>
            )}

            {step === "pagInflu" && (
              <Section
                icon={Coins}
                title="Pagamento aos influenciadores"
                description="Tipo de remuneração e prazo de pagamento."
              >
                <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <Field label="Tipos de pagamento">
                    <div className="flex flex-wrap gap-2">
                      {PAGAMENTOS.map((p) => {
                        const active = pagTipos.includes(p);
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => toggleTipo(p)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? "border-foreground bg-foreground text-background"
                                : "border-border bg-card text-foreground hover:bg-muted"
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  {pagTipos.includes("Valor") && (
                    <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
                      <Field label="Valor">
                        <input
                          value={(pagConfig.Valor ?? {}).valor ?? ""}
                          onChange={(e) => updateConfig("Valor", { valor: e.target.value })}
                          placeholder="R$ 0,00"
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  )}

                  {pagTipos.includes("Por Hora") && (
                    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-4">
                      <Field label="Valor por hora">
                        <input
                          value={(pagConfig["Por Hora"] ?? {}).porHoraValor ?? ""}
                          onChange={(e) =>
                            updateConfig("Por Hora", { porHoraValor: e.target.value })
                          }
                          placeholder="R$ 0,00"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Detalhes">
                        <textarea
                          value={(pagConfig["Por Hora"] ?? {}).porHoraDescricao ?? ""}
                          onChange={(e) =>
                            updateConfig("Por Hora", { porHoraDescricao: e.target.value })
                          }
                          rows={2}
                          placeholder="Ex: quantidade de horas estimada, escopo do trabalho..."
                          className={`${inputCls} resize-none`}
                        />
                      </Field>
                    </div>
                  )}

                  {pagTipos.includes("Comissão") && (
                    <div className="grid grid-cols-1 gap-4 rounded-lg border border-border/70 bg-muted/30 p-4 sm:grid-cols-2">
                      <Field label="Comissão (%)">
                        <input
                          value={(pagConfig.Comissão ?? {}).comissaoPct ?? ""}
                          onChange={(e) =>
                            updateConfig("Comissão", { comissaoPct: e.target.value })
                          }
                          placeholder="Ex: 10%"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Sobre o que">
                        <input
                          value={(pagConfig.Comissão ?? {}).comissaoSobre ?? ""}
                          onChange={(e) =>
                            updateConfig("Comissão", { comissaoSobre: e.target.value })
                          }
                          placeholder="Ex: vendas via cupom"
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  )}

                  {pagTipos.includes("Permuta") && (
                    <div className="space-y-4 rounded-lg border border-border/70 bg-muted/30 p-4">
                      <Field label="Descrição da permuta">
                        <textarea
                          value={(pagConfig.Permuta ?? {}).permutaDescricao ?? ""}
                          onChange={(e) =>
                            updateConfig("Permuta", { permutaDescricao: e.target.value })
                          }
                          rows={2}
                          placeholder="O que será entregue em troca"
                          className={`${inputCls} resize-none`}
                        />
                      </Field>
                      <div className="flex items-center gap-3">
                        {(pagConfig.Permuta ?? {}).permutaFoto ? (
                          <div className="relative">
                            <img
                              src={(pagConfig.Permuta ?? {}).permutaFoto}
                              alt=""
                              className="h-16 w-16 rounded-lg object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => updateConfig("Permuta", { permutaFoto: undefined })}
                              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => permutaRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          {(pagConfig.Permuta ?? {}).permutaFoto ? "Trocar foto" : "Anexar foto"}
                        </button>
                        <input
                          ref={permutaRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            onFile(e.target.files?.[0], (data) =>
                              updateConfig("Permuta", { permutaFoto: data }),
                            )
                          }
                        />
                      </div>
                    </div>
                  )}

                  {pagTipos.includes("Outro") && (
                    <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/70 bg-muted/30 p-4 md:grid-cols-2">
                      <Field label="Descrição">
                        <input
                          value={(pagConfig.Outro ?? {}).outroDescricao ?? ""}
                          onChange={(e) =>
                            updateConfig("Outro", { outroDescricao: e.target.value })
                          }
                          placeholder="Ex: Bônus por meta, cachê fixo..."
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Valor">
                        <input
                          value={(pagConfig.Outro ?? {}).outroValor ?? ""}
                          onChange={(e) => updateConfig("Outro", { outroValor: e.target.value })}
                          placeholder="R$ 0,00"
                          className={inputCls}
                        />
                      </Field>
                      <div className="md:col-span-2">
                        <Field label="Critérios de pagamento">
                          <textarea
                            value={(pagConfig.Outro ?? {}).outroCriterios ?? ""}
                            onChange={(e) =>
                              updateConfig("Outro", { outroCriterios: e.target.value })
                            }
                            placeholder="Explique quando e como esse pagamento deve ser feito..."
                            rows={3}
                            className={`${inputCls} resize-y`}
                          />
                        </Field>
                      </div>
                    </div>
                  )}
                </div>

                <Field label="Prazo de pagamento">
                  <div className="flex flex-wrap gap-2">
                    {PRAZOS.map((p) => {
                      const active = prazoPag === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPrazoPag(p)}
                          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-card text-foreground hover:bg-muted"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </Section>
            )}

            {step === "direitos" && (
              <Section
                icon={ShieldCheck}
                title="Direitos de imagem"
                description="Defina se e como o cliente pode reutilizar o conteúdo dos influenciadores."
              >
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={direitosImagem.permitido}
                    onChange={(e) =>
                      setDireitosImagem((d) => ({ ...d, permitido: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  Cliente tem direito de uso do conteúdo/imagem do influenciador
                </label>

                {direitosImagem.permitido && (
                  <div className="space-y-4 rounded-lg border border-border/70 bg-muted/30 p-4">
                    <Field label="Tipos de uso permitidos">
                      <div className="flex flex-wrap gap-2">
                        {USOS_IMAGEM.map((u) => {
                          const active = direitosImagem.usos.includes(u);
                          return (
                            <button
                              key={u}
                              type="button"
                              onClick={() => toggleUsoImagem(u)}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                active
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border bg-card text-foreground hover:bg-muted"
                              }`}
                            >
                              {u}
                            </button>
                          );
                        })}
                      </div>
                    </Field>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Duração da veiculação (dias)">
                        <input
                          type="number"
                          min={1}
                          value={direitosImagem.duracaoDias ?? ""}
                          onChange={(e) =>
                            setDireitosImagem((d) => ({
                              ...d,
                              duracaoDias: e.target.value ? Number(e.target.value) : undefined,
                            }))
                          }
                          placeholder="Deixe em branco = indeterminado"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Exclusividade">
                        <label className="flex h-9 items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={direitosImagem.exclusividade}
                            onChange={(e) =>
                              setDireitosImagem((d) => ({ ...d, exclusividade: e.target.checked }))
                            }
                            className="h-4 w-4 rounded border-border"
                          />
                          Influenciador não pode divulgar concorrentes
                        </label>
                      </Field>
                    </div>

                    {direitosImagem.exclusividade && (
                      <Field label="Segmento/categoria da exclusividade">
                        <input
                          value={direitosImagem.exclusividadeSegmento ?? ""}
                          onChange={(e) =>
                            setDireitosImagem((d) => ({
                              ...d,
                              exclusividadeSegmento: e.target.value,
                            }))
                          }
                          placeholder="Ex: bebidas energéticas, streaming de música..."
                          className={inputCls}
                        />
                      </Field>
                    )}

                    <Field label="Observações do contrato">
                      <textarea
                        value={direitosImagem.observacoes ?? ""}
                        onChange={(e) =>
                          setDireitosImagem((d) => ({ ...d, observacoes: e.target.value }))
                        }
                        rows={2}
                        placeholder="Detalhes adicionais de uso de imagem, território, etc."
                        className={`${inputCls} resize-none`}
                      />
                    </Field>
                  </div>
                )}
              </Section>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-8 py-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancelar
            </button>
            <div className="flex items-center gap-2">
              {step !== STEPS[0].key && (
                <button
                  type="button"
                  onClick={() => setStep(STEPS[STEPS.findIndex((s) => s.key === step) - 1].key)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  Voltar
                </button>
              )}
              {step !== STEPS[STEPS.length - 1].key ? (
                <button
                  type="button"
                  onClick={() => setStep(STEPS[STEPS.findIndex((s) => s.key === step) + 1].key)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3.5 py-2 text-xs font-medium text-background hover:opacity-90"
                >
                  Próximo
                </button>
              ) : (
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3.5 py-2 text-xs font-medium text-background hover:opacity-90"
                >
                  {initial ? "Salvar alterações" : "Vincular campanha"}
                </button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
