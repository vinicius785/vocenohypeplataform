# Sound branding — Você no Hype

A família sonora oficial: três sons curtos que partilham timbre (sino/pluck suave em Lá maior, com um
reverb curto) e a nota-assinatura **Lá (A5)**.

| Arquivo | Evento | Duração | Desenho |
| --- | --- | --- | --- |
| `chat-notification.mp3` | Nova mensagem de Chat | ≈ 0,7 s | Leve: duas notas (Mi → Lá), brilho baixo — feito para ser ouvido muitas vezes |
| `commercial-notification.mp3` | Notificação Comercial (novo lead) | ≈ 0,9 s | Ascendente: Mi → Lá → Dó♯ (arpejo de Lá maior), mais brilho; atenção + oportunidade |
| `meeting-notification.mp3` | Lembrete de reunião | ≈ 1,4 s | Assinatura completa: entrada suave (Lá + Mi) e nota final clara (Lá + oitava) |

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
