import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ImageIcon,
  Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import type { Influ } from "@/components/influenciadores/InfluencerBoard";
import {
  type InscricaoPageStatus,
  type InscricaoPageConfig,
  type InscricaoFieldKey,
  type CustomQuestion,
  type CustomQuestionType,
  INSCRICAO_STATUS_LABEL,
  INSCRICAO_FIELD_LABEL,
  CUSTOM_QUESTION_TYPE_LABEL,
  getEffectiveInscricaoPage,
  newCustomQuestion,
} from "@/lib/inscricao-page";

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block space-y-1 text-xs font-medium text-muted-foreground";
const FIELD_KEYS: InscricaoFieldKey[] = ["nicho", "redes", "mensagem", "midiaKit"];
const QUESTION_TYPES: CustomQuestionType[] = [
  "texto_curto",
  "texto_longo",
  "numero",
  "sim_nao",
  "selecao_unica",
  "selecao_multipla",
  "data",
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const next = [...list];
  const target = index + dir;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Sobe o banner pro bucket `avatars` (Storage) e devolve uma URL assinada
 * — o banner é um anexo de verdade, não um link colado à mão. Mesmo padrão
 * de `uploadInfluFoto` (InfluencerBoard.tsx). */
async function uploadCampanhaBanner(file: File): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const ext = (file.name.split(".").pop() || "jpg").replace(/[^\w]+/g, "");
  const path = `campanha_banners/${uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) {
    console.warn("[avatars] banner upload failed", error);
    return null;
  }
  const { data: signed } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  return signed?.signedUrl ?? null;
}

/**
 * Gerenciador da Página de Inscrição pública da campanha — substitui o
 * antigo botão "Link de inscrição" (que só copiava o link). Edita
 * `campaign.dos`/`donts`/`inscricaoPage`, sempre salvos via `onSave` (o
 * chamador grava com o mesmo `clientesStore.set(...)` já usado hoje pro
 * `signupToken`, sem caminho de escrita novo). Métricas vêm de `influs`
 * (já sincronizado ao vivo via `campanha-scoped-store.ts`) — sem query
 * nova.
 */
export function InscricaoPageDialog({
  open,
  onOpenChange,
  campaign,
  influs,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign;
  influs: Influ[];
  onSave: (patch: Partial<Campaign>) => void;
}) {
  const effective = getEffectiveInscricaoPage(campaign);
  const [tab, setTab] = useState("geral");
  const [publicTitle, setPublicTitle] = useState(effective.publicTitle);
  const [publicSubtitle, setPublicSubtitle] = useState(effective.publicSubtitle);
  const [bannerUrl, setBannerUrl] = useState(effective.bannerUrl ?? "");
  const [description, setDescription] = useState(effective.description);
  const [sobre, setSobre] = useState(effective.sobre);
  const [thankYouMessage, setThankYouMessage] = useState(effective.thankYouMessage);
  const [dos, setDos] = useState<string[]>(effective.dos);
  const [donts, setDonts] = useState<string[]>(effective.donts);
  const [showDos, setShowDos] = useState(effective.showDos);
  const [showDonts, setShowDonts] = useState(effective.showDonts);
  const [fields, setFields] = useState(effective.fields);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>(
    effective.customQuestions,
  );
  const [newDo, setNewDo] = useState("");
  const [newDont, setNewDont] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const bannerRef = useRef<HTMLInputElement>(null);

  // Re-sincroniza o estado local sempre que abre (ou troca de campanha) —
  // mesmo padrão do drawer de oportunidade do Comercial.
  useEffect(() => {
    if (!open) return;
    const eff = getEffectiveInscricaoPage(campaign);
    setPublicTitle(eff.publicTitle);
    setPublicSubtitle(eff.publicSubtitle);
    setBannerUrl(eff.bannerUrl ?? "");
    setDescription(eff.description);
    setSobre(eff.sobre);
    setThankYouMessage(eff.thankYouMessage);
    setDos(eff.dos);
    setDonts(eff.donts);
    setShowDos(eff.showDos);
    setShowDonts(eff.showDonts);
    setFields(eff.fields);
    setCustomQuestions(eff.customQuestions);
    setTab("geral");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaign.id]);

  const submissoes = influs.filter((i) => i.submittedVia === "inscricao_page");
  const totalInscricoes = submissoes.length;
  const hojeInscricoes = submissoes.filter((i) =>
    (i.createdAt ?? "").startsWith(todayIso()),
  ).length;
  const ultimaInscricao = submissoes.reduce<string | undefined>((latest, i) => {
    if (!i.createdAt) return latest;
    return !latest || i.createdAt > latest ? i.createdAt : latest;
  }, undefined);

  const buildPatch = (statusOverride?: InscricaoPageStatus): Partial<Campaign> => {
    const inscricaoPage: InscricaoPageConfig = {
      status: statusOverride ?? effective.status,
      publicTitle: publicTitle.trim() || undefined,
      publicSubtitle: publicSubtitle.trim() || undefined,
      bannerUrl: bannerUrl.trim() || undefined,
      description: description.trim() || undefined,
      sobre,
      showDos,
      showDonts,
      fields,
      customQuestions,
      thankYouMessage: thankYouMessage.trim() || undefined,
    };
    const patch: Partial<Campaign> = { dos, donts, inscricaoPage };
    if (!campaign.signupToken) {
      patch.signupToken = crypto.randomUUID().replace(/-/g, "");
    }
    return patch;
  };

  const publicUrl = (token: string) => `${window.location.origin}/inscricao/${token}`;

  const handleSave = (statusOverride?: InscricaoPageStatus) => {
    const patch = buildPatch(statusOverride);
    onSave(patch);
    return patch;
  };

  const handleCopyLink = () => {
    const patch = handleSave();
    const token = (patch.signupToken ?? campaign.signupToken)!;
    void navigator.clipboard.writeText(publicUrl(token)).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    });
  };

  const handlePreview = () => {
    const patch = handleSave();
    const token = (patch.signupToken ?? campaign.signupToken)!;
    window.open(publicUrl(token), "_blank", "noopener,noreferrer");
  };

  const addDo = () => {
    if (!newDo.trim()) return;
    setDos((prev) => [...prev, newDo.trim()]);
    setNewDo("");
  };
  const addDont = () => {
    if (!newDont.trim()) return;
    setDonts((prev) => [...prev, newDont.trim()]);
    setNewDont("");
  };

  const addQuestion = () => setCustomQuestions((prev) => [...prev, newCustomQuestion()]);
  const patchQuestion = (id: string, patch: Partial<CustomQuestion>) =>
    setCustomQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const removeQuestion = (id: string) =>
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 p-0">
        <div className="border-b border-border px-6 py-4">
          <DialogTitle className="text-lg font-light tracking-tight text-foreground">
            Página de inscrição
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
            Porta de entrada pública da campanha pros influenciadores.
          </DialogDescription>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  effective.status === "PUBLICADA"
                    ? "bg-foreground"
                    : effective.status === "ENCERRADA"
                      ? "border border-foreground bg-transparent"
                      : "bg-muted-foreground"
                }`}
              />
              {INSCRICAO_STATUS_LABEL[effective.status]}
            </span>
            <span className="text-xs text-muted-foreground">
              <strong className="font-semibold text-foreground">{totalInscricoes}</strong>{" "}
              inscrições
              {hojeInscricoes > 0 && ` · ${hojeInscricoes} hoje`}
              {ultimaInscricao &&
                ` · última em ${new Date(ultimaInscricao).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreview}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Visualizar
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {linkCopied ? "Copiado!" : "Copiar link"}
            </button>
            {effective.status === "RASCUNHO" && (
              <button
                type="button"
                onClick={() => handleSave("PUBLICADA")}
                className="rounded-full border-2 border-foreground bg-foreground px-3.5 py-1.5 text-xs font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
              >
                Publicar
              </button>
            )}
            {effective.status === "PUBLICADA" && (
              <button
                type="button"
                onClick={() => handleSave("ENCERRADA")}
                className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Encerrar inscrições
              </button>
            )}
            {effective.status === "ENCERRADA" && (
              <button
                type="button"
                onClick={() => handleSave("PUBLICADA")}
                className="rounded-full border-2 border-foreground bg-foreground px-3.5 py-1.5 text-xs font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
              >
                Reabrir inscrições
              </button>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TabsList className="mx-6 mt-3 w-fit shrink-0">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="dos-donts">Do's &amp; Don'ts</TabsTrigger>
              <TabsTrigger value="formulario">Formulário</TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <TabsContent value="geral" className="mt-0 space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className={labelCls}>
                    <span>Título público</span>
                    <input
                      value={publicTitle}
                      onChange={(e) => setPublicTitle(e.target.value)}
                      placeholder={campaign.nome}
                      className={inputCls}
                      maxLength={120}
                    />
                  </label>
                  <label className={labelCls}>
                    <span>Subtítulo público</span>
                    <input
                      value={publicSubtitle}
                      onChange={(e) => setPublicSubtitle(e.target.value)}
                      placeholder="Ex: Estamos buscando criadores para..."
                      className={inputCls}
                      maxLength={160}
                    />
                  </label>
                </div>
                <div className={labelCls}>
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" /> Banner (opcional)
                  </span>
                  <input
                    ref={bannerRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setBannerUploading(true);
                      void uploadCampanhaBanner(file)
                        .then((url) => {
                          if (url) setBannerUrl(url);
                        })
                        .finally(() => setBannerUploading(false));
                    }}
                  />
                  {bannerUrl ? (
                    <div className="mt-1 flex items-center gap-3 rounded-lg border border-border bg-background p-2">
                      <img
                        src={bannerUrl}
                        alt=""
                        className="h-14 w-24 shrink-0 rounded-md object-cover"
                      />
                      <div className="flex flex-1 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => bannerRef.current?.click()}
                          disabled={bannerUploading}
                          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          Trocar
                        </button>
                        <button
                          type="button"
                          onClick={() => setBannerUrl("")}
                          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => bannerRef.current?.click()}
                      disabled={bannerUploading}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
                    >
                      {bannerUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5" />
                      )}
                      {bannerUploading ? "Enviando..." : "Anexar imagem"}
                    </button>
                  )}
                </div>
                <label className={labelCls}>
                  <span>Apresentação (texto público, antes do formulário)</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Estamos buscando influenciadores para..."
                    className={`${inputCls} h-auto resize-none py-2`}
                    maxLength={2000}
                  />
                </label>

                <div className="rounded-2xl border border-border bg-muted/40 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sobre a campanha
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={labelCls}>
                      <span>Objetivo</span>
                      <input
                        value={sobre.objetivo ?? ""}
                        onChange={(e) => setSobre((s) => ({ ...s, objetivo: e.target.value }))}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      <span>Regiões</span>
                      <input
                        value={sobre.regioes ?? ""}
                        onChange={(e) => setSobre((s) => ({ ...s, regioes: e.target.value }))}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      <span>Período</span>
                      <input
                        value={sobre.periodo ?? ""}
                        onChange={(e) => setSobre((s) => ({ ...s, periodo: e.target.value }))}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      <span>Tipo de conteúdo</span>
                      <input
                        value={sobre.tipoConteudo ?? ""}
                        onChange={(e) => setSobre((s) => ({ ...s, tipoConteudo: e.target.value }))}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      <span>Requisitos</span>
                      <input
                        value={sobre.requisitos ?? ""}
                        onChange={(e) => setSobre((s) => ({ ...s, requisitos: e.target.value }))}
                        className={inputCls}
                      />
                    </label>
                    <label className={labelCls}>
                      <span>Público desejado</span>
                      <input
                        value={sobre.publicoDesejado ?? ""}
                        onChange={(e) =>
                          setSobre((s) => ({ ...s, publicoDesejado: e.target.value }))
                        }
                        className={inputCls}
                      />
                    </label>
                  </div>
                  <label className={`${labelCls} mt-3`}>
                    <span>Informações importantes</span>
                    <textarea
                      value={sobre.infoImportante ?? ""}
                      onChange={(e) => setSobre((s) => ({ ...s, infoImportante: e.target.value }))}
                      rows={2}
                      className={`${inputCls} h-auto resize-none py-2`}
                    />
                  </label>
                </div>

                <label className={labelCls}>
                  <span>Mensagem após inscrição</span>
                  <textarea
                    value={thankYouMessage}
                    onChange={(e) => setThankYouMessage(e.target.value)}
                    rows={2}
                    className={`${inputCls} h-auto resize-none py-2`}
                    maxLength={500}
                  />
                </label>
              </TabsContent>

              <TabsContent value="dos-donts" className="mt-0 space-y-5">
                <DoDontEditor
                  title="O que fazer"
                  items={dos}
                  setItems={setDos}
                  newValue={newDo}
                  setNewValue={setNewDo}
                  onAdd={addDo}
                  show={showDos}
                  onToggleShow={setShowDos}
                  addLabel="+ Adicionar DO"
                  symbol="✓"
                />
                <DoDontEditor
                  title="O que evitar"
                  items={donts}
                  setItems={setDonts}
                  newValue={newDont}
                  setNewValue={setNewDont}
                  onAdd={addDont}
                  show={showDonts}
                  onToggleShow={setShowDonts}
                  addLabel="+ Adicionar DON'T"
                  symbol="×"
                />
              </TabsContent>

              <TabsContent value="formulario" className="mt-0 space-y-5">
                <div className="rounded-2xl border border-border bg-muted/40 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Campos padrão
                  </p>
                  <p className="mb-3 text-[11px] text-muted-foreground">
                    Nome, telefone e e-mail são sempre obrigatórios — usados pelo fluxo atual de
                    inscrição.
                  </p>
                  <div className="space-y-2">
                    {(["nome", "telefone", "email"] as const).map((k) => (
                      <div
                        key={k}
                        className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm opacity-60"
                      >
                        <span className="capitalize">{k === "email" ? "E-mail" : k}</span>
                        <span className="text-xs text-muted-foreground">Obrigatório</span>
                      </div>
                    ))}
                    {FIELD_KEYS.map((key) => (
                      <div
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        <span>{INSCRICAO_FIELD_LABEL[key]}</span>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={fields[key].visible}
                              onChange={(e) =>
                                setFields((f) => ({
                                  ...f,
                                  [key]: { ...f[key], visible: e.target.checked },
                                }))
                              }
                            />
                            Visível
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              disabled={!fields[key].visible}
                              checked={fields[key].required}
                              onChange={(e) =>
                                setFields((f) => ({
                                  ...f,
                                  [key]: { ...f[key], required: e.target.checked },
                                }))
                              }
                            />
                            Obrigatório
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Perguntas personalizadas
                    </p>
                    <button
                      type="button"
                      onClick={addQuestion}
                      className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Adicionar pergunta
                    </button>
                  </div>
                  {customQuestions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma pergunta adicional.</p>
                  ) : (
                    <div className="space-y-2">
                      {customQuestions.map((q, i) => (
                        <div key={q.id} className="rounded-xl border border-border bg-muted/20 p-3">
                          <div className="flex items-start gap-2">
                            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                              <input
                                value={q.label}
                                onChange={(e) => patchQuestion(q.id, { label: e.target.value })}
                                placeholder="Ex: Você mora em qual cidade?"
                                className={`${inputCls} sm:flex-1`}
                              />
                              <select
                                value={q.type}
                                onChange={(e) =>
                                  patchQuestion(q.id, {
                                    type: e.target.value as CustomQuestionType,
                                  })
                                }
                                className={`${inputCls} sm:w-44`}
                              >
                                {QUESTION_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {CUSTOM_QUESTION_TYPE_LABEL[t]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => setCustomQuestions((prev) => moveItem(prev, i, -1))}
                                disabled={i === 0}
                                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                                aria-label="Mover pra cima"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setCustomQuestions((prev) => moveItem(prev, i, 1))}
                                disabled={i === customQuestions.length - 1}
                                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                                aria-label="Mover pra baixo"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeQuestion(q.id)}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                                aria-label="Remover pergunta"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {(q.type === "selecao_unica" || q.type === "selecao_multipla") && (
                            <label className={`${labelCls} mt-2`}>
                              <span>Opções (uma por linha)</span>
                              <textarea
                                value={(q.options ?? []).join("\n")}
                                onChange={(e) =>
                                  patchQuestion(q.id, {
                                    options: e.target.value
                                      .split("\n")
                                      .map((o) => o.trim())
                                      .filter(Boolean),
                                  })
                                }
                                rows={3}
                                className={`${inputCls} h-auto resize-none py-2`}
                              />
                            </label>
                          )}
                          <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={(e) => patchQuestion(q.id, { required: e.target.checked })}
                            />
                            Obrigatória
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-muted/20 lg:block">
            <LivePreview
              publicTitle={publicTitle}
              publicSubtitle={publicSubtitle}
              bannerUrl={bannerUrl}
              description={description}
              sobre={sobre}
              dos={dos}
              donts={donts}
              showDos={showDos}
              showDonts={showDonts}
              fields={fields}
              customQuestions={customQuestions}
              thankYouMessage={thankYouMessage}
              fallbackTitle={campaign.nome}
            />
          </aside>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            className="rounded-full border-2 border-foreground bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
          >
            Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DoDontEditor({
  title,
  items,
  setItems,
  newValue,
  setNewValue,
  onAdd,
  show,
  onToggleShow,
  addLabel,
  symbol,
}: {
  title: string;
  items: string[];
  setItems: (fn: (prev: string[]) => string[]) => void;
  newValue: string;
  setNewValue: (v: string) => void;
  onAdd: () => void;
  show: boolean;
  onToggleShow: (v: boolean) => void;
  addLabel: string;
  symbol: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={show} onChange={(e) => onToggleShow(e.target.checked)} />
          Mostrar na página
        </label>
      </div>
      {items.length === 0 ? (
        <p className="mb-2 text-xs text-muted-foreground">Nenhum item cadastrado.</p>
      ) : (
        <ul className="mb-2 space-y-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            >
              <span className="w-4 shrink-0 text-center text-muted-foreground">{symbol}</span>
              <input
                value={item}
                onChange={(e) =>
                  setItems((prev) => prev.map((it, idx) => (idx === i ? e.target.value : it)))
                }
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setItems((prev) => moveItem(prev, i, -1))}
                  disabled={i === 0}
                  className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  aria-label="Mover pra cima"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setItems((prev) => moveItem(prev, i, 1))}
                  disabled={i === items.length - 1}
                  className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  aria-label="Mover pra baixo"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="Descreva o item..."
          className={inputCls}
        />
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      </div>
    </div>
  );
}

/** Prévia ao vivo de como a página pública vai ficar — atualiza a cada
 * tecla, reflete os mesmos dados que `/inscricao/:token` vai mostrar
 * (ver src/routes/inscricao.$token.tsx), só numa versão em miniatura, sem
 * abrir uma segunda janela/aba. */
function LivePreview({
  publicTitle,
  publicSubtitle,
  bannerUrl,
  description,
  sobre,
  dos,
  donts,
  showDos,
  showDonts,
  fields,
  customQuestions,
  thankYouMessage,
  fallbackTitle,
}: {
  publicTitle: string;
  publicSubtitle: string;
  bannerUrl: string;
  description: string;
  sobre: { objetivo?: string; regioes?: string; periodo?: string; infoImportante?: string };
  dos: string[];
  donts: string[];
  showDos: boolean;
  showDonts: boolean;
  fields: Record<InscricaoFieldKey, { visible: boolean; required: boolean }>;
  customQuestions: CustomQuestion[];
  thankYouMessage: string;
  fallbackTitle: string;
}) {
  const sobreItems = [sobre.objetivo, sobre.regioes, sobre.periodo].filter(Boolean);

  return (
    <div className="p-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Como vai ficar pro influenciador
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-background text-[11px] shadow-sm">
        {bannerUrl && <img src={bannerUrl} alt="" className="h-20 w-full object-cover" />}
        <div className="space-y-3 p-3">
          <div>
            <h3 className="text-sm font-semibold leading-tight text-foreground">
              {publicTitle.trim() || fallbackTitle}
            </h3>
            {publicSubtitle.trim() && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{publicSubtitle}</p>
            )}
          </div>

          {description.trim() && (
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-2 text-[11px] text-foreground">
              {description}
            </p>
          )}

          {sobreItems.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Sobre a campanha
              </p>
              <ul className="space-y-0.5 text-[11px] text-foreground">
                {sobreItems.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}

          {showDos && dos.length > 0 && (
            <div className="rounded-lg border border-border p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                O que fazer
              </p>
              <ul className="space-y-0.5">
                {dos.map((d, i) => (
                  <li key={i} className="flex gap-1 text-foreground">
                    <Check className="mt-0.5 h-2.5 w-2.5 shrink-0" /> {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showDonts && donts.length > 0 && (
            <div className="rounded-lg border border-border p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                O que evitar
              </p>
              <ul className="space-y-0.5">
                {donts.map((d, i) => (
                  <li key={i} className="flex gap-1 text-foreground">
                    <span className="shrink-0">×</span> {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1.5 rounded-lg border border-border p-2">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Inscreva-se</p>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <div className="rounded border border-border bg-muted/30 px-2 py-1">Nome *</div>
              <div className="rounded border border-border bg-muted/30 px-2 py-1">Telefone *</div>
              <div className="rounded border border-border bg-muted/30 px-2 py-1">E-mail *</div>
              {FIELD_KEYS.filter((k) => fields[k].visible).map((k) => (
                <div key={k} className="rounded border border-border bg-muted/30 px-2 py-1">
                  {INSCRICAO_FIELD_LABEL[k]}
                  {fields[k].required ? " *" : ""}
                </div>
              ))}
              {customQuestions
                .filter((q) => q.label.trim())
                .map((q) => (
                  <div key={q.id} className="rounded border border-border bg-muted/30 px-2 py-1">
                    {q.label}
                    {q.required ? " *" : ""}
                  </div>
                ))}
            </div>
            <div className="rounded-full bg-foreground py-1.5 text-center text-[11px] font-medium text-background">
              Enviar inscrição
            </div>
          </div>

          {thankYouMessage.trim() && (
            <p className="text-[10px] italic text-muted-foreground">
              Após enviar: "{thankYouMessage}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
