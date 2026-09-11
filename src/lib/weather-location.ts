/** Localização fixa e centralizada do ambiente climático da Home — nunca
 * varia por usuário, nunca vem de geolocalização/IP/perfil (item 1 do
 * pedido: "todos os usuários devem visualizar o mesmo clima"). Único
 * lugar que define coordenadas/fuso; qualquer outro módulo que precise
 * do clima da Home deve importar daqui, nunca duplicar o número. */
export const WEATHER_LOCATION = {
  label: "Itaim Bibi, São Paulo — SP, Brasil",
  /** Forma curta pra exibição na saudação — a versão completa (`label`)
   * cabe em tooltip/título, mas ocuparia espaço demais na linha discreta
   * de clima no mobile (item 13: "localização sem ocupar várias linhas
   * desnecessárias"). */
  shortLabel: "Itaim Bibi",
  latitude: -23.5878,
  longitude: -46.6754,
  timezone: "America/Sao_Paulo",
} as const;
