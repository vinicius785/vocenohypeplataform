import { useState } from "react";
import { PRIVACY_CONTROLLER, PRIVACY_POLICY_URL_PATH } from "@/lib/privacy-policy-config";
import { A, P, UL } from "./legal-ui";
import type { ConnectResult } from "./instagram-connect-result";

export type LinkState = "valid" | "expired" | "used" | "invalid";

const BAD_LINK: Record<Exclude<LinkState, "valid">, string> = {
  expired: "Este link expirou. Peça um novo link à equipe da Você no Hype.",
  used: "Este link já foi usado. Se precisar reconectar, peça um novo link à equipe.",
  invalid: "Link inválido ou indisponível. Confira o endereço ou peça um novo link à equipe.",
};

/** Página pública que o influenciador abre pelo link recebido: transparência + botão de conectar. */
export function InstagramConnectContent({
  state,
  firstName,
  configured,
  onConnect,
}: {
  state: LinkState;
  firstName: string | null;
  configured: boolean;
  onConnect: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = PRIVACY_CONTROLLER.canalPrivacidade;
  return (
    <article lang="pt-BR" className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Conectar seu Instagram
      </h1>
      {state !== "valid" || !configured ? (
        <P>
          {state !== "valid"
            ? BAD_LINK[state]
            : "A conexão não está disponível no momento. Tente mais tarde."}
        </P>
      ) : (
        <>
          <P>
            {firstName ? `Olá, ${firstName}. ` : ""}A Você no Hype pede que você conecte sua conta
            profissional do Instagram (Business ou Criador) para acompanhar o desempenho do seu
            perfil nas campanhas.
          </P>
          <section aria-labelledby="o-que" className="space-y-2">
            <h2 id="o-que" className="text-lg font-semibold text-foreground">
              O que vamos acessar (somente leitura)
            </h2>
            <UL>
              <li>
                dados básicos do perfil: @, tipo de conta, seguidores e número de publicações;
              </li>
              <li>
                métricas dos últimos 30 dias: alcance, visualizações, interações e contas engajadas;
              </li>
              <li>
                perfil dos seus seguidores: gênero, faixa etária, países e cidades, em percentuais.
              </li>
            </UL>
            <P>
              Não publicamos nada, não lemos mensagens privadas nem comentários e não alteramos sua
              conta. Os dados são usados só para as campanhas da Você no Hype, conforme a{" "}
              <A href={PRIVACY_POLICY_URL_PATH}>Política de Privacidade</A>.
            </P>
          </section>
          <section aria-labelledby="revogar" className="space-y-2">
            <h2 id="revogar" className="text-lg font-semibold text-foreground">
              Você controla o acesso
            </h2>
            <P>
              Você pode revogar quando quiser, no Instagram em Configurações → Aplicativos e sites,
              ou pedindo à equipe
              {email ? (
                <>
                  {" "}
                  (<A href={`mailto:${email}`}>{email}</A>)
                </>
              ) : null}
              . Para excluir os dados, veja as{" "}
              <A href="/exclusao-de-dados">instruções de exclusão</A>.
            </P>
          </section>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConnect();
              } catch {
                setError("Não foi possível iniciar a conexão. Tente de novo ou peça um novo link.");
                setBusy(false);
              }
            }}
            className="h-11 rounded-md bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {busy ? "Abrindo o Instagram…" : "Conectar com o Instagram"}
          </button>
        </>
      )}
    </article>
  );
}

const RESULT: Record<ConnectResult, { title: string; text: string }> = {
  ok: {
    title: "Instagram conectado",
    text: "Pronto! Sua conta foi conectada. Você já pode fechar esta página.",
  },
  negado: {
    title: "Conexão cancelada",
    text: "Você não autorizou o acesso, então nada foi conectado. Para tentar de novo, abra o link novamente.",
  },
  permissao: {
    title: "Faltou uma permissão",
    text: "Precisamos das duas permissões de leitura (perfil e métricas) para conectar. Abra o link e autorize as duas.",
  },
  expirado: {
    title: "Link expirado",
    text: "O link expirou. Peça um novo link à equipe da Você no Hype.",
  },
  invalido: {
    title: "Link inválido",
    text: "Não conseguimos validar esta conexão. Peça um novo link à equipe da Você no Hype.",
  },
  erro: {
    title: "Não foi possível conectar",
    text: "Algo deu errado. Confirme que sua conta é profissional (Business ou Criador) e tente de novo com o mesmo link, ou peça um novo.",
  },
};

export function InstagramResultContent({ status }: { status: ConnectResult }) {
  const r = RESULT[status];
  return (
    <article lang="pt-BR" className="space-y-3">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{r.title}</h1>
      <div role="status">
        <P>{r.text}</P>
      </div>
    </article>
  );
}
