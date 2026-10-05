import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, type Member } from "@/components/tasks/task-people";
import {
  EDITORIAL_STATUS_DOT,
  EDITORIAL_STATUS_LABEL,
  overdueDays,
  overdueLabel,
  type EditorialItem,
  type EditorialStatus,
  channelFormatLabel,
} from "@/lib/marketing-editorial";
import { cn } from "@/lib/utils";

export function EditorialStatusDot({
  status,
  className,
}: {
  status: EditorialStatus;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        EDITORIAL_STATUS_DOT[status],
        className,
      )}
    />
  );
}

/** Ponto + nome do status. A cor é só o pontinho; o texto fica neutro. */
export function EditorialStatusBadge({ status }: { status: EditorialStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
      <EditorialStatusDot status={status} />
      {EDITORIAL_STATUS_LABEL[status]}
    </span>
  );
}

function memberById(members: Member[], id: string | null | undefined): Member | undefined {
  return id ? members.find((m) => m.id === id) : undefined;
}

/** Foto (ou iniciais) + nome do responsável. */
export function MemberInline({
  members,
  id,
  size = 20,
  showName = true,
}: {
  members: Member[];
  id: string | null | undefined;
  size?: number;
  showName?: boolean;
}) {
  const m = memberById(members, id);
  if (!m) {
    return showName ? <span className="text-xs text-text-secondary">Sem responsável</span> : null;
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar member={m} size={size} />
      {showName && <span className="min-w-0 truncate text-xs text-foreground">{m.name}</span>}
    </span>
  );
}

/** Item compacto (célula do calendário e popover do dia): linha lateral do status, título e uma
 * segunda linha com horário/canal/formato — ou o atraso, em destaque discreto. */
export function EditorialChip({
  item,
  today,
  onOpen,
}: {
  item: EditorialItem;
  today: string;
  onOpen: (id: string) => void;
}) {
  const late = overdueDays(item, today);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item.id);
      }}
      title={`${item.titulo} — ${EDITORIAL_STATUS_LABEL[item.status]}`}
      className={cn(
        "relative block w-full rounded-md bg-muted/40 py-1 pl-2.5 pr-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        item.status === "cancelado" && "opacity-60",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute bottom-1 left-1 top-1 w-0.5 rounded-full",
          EDITORIAL_STATUS_DOT[item.status],
        )}
      />
      <span
        className={cn(
          "block truncate text-xs font-medium text-foreground",
          item.status === "cancelado" && "line-through",
        )}
      >
        {item.hora && <span className="font-normal text-text-secondary">{item.hora} </span>}
        {item.titulo}
      </span>
      <span
        className={cn(
          "block truncate text-[11px]",
          late > 0 ? "text-danger" : "text-text-secondary",
        )}
      >
        {late > 0 ? overdueLabel(late) : channelFormatLabel(item)}
      </span>
    </button>
  );
}

/** Seletor de responsável com foto e nome (lista do time). */
export function ResponsavelPicker({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const withId = members.filter((m) => m.id);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {memberById(members, value) ? (
            <MemberInline members={members} id={value} size={20} />
          ) : (
            <span className="text-text-secondary">Sem responsável</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <ul className="max-h-64 overflow-y-auto">
          <li>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-muted"
            >
              <span className="h-5 w-5 rounded-full border border-dashed border-border" />
              Sem responsável
              {value === null && <Check className="ml-auto h-3.5 w-3.5" />}
            </button>
          </li>
          {withId.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(m.id ?? null);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Avatar member={m} size={20} />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {value === m.id && <Check className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
