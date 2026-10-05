# Sound branding — Você no Hype

A família sonora oficial: três sons curtos em Lá maior, com reverb curto e a nota-assinatura **Lá (A5)**
reaparecendo em todos. Chat = pluck curto; Comercial = moedas; Reunião = campainha grave.

| Arquivo | Evento | Duração | Desenho |
| --- | --- | --- | --- |
| `chat-notification.mp3` | Nova mensagem de Chat | ≈ 0,4 s | Curtíssimo e médio-grave: duas notas (Lá → Mi), sem brilho e quase sem cauda — feito para ser ouvido muitas vezes |
| `commercial-notification.mp3` | Notificação Comercial (novo lead) | ≈ 0,9 s | Dinheiro, sóbrio e firme: duas moedas sobre um corpo grave e duas notas médias (Lá → Mi), sem arpejo brilhante |
| `meeting-notification.mp3` | Lembrete de reunião | ≈ 1,5 s | Campainha do carteiro: "ding-dong" (Dó♯ → Lá) em registro grave, filtrado e quente; nota final longa |

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
