import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Lead } from "@/lib/comercial";

// `member-ui` puxa o chat-store/Supabase; aqui só importa a marcação do card.
vi.mock("@/components/team/member-ui", () => ({
  avatarAccent: () => "",
  initialsOf: (n: string, f: string) => (n || f || "?").slice(0, 2).toUpperCase(),
}));
vi.mock("@/lib/commercial-interactions.functions", () => ({
  INTERACTION_OUTCOME_LABEL: {},
  INTERACTION_TYPE_LABEL: {},
}));

const { LeadCard } = await import("./LeadCard");

const DAY = 86_400_000;
const base = {
  id: "l1",
  name: "zerezes",
  company: "",
  contact: "Head of Growth / Digital",
  role: "Head of Growth / Digital",
  value: 100_000,
  stage: "CONTATO_FEITO",
  phone: "(21) 98114-5276",
  responsible: "Rodrigo Hype",
  tags: [],
  activities: [],
} as unknown as Lead;

const render = (over: Partial<Lead> = {}) =>
  renderToStaticMarkup(
    <LeadCard
      lead={{ ...base, ...over }}
      onOpen={() => {}}
      onDragStart={() => {}}
      onDragEnd={() => {}}
      onRegisterFollowUp={() => {}}
      dragging={false}
    />,
  );
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("LeadCard — o que o vendedor lê sem abrir a ficha", () => {
  it("quem, quanto, situação e o CTA; cargo sem repetir o contato", () => {
    const t = text(render({ lastContactAt: Date.now() - 6 * DAY }));
    expect(t).toContain("zerezes");
    expect(t).toContain("R$ 100.000");
    expect(t).toContain("Sem contato há 6 dias");
    expect(t).toContain("Registrar follow-up");
    // contato e cargo iguais (webhook) aparecem uma vez só
    expect(t.match(/Head of Growth \/ Digital/g)).toHaveLength(1);
  });

  it("nunca contatado, contato hoje e aguardando retorno", () => {
    expect(text(render())).toContain("Nunca contatado");
    expect(text(render({ lastContactAt: Date.now() - 3_600_000 }))).toContain("Contato hoje");
    expect(text(render({ stage: "PROPOSTA_ENVIADA" }))).toContain("Aguardando retorno");
  });

  it("com próxima ação, ela substitui a frase de contato (uma situação só)", () => {
    const html = render({
      nextActionAt: Date.now() + 2 * DAY,
      nextActionDescription: "Enviar proposta",
      lastContactAt: Date.now() - 10 * DAY,
    });
    const t = text(html);
    expect(t).toContain("Próxima ação: Enviar proposta");
    expect(t).not.toContain("Sem contato há");
    expect(t).not.toContain("Nunca contatado");
  });

  it("ação vencida em destaque discreto (ícone + cor de alerta, sem badge)", () => {
    const html = render({ nextActionAt: Date.now() - 2 * DAY });
    expect(text(html)).toContain("vencida há");
    expect(html).toContain("text-danger-soft-foreground");
    expect(html).not.toContain("rounded-full bg-"); // nada de badge colorido
  });

  it("valor ausente vira 'Valor a definir' (nunca 'R$ 0')", () => {
    const t = text(render({ value: 0 }));
    expect(t).toContain("Valor a definir");
    expect(t).not.toContain("R$ 0");
  });

  it("responsável: iniciais com nome acessível; sem responsável, ícone claro (não um '—')", () => {
    const withOwner = render();
    expect(withOwner).toContain('aria-label="Responsável: Rodrigo Hype"');
    const none = render({ responsible: undefined });
    expect(none).toContain('aria-label="Sem responsável"');
    expect(none).toContain("border-dashed");
    expect(text(none)).not.toContain("—");
  });

  it("WhatsApp é ação secundária com nome acessível; some sem telefone válido", () => {
    expect(render()).toContain('aria-label="Abrir WhatsApp"');
    expect(render()).toContain("https://wa.me/5521981145276");
    expect(render({ phone: undefined })).not.toContain("Abrir WhatsApp");
  });

  it("lead encerrado: mostra o desfecho e não oferece follow-up", () => {
    const won = text(render({ stage: "GANHO" }));
    expect(won).toContain("Ganho");
    expect(won).not.toContain("Registrar follow-up");
    const lost = text(render({ stage: "PERDIDO", lossReason: "Sem orçamento" }));
    expect(lost).toContain("Perdido — Sem orçamento");
    expect(lost).not.toContain("Registrar follow-up");
  });

  it("nomes e cargos longos truncam (e levam o texto completo no title)", () => {
    const long = "Associação Brasileira de Empresas de Tecnologia e Inovação Digital";
    const html = render({ company: long, role: "Diretor de Marketing e Comunicação Corporativa" });
    expect(html).toContain("truncate");
    expect(html).toContain(`title="${long}"`);
  });
});
