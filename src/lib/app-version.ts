/** Versão exibida no rodapé de Configurações e usada por `VersionWatcher`
 * pra saber se o bundle carregado está desatualizado frente a
 * `public/version.json`. Extraído de `ConfiguracoesSection.tsx` (Etapa de
 * reconstrução de Configurações) pra `VersionWatcher` parar de depender de
 * importar de dentro do componente de tela — mesmo valor de antes, só
 * mudou de arquivo. Bump manual a cada deploy, junto de `public/version.json`. */
export const APP_VERSION = "1.276.4";
