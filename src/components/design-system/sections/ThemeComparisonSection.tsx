import { Building2 } from "lucide-react";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MetricCard } from "@/components/shared/MetricCard";
import { ListRow } from "@/components/shared/ListRow";
import { ThemeComparisonPanel } from "../ThemeComparisonPanel";

/**
 * Comparação lado a lado dos MESMOS componentes nos dois temas ao mesmo
 * tempo (rodada corretiva §11) — usa os tokens reais via
 * `ThemeComparisonPanel` (força `--background`/`--brand`/etc. por caixa,
 * independente do seletor de tema global da página).
 */
export function ThemeComparisonSection() {
  return (
    <section id="comparacao-temas" className="space-y-4">
      <div>
        <h2 className={TYPOGRAPHY.sectionTitle}>Claro e escuro, lado a lado</h2>
        <p className={`${TYPOGRAPHY.bodySecondary} mt-1 max-w-2xl`}>
          Os mesmos componentes, com os tokens reais de cada tema, comparados ao mesmo tempo — além
          do seletor global no topo da página.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ThemeComparisonPanel label="Claro" theme="light">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm">
              Ação
            </Button>
            <Button variant="outline" size="sm">
              Outline
            </Button>
          </div>
          <Input placeholder="Buscar..." className="h-10" />
          <MetricCard
            label="Receita"
            value="R$ 42.900"
            tone="success"
            delta={{ value: 12 }}
            compact
          />
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-2">
                <Badge variant="brand">brand</Badge>
                <Badge variant="success">success</Badge>
                <Badge variant="danger">danger</Badge>
              </div>
            </CardContent>
          </Card>
          <Alert variant="warning">
            <AlertTitle>Atenção</AlertTitle>
            <AlertDescription>Alert de exemplo no tema claro.</AlertDescription>
          </Alert>
          <div className="overflow-hidden rounded-xl border border-border">
            <ListRow
              icon={<Building2 className="h-4 w-4" />}
              title="HubData"
              description="Tecnologia"
              status={{ label: "Ativo", tone: "success" }}
              value="R$ 12.500"
            />
          </div>
        </ThemeComparisonPanel>

        <ThemeComparisonPanel label="Escuro" theme="dark">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm">
              Ação
            </Button>
            <Button variant="outline" size="sm">
              Outline
            </Button>
          </div>
          <Input placeholder="Buscar..." className="h-10" />
          <MetricCard
            label="Receita"
            value="R$ 42.900"
            tone="success"
            delta={{ value: 12 }}
            compact
          />
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-2">
                <Badge variant="brand">brand</Badge>
                <Badge variant="success">success</Badge>
                <Badge variant="danger">danger</Badge>
              </div>
            </CardContent>
          </Card>
          <Alert variant="warning">
            <AlertTitle>Atenção</AlertTitle>
            <AlertDescription>Alert de exemplo no tema escuro.</AlertDescription>
          </Alert>
          <div className="overflow-hidden rounded-xl border border-border">
            <ListRow
              icon={<Building2 className="h-4 w-4" />}
              title="HubData"
              description="Tecnologia"
              status={{ label: "Ativo", tone: "success" }}
              value="R$ 12.500"
            />
          </div>
        </ThemeComparisonPanel>
      </div>
    </section>
  );
}
