import { AEO_POSICOES, AEO_POSICAO_LABEL, type AeoPosicao } from "@/lib/aeo-store";

export function PosicaoButtonGroup({
  value,
  onChange,
  disabled,
}: {
  value?: AeoPosicao;
  onChange: (v: AeoPosicao) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md border border-border p-0.5">
      {AEO_POSICOES.map((p) => (
        <button
          key={p}
          type="button"
          disabled={disabled}
          onClick={() => onChange(p)}
          className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            value === p
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {AEO_POSICAO_LABEL[p]}
        </button>
      ))}
    </div>
  );
}
