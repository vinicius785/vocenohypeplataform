import { useEffect, useMemo, useState } from "react";
import {
  getMe,
  initChatSync,
  loadCampaignChannels,
  loadChannels,
  loadMembers,
  loadMessages,
  loadProjectChannels,
  subscribeChat,
} from "@/lib/chat-store";
import { useClientes } from "@/lib/clientes-store";

/** Mesmo padrão de `ChatSection.tsx` (V1): força um re-render a cada `emit()`
 * do `chat-store.ts` e lê os getters síncronos — o Chat V2 é uma
 * reconstrução da camada de UI, não da camada de dados/realtime, que já é
 * madura e é reaproveitada integralmente aqui. */
export function useChatV2Data() {
  const [, force] = useState(0);
  useEffect(() => subscribeChat(() => force((n) => n + 1)), []);

  const me = getMe();
  useEffect(() => {
    if (me.id !== "me") void initChatSync(me.id);
  }, [me.id]);

  const members = loadMembers();
  const channels = loadChannels();
  const messages = loadMessages();
  const clientes = useClientes();
  const campaignChannels = useMemo(() => loadCampaignChannels(clientes), [clientes]);
  const projectChannels = useMemo(() => loadProjectChannels(), []);

  return { me, members, channels, messages, clientes, campaignChannels, projectChannels };
}
