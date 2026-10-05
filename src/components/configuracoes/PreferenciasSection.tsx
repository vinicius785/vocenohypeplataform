import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Play } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { type NotifPrefs, loadNotifPrefs, saveNotifPrefs } from "@/lib/notif-prefs";
import { savePushSubscription, deletePushSubscription } from "@/lib/push.functions";
import {
  isPushSupported,
  getExistingPushSubscription,
  subscribeBrowserToPush,
  pushSubscriptionToKeys,
} from "@/lib/push-notifications";
import { SettingsCard, SettingsRow, SettingsSectionHeader } from "./settings-shared";
import { SOUND_HINT, SOUND_KINDS, SOUND_LABEL } from "@/lib/sound/sound-manifest";
import {
  loadSoundPrefs,
  saveSoundPrefs,
  subscribeSoundPrefs,
  type SoundPrefs,
} from "@/lib/sound/sound-prefs";
import { testSound } from "@/lib/sound/sound-manager";
import { getMe } from "@/lib/chat-store";

const ITEMS: { key: keyof NotifPrefs; label: string; hint: string; adminOnly?: boolean }[] = [
  {
    key: "mensagens",
    label: "Novas mensagens",
    hint: "Avisar sobre mensagens não lidas em canais e DMs.",
  },
  { key: "mencoes", label: "Menções no chat", hint: "Avisar quando alguém mencionar você." },
  {
    key: "tarefas",
    label: "Tarefas atribuídas",
    hint: "Avisar sobre novas tarefas designadas a você.",
  },
  {
    key: "tarefaAtividade",
    label: "Mudanças em tarefas suas",
    hint: "Avisar quando o status ou responsável de uma tarefa sua mudar.",
  },
  {
    key: "reunioes",
    label: "Solicitações de reunião",
    hint: "Avisar quando você for convidado para uma reunião pendente.",
  },
];

export function PreferenciasSection() {
  const [prefs, setPrefs] = useState<NotifPrefs>(() => loadNotifPrefs());
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      const { data: ok } = await supabase.rpc("is_admin", { _user_id: u.user.id });
      if (!cancelled) setIsAdmin(Boolean(ok));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (key: keyof NotifPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    saveNotifPrefs(next);
  };

  const visibleItems = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<Bell className="h-4 w-4" />}
        title="Preferências"
        description="Controla o que aparece no sino de notificações, neste navegador."
      />

      <PushNotificationsCard />

      <SoundsCard />

      <SettingsCard
        title="Notificações na plataforma"
        description="Alterações salvas automaticamente."
      >
        {visibleItems.map((item) => (
          <SettingsRow
            key={item.key}
            title={item.label}
            description={item.hint}
            control={
              <Switch
                checked={prefs[item.key]}
                onCheckedChange={() => toggle(item.key)}
                aria-label={item.label}
              />
            }
          />
        ))}
      </SettingsCard>
    </div>
  );
}

/** Notificação push de verdade (celular/desktop) — hoje dispara pra mensagem
 * de DM e @menção no chat (ver sendChatPush em push.functions.ts). Só
 * funciona com o app instalado no iPhone (iOS 16.4+); no Android/desktop
 * (Chrome/Edge) funciona mesmo sem instalar. */
function PushNotificationsCard() {
  const saveFn = useServerFn(savePushSubscription);
  const deleteFn = useServerFn(deletePushSubscription);
  const [status, setStatus] = useState<"loading" | "off" | "on" | "unsupported" | "denied">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    void getExistingPushSubscription().then((sub) => setStatus(sub ? "on" : "off"));
  }, []);

  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      const sub = await subscribeBrowserToPush();
      await saveFn({ data: pushSubscriptionToKeys(sub) });
      setStatus("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ativar.");
      if (Notification.permission === "denied") setStatus("denied");
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    setError("");
    try {
      const sub = await getExistingPushSubscription();
      if (sub) {
        await deleteFn({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível desativar.");
    } finally {
      setBusy(false);
    }
  };

  const permissionLabel =
    status === "denied" ? "Bloqueada" : status === "unsupported" ? "Indisponível" : "Permitida";

  return (
    <SettingsCard
      title="Notificações do navegador"
      description="Aviso mesmo com o app fechado (mensagens diretas e menções no chat)."
    >
      <SettingsRow
        title="Notificações push"
        description={`Permissão do navegador: ${status === "loading" ? "verificando..." : permissionLabel}.`}
        control={
          status === "on" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void disable()}
              disabled={busy}
            >
              Desativar
            </Button>
          ) : status === "off" ? (
            <Button type="button" size="sm" onClick={() => void enable()} disabled={busy}>
              Ativar
            </Button>
          ) : undefined
        }
      />
      {status === "unsupported" && (
        <p className="text-xs text-muted-foreground">
          Este navegador não suporta notificações push. No iPhone, funciona a partir do iOS 16.4 — e
          só depois de instalar o app na tela de início (Safari → Compartilhar → "Adicionar à Tela
          de Início").
        </p>
      )}
      {status === "denied" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Notificações bloqueadas nas permissões do navegador/sistema — reative manualmente para
          ativar aqui.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </SettingsCard>
  );
}

/** Sons da plataforma — complemento das notificações visuais (que continuam sempre existindo).
 * Preferências por usuário; cada alteração vale na hora. */
function SoundsCard() {
  const userId = getMe().id;
  const [prefs, setPrefs] = useState<SoundPrefs>(() => loadSoundPrefs(userId));
  useEffect(() => subscribeSoundPrefs(() => setPrefs(loadSoundPrefs(userId))), [userId]);

  const update = (patch: Partial<SoundPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveSoundPrefs(userId, next);
  };

  return (
    <SettingsCard
      title="Sons"
      description="Um som curto para cada tipo de aviso. O aviso visual continua aparecendo mesmo com o som desligado."
    >
      <SettingsRow
        title="Som da plataforma"
        description="Desligado, nenhum som de notificação toca."
        control={
          <Switch
            checked={prefs.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
            aria-label="Som da plataforma"
          />
        }
      />
      <SettingsRow
        title="Volume"
        control={
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(prefs.volume * 100)}
              onChange={(e) => update({ volume: Number(e.target.value) / 100 })}
              disabled={!prefs.enabled}
              aria-label="Volume dos sons"
              className="h-1.5 w-32 cursor-pointer accent-brand disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="w-9 text-right text-xs tabular-nums text-text-secondary">
              {Math.round(prefs.volume * 100)}%
            </span>
          </div>
        }
      />
      {SOUND_KINDS.map((kind) => (
        <SettingsRow
          key={kind}
          title={SOUND_LABEL[kind]}
          description={SOUND_HINT[kind]}
          control={
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void testSound(kind)}
                disabled={!prefs.enabled}
                aria-label={`Testar som de ${SOUND_LABEL[kind]}`}
              >
                <Play className="h-3 w-3" /> Testar
              </Button>
              <Switch
                checked={prefs[kind]}
                onCheckedChange={(v) => update({ [kind]: v } as Partial<SoundPrefs>)}
                disabled={!prefs.enabled}
                aria-label={`Som de ${SOUND_LABEL[kind]}`}
              />
            </div>
          }
        />
      ))}
    </SettingsCard>
  );
}
