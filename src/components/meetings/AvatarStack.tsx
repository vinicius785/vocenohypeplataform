import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

export type AvatarPerson = { id: string; name: string; photo?: string };

/** Avatares empilhados com sobreposição — até `max`, e um "+N" se sobrar.
 * Hover mostra a lista completa de nomes via tooltip. Substitui o
 * `MiniAvatar` manual que estava espalhado por `ReunioesSection.tsx`. */
export function AvatarStack({
  people,
  max = 3,
  size = "sm",
}: {
  people: AvatarPerson[];
  max?: number;
  size?: "sm" | "md";
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const rest = people.slice(max);
  const dim = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex shrink-0 -space-x-2">
            {shown.map((p) => (
              <Avatar key={p.id} className={`${dim} border-2 border-background`}>
                {p.photo && <AvatarImage src={p.photo} alt="" />}
                <AvatarFallback className={`${textSize} font-medium`}>
                  {p.name.trim()[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
            ))}
            {rest.length > 0 && (
              <span
                className={`grid ${dim} place-items-center rounded-full border-2 border-background bg-muted ${textSize} font-medium text-muted-foreground`}
              >
                +{rest.length}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>{people.map((p) => p.name).join(", ")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
