/**
 * DTO único que todo consumidor do viewer compartilhado
 * (`ClientFileViewer`) recebe — Relatórios, Arquivos, a página da
 * campanha e o drawer do influenciador constroem este objeto a partir
 * das suas próprias fontes de dado (nenhuma tabela nova), mas o viewer
 * em si nunca precisa saber de onde o arquivo veio.
 */
export type ClientFile = {
  id: string;
  /** Título amigável — o que já é digitado no cadastro (`nome`), nunca o
   * nome físico gerado no Storage. */
  friendlyName: string;
  /** URL já resolvida (assinada) pelo chamador — o viewer nunca gera URL
   * sozinho, cada origem tem sua própria regra de assinatura/expiração. */
  url: string | null;
  category?: string;
  campanhaNome?: string;
  competenciaLabel?: string;
  influencerNome?: string;
  sizeBytes?: number;
  createdAt?: string;
  /** Só relatórios sabem regenerar a própria URL quando expira (têm
   * `storagePath` guardado) — os demais tipos de anexo hoje só têm a URL
   * já persistida, sem um jeito seguro de gerar uma nova (ver auditoria:
   * anti-padrão pré-existente, fora do escopo desta rodada corrigir por
   * completo). Quando ausente, o viewer não oferece "Tentar novamente"
   * além de recarregar a mesma URL. */
  regenerate?: () => Promise<string | null>;
};
