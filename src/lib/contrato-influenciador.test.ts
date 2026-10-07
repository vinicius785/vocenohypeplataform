import { describe, expect, it } from "vitest";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import type { BankInflu } from "@/lib/banco-influs-store";
import type { Entrega, Influ } from "@/lib/influencer-model";
import {
  CONTRATO_TEMPLATE_VERSION,
  anexoGroupKey,
  buildContratoDraft,
  evaluateContrato,
  suggestFormato,
  suggestPermanencia,
  type ContratoDraft,
  type ContratoSource,
} from "./contrato-influenciador";

const entrega = (over: Partial<Entrega> = {}): Entrega =>
  ({
    id: "e1",
    tipo: "Reels",
    quantidade: 1,
    status: "combinado",
    stage: "ROTEIRO_PRODUCAO",
    dataPostagem: "2026-10-20",
    ...over,
  }) as Entrega;

const influ = (over: Partial<Influ> = {}): Influ =>
  ({
    id: "i1",
    nome: "Aline Peixoto",
    status: "APROVADO",
    email: "aline@exemplo.com",
    telefone: "(21) 99999-0000",
    redes: [{ id: "r1", plataforma: "Instagram", handle: "riopara2", isPrimary: true }],
    entregas: [entrega()],
    bank: {
      titular: "Aline Peixoto da Silva",
      cpfCnpj: "52998224725",
      pixTipo: "cpf",
      pixChave: "529.982.247-25",
    },
    pagamento: {
      tipos: ["Valor"],
      config: { Valor: { valor: "R$ 3.500,00" } },
      aprovacao: "aceito",
    },
    ...over,
  }) as Influ;

const campanha = (over: Record<string, unknown> = {}): Campaign =>
  ({
    id: "c1",
    nome: "PoupaTempo RJ",
    dataInicio: "2026-10-15",
    prazo: "2026-11-30",
    direitosImagem: {
      permitido: true,
      usos: ["Orgânico (perfil do influenciador)", "Pago (whitelisting/impulsionamento)"],
      duracaoDias: 180,
      exclusividade: true,
      exclusividadeDias: 30,
    },
    ...over,
  }) as unknown as Campaign;

const banco: BankInflu = {
  id: "b1",
  nome: "Aline Peixoto",
  redes: [],
  endereco: {
    rua: "Rua das Flores",
    numero: "10",
    complemento: "apto 2",
    bairro: "Centro",
    cidade: "Rio de Janeiro",
    estado: "RJ",
    cep: "20000000",
  },
};

const source = (over: Partial<ContratoSource> = {}): ContratoSource => ({
  influ: influ(),
  banco,
  campanha: campanha(),
  cliente: { empresa: "Governo do Estado do RJ" },
  canReadBank: true,
  ...over,
});

/** Completa o que o diálogo coletaria à mão (horário, permanência, antecedência, pesos). */
function completar(draft: ContratoDraft): ContratoDraft {
  return {
    ...draft,
    aprovacaoAntecedenciaDias: "3",
    entregas: draft.entregas.map((r) => ({ ...r, horario: "18:00" })),
    anexoPesos: Object.fromEntries(
      [...new Set(draft.entregas.map(anexoGroupKey))].map((k, _i, all) => [
        k,
        String(100 / all.length),
      ]),
    ),
  };
}

const codes = (r: ReturnType<typeof evaluateContrato>) => r.issues.map((i) => i.code);

describe("buildContratoDraft (pré-preenchimento)", () => {
  it("puxa o que existe: titular, CPF, endereço, perfil, plataformas, e-mail, telefone, campanha", () => {
    const d = buildContratoDraft(source());
    expect(d.contratadoNome).toBe("Aline Peixoto da Silva");
    expect(d.contratadoDocumento).toBe("529.982.247-25");
    expect([d.rua, d.numero, d.bairro, d.cidade, d.uf, d.cep]).toEqual([
      "Rua das Flores",
      "10",
      "Centro",
      "Rio de Janeiro",
      "RJ",
      "20000000",
    ]);
    expect(d.perfil).toBe("@riopara2");
    expect(d.plataformas).toBe("Instagram");
    expect(d.email).toBe("aline@exemplo.com");
    expect(d.anunciante).toBe("Governo do Estado do RJ");
    expect(d.periodoInicio).toBe("2026-10-15");
    expect(d.periodoFim).toBe("2026-11-30");
    expect(d.pagamentoForma).toBe("PIX");
    expect(d.pagamentoDados).toBe("CPF: 529.982.247-25");
    expect(d.pagamentoPrazoDiasUteis).toBe("30");
    expect(d.exclusividadeModo).toBe("dias");
    expect(d.exclusividadeDias).toBe("30");
  });

  it("o briefing é só uma sugestão (nome da campanha); antecedência e horários ficam vazios", () => {
    const d = buildContratoDraft(source());
    expect(d.briefingReferencia).toBe("PoupaTempo RJ");
    expect(d.aprovacaoAntecedenciaDias).toBe("");
    expect(d.entregas[0].horario).toBe("");
  });

  it("e-mail e telefone caem no Banco quando a participação não tem", () => {
    const d = buildContratoDraft(
      source({
        influ: influ({ email: undefined, telefone: undefined }),
        banco: { ...banco, email: "banco@exemplo.com", telefone: "(11) 98888-7777" },
      }),
    );
    expect(d.email).toBe("banco@exemplo.com");
    expect(d.telefone).toBe("(11) 98888-7777");
  });

  it("sem permissão bancária nada de titular, CPF nem PIX é pré-preenchido", () => {
    const d = buildContratoDraft(source({ canReadBank: false }));
    expect([d.contratadoNome, d.contratadoDocumento, d.pagamentoForma, d.pagamentoDados]).toEqual([
      "",
      "",
      "",
      "",
    ]);
  });

  it("sem PIX, cai em transferência com o que existir", () => {
    const d = buildContratoDraft(
      source({
        influ: influ({
          bank: {
            titular: "Aline Peixoto da Silva",
            cpfCnpj: "52998224725",
            banco: "Nubank",
            agencia: "0001",
            conta: "123456-7",
            tipoConta: "corrente",
          },
        }),
      }),
    );
    expect(d.pagamentoForma).toBe("Transferência Bancária");
    expect(d.pagamentoDados).toBe(
      "Banco Nubank, Ag. 0001, Conta 123456-7 (corrente), Titular Aline Peixoto da Silva, CPF/CNPJ 529.982.247-25",
    );
  });

  it("várias redes: principal primeiro, @ garantido, plataformas únicas", () => {
    const d = buildContratoDraft(
      source({
        influ: influ({
          redes: [
            { id: "a", plataforma: "TikTok", handle: "@alinetk" },
            { id: "b", plataforma: "Instagram", handle: "alinelinda", isPrimary: true },
            { id: "c", plataforma: "Instagram", handle: "alineoutra" },
          ],
        }),
      }),
    );
    expect(d.perfil).toBe("@alinelinda, @alinetk, @alineoutra");
    expect(d.plataformas).toBe("Instagram / TikTok");
  });

  it("entregas: só combinadas/publicadas, por data, com sugestão de formato e permanência", () => {
    const d = buildContratoDraft(
      source({
        influ: influ({
          entregas: [
            entrega({ id: "x", tipo: "Reels", dataPostagem: "2026-10-25" }),
            entrega({ id: "y", tipo: "Stories", quantidade: 3, dataPostagem: "2026-10-18" }),
            entrega({ id: "z", tipo: "Post feed", status: "orcado" }),
          ],
        }),
      }),
    );
    expect(d.entregas.map((r) => r.entregaId)).toEqual(["y", "x"]);
    expect(d.entregas[0]).toMatchObject({
      tipo: "Stories",
      quantidade: "3",
      formato: "Instagram Stories",
      permanencia: "24 horas",
    });
    expect(d.entregas[1]).toMatchObject({ formato: "Instagram Reels", permanencia: "Permanente" });
  });

  it("entrega dividida em unidades mantém o sufixo (1/3)", () => {
    const d = buildContratoDraft(
      source({
        influ: influ({
          entregas: [entrega({ id: "u1", tipo: "Stories", grupoId: "g", titulo: "(1/3)" })],
        }),
      }),
    );
    expect(d.entregas[0].tipo).toBe("Stories (1/3)");
    expect(d.entregas[0].formato).toBe("Instagram Stories");
  });

  it("sugestões só para os formatos que o template exemplifica", () => {
    expect(suggestFormato("TikTok")).toBe("TikTok");
    expect(suggestFormato("Short")).toBe("YouTube – Short");
    expect(suggestFormato("Vídeo YouTube")).toBe("YouTube – Video");
    expect(suggestFormato("Post feed")).toBe("Instagram Feed");
    expect(suggestFormato("Carrossel")).toBe("");
    expect(suggestPermanencia("Post feed")).toBe("");
    expect(suggestPermanencia("Carrossel")).toBe("");
  });

  it("exclusividade 'false' na campanha pré-seleciona 'nenhuma'; sem direitos, fica por confirmar", () => {
    const sem = buildContratoDraft(
      source({
        campanha: campanha({
          direitosImagem: { permitido: true, usos: [], duracaoDias: 30, exclusividade: false },
        }),
      }),
    );
    expect(sem.exclusividadeModo).toBe("nenhuma");
    const nada = buildContratoDraft(source({ campanha: campanha({ direitosImagem: undefined }) }));
    expect(nada.exclusividadeModo).toBe("");
  });
});

describe("evaluateContrato — caminho feliz", () => {
  it("gera as variáveis finais depois de completar o que o diálogo coleta", () => {
    const src = source();
    const r = evaluateContrato(completar(buildContratoDraft(src)), src);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    const v = r.variables!;
    expect(v.template_version).toBe(CONTRATO_TEMPLATE_VERSION);
    expect(v.contratado_nome).toBe("Aline Peixoto da Silva");
    expect(v.contratado_documento).toBe("529.982.247-25");
    expect(v.contratado_endereco).toBe(
      "Rua das Flores, nº 10, apto 2, Centro, Rio de Janeiro – RJ",
    );
    expect(v.contratado_cep).toBe("20000-000");
    expect(v.contratado_perfil).toBe("@riopara2");
    expect(v.contratado_telefone).toBe("(21) 99999-0000");
    expect(v.campanha_periodo_inicio).toBe("15/10/2026");
    expect(v.campanha_periodo_fim).toBe("30/11/2026");
    expect(v.entregas).toEqual([
      {
        tipo: "Reels",
        quantidade: "1",
        formato_plataforma: "Instagram Reels",
        data_horario: "20/10/2026 – 18:00",
        permanencia: "Permanente",
      },
    ]);
    expect(v.aprovacao_antecedencia_dias).toBe("3");
    expect(v.pagamento_valor_total).toBe("3.500,00");
    expect(v.pagamento_valor_total_extenso).toBe("três mil e quinhentos reais");
    expect(v.pagamento_forma).toBe("PIX");
    expect(v.pagamento_dados).toBe("CPF: 529.982.247-25");
    expect(v.pagamento_parcela_valor).toBe("3.500,00");
    expect(v.pagamento_prazo_dias_uteis).toBe("30");
    expect(v.exclusividade_periodo).toBe("30 dias a partir da data de assinatura");
    expect(v.uso_conteudo_meses).toBe("6");
    expect(v.midia_paga_autorizada).toBe("SIM");
    expect(v.anexo_i).toEqual([
      {
        tipo: "Reels",
        plataforma: "Instagram Reels",
        peso_percentual: "100%",
        valor_correspondente: "3.500,00",
      },
    ]);
    expect(v.anexo_i_total_valor).toBe("3.500,00");
  });

  it("mídia paga = NÃO quando a campanha não lista uso pago", () => {
    const src = source({
      campanha: campanha({
        direitosImagem: {
          permitido: true,
          usos: ["Orgânico (perfil do influenciador)"],
          duracaoDias: 90,
          exclusividade: true,
          exclusividadeDias: 30,
        },
      }),
    });
    const r = evaluateContrato(completar(buildContratoDraft(src)), src);
    expect(r.variables?.midia_paga_autorizada).toBe("NÃO");
    expect(r.variables?.uso_conteudo_meses).toBe("3");
  });

  it("o valor pode ter sido digitado de vários jeitos", () => {
    for (const valor of ["3500", "3.500,00", "R$ 3.500", "3500.00"]) {
      const src = source({
        influ: influ({
          pagamento: { tipos: ["Valor"], config: { Valor: { valor } }, aprovacao: "aceito" },
        }),
      });
      const r = evaluateContrato(completar(buildContratoDraft(src)), src);
      expect(r.variables?.pagamento_valor_total, valor).toBe("3.500,00");
    }
  });
});

describe("evaluateContrato — elegibilidade", () => {
  const rodar = (src: ContratoSource) => evaluateContrato(completar(buildContratoDraft(src)), src);

  it("bloqueia cliente demo, influenciador não aprovado e falta de permissão bancária", () => {
    expect(codes(rodar(source({ cliente: { empresa: "X", demoSessionId: "d1" } })))).toContain(
      "demo",
    );
    expect(codes(rodar(source({ influ: influ({ status: "EM_CURADORIA" }) })))).toContain(
      "influ.status",
    );
    const semPerm = rodar(source({ canReadBank: false }));
    expect(semPerm.ok).toBe(false);
    expect(codes(semPerm)).toContain("permissao.bancario");
  });
});

describe("evaluateContrato — dados da parte contratada", () => {
  const com = (patch: Partial<ContratoDraft>, src = source()) =>
    evaluateContrato({ ...completar(buildContratoDraft(src)), ...patch }, src);

  it("nome: vazio, só um nome, ou com colchetes de modelo", () => {
    expect(codes(com({ contratadoNome: "" }))).toContain("V01");
    expect(codes(com({ contratadoNome: "Aline" }))).toContain("V01");
    expect(codes(com({ contratadoNome: "[NOME COMPLETO]" }))).toContain("V01");
  });

  it("razão social de CNPJ pode ter uma palavra", () => {
    const r = com({ contratadoNome: "Alinex", contratadoDocumento: "11.222.333/0001-81" });
    expect(codes(r)).not.toContain("V01");
    expect(r.ok).toBe(true);
  });

  it("CPF/CNPJ: ausente e inválido são pendências diferentes", () => {
    const ausente = com({ contratadoDocumento: "" });
    expect(ausente.issues.find((i) => i.code === "V02")?.message).toMatch(/Informe/);
    const invalido = com({ contratadoDocumento: "529.982.247-24" });
    expect(invalido.issues.find((i) => i.code === "V02")?.message).toMatch(/inválido/);
  });

  it("endereço incompleto lista exatamente o que falta", () => {
    const r = com({ rua: "", bairro: "", uf: "ZZ" });
    expect(r.issues.find((i) => i.code === "V03")?.message).toBe(
      "Endereço incompleto. Falta: rua, bairro, UF (2 letras).",
    );
  });

  it("CEP, e-mail e telefone inválidos", () => {
    const r = com({ cep: "123", email: "x", telefone: "123" });
    expect(codes(r)).toEqual(expect.arrayContaining(["V04", "V07", "V08"]));
  });

  it("endereço do Banco ausente bloqueia (não há de onde preencher)", () => {
    const src = source({ banco: null });
    const r = evaluateContrato(completar(buildContratoDraft(src)), src);
    expect(codes(r)).toEqual(expect.arrayContaining(["V03", "V04"]));
  });
});

describe("evaluateContrato — objeto e período", () => {
  const com = (patch: Partial<ContratoDraft>) => {
    const src = source();
    return evaluateContrato({ ...completar(buildContratoDraft(src)), ...patch }, src);
  };

  it("período: datas obrigatórias e fim não pode ser antes do início", () => {
    expect(codes(com({ periodoInicio: "" }))).toContain("V11");
    expect(codes(com({ periodoFim: "30/11/2026" }))).toContain("V12");
    expect(com({ periodoFim: "2026-10-01" }).issues.find((i) => i.code === "V12")?.message).toMatch(
      /anterior/,
    );
  });

  it("campanha sem dataInicio bloqueia até a pessoa informar", () => {
    const src = source({ campanha: campanha({ dataInicio: undefined }) });
    const draft = completar(buildContratoDraft(src));
    expect(codes(evaluateContrato(draft, src))).toContain("V11");
    expect(evaluateContrato({ ...draft, periodoInicio: "2026-10-15" }, src).ok).toBe(true);
  });

  it("briefing e antecedência da aprovação", () => {
    expect(codes(com({ briefingReferencia: "ab" }))).toContain("V13");
    expect(codes(com({ aprovacaoAntecedenciaDias: "" }))).toContain("V15");
    expect(codes(com({ aprovacaoAntecedenciaDias: "0" }))).toContain("V15");
    expect(codes(com({ aprovacaoAntecedenciaDias: "61" }))).toContain("V15");
  });
});

describe("evaluateContrato — entregas", () => {
  it("sem entrega combinada bloqueia", () => {
    const src = source({ influ: influ({ entregas: [] }) });
    expect(codes(evaluateContrato(buildContratoDraft(src), src))).toContain("V14");
  });

  it("mostra exatamente o que falta em cada linha", () => {
    const src = source({
      influ: influ({
        entregas: [
          entrega({ id: "a", tipo: "Stories", dataPostagem: undefined }),
          entrega({ id: "b", tipo: "Carrossel" }),
        ],
      }),
    });
    const draft = { ...buildContratoDraft(src), aprovacaoAntecedenciaDias: "3" };
    const r = evaluateContrato(draft, src);
    const msgs = r.issues.filter((i) => i.code === "V14").map((i) => i.message);
    expect(msgs).toContain("Stories — falta: data, horário (HH:MM).");
    expect(msgs).toContain("Carrossel — falta: formato/plataforma, horário (HH:MM), permanência.");
    expect(r.issues.find((i) => i.entregaId === "a")).toBeDefined();
  });

  it("horário inválido e quantidade inválida", () => {
    const src = source();
    const d = completar(buildContratoDraft(src));
    const r = evaluateContrato(
      { ...d, entregas: [{ ...d.entregas[0], horario: "25:99", quantidade: "0" }] },
      src,
    );
    expect(r.issues[0].message).toBe("Reels — falta: quantidade, horário (HH:MM).");
  });

  it("PMR-8: entrega só orçada bloqueia e é apontada", () => {
    const src = source({
      influ: influ({
        entregas: [entrega(), entrega({ id: "o", tipo: "Post feed", status: "orcado" })],
      }),
    });
    const r = evaluateContrato(completar(buildContratoDraft(src)), src);
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.code === "PMR-8")?.entregaId).toBe("o");
  });
});

describe("evaluateContrato — pagamento", () => {
  const com = (pagamento: Influ["pagamento"], patch: Partial<ContratoDraft> = {}) => {
    const src = source({ influ: influ({ pagamento }) });
    return evaluateContrato({ ...completar(buildContratoDraft(src)), ...patch }, src);
  };

  it("sem pagamento definido", () => {
    expect(codes(com(undefined))).toContain("V16");
  });

  it("PMR-1: permuta, por hora, comissão, outro e combinações não cabem no template", () => {
    for (const tipos of [
      ["Permuta"],
      ["Por Hora"],
      ["Comissão"],
      ["Outro"],
      ["Valor", "Permuta"],
      ["Valor", "Por Hora"],
    ] as const) {
      const r = com({
        tipos: [...tipos],
        config: {
          Valor: { valor: "1000" },
          "Por Hora": { porHoraValor: "100" },
          Permuta: { permutaDescricao: "Kit" },
        },
        aprovacao: "aceito",
      });
      expect(codes(r), tipos.join("+")).toContain("PMR-1");
      expect(r.ok).toBe(false);
    }
  });

  it("valor vazio, inválido ou zero nunca vira 0 silencioso", () => {
    for (const valor of [undefined, "", "abc", "0", "0,00"]) {
      const r = com({ tipos: ["Valor"], config: { Valor: { valor } }, aprovacao: "aceito" });
      expect(codes(r), String(valor)).toContain("V16");
    }
  });

  it("forma e dados de pagamento", () => {
    expect(codes(com(influ().pagamento, { pagamentoForma: "" }))).toContain("V18");
    expect(codes(com(influ().pagamento, { pagamentoDados: "" }))).toContain("V19");
    expect(
      com(influ().pagamento, {
        pagamentoForma: "PIX",
        pagamentoDados: "CPF: 529.982.247-24",
      }).issues.find((i) => i.code === "V19")?.message,
    ).toMatch(/inválida/);
    expect(
      codes(
        com(influ().pagamento, {
          pagamentoForma: "Transferência Bancária",
          pagamentoDados: "Nubank",
        }),
      ),
    ).toContain("V19");
    expect(
      com(influ().pagamento, { pagamentoForma: "Outro", pagamentoDados: "Depósito em espécie" }).ok,
    ).toBe(true);
  });

  it("PIX com texto livre (não reconhecido) é aceito: a pessoa pode ter editado", () => {
    const r = com(influ().pagamento, {
      pagamentoForma: "PIX",
      pagamentoDados: "chave da mãe: 11 99999-0000",
    });
    expect(codes(r)).not.toContain("V19");
  });

  it("prazo de pagamento em dias úteis", () => {
    expect(codes(com(influ().pagamento, { pagamentoPrazoDiasUteis: "0" }))).toContain("V21");
    expect(
      com(influ().pagamento, { pagamentoPrazoDiasUteis: "15" }).variables
        ?.pagamento_prazo_dias_uteis,
    ).toBe("15");
  });
});

describe("evaluateContrato — exclusividade e direitos de imagem", () => {
  const com = (campanhaPatch: Record<string, unknown>, draftPatch: Partial<ContratoDraft> = {}) => {
    const src = source({ campanha: campanha(campanhaPatch) });
    return evaluateContrato({ ...completar(buildContratoDraft(src)), ...draftPatch }, src);
  };
  const di = (over: Record<string, unknown>) => ({
    direitosImagem: {
      permitido: true,
      usos: [],
      duracaoDias: 180,
      exclusividade: true,
      exclusividadeDias: 30,
      ...over,
    },
  });

  it("PMR-3: 'sem exclusividade' bloqueia enquanto o texto jurídico não for aprovado", () => {
    const r = com(di({ exclusividade: false }));
    expect(codes(r)).toContain("PMR-3");
    expect(r.issues.find((i) => i.code === "PMR-3")?.message).toMatch(/redação jurídica/);
  });

  it("exclusividade em dias exige número; sem confirmação, pede confirmação", () => {
    expect(codes(com(di({}), { exclusividadeDias: "" }))).toContain("V22");
    expect(codes(com(di({}), { exclusividadeDias: "0" }))).toContain("V22");
    expect(codes(com(di({}), { exclusividadeModo: "" }))).toContain("V22");
  });

  it("o diálogo pode ajustar os dias pré-preenchidos pela campanha", () => {
    const r = com(di({}), { exclusividadeDias: "60" });
    expect(r.variables?.exclusividade_periodo).toBe("60 dias a partir da data de assinatura");
  });

  it("PMR-4: campanha sem cessão de imagem bloqueia", () => {
    expect(codes(com(di({ permitido: false })))).toContain("PMR-4");
    expect(codes(com({ direitosImagem: undefined }))).toContain("PMR-4");
  });

  it("PMR-5: prazo de uso indeterminado bloqueia", () => {
    expect(codes(com(di({ duracaoDias: undefined })))).toContain("PMR-5");
  });

  it("prazo de uso só vira meses quando é múltiplo exato de 30 dias", () => {
    expect(com(di({ duracaoDias: 360 })).variables?.uso_conteudo_meses).toBe("12");
    const r = com(di({ duracaoDias: 45 }));
    expect(r.issues.find((i) => i.code === "V23")?.message).toMatch(/45 dias/);
    expect(r.ok).toBe(false);
  });
});

describe("evaluateContrato — Anexo I", () => {
  const stories = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      entrega({ id: `s${i}`, tipo: "Stories", grupoId: "g", titulo: `(${i + 1}/${n})` }),
    );

  it("pesos ausentes são apontados pelo nome da entrega (PMR-10)", () => {
    const src = source({
      influ: influ({ entregas: [entrega({ id: "r" }), entrega({ id: "s", tipo: "Stories" })] }),
    });
    const draft = { ...buildContratoDraft(src), aprovacaoAntecedenciaDias: "3" };
    draft.entregas = draft.entregas.map((r) => ({ ...r, horario: "10:00" }));
    const r = evaluateContrato(draft, src);
    expect(r.issues.find((i) => i.code === "PMR-10")?.message).toBe(
      "Anexo I — informe o peso (%) de: Reels, Stories (conjunto).",
    );
  });

  it("a soma precisa ser exatamente 100%", () => {
    const src = source({
      influ: influ({ entregas: [entrega({ id: "r" }), entrega({ id: "s", tipo: "Stories" })] }),
    });
    const base = completar(buildContratoDraft(src));
    const keys = Object.keys(base.anexoPesos);
    const r = evaluateContrato({ ...base, anexoPesos: { [keys[0]]: "60", [keys[1]]: "30" } }, src);
    expect(r.issues.find((i) => i.code === "PMR-10")?.message).toBe(
      "Anexo I — os pesos somam 90%; precisam somar 100%.",
    );
  });

  it("valores em centavos somam exatamente o total (a última linha absorve o arredondamento)", () => {
    const src = source({
      influ: influ({
        entregas: [
          entrega({ id: "a", tipo: "Reels" }),
          entrega({ id: "b", tipo: "Stories" }),
          entrega({ id: "c", tipo: "TikTok" }),
        ],
        pagamento: {
          tipos: ["Valor"],
          config: { Valor: { valor: "100,01" } },
          aprovacao: "aceito",
        },
      }),
    });
    const base = completar(buildContratoDraft(src));
    const [k1, k2, k3] = Object.keys(base.anexoPesos);
    const r = evaluateContrato(
      { ...base, anexoPesos: { [k1]: "33,33", [k2]: "33,33", [k3]: "33,34" } },
      src,
    );
    expect(r.ok).toBe(true);
    const cents = r.variables!.anexo_i.map((l) =>
      Number(l.valor_correspondente.replace(/\D/g, "")),
    );
    expect(cents.reduce((a, b) => a + b, 0)).toBe(10001);
    expect(r.variables!.anexo_i_total_valor).toBe("100,01");
  });

  it("unidades de Stories dividida viram UM grupo 'Stories (conjunto)'", () => {
    const src = source({ influ: influ({ entregas: stories(3) }) });
    const r = evaluateContrato(completar(buildContratoDraft(src)), src);
    expect(r.ok).toBe(true);
    expect(r.variables!.entregas.map((e) => e.tipo)).toEqual([
      "Stories (1/3)",
      "Stories (2/3)",
      "Stories (3/3)",
    ]);
    expect(r.variables!.anexo_i).toEqual([
      {
        tipo: "Stories (conjunto)",
        plataforma: "Instagram Stories",
        peso_percentual: "100%",
        valor_correspondente: "3.500,00",
      },
    ]);
  });
});

describe("evaluateContrato — nunca devolve variáveis incompletas", () => {
  it("com qualquer pendência, `variables` é null", () => {
    const src = source();
    const r = evaluateContrato(buildContratoDraft(src), src);
    expect(r.ok).toBe(false);
    expect(r.variables).toBeNull();
    expect(r.issues.length).toBeGreaterThan(0);
  });
});
