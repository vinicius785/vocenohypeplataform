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
  MoreVertical,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatDateToIso, cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useConfirm } from "@/hooks/use-confirm";
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
  ANONYMOUS_CAMPAIGN_TITLE,
  getEffectiveInscricaoPage,
  newCustomQuestion,
  buildMesReferenciaOptions,
  type InscricaoSobre,
} from "@/lib/inscricao-page";
import { NativeSelect } from "@/components/ui/native-select";

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
  return formatDateToIso(new Date());
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
 * de `uploadInfluFoto` (InfluencerBoard.tsx): a policy de INSERT do bucket
 * `avatars` exige que o PRIMEIRO segmento do path seja o uid de quem está
 * subindo — path com "campanha_banners/" na frente nunca batia com
 * `auth.uid()`, e o upload falhava silenciosamente por RLS (mesmo bug já
 * corrigido pra foto de perfil de influenciador, nunca replicado aqui). */
async function uploadCampanhaBanner(file: File): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const ext = (file.name.split(".").pop() || "jpg").replace(/[^\w]+/g, "");
  const path = `${uid}/campanha-banner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
  clienteNome,
  influs,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign;
  clienteNome: string;
  influs: Influ[];
  onSave: (patch: Partial<Campaign>) => void;
}) {
  const effective = getEffectiveInscricaoPage(campaign);
  const { confirm, confirmDialog } = useConfirm();
  const [tab, setTab] = useState("conteudo");
  // Estado do campo é o valor CRU salvo (não o `effective.publicTitle` já
  // com o fallback aplicado) — senão o campo sempre chegaria pré-preenchido
  // com o nome real da campanha, e o toggle "Mostrar nome da campanha"
  // nunca teria efeito (o campo nunca ficaria vazio pra cair no fallback).
  const [publicTitle, setPublicTitle] = useState(campaign.inscricaoPage?.publicTitle ?? "");
  const [publicSubtitle, setPublicSubtitle] = useState(effective.publicSubtitle);
  const [bannerUrl, setBannerUrl] = useState(effective.bannerUrl ?? "");
  const [description, setDescription] = useState(effective.description);
  const [sobre, setSobre] = useState(effective.sobre);
  const [thankYouMessage, setThankYouMessage] = useState(effective.thankYouMessage);
  const [dos, setDos] = useState<string[]>(effective.dos);
  const [donts, setDonts] = useState<string[]>(effective.donts);
  const [showDos, setShowDos] = useState(effective.showDos);
  const [showDonts, setShowDonts] = useState(effective.showDonts);
  const [showClientName, setShowClientName] = useState(effective.showClientName);
  const [showCampaignName, setShowCampaignName] = useState(
    campaign.inscricaoPage?.showCampaignName ?? true,
  );
  const [fields, setFields] = useState(effective.fields);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>(
    effective.customQuestions,
  );
  const isRecorrente = campaign.pagClienteTipo === "Recorrente";
  const [mesReferencia, setMesReferencia] = useState(effective.mesReferencia);
  const mesOptions = buildMesReferenciaOptions(campaign.pagClienteRecorrenteInicio);
  const [newDo, setNewDo] = useState("");
  const [newDont, setNewDont] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [baseline, setBaseline] = useState("");
  const bannerRef = useRef<HTMLInputElement>(null);

  // Re-sincroniza o estado local sempre que abre (ou troca de campanha) —
  // mesmo padrão do drawer de oportunidade do Comercial.
  useEffect(() => {
    if (!open) return;
    const eff = getEffectiveInscricaoPage(campaign);
    setPublicTitle(campaign.inscricaoPage?.publicTitle ?? "");
    setPublicSubtitle(eff.publicSubtitle);
    setBannerUrl(eff.bannerUrl ?? "");
    setDescription(eff.description);
    setSobre(eff.sobre);
    setThankYouMessage(eff.thankYouMessage);
    setDos(eff.dos);
    setDonts(eff.donts);
    setShowDos(eff.showDos);
    setShowDonts(eff.showDonts);
    setShowClientName(eff.showClientName);
    setShowCampaignName(campaign.inscricaoPage?.showCampaignName ?? true);
    setFields(eff.fields);
    setCustomQuestions(eff.customQuestions);
    setMesReferencia(eff.mesReferencia);
    setTab("conteudo");
    setBaseline(
      JSON.stringify({
        publicTitle: campaign.inscricaoPage?.publicTitle ?? "",
        publicSubtitle: eff.publicSubtitle,
        bannerUrl: eff.bannerUrl ?? "",
        description: eff.description,
        sobre: eff.sobre,
        thankYouMessage: eff.thankYouMessage,
        dos: eff.dos,
        donts: eff.donts,
        showDos: eff.showDos,
        showDonts: eff.showDonts,
        showClientName: eff.showClientName,
        showCampaignName: campaign.inscricaoPage?.showCampaignName ?? true,
        fields: eff.fields,
        customQuestions: eff.customQuestions,
        mesReferencia: eff.mesReferencia,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaign.id]);

  // Detecta alterações não salvas comparando o rascunho atual com o
  // snapshot salvo ao abrir/publicar/salvar — não depende de comparar
  // contra `effective` de novo (que já reflete o `campaign` mais recente
  // só depois de `onSave` re-renderizar o pai).
  const dirty =
    baseline !== "" &&
    baseline !==
      JSON.stringify({
        publicTitle,
        publicSubtitle,
        bannerUrl,
        description,
        sobre,
        thankYouMessage,
        dos,
        donts,
        showDos,
        showDonts,
        showClientName,
        showCampaignName,
        fields,
        customQuestions,
        mesReferencia,
      });

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
      showClientName,
      showCampaignName,
      fields,
      customQuestions,
      thankYouMessage: thankYouMessage.trim() || undefined,
      mesReferencia: isRecorrente ? mesReferencia : undefined,
    };
    const patch: Partial<Campaign> = { dos, donts, inscricaoPage };
    if (!campaign.signupToken) {
      patch.signupToken = crypto.randomUUID().replace(/-/g, "");
    }
    return patch;
  };

  const publicUrl = (token: string) => `${window.location.origin}/inscricao/${token}`;

  const savedTimeout = useRef<number | null>(null);
  const handleSave = (statusOverride?: InscricaoPageStatus) => {
    const patch = buildPatch(statusOverride);
    onSave(patch);
    // Feedback visual de que salvou de verdade — antes o botão "Salvar" não
    // dava nenhuma confirmação, então parecia que nada tinha acontecido.
    setJustSaved(true);
    if (savedTimeout.current) window.clearTimeout(savedTimeout.current);
    savedTimeout.current = window.setTimeout(() => setJustSaved(false), 1800);
    // "Salvar" só grava o rascunho — nunca muda `status` sozinho (Publicar/
    // Encerrar/Reabrir são as únicas ações que trocam status, cada uma seu
    // próprio botão). O snapshot vira o novo "sem alterações pendentes".
    setBaseline(
      JSON.stringify({
        publicTitle,
        publicSubtitle,
        bannerUrl,
        description,
        sobre,
        thankYouMessage,
        dos,
        donts,
        showDos,
        showDonts,
        showClientName,
        showCampaignName,
        fields,
        customQuestions,
        mesReferencia,
      }),
    );
    return patch;
  };

  const requestClose = async () => {
    if (dirty) {
      const ok = await confirm(
        "Você tem alterações não salvas na página de inscrição. Fechar sem salvar?",
      );
      if (!ok) return;
    }
    onOpenChange(false);
  };
  useEffect(
    () => () => {
      if (savedTimeout.current) window.clearTimeout(savedTimeout.current);
    },
    [],
  );

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

  const handleEncerrar = async () => {
    const ok = await confirm(
      "Encerrar as inscrições? A página pública deixa de aceitar novas respostas até você reabrir.",
    );
    if (ok) handleSave("ENCERRADA");
  };

  const addQuestion = () => setCustomQuestions((prev) => [...prev, newCustomQuestion()]);
  const patchQuestion = (id: string, patch: Partial<CustomQuestion>) =>
    setCustomQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const removeQuestion = (id: string) =>
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));

  const previewProps = {
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
    fallbackTitle: showCampaignName ? campaign.nome : ANONYMOUS_CAMPAIGN_TITLE,
    clienteNome,
    showClientName,
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : void requestClose())}>
      <DialogContent
        className="flex max-h-[calc(100vh-2rem)] max-w-[1180px] flex-col gap-0 p-0"
        mobileFullScreen
      >
        {confirmDialog}

        {/* CABEÇALHO — contexto (qual campanha/cliente, em que estado) à
         * esquerda; só as ações que importam à direita: publicar/reabrir é a
         * única de destaque; visualizar e copiar são discretas; encerrar
         * (impacto real) fica atrás do ⋮, nunca ao lado de "Visualizar". */}
        <div className="px-6 pb-4 pt-5 pr-14">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <DialogTitle asChild>
                  <p className={`${TYPOGRAPHY.sectionTitle} text-foreground`}>
                    Página de inscrição
                  </p>
                </DialogTitle>
                <Badge
                  variant={
                    effective.status === "PUBLICADA"
                      ? "success"
                      : effective.status === "ENCERRADA"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {INSCRICAO_STATUS_LABEL[effective.status]}
                </Badge>
              </div>
              <DialogDescription className={`mt-1 ${TYPOGRAPHY.bodySecondary}`}>
                {campaign.nome} · {clienteNome}
              </DialogDescription>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                <span>
                  <span className="font-semibold text-foreground">{totalInscricoes}</span>{" "}
                  {totalInscricoes === 1 ? "inscrição" : "inscrições"}
                  {hojeInscricoes > 0 && ` · ${hojeInscricoes} hoje`}
                  {ultimaInscricao &&
                    ` · última em ${new Date(ultimaInscricao).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
                </span>
                {isRecorrente && (
                  <label className="inline-flex items-center gap-1.5">
                    Mês de referência
                    <NativeSelect
                      value={mesReferencia}
                      onChange={(e) => setMesReferencia(e.target.value)}
                      className="h-7 rounded-md border border-border bg-background px-1.5 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-ring"
                    >
                      {mesOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={handlePreview}>
                <ExternalLink className="h-3.5 w-3.5" /> Visualizar
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopyLink}>
                {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {linkCopied ? "Copiado!" : "Copiar link"}
              </Button>
              {effective.status === "RASCUNHO" && (
                <Button variant="primary" size="sm" onClick={() => handleSave("PUBLICADA")}>
                  Publicar
                </Button>
              )}
              {effective.status === "ENCERRADA" && (
                <Button variant="primary" size="sm" onClick={() => handleSave("PUBLICADA")}>
                  Reabrir inscrições
                </Button>
              )}
              {effective.status === "PUBLICADA" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Mais ações"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary/80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => void handleEncerrar()}
                      className="text-destructive focus:text-destructive"
                    >
                      Encerrar inscrições
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 border-t border-border">
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-border px-6">
              <TabsList className="h-auto gap-6 rounded-none bg-transparent p-0">
                {(
                  [
                    ["conteudo", "Página"],
                    ["orientacoes", "Orientações"],
                    ["formulario", "Formulário"],
                  ] as const
                ).map(([value, label]) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="rounded-none border-b-2 border-transparent bg-transparent px-0 py-3 text-text-secondary shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobilePreviewOpen(true)}
                className="lg:hidden"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Ver prévia
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <div className="mx-auto max-w-2xl">
                <TabsContent value="conteudo" className="mt-0">
                  <FormSection
                    first
                    title="Identidade da página"
                    description="Como a página se apresenta ao influenciador."
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField label="Título público">
                        <Input
                          value={publicTitle}
                          onChange={(e) => setPublicTitle(e.target.value)}
                          placeholder={showCampaignName ? campaign.nome : ANONYMOUS_CAMPAIGN_TITLE}
                          maxLength={120}
                        />
                      </FormField>
                      <FormField label="Subtítulo público">
                        <Input
                          value={publicSubtitle}
                          onChange={(e) => setPublicSubtitle(e.target.value)}
                          placeholder="Ex: Estamos buscando criadores para..."
                          maxLength={160}
                        />
                      </FormField>
                    </div>
                    <div className="divide-y divide-border/60">
                      <ToggleRow
                        label="Mostrar nome do cliente"
                        hint={clienteNome}
                        checked={showClientName}
                        onChange={setShowClientName}
                      />
                      <ToggleRow
                        label="Usar o nome real da campanha quando o título estiver em branco"
                        checked={showCampaignName}
                        onChange={setShowCampaignName}
                      />
                    </div>
                    {(!showClientName || !showCampaignName) && (
                      <p className="text-xs text-text-secondary">
                        Útil quando o cliente só é revelado depois de fechado — deixe o título
                        público em branco pra usar "{ANONYMOUS_CAMPAIGN_TITLE}".
                      </p>
                    )}
                  </FormSection>

                  <FormSection
                    title="Apresentação"
                    description="Banner e texto exibidos antes do formulário."
                  >
                    <FormField
                      label="Banner (opcional)"
                      hint="Formato horizontal, recomendado 1920×1080px (proporção 16:9)."
                    >
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
                        <div className="flex items-center gap-3">
                          <img
                            src={bannerUrl}
                            alt=""
                            className="aspect-video h-16 shrink-0 rounded-md object-cover"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => bannerRef.current?.click()}
                            disabled={bannerUploading}
                          >
                            Trocar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setBannerUrl("")}>
                            Remover
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => bannerRef.current?.click()}
                          disabled={bannerUploading}
                          className="w-fit"
                        >
                          {bannerUploading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ImageIcon className="h-3.5 w-3.5" />
                          )}
                          {bannerUploading ? "Enviando..." : "Anexar imagem"}
                        </Button>
                      )}
                    </FormField>
                    <FormField label="Texto de apresentação">
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="Estamos buscando influenciadores para..."
                        className="resize-none"
                        maxLength={2000}
                      />
                    </FormField>
                  </FormSection>

                  <FormSection
                    title="Sobre a campanha"
                    description="Detalhes que ajudam o influenciador a decidir se faz sentido se inscrever."
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {(
                        [
                          ["objetivo", "Objetivo"],
                          ["regioes", "Regiões"],
                          ["periodo", "Período"],
                          ["tipoConteudo", "Tipo de conteúdo"],
                          ["requisitos", "Requisitos"],
                          ["publicoDesejado", "Público desejado"],
                        ] as const
                      ).map(([key, label]) => (
                        <FormField key={key} label={label}>
                          <Input
                            value={sobre[key] ?? ""}
                            onChange={(e) => setSobre((s) => ({ ...s, [key]: e.target.value }))}
                          />
                        </FormField>
                      ))}
                    </div>
                    <FormField label="Informações importantes">
                      <Textarea
                        value={sobre.infoImportante ?? ""}
                        onChange={(e) =>
                          setSobre((s) => ({ ...s, infoImportante: e.target.value }))
                        }
                        rows={2}
                        className="resize-none"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection
                    title="Após a inscrição"
                    description="Mensagem mostrada ao influenciador depois de enviar."
                  >
                    <FormField label="Mensagem de confirmação">
                      <Textarea
                        value={thankYouMessage}
                        onChange={(e) => setThankYouMessage(e.target.value)}
                        rows={2}
                        className="resize-none"
                        maxLength={500}
                      />
                    </FormField>
                  </FormSection>
                </TabsContent>

                <TabsContent value="orientacoes" className="mt-0">
                  <DoDontEditor
                    first
                    title="O que fazer"
                    description="Boas práticas esperadas — aparecem na página pública."
                    items={dos}
                    setItems={setDos}
                    newValue={newDo}
                    setNewValue={setNewDo}
                    onAdd={addDo}
                    show={showDos}
                    onToggleShow={setShowDos}
                    addLabel="Adicionar"
                    symbol="✓"
                  />
                  <DoDontEditor
                    title="O que evitar"
                    description="O que não deve acontecer — aparece na página pública."
                    items={donts}
                    setItems={setDonts}
                    newValue={newDont}
                    setNewValue={setNewDont}
                    onAdd={addDont}
                    show={showDonts}
                    onToggleShow={setShowDonts}
                    addLabel="Adicionar"
                    symbol="×"
                  />
                </TabsContent>

                <TabsContent value="formulario" className="mt-0">
                  <FormSection
                    first
                    title="Campos padrão"
                    description="Nome, telefone e e-mail são sempre pedidos e obrigatórios — o fluxo de inscrição depende deles."
                  >
                    <ul className="divide-y divide-border/60">
                      {(["nome", "telefone", "email"] as const).map((k) => (
                        <li key={k} className="flex items-center justify-between gap-3 py-2.5">
                          <span className="text-sm text-foreground">
                            {k === "email" ? "E-mail" : k === "nome" ? "Nome" : "Telefone"}
                          </span>
                          <span className="text-xs text-text-secondary">Sempre obrigatório</span>
                        </li>
                      ))}
                      {FIELD_KEYS.map((key) => (
                        <li
                          key={key}
                          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2.5"
                        >
                          <span className="text-sm text-foreground">
                            {INSCRICAO_FIELD_LABEL[key]}
                          </span>
                          <div className="flex items-center gap-5">
                            <label className="flex items-center gap-2 text-xs text-text-secondary">
                              Visível
                              <Switch
                                checked={fields[key].visible}
                                onCheckedChange={(v) =>
                                  setFields((f) => ({ ...f, [key]: { ...f[key], visible: v } }))
                                }
                              />
                            </label>
                            <label
                              className={cn(
                                "flex items-center gap-2 text-xs text-text-secondary",
                                !fields[key].visible && "opacity-40",
                              )}
                            >
                              Obrigatório
                              <Switch
                                disabled={!fields[key].visible}
                                checked={fields[key].required}
                                onCheckedChange={(v) =>
                                  setFields((f) => ({ ...f, [key]: { ...f[key], required: v } }))
                                }
                              />
                            </label>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </FormSection>

                  <FormSection
                    title="Perguntas personalizadas"
                    description="Perguntas extras específicas desta campanha."
                    action={
                      <Button variant="outline" size="sm" onClick={addQuestion}>
                        <Plus className="h-3.5 w-3.5" /> Adicionar pergunta
                      </Button>
                    }
                  >
                    {customQuestions.length === 0 ? (
                      <p className="text-sm text-text-secondary">Nenhuma pergunta adicional.</p>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {customQuestions.map((q, i) => (
                          <li key={q.id} className="space-y-2.5 py-4 first:pt-0">
                            <div className="flex items-start gap-2">
                              <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                                <Input
                                  value={q.label}
                                  onChange={(e) => patchQuestion(q.id, { label: e.target.value })}
                                  placeholder="Ex: Você mora em qual cidade?"
                                  className="sm:flex-1"
                                />
                                <NativeSelect
                                  value={q.type}
                                  onChange={(e) =>
                                    patchQuestion(q.id, {
                                      type: e.target.value as CustomQuestionType,
                                    })
                                  }
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-44"
                                >
                                  {QUESTION_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                      {CUSTOM_QUESTION_TYPE_LABEL[t]}
                                    </option>
                                  ))}
                                </NativeSelect>
                              </div>
                              <RowActions
                                canUp={i > 0}
                                canDown={i < customQuestions.length - 1}
                                onUp={() => setCustomQuestions((prev) => moveItem(prev, i, -1))}
                                onDown={() => setCustomQuestions((prev) => moveItem(prev, i, 1))}
                                onRemove={() => removeQuestion(q.id)}
                                removeLabel="Remover pergunta"
                              />
                            </div>
                            {(q.type === "selecao_unica" || q.type === "selecao_multipla") && (
                              <FormField label="Opções (uma por linha)">
                                <Textarea
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
                                  className="resize-none"
                                />
                              </FormField>
                            )}
                            <label className="flex w-fit items-center gap-2 text-xs text-text-secondary">
                              Obrigatória
                              <Switch
                                checked={q.required}
                                onCheckedChange={(v) => patchQuestion(q.id, { required: v })}
                              />
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </FormSection>
                </TabsContent>
              </div>
            </div>
          </Tabs>

          {/* PRÉVIA — metade do trabalho (configuração ↔ resultado): mais larga
           * que antes e sempre visível no desktop; abaixo de `lg` vira a folha
           * "Ver prévia". */}
          <aside className="hidden w-[42%] min-w-[360px] max-w-[500px] shrink-0 overflow-y-auto border-l border-border bg-muted/30 lg:block">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-5 py-2.5 backdrop-blur">
              <p className="text-xs font-medium text-text-secondary">Prévia ao vivo</p>
              <button
                type="button"
                onClick={handlePreview}
                className="inline-flex items-center gap-1 text-xs font-medium text-text-brand hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Abrir página
              </button>
            </div>
            <LivePreview {...previewProps} />
          </aside>
        </div>

        <Sheet open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
          <SheetContent side="bottom" className="h-[90vh] overflow-y-auto p-0">
            <SheetTitle className="sr-only">Prévia da página de inscrição</SheetTitle>
            <SheetDescription className="sr-only">
              Como a página pública vai ficar pro influenciador
            </SheetDescription>
            <LivePreview {...previewProps} />
          </SheetContent>
        </Sheet>

        {/* RODAPÉ — estado de salvamento à esquerda (sempre diz a verdade),
         * ações à direita: "Salvar" só ganha destaque quando há o que salvar. */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3">
          <p className="flex items-center gap-2 text-xs text-text-secondary" aria-live="polite">
            {dirty ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                Alterações não salvas
              </>
            ) : justSaved ? (
              <>
                <Check className="h-3.5 w-3.5" /> Salvo
              </>
            ) : (
              "Tudo salvo"
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void requestClose()}>
              {dirty ? "Descartar" : "Fechar"}
            </Button>
            <Button variant={dirty ? "primary" : "outline"} size="sm" onClick={() => handleSave()}>
              Salvar alterações
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Seção da configuração: título + descrição + conteúdo, separadas por
 * espaço e um divisor sutil — nenhum card dentro de card. */
function FormSection({
  title,
  description,
  action,
  first = false,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-4 py-7", first ? "pt-0" : "border-t border-border/60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p role="heading" aria-level={3} className={TYPOGRAPHY.cardTitle}>
            {title}
          </p>
          {description && <p className={`mt-0.5 ${TYPOGRAPHY.bodySecondary}`}>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint && <span className="-mt-1 text-xs text-text-secondary">{hint}</span>}
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {hint && <span className="block text-xs text-text-secondary">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function RowActions({
  canUp,
  canDown,
  onUp,
  onDown,
  onRemove,
  removeLabel,
}: {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={onUp}
        disabled={!canUp}
        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
        aria-label="Mover pra cima"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={!canDown}
        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
        aria-label="Mover pra baixo"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
        aria-label={removeLabel}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function DoDontEditor({
  title,
  description,
  items,
  setItems,
  newValue,
  setNewValue,
  onAdd,
  show,
  onToggleShow,
  addLabel,
  symbol,
  first = false,
}: {
  title: string;
  description: string;
  items: string[];
  setItems: (fn: (prev: string[]) => string[]) => void;
  newValue: string;
  setNewValue: (v: string) => void;
  onAdd: () => void;
  show: boolean;
  onToggleShow: (v: boolean) => void;
  addLabel: string;
  symbol: string;
  first?: boolean;
}) {
  return (
    <FormSection
      first={first}
      title={title}
      description={description}
      action={
        <label className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
          Mostrar na página
          <Switch checked={show} onCheckedChange={onToggleShow} />
        </label>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary">Nenhum item ainda.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-2 py-1.5">
              <span className="w-4 shrink-0 text-center text-text-secondary">{symbol}</span>
              <input
                value={item}
                onChange={(e) =>
                  setItems((prev) => prev.map((it, idx) => (idx === i ? e.target.value : it)))
                }
                className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
              />
              <RowActions
                canUp={i > 0}
                canDown={i < items.length - 1}
                onUp={() => setItems((prev) => moveItem(prev, i, -1))}
                onDown={() => setItems((prev) => moveItem(prev, i, 1))}
                onRemove={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                removeLabel="Remover"
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="Descreva o item e pressione Enter..."
        />
        <Button variant="outline" size="sm" onClick={onAdd} className="shrink-0">
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </Button>
      </div>
    </FormSection>
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
  clienteNome,
  showClientName,
}: {
  publicTitle: string;
  publicSubtitle: string;
  bannerUrl: string;
  description: string;
  sobre: InscricaoSobre;
  dos: string[];
  donts: string[];
  showDos: boolean;
  showDonts: boolean;
  fields: Record<InscricaoFieldKey, { visible: boolean; required: boolean }>;
  customQuestions: CustomQuestion[];
  thankYouMessage: string;
  fallbackTitle: string;
  clienteNome: string;
  showClientName: boolean;
}) {
  const sobreRows: [string, string | undefined][] = [
    ["Objetivo", sobre.objetivo],
    ["Regiões", sobre.regioes],
    ["Período", sobre.periodo],
    ["Formato", sobre.tipoConteudo],
    ["Requisitos", sobre.requisitos],
    ["Público desejado", sobre.publicoDesejado],
  ].filter(([, v]) => v?.trim()) as [string, string][];

  return (
    <div className="p-5">
      {/* Moldura = a "janela" da página pública (único contêiner com borda);
       * o conteúdo dentro separa por espaço e divisor, não por caixas. */}
      <div className="overflow-hidden rounded-xl border border-border bg-background text-xs shadow-sm">
        {bannerUrl && <img src={bannerUrl} alt="" className="aspect-video w-full object-cover" />}
        <div className="space-y-5 p-5">
          <div>
            {showClientName && (
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                {clienteNome}
              </p>
            )}
            <p
              role="heading"
              aria-level={3}
              className="text-base font-semibold leading-tight text-foreground"
            >
              {publicTitle.trim() || fallbackTitle}
            </p>
            {publicSubtitle.trim() && (
              <p className="mt-1 text-xs text-text-secondary">{publicSubtitle}</p>
            )}
          </div>

          {description.trim() && (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
              {description}
            </p>
          )}

          {(sobreRows.length > 0 || sobre.infoImportante?.trim()) && (
            <div className="space-y-2 border-t border-border/60 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                Sobre a campanha
              </p>
              {sobreRows.length > 0 && (
                <dl className="space-y-1.5 text-xs text-foreground">
                  {sobreRows.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[11px] text-text-secondary">{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {sobre.infoImportante?.trim() && (
                <p className="whitespace-pre-wrap text-xs text-foreground">
                  {sobre.infoImportante}
                </p>
              )}
            </div>
          )}

          {showDos && dos.length > 0 && (
            <div className="space-y-1.5 border-t border-border/60 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                O que fazer
              </p>
              <ul className="space-y-1">
                {dos.map((d, i) => (
                  <li key={i} className="flex gap-1.5 text-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-text-secondary" /> {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showDonts && donts.length > 0 && (
            <div className="space-y-1.5 border-t border-border/60 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                O que evitar
              </p>
              <ul className="space-y-1">
                {donts.map((d, i) => (
                  <li key={i} className="flex gap-1.5 text-foreground">
                    <span className="w-3 shrink-0 text-center text-text-secondary">×</span> {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2 border-t border-border/60 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              Inscreva-se
            </p>
            <div className="space-y-1.5 text-xs text-text-secondary">
              {["Nome *", "Telefone *", "E-mail *"].map((l) => (
                <div key={l} className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                  {l}
                </div>
              ))}
              {FIELD_KEYS.filter((k) => fields[k].visible).map((k) => (
                <div key={k} className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                  {INSCRICAO_FIELD_LABEL[k]}
                  {fields[k].required ? " *" : ""}
                </div>
              ))}
              {customQuestions
                .filter((q) => q.label.trim())
                .map((q) => (
                  <div
                    key={q.id}
                    className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
                  >
                    {q.label}
                    {q.required ? " *" : ""}
                  </div>
                ))}
            </div>
            <div className="rounded-md bg-foreground py-2 text-center text-xs font-medium text-background">
              Enviar inscrição
            </div>
          </div>

          {thankYouMessage.trim() && (
            <p className="text-[11px] italic text-text-secondary">
              Após enviar: "{thankYouMessage}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
