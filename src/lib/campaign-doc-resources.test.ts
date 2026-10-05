import { describe, expect, it } from "vitest";
import type { CampaignDoc } from "@/lib/campanha-scoped-store";
import {
  applyCampaignDocEdit,
  campaignDocFromInput,
  campaignDocToResource,
} from "./campaign-doc-resources";

const link: CampaignDoc = {
  id: "1",
  tipo: "link",
  titulo: "Guia",
  url: "https://docs.google.com/document/d/1",
  criadoEm: "2026-10-01T10:00:00Z",
};
const anexo: CampaignDoc = {
  id: "2",
  tipo: "anexo",
  titulo: "Contrato",
  url: "data:application/pdf;base64,AAA",
  arquivoNome: "contrato.pdf",
  criadoEm: "2026-10-02T10:00:00Z",
};

describe("adaptador CampaignDoc ↔ DocumentResource", () => {
  it("link vira recurso com a origem detectada; anexo vira arquivo", () => {
    expect(campaignDocToResource(link)).toMatchObject({
      kind: "link",
      sourceType: "google_docs",
      title: "Guia",
    });
    expect(campaignDocToResource(anexo)).toMatchObject({
      kind: "file",
      sourceType: "file",
      fileName: "contrato.pdf",
    });
  });
  it("criar mantém o formato persistido de antes", () => {
    const l = campaignDocFromInput({ kind: "link", title: "", url: " https://a.com " });
    expect(l).toMatchObject({ tipo: "link", titulo: "https://a.com", url: "https://a.com" });
    expect(l).not.toHaveProperty("arquivoNome");
    const f = campaignDocFromInput({
      kind: "file",
      title: "",
      url: "data:x",
      fileName: "a.pdf",
    });
    expect(f).toMatchObject({ tipo: "anexo", titulo: "a.pdf", arquivoNome: "a.pdf" });
  });
  it("editar link troca nome e endereço; editar anexo só o nome (mantém o arquivo)", () => {
    expect(
      applyCampaignDocEdit(link, { kind: "link", title: "Novo", url: "https://b.com" }),
    ).toMatchObject({ id: "1", titulo: "Novo", url: "https://b.com", tipo: "link" });
    const e = applyCampaignDocEdit(anexo, { kind: "file", title: "Contrato v2", url: anexo.url });
    expect(e).toMatchObject({ titulo: "Contrato v2", url: anexo.url, arquivoNome: "contrato.pdf" });
  });
});
