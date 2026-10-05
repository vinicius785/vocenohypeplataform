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

export function buildPortalAccessEmail(opts: {
  clienteName: string;
  inviterName: string;
  role: PortalAccessRole;
  /** Conta nova: link para criar a senha. Conta existente: link do login. */
  actionUrl: string;
  existingAccount: boolean;
}): { subject: string; html: string } {
  const cliente = escapeHtml(opts.clienteName);
  const inviter = escapeHtml(opts.inviterName);
  const url = escapeHtml(opts.actionUrl);
  const cta = opts.existingAccount ? "Acessar o portal" : "Criar minha senha e acessar";
  const step = opts.existingAccount
    ? "Entre com o seu e-mail e a senha que você já usa."
    : "Clique no botão abaixo para criar a sua senha e entrar. O link é de uso único.";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f1d1a;max-width:520px;line-height:1.5;">
      <p style="font-size:16px;font-weight:700;margin:0 0 12px;">Você recebeu acesso ao portal da ${cliente}</p>
      <p style="margin:0 0 12px;">${inviter} convidou você para acessar o portal da <strong>${cliente}</strong> na Você no Hype.</p>
      <p style="margin:0 0 12px;">Seu nível de acesso: <strong>${PORTAL_ACCESS_ROLE_LABEL[opts.role]}</strong> — ${ROLE_DESCRIPTION[opts.role]}.</p>
      <p style="margin:0 0 16px;">${step}</p>
      <p style="margin:0 0 20px;"><a href="${url}" style="display:inline-block;background:#6F95FF;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;">${cta}</a></p>
      <p style="color:#6b6862;font-size:12px;margin:0;">Se o botão não funcionar, peça ao time da Você no Hype para reenviar o convite. Se você não esperava este e-mail, pode ignorá-lo.</p>
    </div>
  `;
  return { subject: `Você recebeu acesso ao portal da ${opts.clienteName}`, html };
}
