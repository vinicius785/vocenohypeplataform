import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteMessage,
  ensurePinnedLoaded,
  hasMoreOlderMessages,
  loadOlderMessages,
  type ChatMember,
  type ChatMessage,
} from "@/lib/chat-store";
import { dateDividerLabel, firstUnreadIndex, groupMessages, isSameDay } from "./chat-v2-utils";
import { ChatV2Message } from "./ChatV2Message";
import { ChatV2NewMessagesIndicator } from "./ChatV2NewMessagesIndicator";

const NEAR_BOTTOM_PX = 150;

export function ChatV2Timeline({
  convoId,
  messages,
  meId,
  members,
  lastReadAt,
  onReply,
  highlightId,
  channelName,
}: {
  convoId: string;
  messages: ChatMessage[];
  meId: string;
  members: ChatMember[];
  lastReadAt: number;
  onReply: (message: ChatMessage) => void;
  /** Id de mensagem a destacar (vindo da busca) — recebe um scroll-into-view
   * e um realce temporário de ~2s, depois volta ao normal. */
  highlightId?: string;
  /** Nome do canal (sem `#`), só quando `convoId` é um canal — usado pra
   * mostrar a introdução "# nome / Este é o início do canal #nome." no
   * lugar do texto genérico quando o canal está vazio. */
  channelName?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newBelowCount, setNewBelowCount] = useState(0);
  const [activeHighlight, setActiveHighlight] = useState<string | undefined>(undefined);
  // Incrementado a cada rolagem relevante — cada `ChatV2Message` observa
  // esse valor pra fechar seus próprios menus locais (picker/mais ações),
  // evitando um menu "flutuando" numa posição antiga depois que a mensagem
  // saiu de vista.
  const [closeMenusSignal, setCloseMenusSignal] = useState(0);

  // Baseline da contagem de "novas mensagens" — deliberadamente não
  // inicializada no mount (que pode capturar `messages.length` ainda
  // parcial/zero, antes do lote inicial carregar). Só passa a valer quando
  // `settledConvoRef` confirma que o scroll inicial desta conversa já foi
  // aplicado — ver o efeito de abertura de conversa abaixo.
  const prevCountRef = useRef<number | null>(null);
  const settledConvoRef = useRef<string | null>(null);
  // true enquanto uma página de mensagens antigas está sendo carregada via
  // scroll pro topo — o efeito de "mensagens novas" ignora esse ciclo
  // (adicionado no topo, não embaixo).
  const isPaginatingRef = useRef(false);
  // Última leitura de "está no final" — usada pelo ResizeObserver (que roda
  // DEPOIS que o conteúdo já cresceu, quando recalcular pela posição atual
  // já daria falso negativo).
  const wasAtBottomRef = useRef(true);

  const replyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of messages) {
      if (m.replyToId) counts.set(m.replyToId, (counts.get(m.replyToId) ?? 0) + 1);
    }
    return counts;
  }, [messages]);
  // Respostas em thread não aparecem como mensagens completas no canal
  // principal — só a mensagem raiz, com o indicador compacto de contagem.
  const rootMessages = useMemo(() => messages.filter((m) => !m.replyToId), [messages]);
  // Só usado pra desenhar o divisor visual "Novas mensagens" como
  // referência de leitura — NÃO é mais usado como ponto de ancoragem do
  // scroll inicial (ver efeito abaixo: abrir uma conversa vai sempre para
  // o final, exceto em deep link de destaque).
  const initialUnreadIndex = useMemo(
    () => firstUnreadIndex(rootMessages, lastReadAt, meId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [convoId],
  );
  const groups = useMemo(() => groupMessages(rootMessages), [rootMessages]);

  const isAtBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  // Ao trocar de conversa: sempre ir para o final. A única exceção é um
  // deep link de destaque (`?highlight=`, ver `ChatV2ConversationPane.tsx`)
  // — nesse caso o efeito de highlight abaixo cuida do scroll até a
  // mensagem indicada, sem forçar o final. Não existe hoje uma feature real
  // de "marcar como não lida" que registre onde abrir (só um botão
  // decorativo, se algum dia existir) nem um deep link de thread que exija
  // ancorar a timeline principal de outro jeito — abrir `?thread=` só abre
  // o painel de thread (`ChatV2ConversationPane.tsx`), sem afetar este
  // scroll.
  useEffect(() => {
    settledConvoRef.current = null;
    prevCountRef.current = null;
    setNewBelowCount(0);
    const el = scrollRef.current;
    if (!el) return;
    if (highlightId) {
      // O efeito de highlight (abaixo) faz o scroll até a mensagem; aqui só
      // fixamos a baseline pra não tratar o lote inicial como "novas".
      prevCountRef.current = messages.length;
      settledConvoRef.current = convoId;
      wasAtBottomRef.current = false;
      return;
    }
    // Ajusta o scroll de imediato (layout já commitado nesta altura do
    // efeito, `scrollHeight` já reflete o DOM atual) — evita depender de
    // `requestAnimationFrame`, que pode ficar parado enquanto a aba não
    // está em primeiro plano/visível. Ainda assim agenda uma segunda
    // correção num rAF (quando disponível) pra cobrir imagens/anexos que só
    // terminam de medir depois deste commit.
    el.scrollTop = el.scrollHeight;
    prevCountRef.current = messages.length;
    settledConvoRef.current = convoId;
    wasAtBottomRef.current = true;
    const raf = requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node && wasAtBottomRef.current) node.scrollTop = node.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convoId, highlightId]);

  // Nova mensagem chegando: se já estava perto do final, acompanha
  // automaticamente; senão, só conta (indicador "N novas mensagens"). Não
  // conta enquanto o scroll inicial desta conversa ainda não se
  // estabilizou, e não conta um lote carregado via paginação pro topo.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (settledConvoRef.current !== convoId) {
      // Ainda estabilizando (ou aguardando o efeito de highlight) — só
      // atualiza a baseline, sem contar como mensagem nova.
      prevCountRef.current = messages.length;
      return;
    }
    if (isPaginatingRef.current) {
      isPaginatingRef.current = false;
      prevCountRef.current = messages.length;
      return;
    }
    const prev = prevCountRef.current ?? messages.length;
    const added = messages.length - prev;
    prevCountRef.current = messages.length;
    if (added <= 0) return;
    // Usa a ÚLTIMA posição conhecida (antes deste lote chegar), não a
    // posição recalculada agora — o DOM já cresceu com o lote novo, então
    // `isAtBottom()` neste ponto compararia contra um `scrollHeight` maior
    // e daria falso negativo mesmo quando o usuário estava, de fato, no
    // final (é exatamente esse o caso de um lote grande do carregamento
    // inicial chegando em várias ondas — sem isso, ficaria preso no topo).
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setNewBelowCount((n) => n + added);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, convoId]);

  useEffect(() => {
    if (!highlightId) return;
    setActiveHighlight(highlightId);
    const el = scrollRef.current;
    const target = el?.querySelector(`[data-message-id="${highlightId}"]`);
    target?.scrollIntoView({ block: "center" });
    const t = setTimeout(() => setActiveHighlight(undefined), 2000);
    return () => clearTimeout(t);
  }, [highlightId, convoId]);

  useEffect(() => {
    void ensurePinnedLoaded(convoId);
  }, [convoId]);

  // Enquanto o usuário está no final da timeline, qualquer crescimento de
  // altura do conteúdo (imagem carregando, anexo, card) reancora pro final
  // — sem isso, uma imagem que termina de carregar empurra o "final" pra
  // baixo da área visível. Enquanto NÃO está no final (lendo histórico),
  // não mexe na posição.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const content = el.firstElementChild;
    const ro = new ResizeObserver(() => {
      if (wasAtBottomRef.current && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    ro.observe(el);
    if (content) ro.observe(content);
    return () => ro.disconnect();
  }, [convoId]);

  const handleScroll = async () => {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottomRef.current = isAtBottom();
    setCloseMenusSignal((n) => n + 1);
    if (loadingOlder) return;
    if (el.scrollTop < 80 && hasMoreOlderMessages(convoId)) {
      setLoadingOlder(true);
      isPaginatingRef.current = true;
      const prevHeight = el.scrollHeight;
      await loadOlderMessages(convoId);
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
        }
      });
      setLoadingOlder(false);
    }
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    wasAtBottomRef.current = true;
    setNewBelowCount(0);
  };

  return (
    // `relative` + `min-h-0` (não `flex-1`): a linha do meio do grid pai já
    // define a altura disponível (`minmax(0,1fr)`) — este componente só
    // precisa respeitar essa altura (`h-full`) e nunca ultrapassá-la, que é
    // o que `min-h-0` garante num filho de grid/flex com conteúdo que cresce.
    <div className="message-scroll-wrap relative h-full min-h-0 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={() => void handleScroll()}
        className="message-scroll-area h-full overflow-y-auto overflow-x-hidden"
        aria-live="off"
      >
        {/* Conteúdo centralizado com largura de leitura confortável — em
         * telas ultrawide isso evita tanto "tudo colado à esquerda" quanto
         * "vazio enorme à direita": o painel ocupa 100% da largura, mas o
         * texto nunca passa de 1120px, com margens automáticas equilibradas
         * dos dois lados. */}
        <div className="message-timeline-inner mx-auto w-full max-w-[1120px] px-4 pb-8 pt-5 md:px-7">
          {loadingOlder && (
            <p className="py-2 text-center text-xs text-muted-foreground">Carregando mensagens…</p>
          )}
          {groups.map((group, gi) => {
            const prevGroup = groups[gi - 1];
            const showDateDivider =
              !prevGroup ||
              !isSameDay(
                prevGroup.messages[prevGroup.messages.length - 1].createdAt,
                group.messages[0].createdAt,
              );
            const isMine = group.authorId === meId;
            return (
              <div key={group.messages[0].id} className={gi > 0 ? "mt-3" : undefined}>
                {showDateDivider && (
                  // Pill pequena centralizada, sem linhas atravessando a
                  // tela — substitui o antigo separador "linha — texto —
                  // linha" (que criava uma régua horizontal cruzando todo o
                  // painel, item explicitamente proibido no pedido).
                  <div className={`flex justify-center ${gi > 0 ? "mb-4" : "mb-4"}`}>
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                      {dateDividerLabel(group.messages[0].createdAt)}
                    </span>
                  </div>
                )}
                {group.messages.map((m, mi) => {
                  const globalIndex = rootMessages.indexOf(m);
                  const isUnreadDivider = globalIndex === initialUnreadIndex;
                  return (
                    <div
                      key={m.id}
                      data-message-id={m.id}
                      className={
                        activeHighlight === m.id
                          ? "rounded-lg bg-brand/10 outline outline-2 outline-brand/40 transition-colors duration-1000"
                          : undefined
                      }
                    >
                      {isUnreadDivider && (
                        <div data-unread-divider="1" className="my-3 flex justify-center">
                          <span className="rounded-full border border-brand-border bg-brand-subtle px-3 py-1 text-[11px] font-semibold text-brand">
                            Novas mensagens
                          </span>
                        </div>
                      )}
                      <ChatV2Message
                        message={m}
                        showHeader={mi === 0}
                        isMine={isMine}
                        meId={meId}
                        members={members}
                        onReply={onReply}
                        onDelete={(id) => deleteMessage(id)}
                        replyCount={replyCounts.get(m.id)}
                        closeMenusSignal={closeMenusSignal}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
          {messages.length === 0 &&
            (channelName ? (
              <div className="flex flex-col items-center gap-1 py-16 text-center">
                <p className="text-lg font-semibold text-foreground"># {channelName}</p>
                <p className="text-sm text-muted-foreground">
                  Este é o início do canal #{channelName}.
                </p>
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Nenhuma mensagem ainda. Envie a primeira.
              </p>
            ))}
        </div>
      </div>
      <ChatV2NewMessagesIndicator count={newBelowCount} onClick={jumpToLatest} />
    </div>
  );
}
