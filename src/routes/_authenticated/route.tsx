import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { shouldExpireUnrememberedSession, markTabSessionActive } from "@/lib/session-scope";
import { resolveUserEnvironment } from "@/lib/user-environment.server";
import { shouldRequireMfaChallenge } from "@/lib/mfa.functions";
import { getTeamDirectory } from "@/lib/team.functions";
import { saveMe, initChatSync, heartbeat } from "@/lib/chat-store";
import { initWorkspaceSync } from "@/lib/workspace-store";
import { initPricingSync } from "@/lib/pricing-store";
import { initSharedSync } from "@/lib/shared-sync";
import { initClientesSync } from "@/lib/clientes-store";
import { initProjetosSync } from "@/lib/projetos";
import { initReunioesSync, initDisponibilidadeSync } from "@/lib/reunioes-store";
import { initFinanceiroSync, initOverridesSync, initInflusSync } from "@/lib/financeiro-entries";
import { initBancoInflusSync } from "@/lib/banco-influs-store";
import { initMetasSync } from "@/lib/metas-store";
import { initAeoSync } from "@/lib/aeo-store";
import { initMarketingTasksSync } from "@/lib/marketing-tasks";
import { initTaskTagsSync } from "@/lib/task-tags-store";
import { initCampanhaScopedSync } from "@/lib/campanha-scoped-store";
import { initProjetoScopedSync } from "@/lib/projeto-scoped-store";
import { initTaskDependenciesSync } from "@/lib/task-dependencies-store";
import { initCallController, shutdownCallController } from "@/lib/call-controller";
import { runGoogleCalendarSync } from "@/lib/google-calendar.functions";
import { CallOverlay } from "@/components/CallOverlay";
import { PreparingEnvironmentScreen } from "@/components/auth/PreparingEnvironmentScreen";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw redirect({ to: "/" });
    }
    // "Manter conectado" desmarcado no login + esta ser uma aba/janela nova
    // (não uma continuação da mesma) = o navegador foi fechado de vez e
    // reaberto — a sessão (ainda válida no Supabase) deve encerrar aqui.
    if (shouldExpireUnrememberedSession()) {
      await supabase.auth.signOut();
      throw redirect({ to: "/" });
    }

    // Três leituras independentes (nível de MFA, perfil, ambiente) disparadas JUNTAS:
    // antes eram 3 idas ao servidor em fila, antes de qualquer tela aparecer. As
    // DECISÕES continuam na mesma ordem de antes (MFA → troca de senha → ambiente).
    const userId = sessionData.session.user.id;
    const isFirstAccess = location.pathname === "/primeiro-acesso";
    const [{ data: aal }, { data: profile }, env] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.from("profiles").select("must_change_password").eq("id", userId).maybeSingle(),
      // Pulado na tela de primeiro acesso: ainda não teve chance de ter uma
      // membership de verdade resolvida.
      // Um erro aqui só deve aparecer se chegarmos ao ponto de usar o ambiente (como
      // antes, quando esta consulta vinha depois dos redirects de MFA/senha).
      isFirstAccess
        ? Promise.resolve(null)
        : resolveUserEnvironment(supabase, userId).then(
            (value) => ({ value }),
            (error: unknown) => ({ error }),
          ),
    ]);

    // Check (2026-09-18, Fase 3 parte 2): sem isto, um usuário com MFA cadastrado
    // poderia contornar o desafio de segundo fator navegando direto para uma URL
    // autenticada logo após a senha (a sessão já existe em aal1 nesse ponto).
    // `/` já sabe mostrar a etapa de verificação. Só é `true` no caso estreito
    // "tem fator verificado E esta sessão ainda não o satisfez".
    if (shouldRequireMfaChallenge(aal?.currentLevel ?? null, aal?.nextLevel ?? null)) {
      throw redirect({ to: "/" });
    }

    markTabSessionActive();

    if (profile?.must_change_password && !isFirstAccess) {
      throw redirect({ to: "/primeiro-acesso" });
    }
    if (profile && !profile.must_change_password && isFirstAccess) {
      throw redirect({ to: "/time" });
    }

    // Um usuário autenticado sem NENHUM ambiente interno ativo (ex.: um cliente que
    // logou pela mesma tela, ou um convite ainda não aceito) não deve ver o shell
    // interno. `/selecionar-ambiente` e `/acesso-pendente` são rotas de nível raiz
    // (fora de `_authenticated`), então não recaem neste guard — sem loop.
    if (env && "error" in env) throw env.error;
    if (env && env.value.type !== "internal") {
      throw redirect({ to: env.value.redirectTo });
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
        initDisponibilidadeSync(),
        initFinanceiroSync(),
        initOverridesSync(),
        initInflusSync(),
        initBancoInflusSync(),
        initMetasSync(),
        initAeoSync(),
        initMarketingTasksSync(),
        initTaskTagsSync(),
        initCampanhaScopedSync(),
        initProjetoScopedSync(),
        initTaskDependenciesSync(),
      ]);
    }
    return { userId };
  },
  pendingComponent: () => <PreparingEnvironmentScreen />,
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
        initPricingSync();
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

  // Sincroniza com o Google Agenda PESSOAL de cada usuário conectado (não
  // é mais uma conta compartilhada — esse modelo foi removido em 02/09;
  // ver `google-calendar.functions.ts`), nos dois sentidos: empurra
  // reuniões da plataforma criadas por quem tem conta conectada, e importa
  // de volta eventos criados DIRETO no Google. Este polling continua como
  // REFORÇO (cobre quem está com a aba aberta sem ter acabado de
  // criar/editar nada), não é mais o único mecanismo — o mecanismo
  // principal agora é o cron server-side (`api/cron/google-calendar-sync`)
  // + o disparo imediato ao criar/editar/excluir uma reunião
  // (`ReunioesSection.tsx`). `runGoogleCalendarSync` já é protegido pela
  // trava de concorrência (`google_calendar_sync_state`) — chamadas
  // simultâneas de várias abas/pessoas nunca rodam em paralelo.
  const syncGoogleFn = useServerFn(runGoogleCalendarSync);
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
