import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_SIGNAL_DEBOUNCE_MS,
  DEMO_SIGNAL_EVENT,
  createDemoSignalSender,
  debounce,
  demoSignalTopic,
  sendDemoSignalHttp,
  subscribeDemoSignal,
} from "./demo-signal";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("debounce", () => {
  it("junta chamadas em sequência numa só, no fim da janela", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(60);
    d();
    vi.advanceTimersByTime(60);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel descarta a chamada pendente", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("tópico", () => {
  it("é demo:<realtime_key> — nunca contém o token", () => {
    expect(demoSignalTopic("abc123")).toBe("demo:abc123");
  });
});

describe("createDemoSignalSender (lado do time)", () => {
  function setup(over: Partial<Parameters<typeof createDemoSignalSender>[0]> = {}) {
    const broadcast = vi.fn().mockResolvedValue(undefined);
    const loadKeys = vi.fn().mockResolvedValue(new Map([["k-demo", "KEY1"]]));
    const notify = createDemoSignalSender({
      loadKeys,
      broadcast,
      isDemoCampanha: (id) => id === "k-demo",
      ...over,
    });
    return { notify, broadcast, loadKeys };
  }

  it("campanha comum: não faz nada (nem consulta chaves)", async () => {
    const { notify, broadcast, loadKeys } = setup();
    notify("k-real");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(loadKeys).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("campanha de demo: UM broadcast no tópico certo, depois do debounce", async () => {
    const { notify, broadcast } = setup();
    notify("k-demo");
    notify("k-demo");
    notify("k-demo");
    await vi.advanceTimersByTimeAsync(DEMO_SIGNAL_DEBOUNCE_MS - 1);
    expect(broadcast).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5);
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith("demo:KEY1");
  });

  it("as chaves são carregadas uma vez e reaproveitadas", async () => {
    const { notify, loadKeys } = setup();
    notify("k-demo");
    await vi.advanceTimersByTimeAsync(1_000);
    notify("k-demo");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(loadKeys).toHaveBeenCalledTimes(1);
  });

  it("sem chave para a campanha (demo ainda não listada): não envia e não quebra", async () => {
    const { notify, broadcast } = setup({ loadKeys: vi.fn().mockResolvedValue(new Map()) });
    notify("k-demo");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("falha ao carregar chaves ou enviar NUNCA propaga (o polling cobre)", async () => {
    const a = setup({ loadKeys: vi.fn().mockRejectedValue(new Error("rede")) });
    a.notify("k-demo");
    const b = setup({ broadcast: vi.fn().mockRejectedValue(new Error("realtime fora")) });
    b.notify("k-demo");
    await expect(vi.advanceTimersByTimeAsync(1_000)).resolves.not.toThrow();
  });
});

describe("subscribeDemoSignal (lado do cliente)", () => {
  function fakeClient() {
    const handlers: Array<{ filter: { event: string }; cb: () => void }> = [];
    const topics: string[] = [];
    const removed: unknown[] = [];
    const channel = {
      on: (_t: "broadcast", filter: { event: string }, cb: () => void) => (
        handlers.push({ filter, cb }),
        channel
      ),
      subscribe: vi.fn(),
    };
    const client = {
      channel: (topic: string) => (topics.push(topic), channel),
      removeChannel: (c: unknown) => removed.push(c),
    };
    return { client, handlers, topics, removed, channel };
  }

  it("assina o tópico e o evento certos; vários sinais viram UM reload", () => {
    const f = fakeClient();
    const onSignal = vi.fn();
    subscribeDemoSignal(f.client, "KEY1", onSignal);
    expect(f.topics).toEqual(["demo:KEY1"]);
    expect(f.handlers[0].filter.event).toBe(DEMO_SIGNAL_EVENT);
    expect(f.channel.subscribe).toHaveBeenCalledTimes(1);
    f.handlers[0].cb();
    f.handlers[0].cb();
    f.handlers[0].cb();
    vi.advanceTimersByTime(DEMO_SIGNAL_DEBOUNCE_MS + 1);
    expect(onSignal).toHaveBeenCalledTimes(1);
  });

  it("cancelar remove o canal e descarta reload pendente", () => {
    const f = fakeClient();
    const onSignal = vi.fn();
    const off = subscribeDemoSignal(f.client, "KEY1", onSignal);
    f.handlers[0].cb();
    off();
    vi.advanceTimersByTime(1_000);
    expect(onSignal).not.toHaveBeenCalled();
    expect(f.removed).toEqual([f.channel]);
  });
});

describe("sendDemoSignalHttp (servidor)", () => {
  it("POST ao endpoint de broadcast com payload VAZIO e tópico público", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 202, ok: true });
    const ok = await sendDemoSignalHttp({
      url: "https://x.supabase.co/",
      serviceKey: "SK",
      realtimeKey: "KEY1",
      fetchImpl: fetchImpl as never,
    });
    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/realtime/v1/api/broadcast");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("SK");
    expect(JSON.parse(init.body)).toEqual({
      messages: [{ topic: "demo:KEY1", event: "changed", payload: {}, private: false }],
    });
  });

  it("resposta de erro: false (sem lançar)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 500, ok: false });
    expect(
      await sendDemoSignalHttp({
        url: "u",
        serviceKey: "k",
        realtimeKey: "r",
        fetchImpl: fetchImpl as never,
      }),
    ).toBe(false);
  });
});
