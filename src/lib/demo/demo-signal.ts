/**
 * Sinal de mudança da Demo (Time ⇄ Cliente) — Broadcast do Realtime, SEM dado.
 *
 * O cliente da demo não tem sessão, então não recebe `postgres_changes` (RLS). O sinal é só
 * "algo mudou": o portal faz UM `reload()` (com debounce) e o polling de 20 s fica de rede de
 * segurança. A chave pública permite forjar o sinal; o pior efeito é um recarregamento extra
 * (por isso o tópico usa `realtime_key`, distinta do token, e o payload é vazio).
 *
 * Tudo aqui é puro/injetável (sem Supabase, sem timers globais obrigatórios) para teste.
 */

export const DEMO_SIGNAL_EVENT = "changed";
export const DEMO_SIGNAL_DEBOUNCE_MS = 400;

export const demoSignalTopic = (realtimeKey: string) => `demo:${realtimeKey}`;

type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Chama `fn` só depois de `ms` sem novas chamadas (trailing). */
export function debounce(fn: () => void, ms: number, timers: Timers = realTimers) {
  let handle: unknown = null;
  const run = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = timers.setTimeout(() => {
      handle = null;
      fn();
    }, ms);
  };
  run.cancel = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };
  return run;
}

// ---------------------------------------------------------------------------------------
// Lado do TIME: depois de gravar na campanha de uma demo, avisa o cliente.
// ---------------------------------------------------------------------------------------

export type DemoSignalSenderDeps = {
  /** `campanha_id → realtime_key` das demos (lido de `demo_sessions`, RLS interna). */
  loadKeys: () => Promise<Map<string, string>>;
  /** Envia um broadcast ao tópico. */
  broadcast: (topic: string) => Promise<void>;
  isDemoCampanha: (campanhaId: string) => boolean;
  debounceMs?: number;
  timers?: Timers;
};

export function createDemoSignalSender(deps: DemoSignalSenderDeps) {
  const timers = deps.timers ?? realTimers;
  const ms = deps.debounceMs ?? DEMO_SIGNAL_DEBOUNCE_MS;
  let keys: Map<string, string> | null = null;
  const pending = new Map<string, ReturnType<typeof debounce>>();

  async function fire(campanhaId: string) {
    try {
      let key = keys?.get(campanhaId);
      if (!key) {
        // Demo nova (ou cache vazio): recarrega uma vez.
        keys = await deps.loadKeys();
        key = keys.get(campanhaId);
      }
      if (!key) return;
      await deps.broadcast(demoSignalTopic(key));
    } catch {
      /* best-effort: o polling do portal cobre */
    }
  }

  return function notify(campanhaId: string): void {
    if (!deps.isDemoCampanha(campanhaId)) return; // campanha comum: nada a fazer
    let d = pending.get(campanhaId);
    if (!d) {
      d = debounce(() => void fire(campanhaId), ms, timers);
      pending.set(campanhaId, d);
    }
    d();
  };
}

// ---------------------------------------------------------------------------------------
// Lado do CLIENTE (portal): ouve o tópico e pede UM recarregamento.
// ---------------------------------------------------------------------------------------

type BroadcastChannel = {
  on: (type: "broadcast", filter: { event: string }, callback: () => void) => BroadcastChannel;
  subscribe: () => unknown;
};

export type DemoSignalClient = {
  channel: (topic: string) => BroadcastChannel;
  removeChannel: (channel: BroadcastChannel) => unknown;
};

/** Assina o sinal da demo; devolve o cancelamento. */
export function subscribeDemoSignal(
  client: DemoSignalClient,
  realtimeKey: string,
  onSignal: () => void,
  options: { debounceMs?: number; timers?: Timers } = {},
): () => void {
  const debounced = debounce(
    onSignal,
    options.debounceMs ?? DEMO_SIGNAL_DEBOUNCE_MS,
    options.timers ?? realTimers,
  );
  const channel = client.channel(demoSignalTopic(realtimeKey));
  channel.on("broadcast", { event: DEMO_SIGNAL_EVENT }, () => debounced()).subscribe();
  return () => {
    debounced.cancel();
    void client.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------------------
// Lado do SERVIDOR: depois da escrita do cliente, avisa outras abas (HTTP, service-role).
// ---------------------------------------------------------------------------------------

export async function sendDemoSignalHttp(opts: {
  url: string;
  serviceKey: string;
  realtimeKey: string;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`${opts.url.replace(/\/$/, "")}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: opts.serviceKey,
      Authorization: `Bearer ${opts.serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          topic: demoSignalTopic(opts.realtimeKey),
          event: DEMO_SIGNAL_EVENT,
          payload: {},
          private: false,
        },
      ],
    }),
  });
  return res.status === 202 || res.ok;
}
