import { stageComercialTask } from "@/lib/comercial-task-link";
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTaskDirectory, type TaskDirectoryEntry } from "@/lib/task-directory";
import type { ChatMention } from "@/lib/chat-store";
import {
  OPEN_CAMPANHA_TASK_KEY,
  OPEN_CLIENTE_KEY,
  OPEN_MEMBER_KEY,
  type SectionKey,
} from "@/components/AppShell";
import { EVERYONE_MENTION_ID } from "@/lib/mention-kinds";

/** Mesmo dispatch de navegação por @menção que `ChatSection.tsx` (V1) já
 * tinha (`openMention`/`openTask`) — Chat V2 ainda não tinha NENHUMA forma de
 * abrir uma menção (o texto era renderizado como string simples, sem
 * badges). Reimplementado aqui (em vez de importar de `ChatSection.tsx`,
 * que não exporta essas funções) pra não arriscar tocar no V1. */
export function useMentionNavigation() {
  const tasks = useTaskDirectory();
  const taskInfoById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const navigate = useNavigate();

  const openTask = (taskId: string) => {
    const t = taskInfoById.get(taskId);
    if (!t) return;
    if (t.comercial) {
      stageComercialTask(t.rawId);
      navigate({ to: "/time", search: { section: "comercial" satisfies SectionKey } });
      return;
    }
    if (t.campanhaId) {
      sessionStorage.setItem(
        OPEN_CAMPANHA_TASK_KEY,
        JSON.stringify({ campanhaId: t.campanhaId, taskId }),
      );
      navigate({ to: "/time", search: { section: "campanhas" satisfies SectionKey } });
      return;
    }
    navigate({ to: "/projeto/$id", params: { id: t.projectId }, search: { taskId } });
  };

  const openMemberProfile = (memberId: string) => {
    sessionStorage.setItem(OPEN_MEMBER_KEY, JSON.stringify({ memberId }));
    navigate({ to: "/time", search: { section: "time" satisfies SectionKey } });
  };

  const openCliente = (clienteId: string) => {
    sessionStorage.setItem(OPEN_CLIENTE_KEY, JSON.stringify({ clienteId }));
    navigate({ to: "/time", search: { section: "clientes" satisfies SectionKey } });
  };

  const openCampanha = (campanhaId: string) => {
    sessionStorage.setItem(OPEN_CAMPANHA_TASK_KEY, JSON.stringify({ campanhaId }));
    navigate({ to: "/time", search: { section: "campanhas" satisfies SectionKey } });
  };

  const openMention = (m: ChatMention) => {
    if (m.kind === "task") return openTask(m.id);
    if (m.kind === "user") {
      if (m.id === EVERYONE_MENTION_ID) return;
      return openMemberProfile(m.id);
    }
    if (m.kind === "project") {
      navigate({ to: "/projeto/$id", params: { id: m.id } });
      return;
    }
    if (m.kind === "campaign") return openCampanha(m.id);
    if (m.kind === "client") return openCliente(m.id);
  };

  return { openMention, openTask, taskInfoById };
}

export type { TaskDirectoryEntry };
