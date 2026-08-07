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
  | "chat"
  | "senhas"
  | "configuracoes"
  | "configuracoes:perfil"
  | "configuracoes:workspace"
  | "configuracoes:av"
  | "configuracoes:senhas";

export const CONFIG_SUB_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "configuracoes:perfil", label: "Meu Perfil" },
  { key: "configuracoes:workspace", label: "Workspace" },
  { key: "configuracoes:av", label: "Áudio e Vídeo" },
  { key: "configuracoes:senhas", label: "Senhas" },
];

export const PERMISSION_GROUPS: { label: string; items: { key: Permission; label: string }[] }[] = [
  {
    label: "Operação",
    items: [
      { key: "clientes", label: "Clientes" },
      { key: "campanhas", label: "Campanhas" },
      { key: "projetos", label: "Projetos" },
      { key: "reunioes", label: "Reuniões" },
      { key: "influenciadores", label: "Influenciadores" },
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
    label: "Time & Comunicação",
    items: [
      { key: "time", label: "Time" },
      { key: "chat", label: "Chat" },
    ],
  },
  { label: "Administração", items: [{ key: "configuracoes", label: "Configurações" }] },
];
export const ALL_PERMISSIONS: Permission[] = [
  ...PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)),
  ...CONFIG_SUB_PERMISSIONS.map((i) => i.key),
];

/** Mapeia cada seção do menu pra permissão exigida. Seções fora deste mapa
 * (ex: "inicio") sempre ficam liberadas. "clientes" e "campanhas" só têm
 * enforcement no cliente — o dado de campanha vive dentro da linha do
 * cliente no banco, então a RLS de `clientes` não separa as duas hoje. */
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
