# Sound branding — Você no Hype

A família sonora oficial: três sons curtos em Lá maior, com reverb curto e a nota-assinatura **Lá (A5)**
reaparecendo em todos. Chat = sino/pluck suave; Comercial = moedas; Reunião = campainha.

| Arquivo | Evento | Duração | Desenho |
| --- | --- | --- | --- |
| `chat-notification.mp3` | Nova mensagem de Chat | ≈ 0,7 s | Leve: duas notas (Mi → Lá), brilho baixo — feito para ser ouvido muitas vezes |
| `commercial-notification.mp3` | Notificação Comercial (novo lead) | ≈ 0,9 s | Dinheiro: duas moedinhas tilintando e um brilho ascendente (Lá → Mi → Lá) |
| `meeting-notification.mp3` | Lembrete de reunião | ≈ 1,4 s | Campainha do carteiro: "ding-dong" (Dó♯ → Lá), nota final longa e clara |

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
