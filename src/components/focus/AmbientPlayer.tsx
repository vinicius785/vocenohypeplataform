import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  FOCUS_TRACKS,
  FOCUS_CATEGORY_LABEL,
  availableCategories,
  type FocusAmbientCategory,
} from "@/lib/focus-audio-tracks";
import type { useAmbientAudio } from "@/hooks/use-ambient-audio";

/** Player de áudio ambiente — independente do cronômetro (item 11/12),
 * discreto mas com hierarquia clara (item 13: categoria, faixa e volume
 * separados, sem virar uma caixa muito destacada). Categorias sem faixa
 * disponível nunca aparecem (`availableCategories()` já filtra isso no
 * registro). */
export function AmbientPlayer({
  audio,
  compact = false,
}: {
  audio: ReturnType<typeof useAmbientAudio>;
  compact?: boolean;
}) {
  const categories = availableCategories();
  const isPlaying = audio.status === "playing";
  const isSilence = audio.currentTrack?.kind === "silence" || !audio.trackId;

  const pickCategory = (cat: FocusAmbientCategory) => {
    const track = FOCUS_TRACKS.find((t) => t.category === cat);
    if (!track) return;
    audio.selectTrack(track.id, true);
  };

  return (
    <div
      className={`flex w-full flex-col gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 ${compact ? "py-2.5" : "py-3.5"}`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (isSilence) return;
            if (isPlaying) audio.pause();
            else if (audio.trackId) audio.play(audio.trackId);
          }}
          disabled={isSilence}
          aria-label={isPlaying ? "Pausar áudio ambiente" : "Tocar áudio ambiente"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground disabled:opacity-30"
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white/85">
            {audio.currentTrack?.title ?? "Silêncio"}
          </p>
          <p className="text-[11px] text-white/40">{isPlaying ? "Tocando" : "Pausado"}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={audio.toggleMute}
            aria-label={audio.muted ? "Ativar som" : "Silenciar"}
            className="text-white/50 hover:text-white/80"
          >
            {audio.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <Slider
            value={[audio.muted ? 0 : audio.volume * 100]}
            onValueChange={([v]) => audio.setVolume(v / 100)}
            max={100}
            step={1}
            aria-label="Volume do áudio ambiente"
            className="w-20"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => pickCategory(cat)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              audio.currentTrack?.category === cat
                ? "border-brand/50 bg-brand/10 text-brand"
                : "border-white/[0.08] text-white/45 hover:border-white/20 hover:text-white/75"
            }`}
          >
            {FOCUS_CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>
    </div>
  );
}
