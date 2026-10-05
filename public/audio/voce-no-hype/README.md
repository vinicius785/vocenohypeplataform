# Sound branding — Você no Hype

A família sonora oficial: quatro sons curtos de **violão de nylon**, cada um citando a harmonia de uma obra da MPB
(Chat = Tim Maia; Comercial = Jorge Vercillo; Reunião = Roberto Carlos; Atualização = Djavan). Só a harmonia é citada, nenhuma gravação é usada.

| Arquivo | Evento | Duração | Desenho |
| --- | --- | --- | --- |
| `chat-notification.mp3` | Nova mensagem de Chat | ≈ 0,5 s | Tim Maia, "Azul da Cor do Mar" (em Lá): abertura A7M → Bm7, violão de nylon, curtíssimo |
| `commercial-notification.mp3` | Notificação Comercial (novo lead) | ≈ 1,0 s | Jorge Vercillo, "Monalisa" (em Fá♯ menor): introdução F#m7 → F#m7(11) → B7(4) → B7 |
| `meeting-notification.mp3` | Lembrete de reunião | ≈ 1,5 s | Roberto Carlos, "Detalhes" (em Lá): A → A7M → A#º, depois Bm7 → E7 → A |
| `update-notification.mp3` | Nova versão da plataforma disponível | ≈ 1,2 s | Djavan, "Oceano" (em Ré): abertura D → G7M → A7 e volta ao D, com nota aguda no fim |

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
