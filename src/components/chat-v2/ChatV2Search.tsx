import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { routeForConvoId } from "./chat-v2-utils";

type SearchResult = {
  id: string;
  convo_id: string;
  author_name: string;
  author_photo: string | null;
  text: string;
  created_at: string;
};

function formatResultDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Realça (sem HTML arbitrário) a ocorrência do termo buscado dentro do
 * trecho de texto exibido no resultado. */
function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-brand/30 text-foreground">
        {text.slice(idx, idx + query.trim().length)}
      </mark>
      {text.slice(idx + query.trim().length)}
    </>
  );
}

export function ChatV2Search({
  value,
  onChange,
  meId,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Id do usuário atual — necessário pra resolver a rota de DMs a partir
   * do `convo_id` retornado pela busca. Opcional só pra não quebrar
   * eventuais outros usos do componente sem essa info disponível ainda. */
  meId?: string;
}) {
  const navigate = useNavigate();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const q = value.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!meId || q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("search_chat_messages", {
        p_query: q,
        p_limit: 20,
      });
      setLoading(false);
      if (error) {
        setResults([]);
        return;
      }
      setResults((data ?? []) as SearchResult[]);
      setOpen(true);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, meId]);

  const goToResult = (r: SearchResult) => {
    if (!meId) return;
    const route = routeForConvoId(r.convo_id, meId);
    if (!route) return;
    setOpen(false);
    void navigate({
      to: route.to,
      params: route.params,
      search: (prev: Record<string, unknown>) => ({ ...prev, highlight: r.id }),
    } as never);
  };

  return (
    <div className="relative px-3.5 pb-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar conversas ou mensagens"
          className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
      </div>
      {open && meId && value.trim().length >= 2 && (
        <div className="absolute inset-x-3.5 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {loading && (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">Buscando mensagens…</p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">
              Nenhuma mensagem encontrada.
            </p>
          )}
          {!loading &&
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => goToResult(r)}
                className="flex w-full flex-col gap-0.5 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-muted"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {r.author_name}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatResultDate(r.created_at)}
                  </span>
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {highlightMatch(r.text, value)}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
