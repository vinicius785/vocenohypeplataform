import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Calculator, Loader2, Check, Sparkles } from "lucide-react";
import { TIERS, FORMATOS, type PacoteLinha, type TierId, type FormatoId } from "@/lib/pricing";
import { formatBRL } from "@/lib/comercial";
import { fetchWorkspace, type Workspace } from "@/lib/workspace-store";
import {
  getPropostaPublicaData,
  calcPropostaPublica,
  savePropostaPublica,
} from "@/lib/proposta-publica.functions";

/**
 * Calculadora de proposta EXTERNA (`/calculadora-proposta/$token`) — link à
 * parte do vendedor pra abrir durante uma call com o cliente, mesma ideia
 * do portal do cliente (`/portal/$token`): página solta, sem `AppShell`,
 * SSR via `loader` (funciona mesmo em navegador embutido/conexão fraca).
 * DIFERENÇA proposital em relação ao Simulador interno do Comercial: aqui
 * nunca aparece custo por tier nem os percentuais da agência — só o preço
 * final (total e por item), que é tudo que o cliente/vendedor precisa ver
 * numa call.
 */

type PropostaPublicaData = {
  leadNome: string;
  leadEmpresa?: string;
  ultimaProposta: { linhas: PacoteLinha[]; precoFinal: number } | null;
};

export const Route = createFileRoute("/calculadora-proposta/$token")({
  component: CalculadoraPropostaPage,
  loader: async ({ params }) => {
    const [proposta, ws] = await Promise.all([
      getPropostaPublicaData({ data: { token: params.token } }).catch(() => null),
      fetchWorkspace().catch(() => ({ nome: "Você no Hype", logo: "" })),
    ]);
    return { proposta: proposta as PropostaPublicaData | null, ws };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Proposta · ${loaderData?.ws?.nome ?? "Calculadora"}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

/** Descrição curta de cada formato — só copy explicativa, nada sensível
 * (o preço/custo de cada um nunca aparece aqui). */
const FORMATO_DESCRICAO: Record<FormatoId, string> = {
  feed_post: "Uma publicação fixa no feed do perfil, com menção/tag da marca.",
  stories_3x: "Sequência de 3 stories, ideal para chamadas rápidas e links.",
  reels_video: "Vídeo em formato Reels — o de maior alcance e engajamento hoje.",
  live: "Transmissão em tempo real com o influenciador, com interação ao vivo.",
  ugc_sem_postagem:
    "Conteúdo gravado pelo influenciador para a marca usar em seus próprios canais.",
  pacote_basico: "Combo com Reels + Stories — a combinação mais pedida.",
};

function newLinha(): PacoteLinha {
  return { id: crypto.randomUUID(), tier: TIERS[1].id, formato: FORMATOS[0].id, qtd: 1 };
}

function TopBar({ ws }: { ws: Workspace }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border bg-background px-5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground text-background">
        {ws.logo ? (
          <img src={ws.logo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[11px] font-bold">{ws.nome.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <span className="text-sm font-semibold text-foreground">{ws.nome}</span>
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        <Calculator className="h-3 w-3" /> Calculadora de proposta
      </span>
    </header>
  );
}

const selectCls =
  "h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

function CalculadoraPropostaPage() {
  const { proposta, ws } = Route.useLoaderData();
  const calcFn = useServerFn(calcPropostaPublica);
  const saveFn = useServerFn(savePropostaPublica);
  const token = Route.useParams().token;

  const [linhas, setLinhas] = useState<PacoteLinha[]>(() =>
    proposta?.ultimaProposta?.linhas.length ? proposta.ultimaProposta.linhas : [newLinha()],
  );
  const [precoFinal, setPrecoFinal] = useState<number | null>(
    proposta?.ultimaProposta?.precoFinal ?? null,
  );
  const [porLinha, setPorLinha] = useState<Record<string, number>>({});
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!proposta) return;
    setCalculando(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      calcFn({ data: { token, linhas } })
        .then((res) => {
          setPrecoFinal(res.precoFinal);
          setPorLinha(Object.fromEntries(res.porLinha.map((l) => [l.id, l.precoFinal])));
          setErro(null);
        })
        .catch(() => setErro("Não foi possível calcular agora. Tente novamente."))
        .finally(() => setCalculando(false));
      setSalvo(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, token, proposta]);

  const updateLinha = (id: string, patch: Partial<PacoteLinha>) =>
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLinha = () => setLinhas((ls) => (ls.length >= 10 ? ls : [...ls, newLinha()]));
  const removeLinha = (id: string) =>
    setLinhas((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls));

  const totalItens = useMemo(
    () => linhas.reduce((s, l) => s + Math.max(0, l.qtd || 0), 0),
    [linhas],
  );

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      await saveFn({ data: { token, linhas } });
      setSalvo(true);
    } catch {
      setErro("Não foi possível salvar a simulação agora.");
    } finally {
      setSalvando(false);
    }
  };

  if (!proposta) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background p-6 text-center">
        <p className="text-lg font-semibold text-foreground">Link não encontrado</p>
        <p className="text-sm text-muted-foreground">
          Este link pode ter sido desativado. Peça um novo link ao seu contato na agência.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar ws={ws} />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8 sm:py-12">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Proposta personalizada
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold text-foreground sm:text-3xl">
            {proposta.leadEmpresa ? `Para ${proposta.leadEmpresa}` : `Para ${proposta.leadNome}`}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Monte o pacote de influenciadores ideal para sua marca — escolha o porte do
            influenciador e o formato de entrega para cada item. O investimento é recalculado em
            tempo real conforme você ajusta a seleção.
          </p>
        </div>

        <div className="space-y-3">
          {linhas.map((l, i) => (
            <div key={l.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                  <select
                    value={l.tier}
                    onChange={(e) => updateLinha(l.id, { tier: e.target.value as TierId })}
                    className={selectCls}
                    aria-label="Porte do influenciador"
                  >
                    {TIERS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={l.formato}
                    onChange={(e) => updateLinha(l.id, { formato: e.target.value as FormatoId })}
                    className={selectCls}
                    aria-label="Formato de entrega"
                  >
                    {FORMATOS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={l.qtd}
                    onChange={(e) =>
                      updateLinha(l.id, { qtd: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-center text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring sm:w-20"
                    aria-label="Quantidade"
                  />
                </div>
                <div className="hidden w-24 shrink-0 text-right text-sm font-medium tabular-nums text-foreground sm:block">
                  {porLinha[l.id] != null ? formatBRL(porLinha[l.id]) : "—"}
                </div>
                <button
                  type="button"
                  onClick={() => removeLinha(l.id)}
                  disabled={linhas.length === 1}
                  className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
                  aria-label="Remover item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 pl-10 text-xs text-muted-foreground">
                {FORMATO_DESCRICAO[l.formato]}
              </p>
              <p className="mt-1 pl-10 text-xs font-medium text-foreground sm:hidden">
                {porLinha[l.id] != null ? formatBRL(porLinha[l.id]) : "—"}
              </p>
            </div>
          ))}
          <button
            type="button"
            onClick={addLinha}
            disabled={linhas.length >= 10}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar item
          </button>
        </div>

        <div className="rounded-2xl border-2 border-foreground bg-muted/40 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Investimento estimado
              </p>
              <p className="text-[11px] text-muted-foreground">
                {totalItens} item{totalItens === 1 ? "" : "s"} selecionado
                {totalItens === 1 ? "" : "s"}
              </p>
            </div>
            <p className="flex items-center gap-2 text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
              {calculando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
              {precoFinal != null ? formatBRL(precoFinal) : "—"}
            </p>
          </div>
          {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-dashed border-border pt-4">
            <p className="text-[11px] text-muted-foreground">
              Valores sujeitos a confirmação final com {ws.nome}.
            </p>
            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando || calculando}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-colors hover:bg-transparent hover:text-foreground disabled:opacity-50"
            >
              {salvando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : salvo ? (
                <Check className="h-3.5 w-3.5" />
              ) : null}
              {salvo ? "Simulação salva" : "Salvar esta simulação"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
