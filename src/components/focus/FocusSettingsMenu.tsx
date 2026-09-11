import { useState } from "react";
import { Settings } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import type { FocusPrefs } from "@/lib/focus-mode-store";

const MIN_MINUTES = 1;
const MAX_MINUTES = 180;

/** Preferências do Modo Foco num popover secundário — item 10: "não
 * transformar a tela em um painel cheio de configurações". Cobre
 * duração de cada etapa, ciclos antes da pausa longa, início automático
 * (desligado por padrão) e o opt-in de notificação do navegador (item
 * 13: nunca solicitado sozinho, só a partir daqui). */
export function FocusSettingsMenu({
  prefs,
  onChange,
}: {
  prefs: FocusPrefs;
  onChange: (patch: Partial<FocusPrefs>) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const notifSupported = typeof Notification !== "undefined";
  const notifPermission = notifSupported ? Notification.permission : "denied";

  const numberField = (label: string, value: number, onSet: (v: number) => void) => (
    <label className="flex items-center justify-between gap-3 text-xs text-white/70">
      <span>{label}</span>
      <input
        type="number"
        min={MIN_MINUTES}
        max={MAX_MINUTES}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v) || v < MIN_MINUTES || v > MAX_MINUTES) {
            setError(`Use um valor entre ${MIN_MINUTES} e ${MAX_MINUTES} minutos.`);
            return;
          }
          setError(null);
          onSet(v);
        }}
        className="w-16 rounded border border-white/15 bg-white/5 px-2 py-1 text-right text-xs text-white outline-none focus-visible:ring-1 focus-visible:ring-brand"
      />
    </label>
  );

  const enableBrowserNotifications = async () => {
    if (!notifSupported) return;
    const perm = await Notification.requestPermission();
    onChange({ notifications: { ...prefs.notifications, browserEnabled: perm === "granted" } });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton
          label="Preferências do Modo Foco"
          tone="neutral"
          className="text-white/70 hover:text-white"
        >
          <Settings className="h-4 w-4" />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 border-white/10 bg-zinc-900 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
          Ciclos de foco
        </p>
        {numberField("Foco (min)", prefs.focusMinutes, (v) => onChange({ focusMinutes: v }))}
        {numberField("Pausa curta (min)", prefs.pausaCurtaMinutes, (v) =>
          onChange({ pausaCurtaMinutes: v }),
        )}
        {numberField("Pausa longa (min)", prefs.pausaLongaMinutes, (v) =>
          onChange({ pausaLongaMinutes: v }),
        )}
        {numberField("Ciclos até pausa longa", prefs.ciclosAntesLongaPausa, (v) =>
          onChange({ ciclosAntesLongaPausa: Math.round(v) }),
        )}
        {error && <p className="text-[11px] text-danger">{error}</p>}

        <div className="space-y-2 border-t border-white/10 pt-2">
          <label className="flex items-center justify-between text-xs text-white/70">
            <span>Iniciar pausa automaticamente</span>
            <input
              type="checkbox"
              checked={prefs.autoStartPausa}
              onChange={(e) => onChange({ autoStartPausa: e.target.checked })}
              className="h-4 w-4 accent-brand"
            />
          </label>
          <label className="flex items-center justify-between text-xs text-white/70">
            <span>Iniciar foco automaticamente</span>
            <input
              type="checkbox"
              checked={prefs.autoStartFoco}
              onChange={(e) => onChange({ autoStartFoco: e.target.checked })}
              className="h-4 w-4 accent-brand"
            />
          </label>
        </div>

        <div className="space-y-2 border-t border-white/10 pt-2">
          <label className="flex items-center justify-between text-xs text-white/70">
            <span>Chuva visual</span>
            <input
              type="checkbox"
              checked={prefs.visual.rainEnabled}
              onChange={(e) => onChange({ visual: { rainEnabled: e.target.checked } })}
              className="h-4 w-4 accent-brand"
              aria-label="Ativar ou desativar o efeito visual de chuva"
            />
          </label>
        </div>

        <div className="space-y-2 border-t border-white/10 pt-2">
          <label className="flex items-center justify-between text-xs text-white/70">
            <span>Som ao concluir etapa</span>
            <input
              type="checkbox"
              checked={prefs.notifications.soundEnabled}
              onChange={(e) =>
                onChange({
                  notifications: { ...prefs.notifications, soundEnabled: e.target.checked },
                })
              }
              className="h-4 w-4 accent-brand"
            />
          </label>
          {prefs.notifications.browserEnabled ? (
            <p className="text-[11px] text-success">Notificações do navegador ativadas.</p>
          ) : notifPermission === "denied" ? (
            <p className="text-[11px] text-white/40">
              Notificações do navegador bloqueadas nas configurações do navegador.
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={enableBrowserNotifications}
              className="w-full border-white/15 bg-transparent text-white hover:bg-white/10"
            >
              Ativar notificações do navegador
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
