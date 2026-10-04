import {
  formatActivityWhen,
  type DemoTimelineActor,
  type DemoTimelineEntry,
} from "@/lib/demo/demo-timeline";

const ACTOR_LABEL: Record<DemoTimelineActor, string> = {
  cliente: "Cliente",
  equipe: "Time",
  sistema: "Sistema",
};

const ACTOR_DOT: Record<DemoTimelineActor, string> = {
  cliente: "bg-info",
  equipe: "bg-brand",
  sistema: "bg-text-secondary",
};

/** Lista da narrativa da demonstração (só apresentação). */
export function DemoActivityList({ entries }: { entries: DemoTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        Nada aconteceu ainda. As aprovações, ajustes e comentários aparecem aqui.
      </p>
    );
  }
  return (
    <ul className="space-y-4 border-l border-border/60 pl-5">
      {entries.map((e) => (
        <li key={e.id} className="relative text-sm">
          <span
            aria-hidden="true"
            className={`absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ${ACTOR_DOT[e.actor]}`}
          />
          <p className="font-medium text-foreground [overflow-wrap:anywhere]">{e.text}</p>
          {e.detail && (
            <p className="mt-0.5 text-text-secondary [overflow-wrap:anywhere]">{e.detail}</p>
          )}
          <p className="mt-0.5 text-xs tabular-nums text-text-secondary">
            {ACTOR_LABEL[e.actor]} · {formatActivityWhen(e.at)}
          </p>
        </li>
      ))}
    </ul>
  );
}
