import { describe, expect, it } from "vitest";
import { getScopedTasks, listScopeCandidates } from "@/lib/hypito-tools.server";
import type { UserAccess } from "@/lib/hypito-permissions.server";

/**
 * Achado da auditoria de segurança (2026-09): `getScopedTasks` e o ramo de
 * projetos de `listScopeCandidates` liam dados antes/sem checar
 * `assertCan`, dependendo só de quem os chamava já ter checado permissão.
 * Estes testes negativos garantem defesa em profundidade — mesmo chamados
 * diretamente (um novo código futuro, por exemplo), nunca vazam dado pra
 * quem não tem o módulo liberado.
 */

const noAccess: UserAccess = { userId: "u1", isAdmin: false, permissions: [] };
const projectsOnly: UserAccess = { userId: "u1", isAdmin: false, permissions: ["projetos"] };
const campaignsOnly: UserAccess = { userId: "u1", isAdmin: false, permissions: ["campanhas"] };

// `db` nunca deveria ser chamado quando a permissão falta — passar `null`
// forçaria um erro alto e claro (TypeError) se `assertCan` não barrar antes.
const dbThatMustNotBeCalled = null as never;

describe("getScopedTasks — nega acesso antes de ler dados (defesa em profundidade)", () => {
  it("lança ao pedir tarefas de campanha sem a permissão 'campanhas'", async () => {
    await expect(
      getScopedTasks(dbThatMustNotBeCalled, projectsOnly, "campanha", "c1", "overdue"),
    ).rejects.toThrow();
  });

  it("lança ao pedir tarefas de projeto sem a permissão 'projetos'", async () => {
    await expect(
      getScopedTasks(dbThatMustNotBeCalled, campaignsOnly, "projeto", "p1", "overdue"),
    ).rejects.toThrow();
  });

  it("sem nenhuma permissão, ambos os escopos são negados", async () => {
    await expect(
      getScopedTasks(dbThatMustNotBeCalled, noAccess, "campanha", "c1", "upcoming"),
    ).rejects.toThrow();
    await expect(
      getScopedTasks(dbThatMustNotBeCalled, noAccess, "projeto", "p1", "upcoming"),
    ).rejects.toThrow();
  });
});

describe("listScopeCandidates — ramo de projetos nunca vaza sem 'projetos' (achado da auditoria)", () => {
  it("sem a permissão 'projetos', a lista de projetos vem vazia (não propaga erro pro chamador)", async () => {
    const result = await listScopeCandidates(dbThatMustNotBeCalled, campaignsOnly);
    expect(result.projects).toEqual([]);
  });

  it("sem a permissão 'campanhas', a lista de campanhas vem vazia", async () => {
    const result = await listScopeCandidates(dbThatMustNotBeCalled, projectsOnly);
    expect(result.campaigns).toEqual([]);
  });
});
