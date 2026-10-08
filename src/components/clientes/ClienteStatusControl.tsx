import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Cliente } from "@/lib/clientes-store";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { campanhaStatus } from "@/components/campanhas/campanha-ui";
import {
  CLIENTE_STATUS_LABEL,
  CLIENTE_STATUS_TRANSITIONS,
  activeCampaignsBlockingClienteStatus,
  buildClienteStatusChangePatch,
  clienteStatus,
  type ClienteStatus,
} from "./cliente-ui";

/** Texto de AÇÃO de cada destino (mesma convenção de
 * `CAMPANHA_STATUS_TRANSITIONS.actionLabel`: "Ativar cliente", nunca "Mudar
 * para Ativo"). */
const ACTION_LABEL: Record<ClienteStatus, string> = {
  capture: "Voltar para captação",
  active: "Ativar cliente",
  closed: "Encerrar cliente",
  archived: "Arquivar cliente",
};

const CONFIRM_MESSAGE: Record<ClienteStatus, string> = {
  capture: "O cliente voltará a ser considerado em captação.",
  active: "O cliente passará a ser considerado ativo e entrará nos indicadores operacionais.",
  closed: "O cliente será marcado como encerrado. Seus dados e campanhas continuarão disponíveis.",
  archived: "O cliente será removido das visualizações padrão, mas nenhum dado será apagado.",
};

type Pending = { next: ClienteStatus; title: string; blocking: Campaign[] };

/**
 * Mudança de status de cliente pós-criação (Fase 3) — replica o padrão já
 * usado no cabeçalho da campanha (`CampanhasSection.tsx`): o próprio badge de
 * status é o gatilho de um `DropdownMenu` com as transições válidas;
 * arquivar/restaurar reservado a admin; confirmação num `AlertDialog`; e o
 * histórico num `<details>` "Histórico de status (N)". Diferença: o dialog
 * aqui tem campo de observação opcional e, ao encerrar/arquivar com campanha
 * ativa, lista as campanhas afetadas (confirmação explícita, nunca bloqueio
 * silencioso nem rígido).
 */
export function ClienteStatusControl({
  cliente,
  canChange,
  canArchiveOrRestore,
  onApply,
  showHistory = true,
}: {
  cliente: Cliente;
  canChange: boolean;
  canArchiveOrRestore: boolean;
  onApply: (patch: Partial<Cliente>) => void;
  /** Mostra o `<details>` de histórico de status. A Central do Cliente tem a própria timeline. */
  showHistory?: boolean;
}) {
  const status = clienteStatus(cliente);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");

  const allTransitions = CLIENTE_STATUS_TRANSITIONS[status];
  const canGoArchived = allTransitions.includes("archived");
  // Sair de "arquivado" (restaurar) é reservado a quem pode arquivar/
  // restaurar, mesma regra de sempre — as outras transições seguem `canChange`.
  const transitions =
    status === "archived"
      ? canArchiveOrRestore
        ? allTransitions
        : []
      : allTransitions.filter((t) => t !== "archived");
  const enabled =
    status === "archived"
      ? canArchiveOrRestore && transitions.length > 0
      : canChange && (transitions.length > 0 || (canArchiveOrRestore && canGoArchived));

  const request = (next: ClienteStatus, title: string) => {
    setReason("");
    setPending({
      next,
      title,
      blocking: activeCampaignsBlockingClienteStatus(cliente, next, campanhaStatus),
    });
  };

  const confirm = () => {
    if (!pending) return;
    onApply(buildClienteStatusChangePatch(cliente, pending.next, reason));
    setPending(null);
  };

  const activity = [...(cliente.activity ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={!enabled} className="disabled:cursor-default">
            <Badge
              variant={
                status === "active" ? "success" : status === "closed" ? "secondary" : "outline"
              }
              className={enabled ? "cursor-pointer hover:opacity-80" : ""}
            >
              {CLIENTE_STATUS_LABEL[status]}
            </Badge>
          </button>
        </DropdownMenuTrigger>
        {enabled && (
          <DropdownMenuContent align="start">
            {transitions.map((to) => (
              <DropdownMenuItem key={to} onSelect={() => request(to, ACTION_LABEL[to])}>
                {ACTION_LABEL[to]}
              </DropdownMenuItem>
            ))}
            {canArchiveOrRestore && canGoArchived && (
              <DropdownMenuItem
                onSelect={() => request("archived", ACTION_LABEL.archived)}
                className="text-destructive focus:text-destructive"
              >
                {ACTION_LABEL.archived}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        )}
      </DropdownMenu>

      {showHistory && activity.length > 0 && (
        <details className="group w-56 text-xs text-text-secondary sm:w-96">
          <summary className="cursor-pointer select-none font-medium hover:text-foreground">
            Histórico de status ({activity.length})
          </summary>
          <ul className="mt-2 space-y-1.5 border-l border-border/60 pl-3">
            {activity.map((entry) => (
              <li key={entry.id}>
                <span className="font-medium text-foreground">{entry.author}</span> {entry.action}
                <span className="ml-1.5 text-text-secondary/70">
                  ·{" "}
                  {new Date(entry.createdAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
                {entry.reason && (
                  <p className="mt-0.5 italic text-text-secondary">“{entry.reason}”</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending &&
                `${CLIENTE_STATUS_LABEL[status]} → ${CLIENTE_STATUS_LABEL[pending.next]}. ${
                  CONFIRM_MESSAGE[pending.next]
                }`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* "Encerrar" com campanha ativa é BLOQUEIO de verdade (item 10 do
           * pedido de reconstrução do domínio Comercial/Clientes/Campanhas/
           * Contratos/Financeiro: "Ao encerrar cliente com campanha ativa:
           * Bloquear inicialmente... Exigir conclusão, arquivamento ou
           * tratamento explícito") — diferente de arquivar, que só pede
           * confirmação e preserva tudo sem exigir tratar antes. */}
          {pending && pending.blocking.length > 0 && pending.next === "closed" ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <p className="font-medium">
                Este cliente tem {pending.blocking.length}{" "}
                {pending.blocking.length === 1 ? "campanha ativa" : "campanhas ativas"} — trate-as
                antes de encerrar:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {pending.blocking.map((c) => (
                  <li key={c.id}>{c.nome || "Campanha sem nome"}</li>
                ))}
              </ul>
              <p className="mt-1">
                Conclua ou arquive cada campanha ativa na página da campanha antes de encerrar o
                cliente.
              </p>
            </div>
          ) : (
            pending &&
            pending.blocking.length > 0 && (
              <div
                role="alert"
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
              >
                <p className="font-medium">
                  Este cliente tem {pending.blocking.length}{" "}
                  {pending.blocking.length === 1 ? "campanha ativa" : "campanhas ativas"}:
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {pending.blocking.map((c) => (
                    <li key={c.id}>{c.nome || "Campanha sem nome"}</li>
                  ))}
                </ul>
                <p className="mt-1">Elas serão preservadas, sem nenhuma alteração.</p>
              </div>
            )
          )}
          {!(pending && pending.blocking.length > 0 && pending.next === "closed") && (
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-foreground">Observação (opcional)</span>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo da mudança"
                rows={2}
              />
            </label>
          )}
          <AlertDialogFooter>
            {pending && pending.blocking.length > 0 && pending.next === "closed" ? (
              <AlertDialogAction onClick={() => setPending(null)}>Entendi</AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirm}>Confirmar</AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
