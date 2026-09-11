import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { deleteGoogleEventsForMeetings } from "@/lib/google-calendar.functions";
import { Button } from "@/components/ui/button";
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

export function ReunioesSection() {
  const me = getMe();
  const search = useSearch({ from: "/_authenticated/time" });
  // A subpágina ativa mora na URL e é escolhida pelos subitens de
  // "Reuniões" na sidebar (mesmo mecanismo de `?financeiroTab=` em
  // Financeiro, ver `time.tsx`'s `onSelectSubTab`) — sobrevive a um
  // refresh e permite link direto pra Calendário/Solicitações.
  // "Disponibilidade" saiu daqui na Etapa 3 (mudou pra Configurações) —
  // um valor antigo na URL cai no default via `resolveReunioesView`.
  const view: ReunioesView = resolveReunioesView(search.reunioesView);

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
  };
  const [summary, setSummary] = useState<Meeting | null>(null);
  const [summaryProposing, setSummaryProposing] = useState(false);

  const persist = (next: Meeting[]) => {
    setMeetings(next);
    saveMeetings(next);
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
  const pendentes = myMeetings.filter((m) => meetingNeedsMyAction(m, me.id)).length;

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
            <p className="text-[36px] font-bold leading-[1.05] tracking-tight text-foreground md:text-[42px]">
              Reuniões
            </p>
            <p className="mt-1.5 text-sm text-text-secondary">
              Sua agenda e reuniões em um só lugar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <JoinByLinkDialog />
            <Button variant="primary" size="comfortable" onClick={() => openNewMeeting()}>
              <Plus className="h-4 w-4" /> Nova reunião
            </Button>
          </div>
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

        {view === "calendario" && (
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

        {view === "solicitacoes" && (
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
          onClose={() => setDialog(null)}
          onDelete={(id) => void requestDeleteMeeting(id)}
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
            setDialog(null);
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
