import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

const RoleEnum = z.enum(["admin", "member"]);

const CreateInput = z.object({
  email: z.string().trim().email().max(255),
  tempPassword: z.string().min(6).max(72),
  fullName: z.string().trim().max(120).optional().default(""),
  roleLabel: z.string().trim().max(120).optional().default(""),
  salary: z.string().trim().max(60).optional().default(""),
  birthday: z.string().trim().optional().default(""),
  permissions: z.array(z.string()).default([]),
  timeView: z.array(z.string()).default([]),
  role: RoleEnum.default("member"),
});

async function setUserRole(
  supabaseAdmin: SupabaseClient<Database>,
  userId: string,
  role: "admin" | "member",
) {
  const other = role === "admin" ? "member" : "admin";
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", other);
  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
  if (error) throw new Error(error.message);
}

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem gerenciar o time.");
}

export const getTeamDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id,email,full_name,photo_url,birthday,role_label,salary,permissions,time_view,start_times",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role");
    const adminSet = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
    const { data: viewerIsAdmin } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });

    // Cada linha (exceto a do próprio usuário e as vistas por um admin) só
    // expõe os campos sensíveis (salário, aniversário, e-mail, horário) que a
    // PESSOA escolheu compartilhar em `time_view` — antes isso só era
    // filtrado no cliente, então qualquer chamada direta a essa função
    // devolvia a folha salarial inteira pra qualquer usuário autenticado.
    return (data ?? []).map((p) => {
      const timeView = (Array.isArray(p.time_view) ? p.time_view : []) as string[];
      const canSeeAll = Boolean(viewerIsAdmin) || p.id === context.userId;
      return {
        id: p.id,
        name: (p.full_name ?? "").trim() || "Sem nome",
        photo: p.photo_url ?? undefined,
        role: p.role_label ?? undefined,
        salary: canSeeAll || timeView.includes("salary") ? (p.salary ?? "") : "",
        email: canSeeAll || timeView.includes("email") ? (p.email ?? "") : "",
        birthday: canSeeAll || timeView.includes("birthday") ? (p.birthday ?? null) : null,
        permissions: (canSeeAll
          ? Array.isArray(p.permissions)
            ? p.permissions
            : []
          : []) as string[],
        timeView,
        startTimes: (canSeeAll && p.start_times && typeof p.start_times === "object"
          ? p.start_times
          : {}) as Record<string, string>,
        isAdmin: adminSet.has(p.id),
      };
    });
  });

export const createTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        role_label: data.roleLabel,
        permissions: data.permissions,
        time_view: data.timeView,
        must_change_password: true,
      },
    });
    if (createErr || !created?.user)
      throw new Error(createErr?.message ?? "Falha ao criar usuário.");

    const userId = created.user.id;
    await supabaseAdmin
      .from("profiles")
      .update({ salary: data.salary, birthday: data.birthday || null })
      .eq("id", userId);

    await setUserRole(supabaseAdmin, userId, data.role);

    return { id: userId, email: data.email, tempPassword: data.tempPassword };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().max(120).optional(),
  roleLabel: z.string().trim().max(120).optional(),
  salary: z.string().trim().max(60).optional(),
  birthday: z.string().trim().optional(),
  permissions: z.array(z.string()).optional(),
  timeView: z.array(z.string()).optional(),
  role: RoleEnum.optional(),
});

export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const patch: {
      full_name?: string;
      role_label?: string;
      salary?: string;
      birthday?: string | null;
      permissions?: string[];
      time_view?: string[];
    } = {};
    if (data.fullName !== undefined) patch.full_name = data.fullName;
    if (data.roleLabel !== undefined) patch.role_label = data.roleLabel;
    if (data.salary !== undefined) patch.salary = data.salary;
    if (data.birthday !== undefined) patch.birthday = data.birthday || null;
    if (data.permissions !== undefined) patch.permissions = data.permissions;
    if (data.timeView !== undefined) patch.time_view = data.timeView;
    const { error } = await context.supabase.from("profiles").update(patch).eq("id", data.id);

    if (error) throw new Error(error.message);

    if (data.role !== undefined) {
      if (data.role !== "admin" && data.id === context.userId) {
        throw new Error("Você não pode remover seu próprio acesso de admin.");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await setUserRole(supabaseAdmin, data.id, data.role);
    }
    return { ok: true };
  });

export const deleteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.id === context.userId) throw new Error("Você não pode remover a si mesmo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetMemberPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), newPassword: z.string().min(6).max(72) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", data.id);
    return { ok: true };
  });
