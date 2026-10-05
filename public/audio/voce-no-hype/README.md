# Sound branding — Você no Hype

A família sonora oficial: três sons curtos de **violão de nylon em Ré maior**, com a harmonia da MPB/bossa nova
(sétima maior e nona). Chat = duas notas (Fá♯→Dó♯); Comercial = arpejo sincopado de Em7(9); Reunião = cadência Em7(9)→Dmaj7(9).

| Arquivo | Evento | Duração | Desenho |
| --- | --- | --- | --- |
| `chat-notification.mp3` | Nova mensagem de Chat | ≈ 0,45 s | Curtíssimo: Fá♯4 → Dó♯5 (a sétima maior do Dmaj7), violão de nylon, quase sem cauda |
| `commercial-notification.mp3` | Notificação Comercial (novo lead) | ≈ 1,0 s | Arpejo ascendente e sincopado de Em7(9) (Mi–Sol–Si–Ré–Fá♯) que fecha num acorde de Ré: otimista e sóbrio, pulso de samba-canção |
| `meeting-notification.mp3` | Lembrete de reunião | ≈ 1,5 s | Cadência da bossa: Em7(9) dedilhado resolvendo em Dmaj7(9), com nota aguda ao final e cauda calma |

Volume percebido equalizado (RMS ativo ≈ −21 dBFS nos três, pico ≤ −6 dBFS, sem clipping), MP3 mono,
~11–22 KB cada. Os arquivos foram gerados por síntese, sem samples de terceiros.

## Regerar / ajustar

`scripts/sound-branding/generate-sounds.mjs` produz os três arquivos (notas, timbre, reverb e
normalização estão no próprio script). Ele usa o encoder `lamejs` — instale em uma pasta temporária,
não no projeto:

```bash
mkdir -p /tmp/snd && cd /tmp/snd && bun add lamejs
cp <repo>/scripts/sound-branding/generate-sounds.mjs . && bun run generate-sounds.mjs <repo>/public/audio/voce-no-hype
```

Ajuste fino de volume relativo entre os sons, se necessário, em `src/lib/sound/sound-manifest.ts` (`gain`).
Para trocar por arquivos produzidos por um estúdio, basta substituir os três MP3 mantendo os nomes
(44,1 kHz, 96–128 kbps, ≈ −18 LUFS integrado, pico ≤ −1 dBTP).

> Ao trocar qualquer MP3, suba `SOUND_ASSETS_VERSION` em `src/lib/sound/sound-manifest.ts` — a versão vai na URL e evita que o navegador/CDN sirva o arquivo antigo em cache. Quem já estava com a aba aberta precisa recarregar (os sons ficam decodificados na memória da sessão).
