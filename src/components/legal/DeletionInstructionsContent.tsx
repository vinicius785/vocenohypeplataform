import { useState } from "react";
import {
  PRIVACY_POLICY_URL_PATH,
  PRIVACY_CONTROLLER,
  DELETION_PATH,
} from "@/lib/privacy-policy-config";
import { A, P, Pending, Section, UL } from "./legal-ui";

/** Consulta pelo código de confirmação. Funciona com JS; o link direto `/exclusao-de-dados/<código>` funciona sem. */
function CodeLookup() {
  const [code, setCode] = useState("");
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        const v = code.trim().toLowerCase();
        if (v) window.location.assign(`${DELETION_PATH}/${encodeURIComponent(v)}`);
      }}
    >
      <label htmlFor="codigo" className="sr-only">
        Código de confirmação
      </label>
      <input
        id="codigo"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Código de confirmação"
        autoComplete="off"
        spellCheck={false}
        className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />
      <button
        type="submit"
        className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Consultar pedido
      </button>
    </form>
  );
}

/** Instruções públicas de exclusão de dados (URL de instruções aceita pela Meta). */
export function DeletionInstructionsContent() {
  const email = PRIVACY_CONTROLLER.canalPrivacidade;
  return (
    <article lang="pt-BR" className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Exclusão de dados</h1>
        <P>
          Explicamos como pedir a exclusão dos seus dados pessoais na Plataforma VNH e como
          acompanhar o pedido. O tratamento de dados está descrito na{" "}
          <A href={PRIVACY_POLICY_URL_PATH}>Política de Privacidade</A>.
        </P>
      </header>

      <Section id="meta" title="Se você conectou o Instagram (Meta)">
        <P>
          A plataforma só recebe dados do Instagram se o próprio influenciador conectar a conta
          profissional dele (token, perfil básico e métricas). Quando a Meta nos envia um pedido de
          exclusão, nós o registramos, apagamos a conexão e as métricas vinculadas àquela identidade
          e só marcamos o pedido como concluído depois disso. Você recebe um código de confirmação e
          pode acompanhar o pedido nesta página.
        </P>
        <UL>
          <li>
            No Instagram, vá em Configurações → Aplicativos e sites, escolha o aplicativo da Você no
            Hype e remova o acesso (e peça a exclusão dos dados).
          </li>
          <li>Guarde o código de confirmação que a Meta mostrar.</li>
          <li>
            Também é possível pedir a desconexão e a exclusão diretamente à equipe, pelo e-mail
            abaixo.
          </li>
        </UL>
      </Section>

      <Section id="manual" title="Pedido direto, por e-mail">
        <P>
          Para excluir a sua conta ou outros dados pessoais diretamente, escreva para{" "}
          {email ? (
            <A href={`mailto:${email}`}>{email}</A>
          ) : (
            <Pending>canal de privacidade</Pending>
          )}{" "}
          informando:
        </P>
        <UL>
          <li>o e-mail da sua conta ou o nome usado no cadastro;</li>
          <li>
            quais dados quer excluir (a conta inteira, os dados de uma integração ou de uma
            campanha);
          </li>
          <li>como podemos confirmar que o pedido é seu.</li>
        </UL>
        <P>
          Confirmaremos o recebimento, excluiremos o que for cabível e informaremos o que precisa
          ser mantido por obrigação legal, contrato ou segurança, e por quê. A exclusão de uma
          pessoa não apaga a conta nem os dados de uma empresa cliente ou de outras pessoas.
        </P>
      </Section>

      <Section id="acompanhar" title="Acompanhar um pedido">
        <P>Digite o código de confirmação recebido para ver o estado do pedido.</P>
        <CodeLookup />
        <P>
          Os estados possíveis são: recebido, em processamento, concluído ou não encontrado. A
          página nunca mostra dados pessoais.
        </P>
      </Section>
    </article>
  );
}
