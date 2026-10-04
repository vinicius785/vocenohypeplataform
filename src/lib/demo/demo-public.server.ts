import { createHash } from "node:crypto";
import type { Cliente } from "@/lib/clientes-store";
import type { Influ } from "@/lib/influencer-model";
import type { ClienteLinkData } from "@/lib/portal-types";
import { throwSafeDbError } from "@/lib/portal-db-error";
import {
  DEMO_READ_LIMIT,
  DEMO_WRITE_LIMIT,
  createDemoPublicService,
  type DemoAccessKind,
  type DemoPublicPort,
} from "./demo-public";
import { sendDemoSignalHttp } from "./demo-signal";
import { createDemoService } from "./demo-service";
import { createSupabaseDemoPort, type DemoAdminClient } from "./demo-service.server";
import type { DemoSessionRow } from "./demo-types";

/**
 * Persistência das funções públicas da Demo (service-role). `.server.ts`.
 * As dependências do restante do produto entram por `deps` para o adaptador ser testável.
 */

export type DemoPublicDeps = {
  resolve: DemoPublicPort["resolve"];
  checkRateLimit: (bucket: string, max: number, windowSeconds: number) => Promise<boolean>;
  buildClienteLinkData: (clienteId: string, cliente: Cliente) => Promise<ClienteLinkData>;
  loadInfluRow: (campanhaId: string, influencerId: string) => Promise<Influ>;
  saveInfluRow: (campanhaId: string, influencerId: string, next: Influ) => Promise<void>;
  afterWrite?: (session: DemoSessionRow) => Promise<void>;
};

const REPORT_SIGNED_URL_SECONDS = 60 * 60;

/** O token NUNCA vai para o banco do limitador: só um resumo dele. */
export function rateLimitBucket(kind: DemoAccessKind, token: string): string {
  return `demo-${kind}:${createHash("sha256").update(token).digest("hex").slice(0, 24)}`;
}

export function createSupabaseDemoPublicPort(
  admin: DemoAdminClient,
  deps: DemoPublicDeps,
): DemoPublicPort {
  /** Cliente da sessão — só se o marcador, o id e a organização ainda baterem. */
  async function loadCliente(session: DemoSessionRow): Promise<Cliente> {
    const { data, error } = await admin
      .from("clientes")
      .select("data")
      .eq("id", session.cliente_id)
      .eq("organization_id", session.organization_id)
      .maybeSingle();
    if (error) throwSafeDbError(error, "demo cliente");
    const cliente = (data?.data ?? null) as (Cliente & { demoSessionId?: string }) | null;
    if (!cliente || cliente.demoSessionId !== session.id) {
      throw new Error("Demonstração indisponível.");
    }
    return cliente;
  }

  return {
    resolve: deps.resolve,

    rateLimit: (kind, token) => {
      const limit = kind === "write" ? DEMO_WRITE_LIMIT : DEMO_READ_LIMIT;
      return deps.checkRateLimit(rateLimitBucket(kind, token), limit.max, limit.windowSeconds);
    },

    async loadPortalData(session) {
      return deps.buildClienteLinkData(session.cliente_id, await loadCliente(session));
    },

    loadInflu: deps.loadInfluRow,
    saveInflu: deps.saveInfluRow,

    async signReportUrl(session, relatorioId) {
      const cliente = await loadCliente(session);
      const campanha = cliente.campanhas?.find((c) => c.id === session.campanha_id);
      const relatorio = campanha?.relatoriosMensais?.find((r) => r.id === relatorioId);
      if (!relatorio) return null;
      const { data, error } = await admin.storage
        .from("relatorios-mensais")
        .createSignedUrl(relatorio.storagePath, REPORT_SIGNED_URL_SECONDS);
      if (error) throwSafeDbError(error, "demo relatorio");
      return data?.signedUrl ?? null;
    },

    afterWrite: deps.afterWrite,
  };
}

/** Serviço público da Demo ligado ao banco real. */
export async function getServerDemoPublicService() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as DemoAdminClient;
  const sessions = createDemoService(createSupabaseDemoPort(admin));
  const { checkRateLimit } = await import("@/lib/rate-limit.server");
  const { buildClienteLinkData, loadInfluRow, saveInfluRow } =
    await import("@/lib/cliente-link.functions");
  return createDemoPublicService(
    createSupabaseDemoPublicPort(admin, {
      resolve: (token) => sessions.resolveAccess(token),
      checkRateLimit,
      buildClienteLinkData: buildClienteLinkData as DemoPublicDeps["buildClienteLinkData"],
      loadInfluRow,
      saveInfluRow,
      // Avisa outras abas do cliente (o time já recebe por `postgres_changes`).
      afterWrite: async (session) => {
        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) return;
        await sendDemoSignalHttp({ url, serviceKey, realtimeKey: session.realtime_key });
      },
    }),
  );
}
