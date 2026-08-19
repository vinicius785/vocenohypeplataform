import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { initTheme } from "../lib/theme";
import { fetchWorkspace, type Workspace } from "@/lib/workspace-store";

/** 404 com a identidade do workspace — antes era um "Page not found"
 * genérico em inglês, destoando do resto da plataforma (pt-BR, logo do
 * workspace no login/sidebar). Fica no `__root.tsx` porque cobre qualquer
 * rota, autenticada ou não — por isso "Voltar" sempre manda pra "/" (a
 * própria tela de login já redireciona pra "/time" sozinha se já houver
 * sessão, então não precisa checar auth aqui). */
function NotFoundComponent() {
  const [ws, setWs] = useState<Workspace | null>(null);
  useEffect(() => {
    fetchWorkspace()
      .then(setWs)
      .catch(() => setWs(null));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-foreground text-background">
        {ws?.logo ? (
          <img src={ws.logo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-lg font-bold">
            {(ws?.nome || "V").trim().charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <p className="mt-6 text-sm font-medium uppercase tracking-widest text-muted-foreground">
        Erro 404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        Essa página não existe
      </h1>
      <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
        O link pode estar errado ou a página pode ter sido movida. Confira o endereço ou volte pro
        início.
      </p>
      <Link
        to="/"
        className="mt-7 inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
      >
        Voltar pro início
      </Link>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Plataforma VNH" },
      { name: "description", content: "Acesse sua conta." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Plataforma VNH" },
      { property: "og:description", content: "Acesse sua conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "theme-color", content: "#ffffff" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "VNH" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    initTheme();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registrado só pra habilitar "instalar como app" (ícone + janela
    // própria) no celular/desktop — ver public/sw.js pra saber por que ele
    // não faz cache de nada.
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    let mounted = true;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (!mounted) return;
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      return () => data.subscription.unsubscribe();
    });
    return () => {
      mounted = false;
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
