/**
 * Mensagem de erro de upload no Storage para quem tentou subir o arquivo (time interno,
 * sessão autenticada). Antes o upload de anexos de entrega descartava o erro do Supabase e
 * mostrava só "Falha ao subir o arquivo. Tente de novo.", sem dizer se era tamanho, permissão
 * ou rede. Aqui os casos conhecidos viram texto acionável e os demais mostram o erro real.
 *
 * Não usar em função pública (sem sessão): lá o erro cru do banco não pode vazar.
 */
export type StorageUploadErrorLike = {
  message?: string;
  status?: number | string;
  statusCode?: number | string;
};

const MB = 1024 * 1024;

export function describeStorageUploadError(
  error: StorageUploadErrorLike,
  file: { size: number },
): string {
  const raw = (error.message ?? "").trim();
  const status = String(error.statusCode ?? error.status ?? "");

  if (status === "413" || /exceeded the maximum allowed size|payload too large/i.test(raw)) {
    return `O arquivo (${(file.size / MB).toFixed(1)}MB) passa do limite de envio do servidor. Peça a um administrador para aumentar o limite de upload do Storage.`;
  }
  if (status === "401" || status === "403" || /row-level security|not authorized|jwt/i.test(raw)) {
    return "Sem permissão para anexar arquivos (a sessão pode ter expirado — atualize a página).";
  }
  if (/failed to fetch|network|timeout|timed out/i.test(raw)) {
    return "A conexão caiu durante o envio. Verifique a internet e tente de novo.";
  }
  return raw ? `Erro do servidor: ${raw}` : "O servidor recusou o envio. Tente de novo.";
}
