import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { SectionHeader } from "@/components/SectionHeader";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { SURFACE } from "@/lib/design-tokens";
import { APP_VERSION } from "@/lib/app-version";
import { ReleaseHistoryDialog } from "@/components/ReleaseHistoryDialog";
import { SettingsNav, type ConfigNavGroup } from "./SettingsNav";
import type { ConfigTab } from "@/lib/section-nav";

/**
 * Casca de layout de toda a área de Configurações — grid `220px nav / 32px
 * gap / resto` no desktop, seletor + Drawer no mobile (a navegação lateral
 * some, vira um botão abaixo do header que abre os mesmos grupos). O
 * conteúdo de cada seção é passado como `children`; este componente não
 * sabe nada sobre dados/permissão, só organiza espaço.
 */
export function ConfiguracoesLayout({
  groups,
  activeKey,
  activeLabel,
  onSelect,
  children,
}: {
  groups: ConfigNavGroup[];
  activeKey: ConfigTab;
  activeLabel: string;
  onSelect: (key: ConfigTab) => void;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <PageContainer className="max-w-[1160px]">
      <SectionHeader
        title="Configurações"
        subtitle="Gerencie sua conta e as preferências do workspace."
      />

      {isMobile ? (
        <div className="mt-6 space-y-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className={cn(
              "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-medium text-foreground",
              SURFACE.raised,
            )}
          >
            {activeLabel}
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>

          <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <DrawerContent
              className={cn(
                "flex max-h-[85vh] flex-col gap-0 border-t p-4 pb-[env(safe-area-inset-bottom)]",
                SURFACE.raised,
              )}
            >
              <DrawerHeader className="sr-only">
                <DrawerTitle>Configurações</DrawerTitle>
                <DrawerDescription>Escolha uma seção de configurações</DrawerDescription>
              </DrawerHeader>
              <div className="overflow-y-auto">
                <SettingsNav
                  groups={groups}
                  activeKey={activeKey}
                  onSelect={(k) => {
                    onSelect(k);
                    setMobileNavOpen(false);
                  }}
                />
              </div>
            </DrawerContent>
          </Drawer>

          <div className="min-w-0 space-y-6">{children}</div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-[220px_1fr] gap-8 md:grid-cols-[180px_1fr] lg:grid-cols-[220px_1fr]">
          <SettingsNav
            groups={groups}
            activeKey={activeKey}
            onSelect={onSelect}
            className="sticky top-20 self-start"
          />
          <div className="min-w-0 space-y-6">{children}</div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowHistory(true)}
        className="w-full pt-8 text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Versão {APP_VERSION}
      </button>
      <ReleaseHistoryDialog open={showHistory} onOpenChange={setShowHistory} />
    </PageContainer>
  );
}
