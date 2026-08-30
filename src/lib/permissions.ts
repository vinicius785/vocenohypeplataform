import { useEffect, useState } from "react";
import { getMe } from "@/lib/chat-store";

export type Permission =
  | "clientes"
  | "campanhas"
  | "projetos"
  | "reunioes"
  | "comercial"
  | "financeiro"
  | "time"
  | "influenciadores"
  | "metas"
  | "chat"
  | "senhas"
  | "configuracoes"
  | "configuracoes:perfil"
  | "configuracoes:workspace"
  | "configuracoes:av"
  | "configuracoes:senhas"
  /** "Gerenciar membros" — exibida em Configurações → Time e permissões,
   * mas ainda DECORATIVA: criar/editar/excluir membro e redefinir senha
   * continuam exigindo `isAdmin` de verdade no servidor
   * (`team.functions.ts`'s `assertAdmin`). Ligar essa permissão de fato
   * exigiria separar o campo `role` (promover a admin) num endpoint à
   * parte antes de liberar pra não-admins — risco de escalação de
   * privilégio não assumido nesta rodada. Ver CLAUDE.md, "Known
   * incomplete work". */
  | "membros"
  /** Dados bancários (PIX/conta) de influenciador — separado de
   * `influenciadores` (perfil geral). Aplicado em
   * `InfluencerBoard.tsx`. */
  | "influenciadores:bancario";

export const CONFIG_SUB_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "configuracoes:perfil", label: "Meu Perfil" },
  { key: "configuracoes:workspace", label: "Workspace" },
  { key: "configuracoes:av", label: "Áudio e Vídeo" },
  { key: "configuracoes:senhas", label: "Senhas" },
];

export const PERMISSION_GROUPS: { label: string; items: { key: Permission; label: string }[] }[] = [
  {
    label: "Administração",
    items: [
      { key: "configuracoes", label: "Administrar workspace" },
      { key: "membros", label: "Gerenciar membros" },
    ],
  },
  {
    label: "Operação",
    items: [
      { key: "clientes", label: "Clientes" },
      { key: "campanhas", label: "Campanhas" },
      { key: "projetos", label: "Projetos" },
      { key: "influenciadores", label: "Banco de influenciadores" },
    ],
  },
  {
    label: "Negócio",
    items: [
      { key: "comercial", label: "Comercial" },
      { key: "financeiro", label: "Financeiro" },
    ],
  },
  {
    label: "Dados sensíveis",
    items: [{ key: "influenciadores:bancario", label: "Dados bancários de influenciadores" }],
  },
  {
    // Grupo residual — preserva a capacidade de conceder essas 4
    // permissões granularmente; não fazem parte dos 4 grupos nomeados
    // no pedido, mas removê-las tiraria funcionalidade já existente.
    label: "Outros",
    items: [
      { key: "reunioes", label: "Reuniões" },
      { key: "time", label: "Time" },
      { key: "metas", label: "Metas" },
      { key: "chat", label: "Chat" },
    ],
  },
];
export const ALL_PERMISSIONS: Permission[] = [
  ...PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)),
  ...CONFIG_SUB_PERMISSIONS.map((i) => i.key),
];

/** Mapeia cada seção do menu pra permissão exigida. Seções fora deste mapa
 * (ex: "inicio") sempre ficam liberadas. "clientes" e "campanhas" também
 * têm enforcement real no banco (RLS via `has_permission`), mas na
 * MESMA policy pras duas — o dado de campanha vive dentro da linha do
 * cliente, então a RLS de `clientes` aceita quem tem "clientes" OU
 * "campanhas", sem conseguir separar "editar cliente" de "editar sua
 * campanha embutida" mais fino que isso (ver CLAUDE.md). */
export const SECTION_PERMISSION: Record<string, Permission> = {
  clientes: "clientes",
  campanhas: "campanhas",
  projetos: "projetos",
  reunioes: "reunioes",
  comercial: "comercial",
  financeiro: "financeiro",
  time: "time",
  influenciadores: "influenciadores",
  chat: "chat",
  configuracoes: "configuracoes",
};

const MEMBERS_KEY = "time:membros";

type DirEntry = { id: string; permissions?: string[]; isAdmin?: boolean };

export type MyAccess = { isAdmin: boolean; permissions: Permission[] };

function readAccess(): MyAccess | null {
  try {
    const raw = localStorage.getItem(MEMBERS_KEY);
    if (!raw) return null;
    const dir = JSON.parse(raw) as DirEntry[];
    const meId = getMe().id;
    const mine = dir.find((d) => d.id === meId);
    if (!mine) return null;
    return {
      isAdmin: Boolean(mine.isAdmin),
      permissions: (Array.isArray(mine.permissions) ? mine.permissions : []) as Permission[],
    };
  } catch {
    return null;
  }
}

/** Acesso do usuário atual (admin + lista de permissões), lido do cache
 * `time:membros` já hidratado por `_authenticated/route.tsx`. Retorna `null`
 * enquanto esse cache ainda não chegou (evitar bloquear/piscar seções antes
 * da primeira hidratação). */
export function useMyAccess(): MyAccess | null {
  const [access, setAccess] = useState<MyAccess | null>(readAccess);
  useEffect(() => {
    const refresh = () => setAccess(readAccess());
    refresh();
    window.addEventListener("time:membros:changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("time:membros:changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return access;
}

/** Admin sempre tem acesso; sem `access` (ainda carregando) tratamos como
 * liberado pra não piscar um "sem permissão" falso antes da hidratação. */
export function hasPermission(access: MyAccess | null, key?: Permission): boolean {
  if (!key) return true;
  if (!access) return true;
  return access.isAdmin || access.permissions.includes(key);
}
