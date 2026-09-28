import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageSquare, Send } from "lucide-react";
import { addInfluClienteComentario } from "@/lib/portal-auth.functions";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { InfluencerDrawerSection } from "./InfluencerDrawerSection";
import type { PublicComment } from "@/lib/portal-types";

/**
 * Comentários — conversa contextual real (`Influ.clienteComments`, canal
 * separado da conversa interna do time), nunca mais um campo único de
 * observação. Sempre ACRESCENTA (nunca sobrescreve o array anterior — a
 * mutação no servidor já garante isso, ver `addInfluClienteComentario`).
 * Visualizador não comenta (mesma regra de `assertCanMutate` do resto do
 * portal — "não amplia permissões").
 */
export function ClientInfluencerComments({
  comments,
  campanhaId,
  influencerId,
}: {
  comments: PublicComment[];
  campanhaId: string;
  influencerId: string;
}) {
  const { reload, readOnly } = usePortalSessionData();
  const queryClient = useQueryClient();
  const addCommentFn = useServerFn(addInfluClienteComentario);
  const [text, setText] = useState("");

  const mutation = useMutation({
    mutationFn: (vars: { text: string }) =>
      addCommentFn({ data: { campanhaId, influencerId, ...vars } }),
    onSuccess: () => {
      reload();
      queryClient.invalidateQueries();
      setText("");
    },
    onError: () => toast.error("Não foi possível enviar o comentário. Tente novamente."),
  });

  return (
    <InfluencerDrawerSection
      icon={<MessageSquare className="h-4 w-4" />}
      title="Comentários"
      description={comments.length > 0 ? `${comments.length}` : undefined}
    >
      {comments.length === 0 ? (
        <p className="rounded-2xl bg-card p-4 text-xs text-text-secondary dark:shadow-none">
          Nenhum comentário ainda.
        </p>
      ) : (
        <div className="space-y-2 rounded-2xl bg-card p-3 dark:shadow-none">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${c.color}`}
              >
                {c.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-xs font-medium text-foreground">{c.author}</p>
                  <p className="text-[11px] text-text-secondary">
                    {new Date(c.createdAt).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva um comentário..."
            className="min-h-[38px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && text.trim()) {
                e.preventDefault();
                mutation.mutate({ text: text.trim() });
              }
            }}
          />
          <button
            type="button"
            disabled={!text.trim() || mutation.isPending}
            onClick={() => mutation.mutate({ text: text.trim() })}
            className="flex shrink-0 items-center justify-center rounded-md bg-brand px-3 text-brand-foreground disabled:opacity-50"
            aria-label="Enviar comentário"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
    </InfluencerDrawerSection>
  );
}
