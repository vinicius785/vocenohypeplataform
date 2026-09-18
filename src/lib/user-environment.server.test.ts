import { describe, expect, it } from "vitest";
import {
  resolveUserEnvironment,
  INTERNAL_HOME_ROUTE,
  CLIENT_PORTAL_HOME_ROUTE,
  ENVIRONMENT_PICKER_ROUTE,
  PENDING_ACCESS_ROUTE,
} from "@/lib/user-environment.server";

type FakeOrg = {
  id: string;
  name: string;
  type: "internal" | "client";
  status: string;
  logo_url?: string | null;
};
type FakeMembership = {
  user_id: string;
  organization_id: string;
  role: string;
  status: string;
  last_access_at: string | null;
  org: FakeOrg;
};

/** Fake mínimo do client Supabase, só pro `.from("organization_members").select(...).eq().eq()`
 * usado por `resolveUserEnvironment` — simula o `!inner` join filtrando por
 * `organizations.status` também, igual o Postgrest real faria. */
function makeFakeDb(memberships: FakeMembership[]) {
  const db = {
    from(table: string) {
      if (table !== "organization_members") throw new Error(`unexpected table ${table}`);
      const filters: { col: string; value: unknown }[] = [];
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, value: unknown) {
          filters.push({ col, value });
          return builder;
        },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          const rows = memberships
            .filter((m) => {
              return filters.every((f) => {
                if (f.col === "user_id") return m.user_id === f.value;
                if (f.col === "status") return m.status === f.value;
                if (f.col === "organizations.status") return m.org.status === f.value;
                return true;
              });
            })
            .map((m) => ({
              organization_id: m.organization_id,
              role: m.role,
              status: m.status,
              last_access_at: m.last_access_at,
              organizations: m.org,
            }));
          resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  };
  return db as unknown as Parameters<typeof resolveUserEnvironment>[0];
}

const internalOrg: FakeOrg = {
  id: "org-internal",
  name: "Você no Hype",
  type: "internal",
  status: "active",
};
const clientOrgA: FakeOrg = {
  id: "org-client-a",
  name: "Cliente A",
  type: "client",
  status: "active",
};
const clientOrgB: FakeOrg = {
  id: "org-client-b",
  name: "Cliente B",
  type: "client",
  status: "active",
};
const suspendedClientOrg: FakeOrg = {
  id: "org-client-c",
  name: "Cliente C",
  type: "client",
  status: "suspended",
};

describe("resolveUserEnvironment", () => {
  it("um ambiente interno ativo -> internal", async () => {
    const db = makeFakeDb([
      {
        user_id: "u1",
        organization_id: internalOrg.id,
        role: "internal_member",
        status: "active",
        last_access_at: null,
        org: internalOrg,
      },
    ]);
    const result = await resolveUserEnvironment(db, "u1");
    expect(result).toEqual({
      type: "internal",
      organizationId: internalOrg.id,
      redirectTo: INTERNAL_HOME_ROUTE,
    });
  });

  it("um ambiente de cliente ativo -> client", async () => {
    const db = makeFakeDb([
      {
        user_id: "u1",
        organization_id: clientOrgA.id,
        role: "client_member",
        status: "active",
        last_access_at: null,
        org: clientOrgA,
      },
    ]);
    const result = await resolveUserEnvironment(db, "u1");
    expect(result).toEqual({
      type: "client",
      organizationId: clientOrgA.id,
      redirectTo: CLIENT_PORTAL_HOME_ROUTE,
    });
  });

  it("múltiplos ambientes ativos (interno + cliente) -> multiple, com redirectTo correto", async () => {
    const db = makeFakeDb([
      {
        user_id: "u1",
        organization_id: internalOrg.id,
        role: "internal_member",
        status: "active",
        last_access_at: null,
        org: internalOrg,
      },
      {
        user_id: "u1",
        organization_id: clientOrgA.id,
        role: "client_admin",
        status: "active",
        last_access_at: "2026-09-01T00:00:00Z",
        org: clientOrgA,
      },
    ]);
    const result = await resolveUserEnvironment(db, "u1");
    expect(result.type).toBe("multiple");
    expect(result.redirectTo).toBe(ENVIRONMENT_PICKER_ROUTE);
    if (result.type === "multiple") {
      expect(result.environments).toHaveLength(2);
      expect(result.environments.map((e) => e.organizationId).sort()).toEqual(
        [internalOrg.id, clientOrgA.id].sort(),
      );
    }
  });

  it("múltiplos ambientes de cliente -> multiple", async () => {
    const db = makeFakeDb([
      {
        user_id: "u1",
        organization_id: clientOrgA.id,
        role: "client_member",
        status: "active",
        last_access_at: null,
        org: clientOrgA,
      },
      {
        user_id: "u1",
        organization_id: clientOrgB.id,
        role: "client_viewer",
        status: "active",
        last_access_at: null,
        org: clientOrgB,
      },
    ]);
    const result = await resolveUserEnvironment(db, "u1");
    expect(result.type).toBe("multiple");
  });

  it("zero ambientes ativos -> pending", async () => {
    const db = makeFakeDb([]);
    const result = await resolveUserEnvironment(db, "u1");
    expect(result).toEqual({ type: "pending", redirectTo: PENDING_ACCESS_ROUTE });
  });

  it("ambiente com organização SUSPENSA é excluído mesmo com a membership ativa", async () => {
    const db = makeFakeDb([
      {
        user_id: "u1",
        organization_id: suspendedClientOrg.id,
        role: "client_member",
        status: "active",
        last_access_at: null,
        org: suspendedClientOrg,
      },
    ]);
    const result = await resolveUserEnvironment(db, "u1");
    expect(result).toEqual({ type: "pending", redirectTo: PENDING_ACCESS_ROUTE });
  });

  it("membership SUSPENSA é excluída mesmo com a organização ativa", async () => {
    const db = makeFakeDb([
      {
        user_id: "u1",
        organization_id: clientOrgA.id,
        role: "client_member",
        status: "suspended",
        last_access_at: null,
        org: clientOrgA,
      },
    ]);
    const result = await resolveUserEnvironment(db, "u1");
    expect(result).toEqual({ type: "pending", redirectTo: PENDING_ACCESS_ROUTE });
  });

  it("membership REMOVIDA é excluída mesmo com a organização ativa", async () => {
    const db = makeFakeDb([
      {
        user_id: "u1",
        organization_id: clientOrgA.id,
        role: "client_member",
        status: "removed",
        last_access_at: null,
        org: clientOrgA,
      },
    ]);
    const result = await resolveUserEnvironment(db, "u1");
    expect(result).toEqual({ type: "pending", redirectTo: PENDING_ACCESS_ROUTE });
  });
});
