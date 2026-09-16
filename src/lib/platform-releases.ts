/** Tipo + mapeamento de linha compartilhados entre `releases.functions.ts`
 * (escrita, via server function) e leituras diretas via `supabase` do
 * browser (`release-watch.ts`, `ReleaseHistoryDialog.tsx`) — mesma regra
 * de sempre: nunca duas formas divergentes de moldar o mesmo dado. */
export type PlatformRelease = {
  id: string;
  version: string;
  title: string;
  summary: string | null;
  changes: { title: string; description: string }[];
  environment: "production" | "preview" | "development";
  requiresReload: boolean;
  minimumSupportedVersion: string | null;
  releasedAt: string;
  createdAt: string;
};

export function mapPlatformReleaseRow(row: {
  id: string;
  version: string;
  title: string;
  summary: string | null;
  changes: unknown;
  environment: string;
  requires_reload: boolean;
  minimum_supported_version: string | null;
  released_at: string;
  created_at: string;
}): PlatformRelease {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    summary: row.summary,
    changes: Array.isArray(row.changes) ? (row.changes as PlatformRelease["changes"]) : [],
    environment: row.environment as PlatformRelease["environment"],
    requiresReload: row.requires_reload,
    minimumSupportedVersion: row.minimum_supported_version,
    releasedAt: row.released_at,
    createdAt: row.created_at,
  };
}
