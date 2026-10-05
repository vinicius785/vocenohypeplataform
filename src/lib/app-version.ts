/** Versão exibida no rodapé de Configurações e usada por `VersionWatcher`
 * pra saber se o bundle carregado está desatualizado frente a
 * `public/version.json`. Extraído de `ConfiguracoesSection.tsx` (Etapa de
 * reconstrução de Configurações) pra `VersionWatcher` parar de depender de
 * importar de dentro do componente de tela — mesmo valor de antes, só
 * mudou de arquivo. Bump manual a cada deploy, junto de `public/version.json` (`version` + a release mais recente; o histórico vai em `public/changelog.json`). */
export const APP_VERSION = "1.325.0";

declare const __BUILD_ID__: string | undefined;

/** Commit do deploy que gerou ESTE bundle (7 caracteres); vazio em dev/local. Comparado com o
 * `build` de `/version.json`: se diferem, saiu um deploy novo — mesmo sem bump de versão. */
export const BUILD_ID: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "";
