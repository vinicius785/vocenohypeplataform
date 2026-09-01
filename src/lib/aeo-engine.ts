import {
  AEO_CATEGORIAS,
  AEO_CATEGORIA_LABEL,
  AEO_IAS,
  type AeoCategoria,
  type AeoIa,
  type AeoPrompt,
  type AeoResposta,
  type AeoRodada,
} from "./aeo-store";

export type AeoRodadaStatus = "em_andamento" | "concluida";

export type AeoRodadaComputada = AeoRodada & {
  status: AeoRodadaStatus;
  promptsAtivos: number;
  iasMonitoradas: number;
  respostasEsperadas: number;
  respostasPreenchidas: number;
  progresso: number; // 0-100
  completedAt: string | null;
};

function ativosDe(prompts: AeoPrompt[]): AeoPrompt[] {
  return prompts.filter((p) => p.ativo);
}

/** Progresso de uma rodada — SEMPRE computado, nunca lido de um campo
 * armazenado (ver comentário em `AeoRodada`, aeo-store.ts). Só conta
 * prompts atualmente ativos: um prompt desativado sai do denominador de
 * rodadas novas, mas respostas já registradas continuam existindo (nunca
 * são apagadas por isso). */
export function computeRodadaProgresso(
  rodada: AeoRodada,
  prompts: AeoPrompt[],
  respostas: AeoResposta[],
): AeoRodadaComputada {
  const ativos = ativosDe(prompts);
  const ativosIds = new Set(ativos.map((p) => p.id));
  const respostasDaRodada = respostas.filter(
    (r) => r.rodadaId === rodada.id && ativosIds.has(r.promptId),
  );
  const respostasEsperadas = ativos.length * AEO_IAS.length;
  const respostasPreenchidas = respostasDaRodada.length;
  const progresso =
    respostasEsperadas === 0 ? 0 : Math.round((respostasPreenchidas / respostasEsperadas) * 100);
  const status: AeoRodadaStatus =
    progresso >= 100 && respostasEsperadas > 0 ? "concluida" : "em_andamento";
  const completedAt =
    status === "concluida"
      ? (respostasDaRodada
          .map((r) => r.updatedAt ?? r.createdAt)
          .sort()
          .at(-1) ?? null)
      : null;
  return {
    ...rodada,
    status,
    promptsAtivos: ativos.length,
    iasMonitoradas: AEO_IAS.length,
    respostasEsperadas,
    respostasPreenchidas,
    progresso,
    completedAt,
  };
}

/** Contador "33/33" da aba de cada IA — só entre prompts ativos. */
export function computeIaProgresso(
  rodadaId: string,
  ia: AeoIa,
  prompts: AeoPrompt[],
  respostas: AeoResposta[],
): { preenchidos: number; total: number } {
  const ativos = ativosDe(prompts);
  const ativosIds = new Set(ativos.map((p) => p.id));
  const preenchidos = respostas.filter(
    (r) => r.rodadaId === rodadaId && r.ia === ia && ativosIds.has(r.promptId),
  ).length;
  return { preenchidos, total: ativos.length };
}

/** Motor do "Salvar e próximo →": primeiro prompt ativo (em ordem de
 * código) ainda sem resposta para essa rodada+IA, começando logo depois de
 * `afterPromptId` e dando a volta uma vez. */
export function proximoPromptNaoPreenchido(
  ativos: AeoPrompt[],
  rodadaId: string,
  ia: AeoIa,
  respostas: AeoResposta[],
  afterPromptId?: string,
): AeoPrompt | null {
  const ordenados = [...ativos].sort((a, b) => a.idCodigo.localeCompare(b.idCodigo));
  const respondidoIds = new Set(
    respostas.filter((r) => r.rodadaId === rodadaId && r.ia === ia).map((r) => r.promptId),
  );
  const naoPreenchidos = ordenados.filter((p) => !respondidoIds.has(p.id));
  if (naoPreenchidos.length === 0) return null;
  if (!afterPromptId) return naoPreenchidos[0];
  const startIdx = ordenados.findIndex((p) => p.id === afterPromptId);
  if (startIdx === -1) return naoPreenchidos[0];
  for (let i = 1; i <= ordenados.length; i++) {
    const candidate = ordenados[(startIdx + i) % ordenados.length];
    if (!respondidoIds.has(candidate.id)) return candidate;
  }
  return null;
}

function respostaFor(respostas: AeoResposta[], rodadaId: string, promptId: string, ia: AeoIa) {
  return respostas.find((r) => r.rodadaId === rodadaId && r.promptId === promptId && r.ia === ia);
}

export type KpiComparativo = { valor: number; deltaPP: number | null };

/** % de respostas RESPONDIDAS (não do total esperado) em que a VNH foi
 * citada — mesmo denominador que o app já usava (`aiVisibilityScore`),
 * então uma rodada em andamento já mostra números com sentido. */
export function kpiVisibilidadeGeral(
  respostas: AeoResposta[],
  rodadaId: string,
  rodadaComparacaoId?: string,
): KpiComparativo {
  const calc = (rid: string) => {
    const subset = respostas.filter((r) => r.rodadaId === rid);
    if (subset.length === 0) return 0;
    return Math.round((subset.filter((r) => r.citada).length / subset.length) * 100);
  };
  const valor = calc(rodadaId);
  const deltaPP = rodadaComparacaoId ? valor - calc(rodadaComparacaoId) : null;
  return { valor, deltaPP };
}

export function kpiTop3(
  respostas: AeoResposta[],
  rodadaId: string,
  rodadaComparacaoId?: string,
): KpiComparativo {
  const calc = (rid: string) => {
    const subset = respostas.filter((r) => r.rodadaId === rid);
    if (subset.length === 0) return 0;
    const top3 = subset.filter((r) => r.posicao === "1" || r.posicao === "2" || r.posicao === "3");
    return Math.round((top3.length / subset.length) * 100);
  };
  const valor = calc(rodadaId);
  const deltaPP = rodadaComparacaoId ? valor - calc(rodadaComparacaoId) : null;
  return { valor, deltaPP };
}

export function kpiPrimeiroLugar(
  respostas: AeoResposta[],
  rodadaId: string,
  rodadaComparacaoId?: string,
): KpiComparativo {
  const calc = (rid: string) => {
    const subset = respostas.filter((r) => r.rodadaId === rid);
    if (subset.length === 0) return 0;
    return Math.round((subset.filter((r) => r.posicao === "1").length / subset.length) * 100);
  };
  const valor = calc(rodadaId);
  const deltaPP = rodadaComparacaoId ? valor - calc(rodadaComparacaoId) : null;
  return { valor, deltaPP };
}

/** Contagem (não %) de combinações prompt×IA respondidas em que a VNH NÃO
 * apareceu — delta em contagem bruta, não em pontos percentuais. */
export function kpiPromptsSemPresenca(
  respostas: AeoResposta[],
  rodadaId: string,
  rodadaComparacaoId?: string,
): { valor: number; delta: number | null } {
  const calc = (rid: string) => respostas.filter((r) => r.rodadaId === rid && !r.citada).length;
  const valor = calc(rodadaId);
  const delta = rodadaComparacaoId ? valor - calc(rodadaComparacaoId) : null;
  return { valor, delta };
}

export function visibilidadePorIa(
  respostas: AeoResposta[],
  rodadaId: string,
  rodadaComparacaoId?: string,
): { ia: AeoIa; pct: number; deltaPP: number | null }[] {
  const calc = (rid: string, ia: AeoIa) => {
    const subset = respostas.filter((r) => r.rodadaId === rid && r.ia === ia);
    if (subset.length === 0) return 0;
    return Math.round((subset.filter((r) => r.citada).length / subset.length) * 100);
  };
  return AEO_IAS.map((ia) => {
    const pct = calc(rodadaId, ia);
    return {
      ia,
      pct,
      deltaPP: rodadaComparacaoId ? pct - calc(rodadaComparacaoId, ia) : null,
    };
  });
}

export function visibilidadePorCategoria(
  respostas: AeoResposta[],
  prompts: AeoPrompt[],
  rodadaId: string,
): Record<AeoCategoria, number> {
  const promptById = new Map(prompts.map((p) => [p.id, p]));
  const result: Record<AeoCategoria, number> = { A: 0, B: 0, C: 0 };
  for (const cat of AEO_CATEGORIAS) {
    const subset = respostas.filter(
      (r) => r.rodadaId === rodadaId && promptById.get(r.promptId)?.categoria === cat,
    );
    if (subset.length === 0) continue;
    result[cat] = Math.round((subset.filter((r) => r.citada).length / subset.length) * 100);
  }
  return result;
}

export function promptsPorCategoria(
  prompts: AeoPrompt[],
  respostas: AeoResposta[],
  rodadaId: string,
  categoria: AeoCategoria,
): AeoPrompt[] {
  const promptIdsNaRodada = new Set(
    respostas.filter((r) => r.rodadaId === rodadaId).map((r) => r.promptId),
  );
  return prompts.filter((p) => p.categoria === categoria && promptIdsNaRodada.has(p.id));
}

/** Série de evolução — uma IA por vez (ou "Geral", combinando todas), nunca
 * as 4 simultaneamente por padrão. */
export function serieEvolucao(
  rodadas: AeoRodada[],
  respostas: AeoResposta[],
  filtro: AeoIa | "Geral",
): { rodadaId: string; label: string; pct: number }[] {
  return [...rodadas]
    .sort((a, b) => a.dataRodada.localeCompare(b.dataRodada))
    .map((rodada) => {
      const subset = respostas.filter(
        (r) => r.rodadaId === rodada.id && (filtro === "Geral" || r.ia === filtro),
      );
      const pct =
        subset.length === 0
          ? 0
          : Math.round((subset.filter((r) => r.citada).length / subset.length) * 100);
      return { rodadaId: rodada.id, label: rodada.dataRodada, pct };
    });
}

export function concorrentesMaisCitados(
  respostas: AeoResposta[],
  rodadaId: string,
): { nome: string; vezes: number; pct: number }[] {
  const subset = respostas.filter((r) => r.rodadaId === rodadaId);
  const counts = new Map<string, number>();
  for (const r of subset) {
    for (const nome of r.concorrentes) {
      counts.set(nome, (counts.get(nome) ?? 0) + 1);
    }
  }
  const total = subset.length || 1;
  return Array.from(counts.entries())
    .map(([nome, vezes]) => ({ nome, vezes, pct: Math.round((vezes / total) * 100) }))
    .sort((a, b) => b.vezes - a.vezes);
}

export function promptsPorConcorrente(
  respostas: AeoResposta[],
  prompts: AeoPrompt[],
  rodadaId: string,
  concorrente: string,
): AeoPrompt[] {
  const promptById = new Map(prompts.map((p) => [p.id, p]));
  const ids = new Set(
    respostas
      .filter((r) => r.rodadaId === rodadaId && r.concorrentes.includes(concorrente))
      .map((r) => r.promptId),
  );
  return Array.from(ids)
    .map((id) => promptById.get(id))
    .filter((p): p is AeoPrompt => !!p);
}

export function promptsSemPresencaLista(
  respostas: AeoResposta[],
  prompts: AeoPrompt[],
  rodadaId: string,
): { prompt: AeoPrompt; ia: AeoIa }[] {
  const promptById = new Map(prompts.map((p) => [p.id, p]));
  return respostas
    .filter((r) => r.rodadaId === rodadaId && !r.citada)
    .map((r) => {
      const prompt = promptById.get(r.promptId);
      return prompt ? { prompt, ia: r.ia } : null;
    })
    .filter((x): x is { prompt: AeoPrompt; ia: AeoIa } => !!x);
}

export type AeoOportunidade = {
  tipo: "critico" | "oportunidade" | "concorrencia";
  titulo: string;
  descricao: string;
};

/** Insights derivados SÓ de dados reais — nunca fabrica um insight sem
 * suporte suficiente. Dos 4 tipos ilustrados no pedido original, o 4º
 * ("CONTEÚDO", agrupar prompts por tema) não é implementado: não existe
 * campo de tema/tag além da categoria (3 valores) e do texto livre — nada
 * aqui tenta simular isso reaproveitando outro cálculo. */
export function oportunidades(
  rodadaId: string,
  prompts: AeoPrompt[],
  respostas: AeoResposta[],
): AeoOportunidade[] {
  const out: AeoOportunidade[] = [];

  for (const { ia, pct } of visibilidadePorIa(respostas, rodadaId)) {
    const total = respostas.filter((r) => r.rodadaId === rodadaId && r.ia === ia).length;
    if (total > 0 && pct === 0) {
      out.push({
        tipo: "critico",
        titulo: `${ia} com 0% de visibilidade`,
        descricao: `Nenhuma resposta analisada do ${ia} nesta rodada citou a VNH.`,
      });
    }
  }

  const cats = visibilidadePorCategoria(respostas, prompts, rodadaId);
  const catsComDado = AEO_CATEGORIAS.filter((c) =>
    respostas.some(
      (r) => r.rodadaId === rodadaId && prompts.find((p) => p.id === r.promptId)?.categoria === c,
    ),
  );
  if (catsComDado.length >= 2) {
    const melhor = catsComDado.reduce((a, b) => (cats[a] >= cats[b] ? a : b));
    const pior = catsComDado.reduce((a, b) => (cats[a] <= cats[b] ? a : b));
    const gap = cats[melhor] - cats[pior];
    if (melhor !== pior && gap >= 30) {
      out.push({
        tipo: "oportunidade",
        titulo: `Alta presença em ${AEO_CATEGORIA_LABEL[melhor]}, baixa em ${AEO_CATEGORIA_LABEL[pior]}`,
        descricao: `${AEO_CATEGORIA_LABEL[melhor]} está em ${cats[melhor]}% de visibilidade, enquanto ${AEO_CATEGORIA_LABEL[pior]} está em ${cats[pior]}% — ${gap}p.p. de diferença.`,
      });
    }
  }

  const naoCitadas = respostas.filter((r) => r.rodadaId === rodadaId && !r.citada);
  if (naoCitadas.length > 0) {
    const counts = new Map<string, number>();
    for (const r of naoCitadas) {
      for (const nome of r.concorrentes) counts.set(nome, (counts.get(nome) ?? 0) + 1);
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const pct = Math.round((top[1] / naoCitadas.length) * 100);
      if (pct >= 25) {
        out.push({
          tipo: "concorrencia",
          titulo: `${top[0]} domina onde a VNH não aparece`,
          descricao: `${top[0]} aparece em ${pct}% das respostas desta rodada em que a VNH não foi citada.`,
        });
      }
    }
  }

  return out;
}
