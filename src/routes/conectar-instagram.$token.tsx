import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { InstagramConnectContent } from "@/components/legal/InstagramConnectContent";
import { getInstagramLinkInfo, startInstagramConnect } from "@/lib/instagram.functions";

/** Página pública do influenciador (link único, sem login): explica o acesso e abre o login do Instagram. */
export const Route = createFileRoute("/conectar-instagram/$token")({
  loader: ({ params }) => getInstagramLinkInfo({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Conectar Instagram | Você no Hype" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ConnectPage,
});

function ConnectPage() {
  const info = Route.useLoaderData();
  const { token } = Route.useParams();
  const start = useServerFn(startInstagramConnect);
  return (
    <LegalPageShell showLogin={false}>
      <InstagramConnectContent
        state={info.state}
        firstName={info.firstName}
        configured={info.configured}
        onConnect={async () => {
          const { url } = await start({ data: { token } });
          window.location.assign(url);
        }}
      />
    </LegalPageShell>
  );
}
