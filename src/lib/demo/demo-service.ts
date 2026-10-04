import {
  DEMO_SCENARIO_ID,
  DEMO_SEED_VERSION,
  buildDemoScenario,
  demoCampanhaId,
  demoClienteId,
  type DemoAssetSpec,
  type DemoScenarioPayload,
} from "./cenario-campanha-completa";
import {
  computeAccessState,
  demoTokenExpiry,
  generateDemoRealtimeKey,
  generateDemoToken,
  isWellFormedDemoToken,
  shouldTouchLastAccess,
} from "./demo-token";
import {
  DEMO_SCHEMA_VERSION,
  DemoError,
  type DemoEventData,
  type DemoEventKind,
  type DemoEventRow,
  type DemoPrerequisites,
  type DemoSessionRow,
  type DemoSessionView,
} from "./demo-types";

/**
 * Regras de negócio do ciclo de vida da Demo — SEM acesso direto a banco. A persistência
 * entra pela porta `DemoPort` (implementada em `demo-service.server.ts` com o cliente
 * service-role), o que permite testar cada regra sem Supabase.
 *
 * Princípios (docs/decisions/0004-demo-operacional.md):
 *  - a Demo só liga se os pré-requisitos de banco existirem (nunca contornados em código);
 *  - criar é "tudo ou nada": falhou no meio ⇒ desfaz sessão, organização e arquivos;
 *  - o token nunca sai daqui para o time, exceto por `getLink` (função própria, com permissão);
 *  - o link só funciona com a sessão ativa, não encerrada, não revogada e não expirada.
 */

export type DemoLeadInfo = {
  id: string;
  name: string;
  company: string | null;
  contact: string | null;
};

export type NewDemoEvent = {
  session_id: string;
  kind: DemoEventKind;
  actor_user_id: string | null;
  data: DemoEventData;
  created_at: string;
};

export interface DemoPort {
  /** `null` quando a função `demo_prerequisites()` não existe (migration não aplicada). */
  getPrerequisites(): Promise<DemoPrerequisites | null>;
  getLead(leadId: string): Promise<DemoLeadInfo | null>;
  findActiveSessionByLead(leadId: string): Promise<DemoSessionRow | null>;
  findLatestSessionByLead(leadId: string): Promise<DemoSessionRow | null>;
  findSessionById(id: string): Promise<DemoSessionRow | null>;
  findSessionByToken(token: string): Promise<DemoSessionRow | null>;
  /** Cria a organização da demo (`type='client'`, `status='suspended'`, sem membros). */
  createOrganization(name: string): Promise<string>;
  insertSession(row: DemoSessionRow): Promise<void>;
  updateSession(id: string, patch: Partial<DemoSessionRow>): Promise<DemoSessionRow>;
  insertEvent(event: NewDemoEvent): Promise<void>;
  listEvents(sessionId: string, limit: number): Promise<DemoEventRow[]>;
  /** Publica os arquivos de exemplo e devolve `key → URL`. */
  publishAssets(sessionId: string, specs: DemoAssetSpec[]): Promise<Map<string, string>>;
  /** Remove o que existe sob `demo/<sessionId>/` (inclui uploads feitos na demo), exceto os
   * caminhos em `keep`. Sem `keep`, remove tudo. */
  purgeAssets(sessionId: string, keep?: string[]): Promise<void>;
  /** RPC atômica `demo_apply_scenario`. */
  applyScenario(sessionId: string, payload: DemoScenarioPayload): Promise<void>;
  /** Desfaz TUDO de uma sessão (dados da campanha, cliente, sessão, organização). */
  removeSession(
    session: Pick<DemoSessionRow, "id" | "cliente_id" | "campanha_id" | "organization_id">,
  ): Promise<void>;
}

export type DemoServiceDeps = {
  now?: () => Date;
  newId?: () => string;
  log?: (message: string, error?: unknown) => void;
};

const SAFE_CREATE_ERROR =
  "Não foi possível criar a demonstração agora. Nada foi criado — tente de novo em instantes.";
const SAFE_RESTART_ERROR =
  "Não foi possível reiniciar a demonstração agora. Tente de novo em instantes.";

export function describeMissingPrerequisites(p: DemoPrerequisites | null): string[] {
  if (!p) {
    return ["A migration da Demo (20261005) ainda não foi aplicada no banco."];
  }
  const missing: string[] = [];
  if (p.schemaVersion !== DEMO_SCHEMA_VERSION) {
    missing.push("A estrutura da Demo no banco está desatualizada em relação ao código.");
  }
  if (!p.rlsInternalOnly) {
    missing.push(
      "A migration 20261004 (RLS: dados internos só para a equipe) ainda não foi aplicada e verificada.",
    );
  }
  if (!p.npsGuard)
    missing.push("A guarda do NPS automático para campanhas de demo não existe no banco.");
  if (!p.markerGuard) missing.push("A guarda do marcador de cliente de demo não existe no banco.");
  return missing;
}

export function toDemoView(row: DemoSessionRow, now: Date): DemoSessionView {
  // Desestruturar tira o token do objeto: a visão do time NUNCA o carrega.
  const { token: _token, ...rest } = row;
  void _token;
  return { ...rest, access: computeAccessState(row, now) };
}

export function createDemoService(port: DemoPort, deps: DemoServiceDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => globalThis.crypto.randomUUID());
  const log = deps.log ?? ((m, e) => console.error(`[demo] ${m}`, e));

  async function assertPrerequisites(): Promise<void> {
    const missing = describeMissingPrerequisites(await port.getPrerequisites());
    if (missing.length > 0) {
      throw new DemoError("prerequisites", `A Demo ainda não pode ser usada: ${missing.join(" ")}`);
    }
  }

  async function mustFind(sessionId: string): Promise<DemoSessionRow> {
    const row = await port.findSessionById(sessionId);
    if (!row) throw new DemoError("not_found", "Demonstração não encontrada.");
    return row;
  }

  async function recordEvent(
    sessionId: string,
    kind: DemoEventKind,
    actorUserId: string | null,
    data: DemoEventData = {},
  ): Promise<void> {
    try {
      await port.insertEvent({
        session_id: sessionId,
        kind,
        actor_user_id: actorUserId,
        data,
        created_at: now().toISOString(),
      });
    } catch (e) {
      // O histórico de ciclo de vida é auxiliar: nunca derruba a operação principal.
      log(`falha ao registrar evento ${kind}`, e);
    }
  }

  /**
   * Publica arquivos + aplica o cenário. Mesmo caminho para criar e reiniciar. Devolve os
   * caminhos dos arquivos do cenário (os demais, sob o prefixo da demo, são "sobra").
   */
  async function materialize(
    row: Pick<DemoSessionRow, "id" | "cliente_id" | "campanha_id">,
    lead: { empresa: string; responsavel?: string },
  ): Promise<string[]> {
    const common = {
      sessionId: row.id,
      clienteId: row.cliente_id,
      campanhaId: row.campanha_id,
      now: now(),
      empresa: lead.empresa,
      responsavel: lead.responsavel,
    };
    // 1ª passada (seca): descobre quais arquivos o cenário precisa.
    const dry = buildDemoScenario({ ...common, assetUrl: () => "pending" });
    const urls = await port.publishAssets(row.id, dry.assetSpecs);
    // 2ª passada: o cenário final, com as URLs reais.
    const scenario = buildDemoScenario({
      ...common,
      assetUrl: (spec) => {
        const url = urls.get(spec.key);
        if (!url) throw new Error(`Arquivo de exemplo sem URL: ${spec.key}`);
        return url;
      },
    });
    await port.applyScenario(row.id, scenario.payload);
    return dry.assetSpecs.map((spec) => spec.path);
  }

  async function leadContext(leadId: string | null, fallbackEmpresa: string) {
    if (!leadId) return { empresa: fallbackEmpresa };
    const lead = await port.getLead(leadId);
    if (!lead) return { empresa: fallbackEmpresa };
    return {
      empresa: lead.company?.trim() || lead.name.trim() || fallbackEmpresa,
      responsavel: lead.contact?.trim() || lead.name.trim() || undefined,
    };
  }

  return {
    /** Cria a demo de um lead. Tudo ou nada. */
    async createDemo(input: { leadId: string; actorUserId: string }): Promise<DemoSessionView> {
      await assertPrerequisites();

      const lead = await port.getLead(input.leadId);
      if (!lead) throw new DemoError("lead_not_found", "Lead não encontrado.");
      if (await port.findActiveSessionByLead(lead.id)) {
        throw new DemoError("already_active", "Este lead já tem uma demonstração ativa.");
      }

      const empresa = lead.company?.trim() || lead.name.trim();
      const responsavel = lead.contact?.trim() || lead.name.trim();
      const sessionId = newId();
      const createdAt = now();
      const row: DemoSessionRow = {
        id: sessionId,
        lead_id: lead.id,
        cliente_id: demoClienteId(sessionId),
        campanha_id: demoCampanhaId(sessionId),
        organization_id: "", // preenchido após criar a organização
        scenario: DEMO_SCENARIO_ID,
        seed_version: DEMO_SEED_VERSION,
        status: "active",
        token: generateDemoToken(),
        token_expires_at: demoTokenExpiry(createdAt).toISOString(),
        access_revoked_at: null,
        closed_at: null,
        last_client_access_at: null,
        realtime_key: generateDemoRealtimeKey(),
        created_by: input.actorUserId,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      };

      let organizationId: string | null = null;
      let sessionInserted = false;
      try {
        organizationId = await port.createOrganization(`Demonstração · ${empresa}`);
        row.organization_id = organizationId;
        await port.insertSession(row);
        sessionInserted = true;
        await materialize(row, { empresa, responsavel });
      } catch (error) {
        log("falha ao criar a demonstração — desfazendo", error);
        try {
          await port.purgeAssets(sessionId);
          if (organizationId) {
            await port.removeSession({
              id: sessionId,
              cliente_id: row.cliente_id,
              campanha_id: row.campanha_id,
              organization_id: organizationId,
            });
          }
        } catch (cleanupError) {
          log(
            sessionInserted
              ? "FALHA ao desfazer a demonstração (limpeza manual pode ser necessária)"
              : "falha ao desfazer a organização",
            cleanupError,
          );
        }
        throw new Error(SAFE_CREATE_ERROR);
      }

      await recordEvent(sessionId, "criada", input.actorUserId, { leadId: lead.id });
      const stored = (await port.findSessionById(sessionId)) ?? row;
      return toDemoView(stored, now());
    },

    /** Volta ao cenário inicial: mesmos ids, mesmo link, mesma validade. */
    async restartDemo(input: { sessionId: string; actorUserId: string }): Promise<DemoSessionView> {
      const session = await mustFind(input.sessionId);
      if (session.status === "closed") {
        throw new DemoError("closed", "A demonstração está encerrada e não pode ser reiniciada.");
      }
      await assertPrerequisites();
      const ctx = await leadContext(session.lead_id, "Cliente de demonstração");
      let keep: string[];
      try {
        // Publica (sobrescrevendo os mesmos caminhos) e aplica ANTES de limpar a sobra: se
        // algo falhar, o cenário anterior continua íntegro e com os arquivos no lugar.
        keep = await materialize(session, ctx);
      } catch (error) {
        log("falha ao reiniciar a demonstração", error);
        throw new Error(SAFE_RESTART_ERROR);
      }
      try {
        await port.purgeAssets(session.id, keep);
      } catch (error) {
        log("falha ao limpar arquivos de uploads antigos da demonstração", error);
      }
      await recordEvent(session.id, "reiniciada", input.actorUserId);
      return toDemoView(session, now());
    },

    /** Encerra: o cliente perde o acesso; o time continua vendo tudo. Idempotente. */
    async closeDemo(input: { sessionId: string; actorUserId: string }): Promise<DemoSessionView> {
      const session = await mustFind(input.sessionId);
      if (session.status === "closed") return toDemoView(session, now());
      const updated = await port.updateSession(session.id, {
        status: "closed",
        closed_at: now().toISOString(),
      });
      await recordEvent(session.id, "encerrada", input.actorUserId);
      return toDemoView(updated, now());
    },

    /** Invalida o link atual (a campanha e o histórico seguem para o time). Idempotente. */
    async revokeAccess(input: {
      sessionId: string;
      actorUserId: string;
    }): Promise<DemoSessionView> {
      const session = await mustFind(input.sessionId);
      if (session.status === "closed") {
        throw new DemoError("closed", "A demonstração está encerrada.");
      }
      if (session.access_revoked_at) return toDemoView(session, now());
      const updated = await port.updateSession(session.id, {
        access_revoked_at: now().toISOString(),
      });
      await recordEvent(session.id, "acesso_revogado", input.actorUserId);
      return toDemoView(updated, now());
    },

    /**
     * Renova a validade (14 dias). Um link REVOGADO nunca volta a funcionar: renovar nesse
     * caso gera um token novo. `newLink` força um token novo mesmo com o atual válido.
     */
    async renewAccess(input: {
      sessionId: string;
      actorUserId: string;
      newLink?: boolean;
    }): Promise<DemoSessionView> {
      const session = await mustFind(input.sessionId);
      if (session.status === "closed") {
        throw new DemoError("closed", "A demonstração está encerrada.");
      }
      const rotate = Boolean(input.newLink) || Boolean(session.access_revoked_at);
      const expiresAt = demoTokenExpiry(now()).toISOString();
      const patch: Partial<DemoSessionRow> = {
        token_expires_at: expiresAt,
        access_revoked_at: null,
      };
      if (rotate) patch.token = generateDemoToken();
      const updated = await port.updateSession(session.id, patch);
      await recordEvent(session.id, rotate ? "link_gerado" : "acesso_renovado", input.actorUserId, {
        expiresAt,
      });
      return toDemoView(updated, now());
    },

    /** ÚNICO ponto que entrega o token ao time (função de servidor com permissão). */
    async getLink(sessionId: string): Promise<{
      token: string;
      path: string;
      expiresAt: string;
      access: DemoSessionView["access"];
    }> {
      const session = await mustFind(sessionId);
      return {
        token: session.token,
        path: `/demo/${session.token}`,
        expiresAt: session.token_expires_at,
        access: computeAccessState(session, now()),
      };
    },

    /** Demo do lead (a ativa; senão a mais recente) + últimos eventos de ciclo de vida. */
    async getDemoForLead(
      leadId: string,
      eventLimit = 20,
    ): Promise<{ session: DemoSessionView | null; events: DemoEventRow[] }> {
      const row =
        (await port.findActiveSessionByLead(leadId)) ??
        (await port.findLatestSessionByLead(leadId));
      if (!row) return { session: null, events: [] };
      return {
        session: toDemoView(row, now()),
        events: await port.listEvents(row.id, eventLimit),
      };
    },

    /**
     * Acesso do CLIENTE pelo link. Qualquer falha devolve o MESMO resultado (`ok: false`) —
     * quem chama responde com a mesma mensagem, sem revelar se o token existe, expirou ou
     * foi revogado.
     */
    async resolveAccess(
      token: unknown,
    ): Promise<{ ok: true; session: DemoSessionRow } | { ok: false }> {
      if (!isWellFormedDemoToken(token)) return { ok: false };
      const session = await port.findSessionByToken(token);
      if (!session) return { ok: false };
      const at = now();
      if (computeAccessState(session, at) !== "ativo") return { ok: false };

      if (shouldTouchLastAccess(session.last_client_access_at, at)) {
        const first = session.last_client_access_at === null;
        try {
          await port.updateSession(session.id, { last_client_access_at: at.toISOString() });
          if (first) await recordEvent(session.id, "cliente_abriu_link", null);
        } catch (e) {
          // Registrar o acesso é auxiliar: nunca bloqueia o cliente.
          log("falha ao registrar último acesso", e);
        }
      }
      return { ok: true, session };
    },
  };
}

export type DemoService = ReturnType<typeof createDemoService>;
