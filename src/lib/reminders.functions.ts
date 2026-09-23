import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * "Lembretes" (antes "Lista pessoal") — CRUD sobre `personal_reminders`.
 * Toda leitura/escrita passa por `context.supabase` (client RLS-scoped,
 * nunca `supabaseAdmin`), então `user_id = auth.uid()` é sempre imposto
 * pelo banco — nenhum handler aqui aceita um `userId` vindo do payload.
 * Nunca aparece em busca global, relatório de performance ou score
 * operacional (é um domínio isolado, sem nenhum outro módulo lendo esta
 * tabela).
 */

export type ReminderPriority = "normal" | "importante";

export type ReminderRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  priority: ReminderPriority;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const listReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("personal_reminders")
      .select("*")
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data as unknown as ReminderRow[];
  });

const createReminderSchema = z.object({
  title: z.string().trim().min(1, "Título é obrigatório").max(200),
  notes: z.string().trim().max(2000).optional(),
  dueAt: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Data inválida")
    .optional(),
  priority: z.enum(["normal", "importante"]).default("normal"),
});

export const createReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof createReminderSchema>) =>
    createReminderSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: inserted, error } = await context.supabase
      .from("personal_reminders")
      .insert({
        user_id: context.userId,
        title: data.title,
        notes: data.notes || null,
        due_at: data.dueAt ?? null,
        priority: data.priority,
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return inserted as unknown as ReminderRow;
  });

const updateReminderSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  dueAt: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()))
    .optional()
    .nullable(),
  priority: z.enum(["normal", "importante"]).optional(),
});

export const updateReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof updateReminderSchema>) =>
    updateReminderSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.notes !== undefined) patch.notes = data.notes || null;
    if (data.dueAt !== undefined) patch.due_at = data.dueAt;
    if (data.priority !== undefined) patch.priority = data.priority;
    // RLS (`own reminders update`, `user_id = auth.uid()`) é quem
    // realmente impede editar o lembrete de outra pessoa — o `.eq("id",
    // ...)` sozinho não bastaria se a policy não existisse.
    const { data: updated, error } = await context.supabase
      .from("personal_reminders")
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated as unknown as ReminderRow;
  });

const idSchema = z.object({ id: z.string().uuid() });

export const completeReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("personal_reminders")
      .update({ completed_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated as unknown as ReminderRow;
  });

export const reopenReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("personal_reminders")
      .update({ completed_at: null } as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated as unknown as ReminderRow;
  });

export const deleteReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("personal_reminders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
