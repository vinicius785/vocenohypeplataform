import type { PublicStatus } from "@/lib/meta-data-deletion";
import { DELETION_PATH, PRIVACY_CONTROLLER } from "@/lib/privacy-policy-config";
import { P } from "./legal-ui";

const dt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      })
    : null;

const COPY: Record<PublicStatus["state"], { title: string; text: string }> = {
  recebido: {
    title: "Pedido recebido",
    text: "Recebemos o seu pedido de exclusão de dados e ele ainda não começou a ser processado.",
  },
  em_processamento: {
    title: "Em processamento",
    text: "Estamos excluindo os dados vinculados a este pedido. Volte a esta página mais tarde.",
  },
  concluido: {
    title: "Concluído",
    text: "O processamento deste pedido terminou.",
  },
  nao_encontrado: {
    title: "Pedido não encontrado",
    text: "Não encontramos nenhum pedido com este código. Confira se copiou o código completo.",
  },
};

/** Estado público de um pedido de exclusão. Só estado, datas e contagem: sem ID da Meta, e-mail ou dados da conta. */
export function DeletionStatusContent({ status }: { status: PublicStatus }) {
  const c = COPY[status.state];
  const email = PRIVACY_CONTROLLER.canalPrivacidade;
  return (
    <article lang="pt-BR" className="space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Status do pedido de exclusão de dados
      </h1>
      <div role="status" className="rounded-lg border border-border p-5">
        <p className="text-lg font-semibold text-foreground">{c.title}</p>
        <p className="mt-1 text-[15px] text-foreground/90">{c.text}</p>
        {status.state === "concluido" && (
          <p className="mt-2 text-[15px] text-foreground/90">
            {status.deletedCount
              ? `Foram excluídos ${status.deletedCount} registro(s) vinculados a este pedido.`
              : "Não havia dados vinculados a este pedido em nossa base, então nada precisou ser excluído."}
          </p>
        )}
        <dl className="mt-3 space-y-0.5 text-sm text-text-secondary">
          {status.createdAt && (
            <div>
              Recebido em: <time dateTime={status.createdAt}>{dt(status.createdAt)}</time>
            </div>
          )}
          {status.completedAt && (
            <div>
              Concluído em: <time dateTime={status.completedAt}>{dt(status.completedAt)}</time>
            </div>
          )}
        </dl>
      </div>
      <P>
        Para dúvidas, consulte as{" "}
        <a
          href={DELETION_PATH}
          className="font-medium text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          instruções de exclusão de dados
        </a>
        {email ? (
          <>
            {" "}
            ou escreva para{" "}
            <a
              href={`mailto:${email}`}
              className="font-medium text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {email}
            </a>
          </>
        ) : null}
        .
      </P>
    </article>
  );
}
