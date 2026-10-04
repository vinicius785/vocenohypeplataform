import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDemoScenario, demoCampanhaId, demoClienteId } from "./cenario-campanha-completa";
import { DEMO_CAMPANHA_TABLES } from "./demo-service.server";
import { DEMO_SCHEMA_VERSION, type DemoEventKind, type DemoSessionRow } from "./demo-types";

/**
 * Teste ESTÁTICO da migration 20261005 (não há Postgres neste ambiente): garante que o SQL e
 * o código TypeScript não divergem — colunas, tipos de evento, nomes de função/parâmetro,
 * tabelas limpas no reinício — e que as travas de segurança estão presentes. NÃO substitui a
 * execução da migration no banco (ver o roteiro de verificação em
 * docs/decisions/0004-demo-operacional.md).
 */

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");
const DEMO_FILE = "20261005000000_demo_operacional.sql";
const read = (f: string) => readFileSync(path.join(MIGRATIONS, f), "utf8");
const sql = read(DEMO_FILE);
const norm = (s: string) => s.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
const flat = norm(sql);

function tableColumns(table: string): string[] {
  const m = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
  if (!m) throw new Error(`tabela ${table} não encontrada`);
  return m[1]
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .filter((l) => /^ {2}[a-z_]+ /.test(l))
    .map((l) => l.trim().split(/\s+/)[0]);
}

function functionBody(file: string, name: string): string {
  const m = new RegExp(
    `create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`,
    "i",
  ).exec(read(file));
  if (!m) throw new Error(`função ${name} não encontrada em ${file}`);
  return norm(m[1]);
}

describe("ordem e escopo da migration", () => {
  it("é posterior à 20261004 (a de RLS) na ordem de aplicação", () => {
    const files = readdirSync(MIGRATIONS).sort();
    expect(files.indexOf(DEMO_FILE)).toBeGreaterThan(
      files.indexOf("20261004000000_restrict_internal_data_to_internal_members.sql"),
    );
    expect(files[files.length - 1]).toBe(DEMO_FILE);
  });

  it("é aditiva: nenhum DROP de tabela/coluna e nenhum ALTER de tabela existente", () => {
    expect(flat).not.toMatch(/drop table|drop column|drop policy|alter table public\.(?!demo_)/);
    expect(flat).not.toMatch(/\btruncate\b/);
  });
});

describe("esquema ⇄ tipos TypeScript", () => {
  it("colunas de demo_sessions == campos de DemoSessionRow", () => {
    const row: Record<keyof DemoSessionRow, true> = {
      id: true,
      lead_id: true,
      cliente_id: true,
      campanha_id: true,
      organization_id: true,
      scenario: true,
      seed_version: true,
      status: true,
      token: true,
      token_expires_at: true,
      access_revoked_at: true,
      closed_at: true,
      last_client_access_at: true,
      realtime_key: true,
      created_by: true,
      created_at: true,
      updated_at: true,
    };
    expect(tableColumns("demo_sessions").sort()).toEqual(Object.keys(row).sort());
  });

  it("tipos de evento do CHECK == DemoEventKind", () => {
    const kinds: Record<DemoEventKind, true> = {
      criada: true,
      reiniciada: true,
      encerrada: true,
      acesso_revogado: true,
      acesso_renovado: true,
      link_gerado: true,
      cliente_abriu_link: true,
    };
    const m = /kind text not null check \(kind in \(([^)]*)\)\)/.exec(flat)!;
    const inSql = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(inSql).toEqual(Object.keys(kinds).sort());
  });

  it("versão do esquema reportada por demo_prerequisites == DEMO_SCHEMA_VERSION", () => {
    expect(flat).toContain(`'schemaversion', ${DEMO_SCHEMA_VERSION}`);
  });

  it("demo_apply_scenario: nomes de função e parâmetros iguais aos da chamada RPC", () => {
    expect(flat).toContain(
      "function public.demo_apply_scenario(p_session_id uuid, p_payload jsonb)",
    );
    const adapter = readFileSync(path.resolve(__dirname, "demo-service.server.ts"), "utf8");
    expect(adapter).toContain('rpc("demo_apply_scenario"');
    expect(adapter).toContain("p_session_id");
    expect(adapter).toContain("p_payload");
    expect(adapter).toContain('rpc("demo_prerequisites")');
  });

  it("as chaves do payload lidas pelo SQL == chaves de DemoScenarioPayload", () => {
    const sessionId = "11111111-2222-4333-8444-555555555555";
    const { payload } = buildDemoScenario({
      sessionId,
      clienteId: demoClienteId(sessionId),
      campanhaId: demoCampanhaId(sessionId),
      now: new Date("2026-10-05T15:00:00.000Z"),
      empresa: "X",
      assetUrl: () => "u",
    });
    const used = [...flat.matchAll(/p_payload -> '([a-z]+)'/g)].map((m) => m[1]);
    expect([...new Set(used)].sort()).toEqual(Object.keys(payload).sort());
  });

  it("as tabelas limpas no reinício == as removidas na compensação (adapter)", () => {
    const applyBody = functionBody(DEMO_FILE, "demo_apply_scenario");
    const deleted = [...applyBody.matchAll(/delete from public\.([a-z_]+) where campanha_id/g)].map(
      (m) => m[1],
    );
    expect(deleted).toEqual([...DEMO_CAMPANHA_TABLES]);
  });
});

describe("isolamento por construção em demo_apply_scenario", () => {
  const body = functionBody(DEMO_FILE, "demo_apply_scenario");

  it("toda linha filha usa o campanha_id DA SESSÃO — nunca um valor vindo do payload", () => {
    expect(body).not.toMatch(/->>? '(campanha_id|campanhaid|organization_id|cliente_id)'/);
    for (const m of body.matchAll(
      /insert into public\.(campanha_[a-z]+) \(id, campanha_id, data\) select \(e ->> 'id'\)::uuid, (\w+\.campanha_id)/g,
    )) {
      expect(m[2], m[1]).toBe("s.campanha_id");
    }
    expect(body.match(/insert into public\.campanha_/g)).toHaveLength(4);
  });

  it("valida que cliente e campanha do payload pertencem à sessão antes de escrever", () => {
    expect(body).toContain("v_cliente ->> 'id' is distinct from s.cliente_id::text");
    expect(body).toContain("v_cliente ->> 'demosessionid' is distinct from v_marker");
    expect(body).toContain("jsonb_array_length(v_cliente -> 'campanhas') <> 1");
    expect(body.indexOf("raise exception 'a campanha do cenário")).toBeLessThan(
      body.indexOf("delete from"),
    );
  });

  it("só reescreve o cliente que JÁ é desta demo (organização + marcador) e confere a contagem", () => {
    expect(body).toContain(
      "where c.organization_id = s.organization_id and c.data ->> 'demosessionid' = v_marker",
    );
    expect(body).toContain("v_count <> 1");
  });

  it("recusa sessão inexistente ou não ativa e trava a linha da sessão", () => {
    expect(body).toContain("for update");
    expect(body).toContain("if s.status <> 'active'");
  });
});

describe("travas de segurança", () => {
  it("o token NÃO está no GRANT SELECT por coluna de `authenticated`", () => {
    const m = /grant select \(([^)]*)\) on public\.demo_sessions to authenticated/.exec(flat)!;
    const cols = m[1].split(",").map((c) => c.trim());
    expect(cols).not.toContain("token");
    expect(cols).toContain("realtime_key");
    expect(cols).toContain("token_expires_at");
    // todas as colunas, menos o segredo
    expect(cols.sort()).toEqual(
      tableColumns("demo_sessions")
        .filter((c) => c !== "token")
        .sort(),
    );
  });

  it("anon/authenticated/public perdem tudo nas tabelas; só service_role escreve", () => {
    expect(flat).toContain(
      "revoke all on table public.demo_sessions from public, anon, authenticated",
    );
    expect(flat).toContain(
      "revoke all on table public.demo_events from public, anon, authenticated",
    );
    expect(flat).toContain("grant all on public.demo_sessions to service_role");
    expect(flat).toContain("grant all on public.demo_events to service_role");
    expect(flat).not.toMatch(/grant (insert|update|delete|all)[^;]* to (anon|authenticated)/);
  });

  it("RLS ligada e leitura só para equipe interna/admin (conta de cliente não passa)", () => {
    expect(flat).toContain("alter table public.demo_sessions enable row level security");
    expect(flat).toContain("alter table public.demo_events enable row level security");
    const policies = [
      ...flat.matchAll(
        /create policy "([^"]+)" on public\.(demo_\w+) for select to authenticated using \(([^;]*)\);/g,
      ),
    ];
    expect(policies).toHaveLength(2);
    for (const [, , , using] of policies) {
      expect(using).toBe(
        "public.is_internal_team_member(auth.uid()) or public.is_admin(auth.uid())",
      );
    }
    expect(flat.match(/create policy/g)).toHaveLength(2); // nenhuma policy de escrita
  });

  it("as duas funções públicas só executam como service_role", () => {
    for (const fn of ["demo_apply_scenario(uuid, jsonb)", "demo_prerequisites()"]) {
      expect(flat).toContain(
        `revoke all on function public.${fn} from public, anon, authenticated`,
      );
      expect(flat).toContain(`grant execute on function public.${fn} to service_role`);
    }
  });

  it("funções SECURITY DEFINER fixam o search_path", () => {
    for (const m of flat.matchAll(
      /create or replace function public\.(\w+)\([^)]*\) returns \w+ language \w+ ([^$]*?)as \$\$/g,
    )) {
      if (m[2].includes("security definer"))
        expect(m[2], m[1]).toContain("set search_path = public");
    }
  });

  it("uma demo ATIVA por lead (índice único parcial) e imutabilidade da identidade", () => {
    expect(flat).toContain(
      "create unique index demo_sessions_one_active_per_lead on public.demo_sessions (lead_id) where status = 'active' and lead_id is not null",
    );
    const guard = functionBody(DEMO_FILE, "demo_sessions_guard");
    for (const col of ["cliente_id", "campanha_id", "organization_id", "realtime_key"]) {
      expect(guard).toContain(`new.${col} is distinct from old.${col}`);
    }
    expect(guard).toContain("old.status = 'closed' and new.status is distinct from 'closed'");
  });

  it("marcador do cliente: imutável no UPDATE e, no INSERT, exige a sessão correspondente", () => {
    const g = functionBody(DEMO_FILE, "clientes_demo_marker_guard");
    expect(g).toContain(
      "(old.data->>'demosessionid') is distinct from (new.data->>'demosessionid')",
    );
    expect(g).toContain("d.id::text = v_marker and d.cliente_id = new.id");
    expect(flat).toContain(
      "create trigger clientes_demo_marker_guard before insert or update on public.clientes for each row",
    );
  });
});

describe("guarda do NPS automático", () => {
  it("é a função original + UMA condição (demo ignorada) — comportamento real preservado", () => {
    const original = functionBody(
      "20261001120000_campanha_nps_influenciador.sql",
      "ensure_campanha_nps_influenciador",
    );
    const updated = functionBody(DEMO_FILE, "ensure_campanha_nps_influenciador");
    const insert =
      "insert into public.campanha_nps_influenciador (campanha_id, influenciador_id, token) values (new.campanha_id, new.id, encode(gen_random_bytes(16), 'hex')) on conflict (campanha_id, influenciador_id) do nothing;";
    expect(original).toContain(insert);
    expect(updated).toContain(insert);
    expect(updated).toContain(
      "and not exists (select 1 from public.demo_sessions d where d.campanha_id = new.campanha_id)",
    );
    expect(
      updated.replace(
        " and not exists (select 1 from public.demo_sessions d where d.campanha_id = new.campanha_id)",
        "",
      ),
    ).toBe(original);
  });
});

describe("demo_prerequisites ⇄ migration 20261004", () => {
  const rls = norm(read("20261004000000_restrict_internal_data_to_internal_members.sql"));

  it("os 3 sinais de 'RLS aplicada' existem de fato na migration de RLS", () => {
    expect(flat).toContain("policyname = 'auth read shared'");
    expect(rls).toContain(
      'create policy "auth read shared" on public.shared_state for select to authenticated using (public.is_internal_team_member(auth.uid())',
    );
    expect(flat).toContain("policyname = 'relatorios_mensais_read_authenticated'");
    expect(rls).toContain(
      'create policy "relatorios_mensais_read_authenticated" on storage.objects',
    );
    expect(flat).toContain("indexname = 'organization_members_user_id_idx'");
    expect(rls).toContain("create index if not exists organization_members_user_id_idx");
  });

  it("os sinais exigem `is_internal_team_member` no texto da policy", () => {
    expect(flat.match(/qual ilike '%is_internal_team_member%'/g)).toHaveLength(2);
  });
});
