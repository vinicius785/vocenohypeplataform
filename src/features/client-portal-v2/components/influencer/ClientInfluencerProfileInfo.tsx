import { User, Sparkles } from "lucide-react";
import { InfluencerDrawerSection } from "./InfluencerDrawerSection";
import type { PublicInfluencer } from "@/lib/portal-types";

/** Informações do perfil — linhas compactas, nunca um card por campo. */
export function ClientInfluencerProfileInfo({ influencer }: { influencer: PublicInfluencer }) {
  const items = [
    { label: "Nicho", value: influencer.nicho },
    ...influencer.redes.map((r) => ({
      label: r.plataforma,
      value: `@${r.handle.replace(/^@+/, "")}${r.seguidores ? ` · ${r.seguidores} seguidores` : ""}`,
    })),
  ].filter((i): i is { label: string; value: string } => !!i.value);

  if (items.length === 0) return null;

  return (
    <InfluencerDrawerSection icon={<User className="h-4 w-4" />} title="Informações do perfil">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-2xl bg-card p-4 dark:shadow-none sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-text-secondary">{item.label}</dt>
            <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{item.value}</dd>
          </div>
        ))}
      </dl>
    </InfluencerDrawerSection>
  );
}

/** "Por que recomendamos" — só existe quando o time preencheu
 * `justificativaTime`; nunca inventa texto. */
export function ClientInfluencerRecommendation({ influencer }: { influencer: PublicInfluencer }) {
  if (!influencer.justificativaTime) return null;
  return (
    <InfluencerDrawerSection icon={<Sparkles className="h-4 w-4" />} title="Por que recomendamos">
      <p className="whitespace-pre-wrap rounded-2xl bg-card p-4 text-sm text-foreground dark:shadow-none">
        {influencer.justificativaTime}
      </p>
    </InfluencerDrawerSection>
  );
}
