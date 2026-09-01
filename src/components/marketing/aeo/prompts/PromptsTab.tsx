import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AEO_CATEGORIAS,
  AEO_CATEGORIA_LABEL,
  AEO_IDIOMAS,
  loadAeoPrompts,
  saveAeoPrompts,
  type AeoCategoria,
  type AeoIdioma,
  type AeoPrompt,
} from "@/lib/aeo-store";
import { inputCls } from "../aeo-ui-utils";
import { PromptFormDialog } from "./PromptFormDialog";

type StatusFiltro = "todos" | "ativo" | "inativo";

export function PromptsTab({ prompts }: { prompts: AeoPrompt[] }) {
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<AeoCategoria | "">("");
  const [idiomaFiltro, setIdiomaFiltro] = useState<AeoIdioma | "">("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<AeoPrompt | null>(null);

  const linhas = useMemo(() => {
    return prompts
      .filter(
        (p) =>
          !busca.trim() ||
          p.idCodigo.toLowerCase().includes(busca.toLowerCase()) ||
          p.texto.toLowerCase().includes(busca.toLowerCase()),
      )
      .filter((p) => !categoriaFiltro || p.categoria === categoriaFiltro)
      .filter((p) => !idiomaFiltro || p.idioma === idiomaFiltro)
      .filter((p) => statusFiltro === "todos" || (statusFiltro === "ativo") === p.ativo)
      .sort((a, b) => a.idCodigo.localeCompare(b.idCodigo));
  }, [prompts, busca, categoriaFiltro, idiomaFiltro, statusFiltro]);

  const handleSave = (patch: {
    idCodigo?: string;
    texto: string;
    categoria: AeoCategoria;
    idioma: AeoIdioma;
    ativo: boolean;
  }) => {
    const all = loadAeoPrompts();
    if (editando) {
      const next = all.map((p) =>
        p.id === editando.id
          ? {
              ...p,
              texto: patch.texto,
              categoria: patch.categoria,
              idioma: patch.idioma,
              ativo: patch.ativo,
            }
          : p,
      );
      saveAeoPrompts(next);
    } else {
      const countCat = all.filter((p) => p.categoria === patch.categoria).length;
      const novo: AeoPrompt = {
        id: crypto.randomUUID(),
        idCodigo: `${patch.categoria}${String(countCat + 1).padStart(2, "0")}`,
        categoria: patch.categoria,
        idioma: patch.idioma,
        texto: patch.texto,
        ativo: true,
        createdAt: new Date().toISOString(),
      };
      saveAeoPrompts([...all, novo]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar prompt..."
              className={`${inputCls} w-52 pl-7`}
            />
          </div>
          <select
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value as AeoCategoria | "")}
            className={inputCls}
          >
            <option value="">Todas categorias</option>
            {AEO_CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c} — {AEO_CATEGORIA_LABEL[c]}
              </option>
            ))}
          </select>
          <select
            value={idiomaFiltro}
            onChange={(e) => setIdiomaFiltro(e.target.value as AeoIdioma | "")}
            className={inputCls}
          >
            <option value="">Todos idiomas</option>
            {AEO_IDIOMAS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value as StatusFiltro)}
            className={inputCls}
          >
            <option value="todos">Todos status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditando(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Novo prompt
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Prompt</th>
              <th className="px-3 py-2 font-medium">Categoria</th>
              <th className="px-3 py-2 font-medium">Idioma</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhas.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <p className="font-medium text-foreground">{p.idCodigo}</p>
                  <p className="mt-0.5 max-w-[320px] truncate text-muted-foreground">{p.texto}</p>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {p.categoria} — {AEO_CATEGORIA_LABEL[p.categoria]}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{p.idioma}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      p.ativo ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(p);
                      setDialogOpen(true);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum prompt encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PromptFormDialog
        key={editando?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        prompt={editando}
        onSave={handleSave}
      />
    </div>
  );
}
