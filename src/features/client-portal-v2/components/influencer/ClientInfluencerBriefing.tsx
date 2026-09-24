import { FileText } from "lucide-react";
import { InfluencerDrawerSection } from "./InfluencerDrawerSection";
import type { PublicInfluencer } from "@/lib/portal-types";

/** Briefing — texto estruturado (nunca textarea, é somente leitura pro
 * cliente). Sem campos de objetivo/mensagem/CTA separados na estrutura
 * de dados atual — só o texto livre já existente (`briefingPersonalizado`)
 * e o anexo, quando houver; nada inventado além disso. */
export function ClientInfluencerBriefing({ influencer }: { influencer: PublicInfluencer }) {
  if (!influencer.briefingPersonalizado && !influencer.briefingAnexoUrl) return null;

  return (
    <InfluencerDrawerSection icon={<FileText className="h-4 w-4" />} title="Briefing">
      <div className="space-y-2 rounded-2xl bg-card p-4 dark:shadow-none">
        {influencer.briefingPersonalizado && (
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {influencer.briefingPersonalizado}
          </p>
        )}
        {influencer.briefingAnexoUrl && (
          <a
            href={influencer.briefingAnexoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs font-medium text-brand hover:underline"
          >
            {influencer.briefingAnexoNome || "Ver anexo do briefing"}
          </a>
        )}
      </div>
    </InfluencerDrawerSection>
  );
}
