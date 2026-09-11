import { useState } from "react";
import { Inbox, Building2 } from "lucide-react";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/shared/ListRow";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  SkeletonCard,
  SkeletonListRow,
  SkeletonMetric,
  SkeletonTableRow,
} from "@/components/shared/SkeletonPatterns";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";

type Cliente = {
  id: string;
  nome: string;
  segmento: string;
  status: "ativo" | "pausado" | "encerrado";
  valor: number;
};

const CLIENTES: Cliente[] = [
  { id: "1", nome: "HubData", segmento: "Tecnologia", status: "ativo", valor: 12500 },
  { id: "2", nome: "Cix Citzen", segmento: "Varejo", status: "ativo", valor: 8300 },
  { id: "3", nome: "Rodonaves", segmento: "Logística", status: "pausado", valor: 4200 },
  { id: "4", nome: "Terê", segmento: "Moda", status: "encerrado", valor: 0 },
  { id: "5", nome: "Jackery", segmento: "Eletrônicos", status: "ativo", valor: 9800 },
  { id: "6", nome: "SouChill", segmento: "Bem-estar", status: "ativo", valor: 6100 },
  // Casos de conteúdo real (rodada corretiva §12): nome muito longo e
  // valor monetário grande — nenhuma string pode quebrar a estrutura.
  {
    id: "7",
    nome: "Consultoria Internacional de Operações Logísticas e Distribuição Ltda",
    segmento: "Serviços corporativos",
    status: "ativo",
    valor: 1284900,
  },
];

const STATUS_TONE = { ativo: "success", pausado: "warning", encerrado: "neutral" } as const;
const STATUS_LABEL = { ativo: "Ativo", pausado: "Pausado", encerrado: "Encerrado" } as const;

const columns: DataTableColumn<Cliente>[] = [
  { key: "nome", header: "Cliente", getValue: (r) => r.nome, sortable: true },
  { key: "segmento", header: "Segmento", getValue: (r) => r.segmento, sortable: true },
  {
    key: "valor",
    header: "Valor mensal",
    getValue: (r) => r.valor,
    align: "right",
    sortable: true,
    render: (r) => (r.valor > 0 ? `R$ ${r.valor.toLocaleString("pt-BR")}` : "—"),
  },
];

export function DataSection() {
  const [tableState, setTableState] = useState<"preenchida" | "vazia" | "carregando">("preenchida");

  return (
    <div className="space-y-10">
      <section id="list-rows" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>List rows</h2>
        <div className="divide-y divide-border rounded-xl border border-border">
          <ListRow
            icon={<Building2 className="h-4 w-4" />}
            title="HubData"
            description="Tecnologia"
            meta="Contrato mensal"
            status={{ label: "Ativo", tone: "success" }}
            value="R$ 12.500"
            primaryAction={{ label: "Ver", onClick: () => {} }}
            menuItems={[
              { label: "Editar", onClick: () => {} },
              { label: "Arquivar", onClick: () => {}, destructive: true },
            ]}
          />
          <ListRow
            icon={<Building2 className="h-4 w-4" />}
            title="Rodonaves"
            description="Logística"
            status={{ label: "Pausado", tone: "warning" }}
            value="R$ 4.200"
            menuItems={[{ label: "Reativar", onClick: () => {} }]}
          />
          {/* Caso de conteúdo real (§12): nome muito longo, sem valor, sem
           * responsável e badge com rótulo mais longo — nada pode quebrar
           * a linha ou empurrar o menu de ações pra fora. */}
          <ListRow
            icon={<Building2 className="h-4 w-4" />}
            title="Consultoria Internacional de Operações Logísticas e Distribuição Ltda"
            description="Serviços corporativos"
            status={{ label: "Aguardando aprovação", tone: "info" }}
            menuItems={[{ label: "Ver detalhes", onClick: () => {} }]}
          />
        </div>
      </section>

      <section id="tabela" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={TYPOGRAPHY.sectionTitle}>Tabela</h2>
          <div className="flex gap-1">
            {(["preenchida", "vazia", "carregando"] as const).map((s) => (
              <Button
                key={s}
                variant={tableState === s ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTableState(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
        <p className={TYPOGRAPHY.caption}>
          Estratégia mobile: redimensione a tela — abaixo de 768px cada linha vira um card, nunca
          rolagem horizontal.
        </p>
        <DataTable
          columns={columns}
          rows={tableState === "vazia" ? [] : CLIENTES}
          isLoading={tableState === "carregando"}
          selectable
          getStatus={(r) => ({ label: STATUS_LABEL[r.status], tone: STATUS_TONE[r.status] })}
          actions={[
            { label: "Ver detalhes", onClick: () => {} },
            { label: "Arquivar", onClick: () => {}, destructive: true },
          ]}
          emptyTitle="Nenhum cliente encontrado"
          emptyDescription="Ajuste os filtros ou cadastre um novo cliente."
        />
      </section>

      <section id="estados-vazios" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Estados vazios</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border">
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title="Nenhum lançamento ainda"
              description="Quando você criar o primeiro lançamento, ele aparece aqui."
              primaryAction={{ label: "Novo lançamento", onClick: () => {} }}
              secondaryAction={{ label: "Importar", onClick: () => {} }}
            />
          </div>
          <div className="rounded-xl border border-border">
            <EmptyState compact title="Sem resultados" description="Tente outro filtro." />
          </div>
        </div>
      </section>

      <section id="skeletons" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Skeletons</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonMetric />
          <SkeletonCard />
        </div>
        <div className="divide-y divide-border rounded-xl border border-border">
          <SkeletonListRow />
          <SkeletonListRow />
        </div>
        <div className="rounded-xl border border-border">
          <SkeletonTableRow />
          <SkeletonTableRow />
        </div>
      </section>
    </div>
  );
}
