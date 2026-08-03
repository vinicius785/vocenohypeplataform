// Service worker mínimo — existe só pra habilitar a instalação como app
// (ícone na tela de início, abrir em janela própria). Não faz cache de
// nada de propósito: este é um app com dados em tempo real (Supabase) e já
// tem seu próprio mecanismo de aviso de versão nova (public/version.json +
// VersionWatcher) — cachear a shell ou respostas de API aqui só criaria
// risco de servir tela/dados desatualizados depois de um deploy.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Sem responseWith — deixa passar direto pra rede. A presença de um
  // listener de "fetch" é o que os navegadores exigem pra considerar o
  // app instalável, mesmo sem interceptar nada de fato.
});

// Notificação push de verdade (mensagem de chat/menção) — ver
// src/lib/push.functions.ts (sendChatPush) pra quem dispara.
self.addEventListener("push", (event) => {
  let payload = { title: "Plataforma VNH", body: "Você tem uma notificação nova.", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* mantém o payload padrão */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/pwa-192.png",
      badge: "/favicon-32.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate?.(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
