/** E-mail do convite de ACESSO AO PORTAL do cliente (enviado pelo admin da Você no Hype na ficha do
 * cliente). Puro, sem I/O — o envio fica em `organization-invites.functions.ts`. Nunca leva senha:
 * conta nova recebe um link para CRIAR a própria senha; conta existente, o link do login. */
export type PortalAccessRole = "client_standard" | "client_viewer";

export const PORTAL_ACCESS_ROLE_LABEL: Record<PortalAccessRole, string> = {
  client_standard: "Administrador",
  client_viewer: "Visualizador",
};

const ROLE_DESCRIPTION: Record<PortalAccessRole, string> = {
  client_standard: "acompanhar campanhas, aprovar entregas e gerenciar o acesso da sua equipe",
  client_viewer: "acompanhar campanhas e resultados (somente leitura)",
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const BRAND = "#6F95FF";
const INK = "#16181d";
const MUTED = "#6b6f78";
const DARK = "#111214";

export function buildPortalAccessEmail(opts: {
  clienteName: string;
  inviterName: string;
  role: PortalAccessRole;
  /** Conta nova: link para criar a senha. Conta existente: link do login. */
  actionUrl: string;
  existingAccount: boolean;
  /** URL pública do logo (e-mail não carrega arquivo local). Sem ela, o cabeçalho mostra o nome. */
  logoUrl?: string;
}): { subject: string; html: string } {
  const cliente = escapeHtml(opts.clienteName);
  const inviter = escapeHtml(opts.inviterName);
  const url = escapeHtml(opts.actionUrl);
  const cta = opts.existingAccount ? "Acessar o portal" : "Criar minha senha e acessar";
  const step = opts.existingAccount
    ? "Entre com o seu e-mail e a senha que você já usa."
    : "Crie a sua senha para entrar. O link é de uso único.";
  const logo = opts.logoUrl
    ? `<img src="${escapeHtml(opts.logoUrl)}" alt="Você no Hype" width="150" style="display:block;margin:0 auto;height:auto;border:0;" />`
    : `<span style="font-size:18px;font-weight:700;color:#ffffff;">Você no Hype</span>`;
  const row = (label: string, value: string) => `
              <tr>
                <td style="padding:10px 16px;font-size:12px;color:${MUTED};width:120px;">${label}</td>
                <td style="padding:10px 16px;font-size:14px;font-weight:600;color:${INK};">${value}</td>
              </tr>`;
  const html = `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light" /></head>
  <body style="margin:0;padding:0;background:#eef0f4;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${inviter} convidou você para o portal da ${cliente}. ${step}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f4;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
          <tr><td style="background:${DARK};padding:28px 24px;text-align:center;">${logo}</td></tr>
          <tr><td style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:${INK};">Você recebeu acesso ao portal da ${cliente}</h1>
            <p style="margin:0;font-size:15px;line-height:1.6;color:${INK};">${inviter} convidou você para acompanhar as campanhas da <strong>${cliente}</strong> na Você no Hype.</p>
          </td></tr>
          <tr><td style="padding:20px 32px 4px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;border-radius:12px;">${row("Cliente", cliente)}${row("Seu acesso", `${PORTAL_ACCESS_ROLE_LABEL[opts.role]}`)}
              <tr><td colspan="2" style="padding:0 16px 12px;font-size:13px;line-height:1.5;color:${MUTED};">Você poderá ${ROLE_DESCRIPTION[opts.role]}.</td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:24px 32px 8px;text-align:center;">
            <p style="margin:0 0 16px;font-size:14px;color:${MUTED};">${step}</p>
            <a href="${url}" style="display:inline-block;background:${BRAND};color:#0B1020;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px;">${cta}</a>
          </td></tr>
          <tr><td style="padding:24px 32px 32px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">O botão não funcionou? Peça ao time da Você no Hype para reenviar o convite.<br />Se você não esperava este e-mail, pode ignorá-lo com segurança.</p>
          </td></tr>
          <tr><td style="border-top:1px solid #e6e8ec;padding:16px 32px;text-align:center;font-size:11px;color:${MUTED};">Você no Hype · Plataforma de campanhas e influência</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return { subject: `Você recebeu acesso ao portal da ${opts.clienteName}`, html };
}
