import { useEffect, useState } from "react";
import { linkifyText } from "@/lib/linkify";

/**
 * Pessoas e motivos de replanejamento de tarefa — peças pequenas e SEM dependência do
 * workspace de tarefas, extraídas de `TaskBoard.tsx` (≈5.400 linhas, ~600 KB no bundle)
 * para que Início, Mural e Time possam usá-las sem carregar o editor inteiro.
 * `TaskBoard` re-exporta tudo daqui, então os imports antigos continuam válidos.
 */

/** As 7 opções fixas do motivo de replanejamento — enum fechado (não
 * texto livre) porque o motivo alimenta `exemptFromResponsibility`
 * automaticamente, e isso precisa ser previsível. */
export const DEADLINE_CHANGE_MOTIVOS = [
  "dependencia_cliente",
  "mudanca_escopo",
  "prioridade_lideranca",
  "dependencia_interna",
  "replanejamento_operacional",
  "atraso_responsavel",
  "outro",
] as const;
export type DeadlineChangeMotivo = (typeof DEADLINE_CHANGE_MOTIVOS)[number];

export const DEADLINE_CHANGE_MOTIVO_LABEL: Record<DeadlineChangeMotivo, string> = {
  dependencia_cliente: "Dependência do cliente",
  mudanca_escopo: "Mudança de escopo",
  prioridade_lideranca: "Prioridade alterada pela liderança",
  dependencia_interna: "Dependência interna",
  replanejamento_operacional: "Replanejamento operacional",
  atraso_responsavel: "Atraso do responsável",
  outro: "Outro",
};

export type Member = { id?: string; name: string; initials: string; color: string; photo?: string };

const AVATAR_COLORS = [
  "bg-rose-500 text-white",
  "bg-sky-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-500 text-white",
  "bg-violet-500 text-white",
  "bg-teal-500 text-white",
  "bg-fuchsia-500 text-white",
  "bg-orange-500 text-white",
];
export function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
export function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function readTeamMembers(): Member[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("time:membros");
    const arr = raw
      ? (JSON.parse(raw) as Array<{ id?: string; name?: string; photo?: string }>)
      : [];
    const seen = new Set<string>();
    const out: Member[] = [];
    for (const m of arr) {
      const name = (m.name ?? "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({
        id: m.id,
        name,
        initials: initialsOf(name) || "?",
        color: colorFor(name),
        photo: m.photo,
      });
    }
    return out;
  } catch {
    return [];
  }
}
/** Exportado pra fora de TaskBoard.tsx — reaproveitado pela @menção dos
 * comentários de artigo do Mural (`ArticleReader.tsx`), mesma lista de
 * pessoas mencionáveis usada nas tarefas, sem duplicar a leitura de
 * `time:membros`. */
export function useTeamMembers(): Member[] {
  const [members, setMembers] = useState<Member[]>(() => readTeamMembers());
  useEffect(() => {
    const upd = () => setMembers(readTeamMembers());
    window.addEventListener("time:membros:changed", upd);
    window.addEventListener("storage", upd);
    return () => {
      window.removeEventListener("time:membros:changed", upd);
      window.removeEventListener("storage", upd);
    };
  }, []);
  return members;
}

export function Avatar({ member, size = 20 }: { member: Member; size?: number }) {
  const cls = `flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold ${member.photo ? "bg-muted" : member.color}`;
  return (
    <span className={cls} style={{ width: size, height: size }} title={member.name}>
      {member.photo ? (
        <img src={member.photo} alt="" className="h-full w-full object-cover" />
      ) : (
        member.initials
      )}
    </span>
  );
}

export function renderMentions(text: string, members: Member[]) {
  const parts = text.split(/(@[\wÀ-ÿ]+(?:\s[\wÀ-ÿ]+)?)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      const name = p.slice(1);
      const match = members.find((m) => m.name.toLowerCase().startsWith(name.toLowerCase()));
      if (match) {
        return (
          <span key={i} className="rounded bg-foreground/10 px-1 font-medium text-primary">
            @{match.name}
          </span>
        );
      }
    }
    return <span key={i}>{linkifyText(p, `mention-link-${i}`)}</span>;
  });
}
