import { supabase } from "@/integrations/supabase/client";

export type Workspace = { nome: string; logo?: string };

const KEY = "config:workspace";
const DEFAULT: Workspace = { nome: "Você no Hype", logo: "" };
export const WORKSPACE_EVENT = "workspace:changed";

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<Workspace>) };
  } catch {
    return DEFAULT;
  }
}

function writeCache(w: Workspace) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(w));
  window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT));
}

export async function fetchWorkspace(): Promise<Workspace> {
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("nome, logo")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return loadWorkspace();
  const w: Workspace = { nome: data.nome ?? DEFAULT.nome, logo: data.logo ?? "" };
  writeCache(w);
  return w;
}

export async function saveWorkspace(w: Workspace): Promise<{ error?: string }> {
  const clean: Workspace = { nome: w.nome.trim() || "Workspace", logo: w.logo ?? "" };
  const { error } = await supabase
    .from("workspace_settings")
    .update({ nome: clean.nome, logo: clean.logo || null })
    .eq("id", true);
  if (error) return { error: error.message };
  writeCache(clean);
  return {};
}

let realtimeStarted = false;
export function initWorkspaceSync() {
  if (realtimeStarted) return;
  realtimeStarted = true;
  void fetchWorkspace();
  supabase
    .channel("workspace_settings_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "workspace_settings" }, () => {
      void fetchWorkspace();
    })
    .subscribe();
}

export function subscribeWorkspace(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  const onCustom = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(WORKSPACE_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(WORKSPACE_EVENT, onCustom);
  };
}

/**
 * Whether the current user can edit workspace identity.
 * Admin, OR profile.permissions contains "configuracoes".
 */
export async function canEditWorkspace(): Promise<boolean> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return false;
  const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: uid });
  if (isAdmin) return true;
  const { data: prof } = await supabase
    .from("profiles")
    .select("permissions")
    .eq("id", uid)
    .maybeSingle();
  const perms = (prof?.permissions as string[] | null) ?? [];
  return Array.isArray(perms) && perms.includes("configuracoes");
}

/** @deprecated use canEditWorkspace() */
export function isCurrentUserAdmin(): boolean {
  return true;
}
