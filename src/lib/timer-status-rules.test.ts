import { describe, expect, it } from "vitest";
import {
  shouldStartTimerOnStatusChange as start,
  shouldStopTimerOnStatusChange as stop,
} from "./timer-status-rules";

describe("cronômetro x mudança de status", () => {
  it("entrar em 'Em andamento' inicia; permanecer não", () => {
    expect(start("A fazer", "Em andamento")).toBe(true);
    expect(start("Bloqueada", "Em andamento")).toBe(true);
    expect(start("Em andamento", "Em andamento")).toBe(false);
    expect(start("Em andamento", "Concluído")).toBe(false);
    expect(start(undefined, "Em andamento")).toBe(true);
  });
  it("sair de 'Em andamento' para qualquer outro status para/pausa", () => {
    for (const next of ["A fazer", "Em revisão", "Bloqueada", "Concluído", "Arquivado"]) {
      expect(stop("Em andamento", next)).toBe(true);
    }
  });
  it("'Concluído' sempre para, de qualquer status de origem", () => {
    expect(stop("A fazer", "Concluído")).toBe(true);
    expect(stop("Em revisão", "Concluído")).toBe(true);
  });
  it("mudanças que não envolvem andamento/concluído não tocam no cronômetro", () => {
    expect(stop("A fazer", "Em revisão")).toBe(false);
    expect(stop("Bloqueada", "A fazer")).toBe(false);
    expect(stop("Em andamento", "Em andamento")).toBe(false);
  });
});
