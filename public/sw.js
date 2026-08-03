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
