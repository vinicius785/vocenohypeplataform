/**
 * Tipos do domínio "Demo operacional" (docs/decisions/0004-demo-operacional.md).
 * Isomórfico e puro: sem React, sem Supabase.
 */

export type DemoStatus = "active" | "closed";

/** Estado de ACESSO do link do cliente — derivado, nunca gravado. */
export type DemoAccessState = "ativo" | "expirado" | "revogado" | "encerrado";

export type DemoEventKind =
  | "criada"
  | "reiniciada"
  | "encerrada"
  | "acesso_revogado"
  | "acesso_renovado"
  | "link_gerado"
  | "cliente_abriu_link";

/** Linha de `demo_sessions` (inclui o segredo — só existe no servidor). */
export type DemoSessionRow = {
  id: string;
  lead_id: string | null;
  cliente_id: string;
  campanha_id: string;
  organization_id: string;
  scenario: string;
  seed_version: number;
  status: DemoStatus;
  token: string;
  token_expires_at: string;
  access_revoked_at: string | null;
  closed_at: string | null;
  last_client_access_at: string | null;
  realtime_key: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Visão devolvida ao time: NUNCA contém o token. */
export type DemoSessionView = Omit<DemoSessionRow, "token"> & { access: DemoAccessState };

/** Dados de um evento de ciclo de vida: JSON simples (serializável pelas server functions). */
export type DemoEventData = Record<string, string | number | boolean | null>;

export type DemoEventRow = {
  id: string;
  session_id: string;
  kind: DemoEventKind;
  actor_user_id: string | null;
  data: DemoEventData;
  created_at: string;
};

/** Resposta de `demo_prerequisites()` no banco. */
export type DemoPrerequisites = {
  schemaVersion: number;
  /** Migration 20261004 (RLS de dados internos) aplicada. */
  rlsInternalOnly: boolean;
  /** `ensure_campanha_nps_influenciador` ignora campanhas de demo. */
  npsGuard: boolean;
  /** Gatilho do marcador `clientes.data.demoSessionId`. */
  markerGuard: boolean;
};

/** Versão do esquema que este código espera de `demo_prerequisites()`. */
export const DEMO_SCHEMA_VERSION = 1;

/** Erro com mensagem SEGURA para o usuário (em português). Qualquer outro erro vira
 * mensagem genérica na borda — nunca vaza detalhe de banco. */
export class DemoError extends Error {
  readonly code: DemoErrorCode;
  constructor(code: DemoErrorCode, message: string) {
    super(message);
    this.name = "DemoError";
    this.code = code;
  }
}

export type DemoErrorCode =
  | "prerequisites"
  | "lead_not_found"
  | "already_active"
  | "not_found"
  | "closed"
  | "invalid_state"
  | "forbidden";

/** Mensagem única para QUALQUER falha de acesso por token (não há oráculo de
 * existência/expiração/revogação). */
export const DEMO_LINK_INVALID_MESSAGE = "Link inválido ou expirado.";
