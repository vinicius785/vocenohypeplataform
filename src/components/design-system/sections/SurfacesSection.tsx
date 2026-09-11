import { Wallet, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { MetricCard } from "@/components/shared/MetricCard";

const CARD_VARIANTS = ["default", "interactive", "elevated", "selected", "muted"] as const;
const BADGE_VARIANTS = [
  "default",
  "brand",
  "success",
  "warning",
  "danger",
  "info",
  "outline",
] as const;

export function SurfacesSection() {
  return (
    <div className="space-y-10">
      <section id="cards" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Cards</h2>
        <p className={TYPOGRAPHY.bodySecondary}>
          Poucas variantes de propósito — não crie uma nova pra cada tela.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {CARD_VARIANTS.map((variant) => (
            <Card key={variant} variant={variant} className="p-4">
              <p className="text-xs font-medium capitalize text-foreground">{variant}</p>
              <p className={TYPOGRAPHY.caption}>Conteúdo de exemplo do card.</p>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Com cabeçalho estruturado</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Usa `CardHeader` e `CardContent` do primitivo — pro corpo com título separado do
            conteúdo.
          </CardContent>
        </Card>
      </section>

      <section id="metric-cards" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Metric cards</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Receita do mês"
            value="R$ 42.900"
            tone="brand"
            icon={<Wallet className="h-4 w-4" />}
            delta={{ value: 12, label: "vs. mês anterior" }}
          />
          <MetricCard
            label="Novos leads"
            value="18"
            delta={{ value: -6 }}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <MetricCard label="Saldo atual" value={null} unavailableReason="Saldo não configurado" />
          <MetricCard
            label="Inadimplência"
            value="4,2%"
            tone="danger"
            complement="R$ 8.400 vencidos"
          />
        </div>
        <MetricCard
          label="Card clicável"
          value="128 tarefas"
          onClick={() => alert("clicou")}
          complement="Clique pra ver detalhes"
        />
      </section>

      <section id="badges" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Badges</h2>
        <p className={TYPOGRAPHY.bodySecondary}>
          Variantes por significado, nunca por módulo — não crie "badge do Financeiro".
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </section>

      <section id="alerts" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Alerts</h2>
        <div className="space-y-3">
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Alteração salva</AlertTitle>
            <AlertDescription>Os dados foram atualizados com sucesso.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Atenção</AlertTitle>
            <AlertDescription>3 itens vencem nos próximos 7 dias.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Erro ao salvar</AlertTitle>
            <AlertDescription>Verifique os campos e tente novamente.</AlertDescription>
          </Alert>
          <Alert variant="info">
            <Info className="h-4 w-4" />
            <AlertTitle>Informação</AlertTitle>
            <AlertDescription>Essa é uma mensagem neutra, sem ação necessária.</AlertDescription>
          </Alert>
        </div>
      </section>
    </div>
  );
}
