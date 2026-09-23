import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Inbox } from "lucide-react";
import {
  deleteGoogleEventsForMeetings,
  runGoogleCalendarSync,
} from "@/lib/google-calendar.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageContainer } from "@/components/shared/PageContainer";
import {
  type Meeting,
  loadMeetings,
  saveMeetings,
  onMeetingsChange,
  meetingNeedsMyAction,
  confirmMeetingFor,
  declineMeetingFor,
  loadDisponibilidades,
  saveMyDisponibilidade,
  onDisponibilidadesChange,
  classifyDialogSyncResult,
} from "@/lib/reunioes-store";
import { getMe } from "@/lib/chat-store";
import { useConfirm, useConfirmChoice } from "@/hooks/use-confirm";
import { toISODate } from "./meetings/meeting-status";
import { loadTeam, type TeamMember } from "./meetings/team";
import { AgendaView } from "./meetings/AgendaView";
import { CalendarView } from "./meetings/CalendarView";
import { SolicitacoesTab } from "./meetings/SolicitacoesTab";
import { MeetingDialog } from "./meetings/MeetingDialog";
import { MeetingSummaryDialog } from "./meetings/MeetingSummaryDialog";
import { JoinByLinkDialog } from "./meetings/JoinByLinkDialog";
import { resolveReunioesView, type ReunioesView } from "@/lib/section-nav";

export { MeetingSummaryDialog } from "./meetings/MeetingSummaryDialog";

const GRID_VIEW_OPTIONS = [
  { value: "agenda" as const, label: "Agenda" },
  { value: "calendar" as const, label: "Calendário" },
];

export function ReunioesSection() {
  const me = getMe();
  const search = useSearch({ from: "/_authenticated/time" });
  const navigate = useNavigate();
  // Fase 3: "Reuniões" deixou de ter subitens de sidebar (Agenda/
  // Calendário/Solicitações) — a visualização ativa agora é um estado só
  // desta página, gerenciado direto na URL (mesmo padrão de `?cView=` em
  // ComercialSection), sem passar pelo mecanismo de subnav de `time.tsx`.
  // O param continua se chamando `reunioesView` (não `?view=` genérico
  // como citado no pedido original) porque `view` já é usado por
  // `bugs.$token.tsx` no schema de busca global do TanStack Router —
  // reaproveitar o nome colidiria de tipos entre rotas não relacionadas.
  // Os VALORES viraram inglês (`agenda`/`calendar`/`requests`), sobrevive
  // a um refresh e permite link direto; um valor antigo/inválido (em
  // português, de antes da Fase 3) cai no default via `resolveReunioesView`.
  const view: ReunioesView = resolveReunioesView(search.reunioesView);
  const setView = (next: ReunioesView) => {
    void navigate({
      to: "/time",
      search: (prev) => ({ ...prev, section: "reunioes", reunioesView: next }),
      replace: true,
    });
  };

  const [team, setTeam] = useState<TeamMember[]>([]);
  useEffect(() => setTeam(loadTeam()), []);

  const [meetings, setMeetings] = useState<Meeting[]>(() => loadMeetings());
  // Disponibilidade de TODO o time (uma linha por membro) — não só a minha,
  // porque o diálogo de nova reunião precisa enxergar quando qualquer
  // participante selecionado está indisponível, não só quem está logado.
  const [disponibilidades, setDisponibilidades] = useState(() => loadDisponibilidades());
  const [dialog, setDialog] = useState<{ mode: "new" | "edit"; data?: Meeting } | null>(null);
  const [newMeetingDate, setNewMeetingDate] = useState<string>(() => toISODate(new Date()));
  const [newMeetingHora, setNewMeetingHora] = useState<string | undefined>(undefined);
  const openNewMeeting = (dateIso?: string, hora?: string) => {
    setNewMeetingDate(dateIso ?? toISODate(new Date()));
    setNewMeetingHora(hora);
    setDialog({ mode: "new" });
    setSyncFeedback(null);
  };
  // Fase 5: estado de sincronização do formulário depois de salvar — o
  // diálogo não fecha mais sozinho (nem em sucesso nem em erro), quem
  // decide é o usuário ("Concluir"/"Tentar novamente"). `ids` são os
  // registros dessa gravação específica, pra checar só o resultado deles
  // (não o de qualquer outra reunião que porventura tenha sincronizado
  // no mesmo ciclo).
  const [syncFeedback, setSyncFeedback] = useState<{
    ids: string[];
    status: "syncing" | "synced" | "error";
    error?: string;
  } | null>(null);
  const [summary, setSummary] = useState<Meeting | null>(null);
  const [summaryProposing, setSummaryProposing] = useState(false);

  // Dispara a sincronização com o Google logo após QUALQUER mutação de
  // reunião (criar, editar, confirmar, recusar, reagendar, cancelar) —
  // antes disso a saída pra Google só acontecia no próximo tick do
  // polling de 3min (`_authenticated/route.tsx`), então criar/editar uma
  // reunião não refletia no Google Agenda na hora. Debounce curto porque
  // `persist` pode ser chamado várias vezes em sequência rápida (ex.:
  // aplicar mudança em todas as ocorrências de uma série); a trava de
  // concorrência (`google_calendar_sync_state`) já protege contra duas
  // chamadas concorrentes de verdade, o debounce aqui é só pra não disparar
  // um ciclo inteiro de sync por edição individual dentro da mesma rajada.
  const syncGoogleFn = useServerFn(runGoogleCalendarSync);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const triggerGoogleSync = () => {
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => {
      syncGoogleFn().catch((e) => console.warn("[google-calendar] sync failed", e));
    }, 1500);
  };
  useEffect(() => () => clearTimeout(syncDebounceRef.current), []);

  const persist = (next: Meeting[]) => {
    setMeetings(next);
    saveMeetings(next);
    triggerGoogleSync();
  };

  // Fase 5: fluxo de sincronização visível especificamente pro formulário
  // de Nova reunião/Editar — diferente do `triggerGoogleSync` debounced
  // acima (usado por toda mutação "de fundo", sem UI própria), esta
  // chamada é imediata e o resultado é mostrado dentro do próprio diálogo.
  // Depois do ciclo rodar, relê as reuniões do zero e olha só o
  // `syncStatus` gravado pelo `syncOneMeeting` (Fase 2) nos ids desta
  // gravação — se nenhum deles foi sequer tentado (`syncStatus` ausente),
  // é porque o criador não tem o Google conectado: nada a reportar, não é
  // um erro, então o diálogo fecha normalmente como sempre fechou.
  const runDialogSync = (ids: string[]) => {
    setSyncFeedback({ ids, status: "syncing" });
    // `persist()` grava no Supabase de forma "fire-and-forget" (ver
    // `table-array-store.ts`) — sem essa pequena espera, o ciclo de sync
    // no servidor corre risco real de ler a tabela ANTES do INSERT/UPDATE
    // desta reunião chegar lá, e reportar "nada pra sincronizar" por pura
    // corrida, não porque a reunião não precisava. Não é uma garantia
    // (ainda existe uma janela, só menor), mas cobre o caso comum.
    new Promise((resolve) => setTimeout(resolve, 800))
      .then(() => syncGoogleFn())
      .then(() => {
        const fresh = loadMeetings();
        const rows = ids
          .map((id) => fresh.find((m) => m.id === id))
          .filter((m): m is Meeting => !!m);
        const result = classifyDialogSyncResult(rows);
        if (result.outcome === "not-attempted") {
          setSyncFeedback(null);
          setDialog(null);
          return;
        }
        setSyncFeedback({ ids, status: result.outcome, error: result.error });
      })
      .catch((e) => {
        console.warn("[google-calendar] sync failed", e);
        setSyncFeedback({ ids, status: "error" });
      });
  };
  const deleteGoogleEventsFn = useServerFn(deleteGoogleEventsForMeetings);
  // Excluir na plataforma também apaga o evento correspondente no Google
  // (se houver) — best-effort, nunca bloqueia a exclusão que já aconteceu
  // localmente/no banco.
  const cleanupGoogleEvents = (removed: Meeting[]) => {
    const targets = removed
      .filter((m) => m.criadorId)
      .map((m) => ({ meetingId: m.id, criadorId: m.criadorId, googleEventId: m.googleEventId }));
    if (targets.length === 0) return;
    deleteGoogleEventsFn({ data: targets }).catch(() => {});
  };
  useEffect(() => onMeetingsChange(() => setMeetings(loadMeetings())), []);
  useEffect(() => onDisponibilidadesChange(() => setDisponibilidades(loadDisponibilidades())), []);

  const { confirm: confirmDelete, confirmDialog: deleteConfirmDialog } = useConfirm();
  const { confirmChoice: confirmDeleteChoice, confirmChoiceDialog: deleteChoiceDialog } =
    useConfirmChoice<"this" | "all">();
  const { confirmChoice: confirmSeriesChoice, confirmChoiceDialog: seriesChoiceDialog } =
    useConfirmChoice<"this" | "all">();

  // Único ponto que exclui uma reunião — usado tanto pelo formulário
  // (`MeetingDialog`) quanto pelo resumo (`MeetingSummaryDialog`), pra não
  // duplicar a lógica de "é série ou não" nos dois. Reunião sem `seriesId`
  // (ou cuja série já ficou com só ela mesma depois de exclusões
  // anteriores) usa a confirmação binária de sempre; com irmãs de verdade,
  // pergunta "só esta ou todas".
  const requestDeleteMeeting = async (id: string) => {
    const alvo = meetings.find((m) => m.id === id);
    if (!alvo) return;
    const siblings = alvo.seriesId ? meetings.filter((m) => m.seriesId === alvo.seriesId) : [];
    if (siblings.length > 1) {
      const choice = await confirmDeleteChoice(
        `"${alvo.titulo}" faz parte de uma série de ${siblings.length} reuniões recorrentes. O que você quer excluir?`,
        [
          { value: "this", label: "Só esta" },
          { value: "all", label: `Todas (${siblings.length})` },
        ],
      );
      if (!choice) return;
      const removed = choice === "all" ? siblings : [alvo];
      persist(
        choice === "all"
          ? meetings.filter((m) => m.seriesId !== alvo.seriesId)
          : meetings.filter((m) => m.id !== id),
      );
      cleanupGoogleEvents(removed);
    } else {
      const ok = await confirmDelete(
        `Excluir a reunião "${alvo.titulo}"? Essa ação não pode ser desfeita.`,
      );
      if (!ok) return;
      persist(meetings.filter((m) => m.id !== id));
      cleanupGoogleEvents([alvo]);
    }
    setDialog(null);
    setSummary(null);
  };

  // Mesmo espírito de `requestDeleteMeeting` — usado tanto pela lista de
  // Solicitações quanto pelo resumo, pra "é série ou não" não ficar
  // duplicado nos dois. Confirmar/recusar uma ocorrência que faz parte de
  // uma série pergunta se é só aquela ou a série inteira; avulsa continua
  // confirmando/recusando direto, sem pergunta.
  const requestConfirmMeeting = async (m: Meeting) => {
    const siblings = m.seriesId ? meetings.filter((x) => x.seriesId === m.seriesId) : [];
    if (siblings.length > 1) {
      const choice = await confirmSeriesChoice(
        `"${m.titulo}" faz parte de uma série de ${siblings.length} reuniões recorrentes. Confirmar presença em:`,
        [
          { value: "this", label: "Só esta" },
          { value: "all", label: `Todas (${siblings.length})` },
        ],
      );
      if (!choice) return;
      persist(
        meetings.map((x) =>
          (choice === "all" ? x.seriesId === m.seriesId : x.id === m.id)
            ? confirmMeetingFor(x, me.id)
            : x,
        ),
      );
    } else {
      persist(meetings.map((x) => (x.id === m.id ? confirmMeetingFor(x, me.id) : x)));
    }
  };

  const requestDeclineMeeting = async (m: Meeting) => {
    const siblings = m.seriesId ? meetings.filter((x) => x.seriesId === m.seriesId) : [];
    if (siblings.length > 1) {
      const choice = await confirmSeriesChoice(
        `"${m.titulo}" faz parte de uma série de ${siblings.length} reuniões recorrentes. Recusar:`,
        [
          { value: "this", label: "Só esta" },
          { value: "all", label: `Todas (${siblings.length})` },
        ],
      );
      if (!choice) return;
      persist(
        meetings.map((x) =>
          (choice === "all" ? x.seriesId === m.seriesId : x.id === m.id)
            ? declineMeetingFor(x, me.id)
            : x,
        ),
      );
    } else {
      persist(meetings.map((x) => (x.id === m.id ? declineMeetingFor(x, me.id) : x)));
    }
  };

  // Só reuniões onde a pessoa é criadora ou foi convidada — o calendário
  // deixou de mostrar tudo do workspace pra todo mundo.
  const myMeetings = useMemo(
    () => meetings.filter((m) => m.criadorId === me.id || m.participanteIds?.includes(me.id)),
    [meetings, me.id],
  );

  // Reflete atualizações vindas do resumo (confirmar/recusar/sugerir/aceitar).
  useEffect(() => {
    if (!summary) return;
    const fresh = meetings.find((m) => m.id === summary.id);
    setSummary(fresh ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, summary?.id]);

  const today = toISODate(new Date());
  // "Confirmadas" saiu do KPI: `meetingDisplayStatus` só considera uma
  // reunião "Confirmada" com 2+ confirmações, um critério pensado pra
  // convites entre pessoas na plataforma — não faz sentido pra reuniões
  // importadas do Google (ex: uma daily onde só o dono da conta usa a
  // plataforma), e misturado com "Pendentes" dava números que pareciam
  // inconsistentes (muitas "próximas", nenhuma "confirmada"). Métricas
  // novas são contagens diretas, sem depender desse critério.
  const semanaLimite = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return toISODate(d);
  })();
  const hojeCount = myMeetings.filter((m) => m.data === today && m.status !== "Cancelada").length;
  const semanaCount = myMeetings.filter(
    (m) => m.data >= today && m.data <= semanaLimite && m.status !== "Cancelada",
  ).length;
  // 1 solicitação por série, nunca 1 por ocorrência — mesmo dedupe por
  // `seriesId` usado em `SolicitacoesTab`, pra esse resumo nunca mostrar um
  // número maior do que o que a aba de Solicitações realmente lista.
  const pendentesSeries = new Set<string>();
  const pendentes = myMeetings.filter((m) => {
    if (!meetingNeedsMyAction(m, me.id)) return false;
    const key = m.seriesId ?? m.id;
    if (pendentesSeries.has(key)) return false;
    pendentesSeries.add(key);
    return true;
  }).length;

  const openSummary = (m: Meeting) => {
    setSummaryProposing(false);
    setSummary(m);
  };
  const openSummaryProposing = (m: Meeting) => {
    setSummaryProposing(true);
    setSummary(m);
  };

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-muted p-4 dark:bg-transparent md:-m-8 md:p-8">
      <PageContainer className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[28px] font-bold leading-[1.1] tracking-tight text-foreground md:text-[32px]">
              Reuniões
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Organize seus compromissos e acompanhe sua agenda.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <JoinByLinkDialog />
            <Button variant="primary" size="comfortable" onClick={() => openNewMeeting()}>
              <Plus className="h-4 w-4" /> Nova reunião
            </Button>
          </div>
        </div>

        {/* Controles de visualização — pertencem só ao conteúdo desta
         * página, nunca uma barra de navegação global nova. O
         * `SegmentedControl` alterna só Agenda/Calendário (o mesmo
         * conteúdo, duas visualizações); Solicitações é uma página à
         * parte, por isso vira um botão separado, com badge só quando há
         * pendência real (mesma contagem deduplicada por série de
         * `pendentes`, nunca a contagem crua de ocorrências). */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            aria-label="Alternar entre Agenda e Calendário"
            value={view === "calendar" ? "calendar" : "agenda"}
            onChange={setView}
            options={GRID_VIEW_OPTIONS}
          />
          <Button
            variant={view === "requests" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setView("requests")}
          >
            <Inbox className="h-3.5 w-3.5" /> Solicitações
            {pendentes > 0 && (
              <Badge variant="destructive" className="ml-0.5 px-1.5 py-0 text-[10px]">
                {pendentes}
              </Badge>
            )}
          </Button>
        </div>

        {view === "agenda" && (
          <AgendaView
            meetings={myMeetings}
            me={me}
            team={team}
            onOpen={openSummary}
            onNewMeeting={() => openNewMeeting()}
            hojeCount={hojeCount}
            semanaCount={semanaCount}
            pendentes={pendentes}
          />
        )}

        {view === "calendar" && (
          <CalendarView
            meetings={myMeetings}
            me={me}
            team={team}
            disponibilidades={disponibilidades}
            onOpen={openSummary}
            onNewMeeting={(iso, hora) => openNewMeeting(iso, hora)}
            onSaveAvailability={(next) => saveMyDisponibilidade(next)}
          />
        )}

        {view === "requests" && (
          <SolicitacoesTab
            meetings={myMeetings}
            me={me}
            onOpen={openSummary}
            onOpenProposing={openSummaryProposing}
            onConfirm={(m) => void requestConfirmMeeting(m)}
            onDecline={(m) => void requestDeclineMeeting(m)}
          />
        )}

        <MeetingDialog
          open={!!dialog}
          initial={dialog?.data}
          seriesSize={
            dialog?.data?.seriesId
              ? meetings.filter((m) => m.seriesId === dialog.data!.seriesId).length
              : 0
          }
          defaultDate={newMeetingDate}
          defaultHora={newMeetingHora}
          me={me}
          disponibilidades={disponibilidades}
          meetings={meetings}
          onClose={() => {
            setDialog(null);
            setSyncFeedback(null);
          }}
          onDelete={(id) => void requestDeleteMeeting(id)}
          syncState={syncFeedback?.status ?? "idle"}
          syncError={syncFeedback?.error}
          onRetrySync={syncFeedback ? () => runDialogSync(syncFeedback.ids) : undefined}
          onSave={(saved, opts) => {
            if (dialog?.mode === "edit" && saved.length === 1) {
              const m = saved[0];
              if (opts?.applyToSeries && m.seriesId) {
                // Só os campos compartilhados da série — cada ocorrência
                // mantém sua própria data e todo estado por-ocorrência
                // (confirmações, presença, reagendamento etc.).
                const {
                  id: _id,
                  data: _data,
                  status: _status,
                  confirmedBy: _confirmedBy,
                  declinedBy: _declinedBy,
                  rescheduleProposal: _rescheduleProposal,
                  attendedBy: _attendedBy,
                  attendanceRecorded: _attendanceRecorded,
                  transcricao: _transcricao,
                  criadorId: _criadorId,
                  seriesId: _seriesId,
                  ...sharedPatch
                } = m;
                persist(
                  meetings.map((x) =>
                    x.id === m.id ? m : x.seriesId === m.seriesId ? { ...x, ...sharedPatch } : x,
                  ),
                );
              } else {
                persist(meetings.map((x) => (x.id === m.id ? m : x)));
              }
            } else {
              persist([...meetings, ...saved]);
            }
            runDialogSync(saved.map((s) => s.id));
          }}
        />

        <MeetingSummaryDialog
          meeting={summary}
          me={me}
          initialProposing={summaryProposing}
          onClose={() => setSummary(null)}
          onEdit={(m) => {
            setSummary(null);
            setDialog({ mode: "edit", data: m });
            setSyncFeedback(null);
          }}
          onChange={(m) => persist(meetings.map((x) => (x.id === m.id ? m : x)))}
          onConfirm={(m) => void requestConfirmMeeting(m)}
          onDecline={(m) => void requestDeclineMeeting(m)}
          onDelete={(id) => void requestDeleteMeeting(id)}
        />

        {deleteConfirmDialog}
        {deleteChoiceDialog}
        {seriesChoiceDialog}
      </PageContainer>
    </div>
  );
}
