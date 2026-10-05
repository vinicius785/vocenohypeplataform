# Sound branding — Você no Hype

Os três arquivos oficiais da família sonora vão aqui. **Enquanto não existirem**, a plataforma toca
o som que já tocava antes (`/sounds/notification.mp3` para Chat e Comercial; a tríade sintetizada
para Reunião) — nada novo é inventado.

| Arquivo | Evento | Duração |
| --- | --- | --- |
| `chat-notification.mp3` | Nova mensagem de Chat | 0,4 – 1,0 s |
| `commercial-notification.mp3` | Notificação Comercial (novo lead) | 0,6 – 1,2 s |
| `meeting-notification.mp3` | Lembrete de reunião | 0,8 – 1,5 s |

## Especificação de produção

- MP3 (ou OGG convertido para MP3 — Safari), 44,1 kHz, 96–128 kbps, mono ou estéreo leve.
- Início imediato (sem silêncio inicial), final limpo (fade-out curto, sem clique).
- **Volume percebido equivalente**: normalizar os três para o mesmo loudness (≈ −18 LUFS integrado)
  com *true peak* ≤ −1 dBTP, para que Reunião não soe mais alta que Chat e nunca haja clipping.
- Mesma família: mesmo timbre/instrumentação e assinatura melódica; Chat = leve (2 notas),
  Comercial = ascendente (2–3 notas, mais marcante), Reunião = assinatura mais completa.
- Sem ringtone, despertador, caixa registradora ou alerta agressivo.

Ajuste fino de volume relativo, se necessário, em `src/lib/sound/sound-manifest.ts` (`gain`).
