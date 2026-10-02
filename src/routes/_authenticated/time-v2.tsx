import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, type SectionKey } from "@/components/AppShell";
import { TimeV2Page } from "@/components/time-v2/TimeV2Page";
import { LockedSection } from "@/components/LockedSection";
import { hasPermission, SECTION_PERMISSION, useMyAccess } from "@/lib/permissions";

/**
 * Time V2 — reconstrução isolada, acessível em `/time-v2` SEM substituir a
 * V1 (`/time?section=time`, intacta) e dentro do `AppShell` oficial (mesmo
 * padrão de coexistência de `/chat-v2` e da V2 do Banco antes do cutover).
 * O item "Time" da sidebar continua abrindo a V1 até a troca ser aprovada.
 * A permissão exigida é a mesma da V1 (`SECTION_PERMISSION.time`).
 */
export const Route = createFileRoute("/_authenticated/time-v2")({
  component: TimeV2Layout,
  head: () => ({ meta: [{ title: "Plataforma VNH" }] }),
});

function TimeV2Layout() {
  const navigate = useNavigate();
  const access = useMyAccess();
  const onSelect = (key: SectionKey) => {
    if (key === "time") return;
    void navigate({ to: "/time", search: { section: key } });
  };
  const allowed = hasPermission(access, SECTION_PERMISSION.time);

  return (
    <AppShell active="time" onSelect={onSelect}>
      {allowed ? <TimeV2Page /> : <LockedSection title="Time" />}
    </AppShell>
  );
}
