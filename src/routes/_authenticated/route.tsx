import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getTeamDirectory } from "@/lib/team.functions";
import { saveMe, initChatSync, heartbeat } from "@/lib/chat-store";
import { initWorkspaceSync } from "@/lib/workspace-store";
import { initSharedSync } from "@/lib/shared-sync";
import { initClientesSync } from "@/lib/clientes-store";
import { initProjetosSync } from "@/lib/projetos";
import { initReunioesSync } from "@/lib/reunioes-store";
import { initFinanceiroSync } from "@/lib/financeiro-entries";
import { initBancoInflusSync } from "@/lib/banco-influs-store";
import { initMetasSync } from "@/lib/metas-store";
import { initAeoSync } from "@/lib/aeo-store";
import { initMarketingTasksSync } from "@/lib/marketing-tasks";
import { initCampanhaScopedSync } from "@/lib/campanha-scoped-store";
import { initProjetoScopedSync } from "@/lib/projeto-scoped-store";
import { initCallController, shutdownCallController } from "@/lib/call-controller";
import { syncAllMeetingsToGoogle } from "@/lib/google-calendar.functions";
import { CallOverlay } from "@/components/CallOverlay";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw redirect({ to: "/" });
    }
    const userId = sessionData.session.user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", userId)
      .maybeSingle();

    const isFirstAccess = location.pathname === "/primeiro-acesso";
    if (profile?.must_change_password && !isFirstAccess) {
      throw redirect({ to: "/primeiro-acesso" });
    }
    if (profile && !profile.must_change_password && isFirstAccess) {
      throw redirect({ to: "/time" });
    }
    // A tela de primeiro acesso não usa nenhum desses dados — sincronizá-los
    // aqui só atrasava (às vezes bastante, com o Realtime ainda reconectando
    // logo após o login) a navegação para essa tela, deixando-a em branco.
    if (!isFirstAccess) {
      // Pull all shared state before children mount so useState initializers see it.
      await Promise.all([
        initSharedSync(),
        initClientesSync(),
        initProjetosSync(),
        initReunioesSync(),
        initFinanceiroSync(),
        initBancoInflusSync(),
        initMetasSync(),
        initAeoSync(),
        initMarketingTasksSync(),
        initCampanhaScopedSync(),
        initProjetoScopedSync(),
      ]);
    }
    return { userId };
  },
  pendingComponent: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
    </div>
  ),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const fetchDirectory = useServerFn(getTeamDirectory);
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      // This runs on a 30s interval — a transient network blip on any call
      // here must not abort the whole cycle silently (as an unhandled
      // rejection) and skip everyone downstream (chat sync, presence, team
      // directory refresh). Log and let the next tick retry instead.
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user || cancelled) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email, phone, birthday, photo_url")
          .eq("id", data.user.id)
          .maybeSingle();
        if (!profile || cancelled) return;
        const perfil = {
          nome: profile.full_name ?? "",
          email: profile.email ?? data.user.email ?? "",
          telefone: profile.phone ?? "",
          aniversario: profile.birthday ?? "",
          foto: profile.photo_url ?? "",
        };
        localStorage.setItem("config:perfil", JSON.stringify(perfil));
        window.dispatchEvent(new StorageEvent("storage", { key: "config:perfil" }));
        saveMe({
          id: data.user.id,
          name: profile.full_name?.trim() || "Você",
          photo: profile.photo_url ?? undefined,
          email: profile.email ?? data.user.email ?? undefined,
        });
        void initChatSync(data.user.id);
        void heartbeat(data.user.id);
        initWorkspaceSync();
        void initCallController(
          data.user.id,
          profile.full_name?.trim() || "Você",
          profile.photo_url ?? undefined,
        );

        const directory = await fetchDirectory();
        if (cancelled) return;
        localStorage.setItem("time:membros", JSON.stringify(directory));
        window.dispatchEvent(new Event("time:membros:changed"));
      } catch (e) {
        console.warn("[hydrate] failed, will retry next tick", e);
      }
    };
    hydrate();
    const interval = window.setInterval(hydrate, 30_000);

    // Sem isso, um membro do time só via alterações de outra pessoa (nome,
    // foto, permissões, etc.) até 30s depois, ou dando refresh na página.
    let debounce: number | null = null;
    const channel = supabase
      .channel(`rt-profiles-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        if (debounce) window.clearTimeout(debounce);
        debounce = window.setTimeout(hydrate, 500);
      })
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (debounce) window.clearTimeout(debounce);
      void supabase.removeChannel(channel);
      void shutdownCallController();
    };
  }, [fetchDirectory]);

  // Empurra TODAS as reuniões da plataforma pro Google Agenda da conta
  // compartilhada (contato@vocenohype.com.br) — sync de mão única,
  // plataforma sempre vence. A própria server function é barata quando a
  // conta ainda não foi conectada (só lê a conexão e retorna); dispara em
  // qualquer sessão logada porque não há infraestrutura de job/cron aqui.
  const syncGoogleFn = useServerFn(syncAllMeetingsToGoogle);
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      syncGoogleFn().catch((e) => {
        if (!cancelled) console.warn("[google-calendar] sync failed", e);
      });
    };
    sync();
    const interval = window.setInterval(sync, 3 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [syncGoogleFn]);

  return (
    <>
      <Outlet />
      <CallOverlay />
    </>
  );
}
