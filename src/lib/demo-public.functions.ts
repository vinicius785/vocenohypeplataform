import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toSafeDemoError } from "@/lib/demo/demo-public";

/**
 * Funções PÚBLICAS da Demo — o cliente, por link (`/demo/$token`), sem login e sem sessão
 * Supabase. Toda chamada leva o token; o servidor deriva sessão → cliente → campanha, aplica
 * limite de uso e recusa tudo que não for da campanha da demo (ver `lib/demo/demo-public.ts`).
 * Todas são POST (respostas nunca cacheáveis). Erros chegam ao navegador já "seguros".
 */

const WithToken = z.object({ token: z.string().max(100) }).passthrough();

async function service() {
  const { getServerDemoPublicService } = await import("@/lib/demo/demo-public.server");
  return getServerDemoPublicService();
}

function split(raw: unknown): { token: string; rest: Record<string, unknown> } {
  const { token, ...rest } = WithToken.parse(raw);
  return { token, rest };
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "DemoError") {
      console.error("[demo-public]", error instanceof Error ? error.message : error);
    }
    throw toSafeDemoError(error);
  }
}

export const getDemoPortalData = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => split(raw))
  .handler(({ data }) => guarded(async () => (await service()).getPortalData(data.token)));

export const respondDemoInflu = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => split(raw))
  .handler(({ data }) =>
    guarded(async () => (await service()).respondInflu(data.token, data.rest)),
  );

export const reopenDemoInflu = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => split(raw))
  .handler(({ data }) => guarded(async () => (await service()).reopenInflu(data.token, data.rest)));

export const respondDemoEntrega = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => split(raw))
  .handler(({ data }) =>
    guarded(async () => (await service()).respondEntrega(data.token, data.rest)),
  );

export const addDemoComentario = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => split(raw))
  .handler(({ data }) =>
    guarded(async () => (await service()).addComentario(data.token, data.rest)),
  );

export const getDemoRelatorioUrl = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => split(raw))
  .handler(({ data }) =>
    guarded(async () => (await service()).freshRelatorioUrl(data.token, data.rest)),
  );
