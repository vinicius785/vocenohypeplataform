/**
 * Baixa um arquivo de verdade (Save As), mesmo quando a URL é de outra
 * origem (signed URL do Supabase Storage, sempre `*.supabase.co`, nunca o
 * mesmo domínio do portal). O atributo HTML `download` é silenciosamente
 * ignorado pelo navegador em links cross-origin — por segurança, ele só
 * funciona em links do MESMO domínio. Sem isso, clicar em "Baixar
 * arquivo" só abre/navega pra URL, nunca dispara o download de verdade
 * (bug relatado pelo usuário).
 *
 * Contorno: busca o arquivo via `fetch` (mesmo cross-origin, funciona
 * porque não depende do atributo `download`), monta um Blob local
 * (mesma origem do documento) e aciona o download nesse Blob, que aí sim
 * respeita `download`. Se o fetch falhar (CORS bloqueado, rede etc.),
 * cai no comportamento antigo (abrir a URL numa aba nova) em vez de
 * travar silenciosamente.
 */
export async function downloadCrossOriginFile(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || "arquivo";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
