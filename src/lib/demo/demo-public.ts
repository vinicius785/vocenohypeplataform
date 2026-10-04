import { z } from "zod";
import {
  applyEntregaApproval,
  applyInfluApproval,
  reopenInfluApprovalByCliente,
} from "@/lib/campanha-aprovacao";
import { PERFIL_REJEICAO_MOTIVOS } from "@/lib/campanha-status";
import type { Influ } from "@/lib/influencer-model";
import type { ClienteLinkData } from "@/lib/portal-types";
import { assertClienteCanRespondInflu } from "./demo-estados";
import { DEMO_LINK_INVALID_MESSAGE, DemoError, type DemoSessionRow } from "./demo-types";

/**
 * Regras das funções PÚBLICAS da Demo (o cliente, por link — sem login). Núcleo puro com a
 * persistência injetada (`DemoPublicPort`): testável sem banco.
 *
 * Princípios:
 *  - TODA chamada passa por `authorize(token)`: formato → limite de uso → sessão ativa. Qualquer
 *    falha de acesso devolve a MESMA mensagem (sem oráculo de existência/expiração/revogação);
 *  - a campanha vem da SESSÃO; um `campanhaId` de outra campanha é recusado, e o influenciador é
 *    sempre carregado escopado por `campanha_id`;
 *  - as transições são as funções PURAS do produto (`campanha-aprovacao`) + a guarda de status do
 *    influenciador; a Demo não cria regra nova;
 *  - ator fixo "Cliente (demonstração)" no histórico (nunca a conta de quem abriu o link);
 *  - nenhum efeito externo: sem push, e-mail ou webhook.
 */

export const DEMO_CLIENT_ACTOR = "Cliente (demonstração)";
export const DEMO_RATE_LIMITED_MESSAGE = "Muitas tentativas. Tente novamente em instantes.";
export const DEMO_NOT_FOUND_MESSAGE = "Recurso não encontrado.";

/** Limites por link (janela de 60 s): leitura inclui o polling de 20 s de várias abas. */
export const DEMO_READ_LIMIT = { max: 120, windowSeconds: 60 } as const;
export const DEMO_WRITE_LIMIT = { max: 40, windowSeconds: 60 } as const;

export type DemoAccessKind = "read" | "write";

export interface DemoPublicPort {
  resolve(token: unknown): Promise<{ ok: true; session: DemoSessionRow } | { ok: false }>;
  /** `false` = excedeu o limite. */
  rateLimit(kind: DemoAccessKind, token: string): Promise<boolean>;
  /** Dados do portal (mesma forma de `ClienteLinkData`) para a campanha da sessão. */
  loadPortalData(session: DemoSessionRow): Promise<ClienteLinkData>;
  loadInflu(campanhaId: string, influencerId: string): Promise<Influ>;
  saveInflu(campanhaId: string, influencerId: string, next: Influ): Promise<void>;
  signReportUrl(session: DemoSessionRow, relatorioId: string): Promise<string | null>;
  /** Chamado depois de toda escrita do cliente (sinal em tempo real; best-effort). */
  afterWrite?(session: DemoSessionRow): Promise<void>;
}

// ---------------------------------------------------------------------------------------
// Entradas (mesmas regras de validação do portal por sessão)
// ---------------------------------------------------------------------------------------

const Id = z.string().min(1).max(100);

export const RespondInfluInput = z
  .object({
    campanhaId: Id,
    influencerId: Id,
    status: z.enum(["aprovado", "reprovado"]),
    motivoLabel: z.enum(PERFIL_REJEICAO_MOTIVOS).optional(),
    comentario: z.string().trim().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status !== "reprovado") return;
    if (!val.motivoLabel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione um motivo para não aprovar o perfil.",
        path: ["motivoLabel"],
      });
      return;
    }
    if (val.motivoLabel === "Outro" && !val.comentario) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Comentário obrigatório quando o motivo é "Outro".',
        path: ["comentario"],
      });
    }
  });

export const ReopenInfluInput = z.object({ campanhaId: Id, influencerId: Id });

export const RespondEntregaInput = z
  .object({
    campanhaId: Id,
    influencerId: Id,
    entregaId: Id,
    status: z.enum(["aprovado", "reprovado"]),
    motivo: z.string().trim().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === "reprovado" && !val.motivo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Comentário obrigatório ao solicitar ajustes.",
        path: ["motivo"],
      });
    }
  });

export const AddComentarioInput = z.object({
  campanhaId: Id,
  influencerId: Id,
  text: z.string().trim().min(1).max(2000),
});

export const ReportUrlInput = z.object({ campanhaId: Id, relatorioId: Id });

export type RespondInfluInputT = z.infer<typeof RespondInfluInput>;
export type ReopenInfluInputT = z.infer<typeof ReopenInfluInput>;
export type RespondEntregaInputT = z.infer<typeof RespondEntregaInput>;
export type AddComentarioInputT = z.infer<typeof AddComentarioInput>;
export type ReportUrlInputT = z.infer<typeof ReportUrlInput>;

export const DEMO_CLIENT_ROLE = "client_standard";
/** `realtimeKey`: tópico do sinal de mudança (não é segredo: só dispara um recarregamento). */
export type DemoPortalData = ClienteLinkData & { role: string; realtimeKey: string };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "C") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function createDemoPublicService(port: DemoPublicPort) {
  async function authorize(token: unknown, kind: DemoAccessKind): Promise<DemoSessionRow> {
    const invalid = new DemoError("forbidden", DEMO_LINK_INVALID_MESSAGE);
    if (typeof token !== "string") throw invalid;
    // `resolve` confere o formato, a existência e o estado (ativa, não expirada, não revogada).
    // O limite de uso vale por link válido; contra adivinhação, o que protege é a entropia do
    // token (256 bits), não o limite.
    const resolved = await port.resolve(token);
    if (!resolved.ok) throw invalid;
    if (!(await port.rateLimit(kind, token))) {
      throw new DemoError("forbidden", DEMO_RATE_LIMITED_MESSAGE);
    }
    return resolved.session;
  }

  function assertOwnCampaign(session: DemoSessionRow, campanhaId: string) {
    if (campanhaId !== session.campanha_id) {
      throw new DemoError("not_found", DEMO_NOT_FOUND_MESSAGE);
    }
  }

  async function mutate(
    token: unknown,
    campanhaId: string,
    influencerId: string,
    transform: (influ: Influ) => Influ,
  ): Promise<void> {
    const session = await authorize(token, "write");
    assertOwnCampaign(session, campanhaId);
    const influ = await port.loadInflu(session.campanha_id, influencerId);
    const next = transform(influ);
    await port.saveInflu(session.campanha_id, influencerId, next);
    try {
      await port.afterWrite?.(session);
    } catch {
      /* o sinal é best-effort: o polling cobre */
    }
  }

  return {
    async getPortalData(token: unknown): Promise<DemoPortalData> {
      const session = await authorize(token, "read");
      const base = await port.loadPortalData(session);
      return { ...base, role: DEMO_CLIENT_ROLE, realtimeKey: session.realtime_key };
    },

    async respondInflu(token: unknown, raw: unknown): Promise<{ ok: true }> {
      const input = RespondInfluInput.parse(raw);
      await mutate(token, input.campanhaId, input.influencerId, (influ) => {
        assertClienteCanRespondInflu(influ.status);
        const motivo =
          input.status === "reprovado"
            ? input.motivoLabel === "Outro"
              ? input.comentario!
              : input.motivoLabel!
            : undefined;
        return applyInfluApproval(influ, input.status, motivo, {
          motivoLabel: input.motivoLabel,
          comentario: input.status === "reprovado" ? input.comentario : undefined,
          actorName: DEMO_CLIENT_ACTOR,
        });
      });
      return { ok: true };
    },

    async reopenInflu(token: unknown, raw: unknown): Promise<{ ok: true }> {
      const input = ReopenInfluInput.parse(raw);
      await mutate(token, input.campanhaId, input.influencerId, (influ) =>
        reopenInfluApprovalByCliente(influ, DEMO_CLIENT_ACTOR),
      );
      return { ok: true };
    },

    async respondEntrega(token: unknown, raw: unknown): Promise<{ ok: true }> {
      const input = RespondEntregaInput.parse(raw);
      await mutate(token, input.campanhaId, input.influencerId, (influ) => {
        if (!influ.entregas.some((e) => e.id === input.entregaId)) {
          throw new DemoError("not_found", "Entrega não encontrada.");
        }
        return applyEntregaApproval(
          influ,
          input.entregaId,
          input.status,
          input.motivo?.trim(),
          DEMO_CLIENT_ACTOR,
        );
      });
      return { ok: true };
    },

    async addComentario(token: unknown, raw: unknown) {
      const input = AddComentarioInput.parse(raw);
      const nowIso = new Date().toISOString();
      const comment = {
        id: globalThis.crypto.randomUUID(),
        author: DEMO_CLIENT_ACTOR,
        initials: initialsOf(DEMO_CLIENT_ACTOR),
        color: "bg-slate-500 text-white",
        text: input.text,
        createdAt: nowIso,
      };
      await mutate(token, input.campanhaId, input.influencerId, (influ) => ({
        ...influ,
        clienteComments: [...(influ.clienteComments ?? []), comment],
        activityEvents: [
          ...(influ.activityEvents ?? []),
          {
            id: globalThis.crypto.randomUUID(),
            kind: "comentario_cliente" as const,
            actor: {
              type: "cliente" as const,
              name: DEMO_CLIENT_ACTOR,
              initials: comment.initials,
              color: comment.color,
            },
            createdAt: nowIso,
            comentario: input.text,
          },
        ],
        updatedAt: nowIso,
      }));
      return { ok: true as const, comment };
    },

    async freshRelatorioUrl(token: unknown, raw: unknown): Promise<{ url: string }> {
      const input = ReportUrlInput.parse(raw);
      const session = await authorize(token, "read");
      assertOwnCampaign(session, input.campanhaId);
      const url = await port.signReportUrl(session, input.relatorioId);
      if (!url) throw new DemoError("not_found", "Relatório não encontrado.");
      return { url };
    },
  };
}

export type DemoPublicService = ReturnType<typeof createDemoPublicService>;

export const DEMO_GENERIC_ERROR =
  "Não foi possível completar esta operação. Tente novamente em instantes.";

/**
 * Erro exibível ao cliente. `DemoError` e erros de regra do produto (mensagem em português,
 * já escritos para o usuário) passam; erro de validação mostra só as mensagens que nós
 * escrevemos (`custom`); o resto vira texto genérico, sem detalhe técnico.
 */
export function toSafeDemoError(error: unknown): Error {
  if (error instanceof DemoError) return new Error(error.message);
  if (error instanceof z.ZodError) {
    const custom = error.issues.find((i) => i.code === "custom");
    return new Error(custom?.message ?? "Dados inválidos.");
  }
  if (error instanceof Error && error.message) return new Error(error.message);
  return new Error(DEMO_GENERIC_ERROR);
}
