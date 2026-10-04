import type { SupabaseClient } from "@supabase/supabase-js";
import { throwSafeDbError } from "@/lib/portal-db-error";
import type { DemoAssetSpec, DemoScenarioPayload } from "./cenario-campanha-completa";
import { renderDemoAsset } from "./demo-assets.server";
import {
  createDemoService,
  type DemoLeadInfo,
  type DemoPort,
  type NewDemoEvent,
} from "./demo-service";
import type { DemoEventRow, DemoPrerequisites, DemoSessionRow } from "./demo-types";

/**
 * Persistência da Demo sobre o cliente SERVICE-ROLE. `.server.ts`: nunca importar de código
 * que vai para o navegador.
 *
 * As tabelas/funções da Demo ainda não estão no `types.ts` gerado (a migration 20261005 ainda
 * não foi aplicada), então o cliente é usado sem tipagem de esquema — as formas das linhas
 * são as de `demo-types.ts`. Erros de banco viram mensagem segura (`throwSafeDbError`): o
 * detalhe vai só para o log do servidor.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DemoAdminClient = SupabaseClient<any, any, any>;

/** URL assinada dos arquivos de exemplo: 1 ano (mesmo prazo dos anexos de entrega reais). */
const ASSET_SIGNED_URL_SECONDS = 365 * 24 * 60 * 60;
const UPLOAD_CONCURRENCY = 6;
const ASSET_BUCKETS = ["entrega-anexos", "relatorios-mensais"] as const;

/** Tabelas por `campanha_id` que `demo_apply_scenario` também limpa (mesma lista). */
export const DEMO_CAMPANHA_TABLES = [
  "campanha_nps_influenciador",
  "campanha_influenciador_avaliacoes",
  "campanha_nps",
  "campaign_cycles",
  "campanha_influenciadores",
  "campanha_tarefas",
  "campanha_documentos",
  "campanha_cronograma",
] as const;

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function/i.test(error.message ?? "")
  );
}

function isPrerequisites(value: unknown): value is DemoPrerequisites {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === "number" &&
    typeof v.rlsInternalOnly === "boolean" &&
    typeof v.npsGuard === "boolean" &&
    typeof v.markerGuard === "boolean"
  );
}

async function inBatches<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export function createSupabaseDemoPort(admin: DemoAdminClient): DemoPort {
  const sessions = () => admin.from("demo_sessions");

  async function one<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
    const { data, error } = await query;
    if (error) throwSafeDbError(error, "demo");
    return data;
  }

  return {
    async getPrerequisites() {
      const { data, error } = await admin.rpc("demo_prerequisites");
      if (error) {
        if (isMissingFunction(error)) return null;
        throwSafeDbError(error, "demo_prerequisites");
      }
      return isPrerequisites(data) ? data : null;
    },

    async getLead(leadId) {
      return one<DemoLeadInfo>(
        admin.from("leads").select("id, name, company, contact").eq("id", leadId).maybeSingle(),
      );
    },

    async findActiveSessionByLead(leadId) {
      return one<DemoSessionRow>(
        sessions().select("*").eq("lead_id", leadId).eq("status", "active").maybeSingle(),
      );
    },

    async findLatestSessionByLead(leadId) {
      return one<DemoSessionRow>(
        sessions()
          .select("*")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
    },

    async findSessionById(id) {
      return one<DemoSessionRow>(sessions().select("*").eq("id", id).maybeSingle());
    },

    async findSessionByToken(token) {
      return one<DemoSessionRow>(sessions().select("*").eq("token", token).maybeSingle());
    },

    async createOrganization(name) {
      const row = await one<{ id: string }>(
        admin
          .from("organizations")
          .insert({ name, type: "client", status: "suspended" })
          .select("id")
          .single(),
      );
      if (!row) throw new Error("Organização da demonstração não foi criada.");
      return row.id;
    },

    async insertSession(row) {
      const { error } = await sessions().insert(row);
      if (error) throwSafeDbError(error, "demo insertSession");
    },

    async updateSession(id, patch) {
      const row = await one<DemoSessionRow>(
        sessions().update(patch).eq("id", id).select("*").single(),
      );
      if (!row) throw new Error("Demonstração não encontrada.");
      return row;
    },

    async insertEvent(event: NewDemoEvent) {
      const { error } = await admin.from("demo_events").insert(event);
      if (error) throwSafeDbError(error, "demo insertEvent");
    },

    async listEvents(sessionId, limit) {
      const { data, error } = await admin
        .from("demo_events")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throwSafeDbError(error, "demo listEvents");
      return (data ?? []) as DemoEventRow[];
    },

    async publishAssets(_sessionId, specs: DemoAssetSpec[]) {
      const urls = new Map<string, string>();
      await inBatches(specs, UPLOAD_CONCURRENCY, async (spec) => {
        const { bytes, contentType } = renderDemoAsset(spec);
        const bucket = admin.storage.from(spec.bucket);
        const up = await bucket.upload(spec.path, bytes, { contentType, upsert: true });
        if (up.error) throwSafeDbError(up.error, `demo upload ${spec.key}`);
        const signed = await bucket.createSignedUrl(spec.path, ASSET_SIGNED_URL_SECONDS);
        if (signed.error || !signed.data?.signedUrl) {
          throwSafeDbError(
            signed.error ?? { message: "sem URL assinada" },
            `demo sign ${spec.key}`,
          );
        }
        urls.set(spec.key, signed.data!.signedUrl);
      });
      return urls;
    },

    async purgeAssets(sessionId, keep) {
      const prefix = `demo/${sessionId}`;
      for (const name of ASSET_BUCKETS) {
        const bucket = admin.storage.from(name);
        const listed = await bucket.list(prefix, { limit: 1000 });
        if (listed.error) throwSafeDbError(listed.error, `demo list ${name}`);
        const paths = (listed.data ?? [])
          .map((f) => `${prefix}/${f.name}`)
          .filter((p) => !keep?.includes(p));
        if (paths.length === 0) continue;
        const removed = await bucket.remove(paths);
        if (removed.error) throwSafeDbError(removed.error, `demo remove ${name}`);
      }
    },

    async applyScenario(sessionId, payload: DemoScenarioPayload) {
      const { error } = await admin.rpc("demo_apply_scenario", {
        p_session_id: sessionId,
        p_payload: payload,
      });
      if (error) throwSafeDbError(error, "demo_apply_scenario");
    },

    async removeSession(session) {
      for (const table of DEMO_CAMPANHA_TABLES) {
        const { error } = await admin.from(table).delete().eq("campanha_id", session.campanha_id);
        if (error) throwSafeDbError(error, `demo remove ${table}`);
      }
      // Só apaga o cliente se ele AINDA for da demo (id + organização + marcador).
      const cliente = await admin
        .from("clientes")
        .delete()
        .eq("id", session.cliente_id)
        .eq("organization_id", session.organization_id)
        .eq("data->>demoSessionId", session.id);
      if (cliente.error) throwSafeDbError(cliente.error, "demo remove cliente");

      const sess = await sessions().delete().eq("id", session.id);
      if (sess.error) throwSafeDbError(sess.error, "demo remove session");

      const org = await admin.from("organizations").delete().eq("id", session.organization_id);
      if (org.error) throwSafeDbError(org.error, "demo remove organization");
    },
  };
}

/** Serviço da Demo ligado ao banco real. Importa o cliente service-role só aqui dentro. */
export async function getServerDemoService() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return createDemoService(createSupabaseDemoPort(supabaseAdmin as unknown as DemoAdminClient));
}
