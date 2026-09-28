/**
 * Conteúdo do card "Preparando seu ambiente" — vive DENTRO do
 * `LoginScreenShell` (nunca mais uma tela preta separada por trás dele),
 * usado tanto pelo login (`routes/index.tsx`) quanto por "Crie sua senha"
 * (`routes/criar-senha.tsx`) logo após o sucesso. `step` é sempre uma
 * etapa REAL do processo (nunca uma % inventada) — ver os chamadores
 * pra saber quando cada uma é setada.
 */
export type PreparingStep = "verificando" | "perfil" | "acesso";

const STEP_LABEL: Record<PreparingStep, string> = {
  verificando: "Verificando sua conta",
  perfil: "Carregando seu perfil",
  acesso: "Preparando seu acesso",
};

export function AuthPreparingCard({ step }: { step: PreparingStep }) {
  return (
    <div className="py-2 text-center" role="status" aria-live="polite" aria-busy="true">
      <p className="text-lg font-semibold tracking-tight text-[#111111]">Preparando seu ambiente</p>
      <p className="mt-1.5 text-sm text-[#6b6862]">
        Estamos carregando seu perfil e organizando seu acesso. Isso levará apenas alguns segundos.
      </p>

      {/* Linha de progresso indeterminada — nunca uma % inventada. */}
      <div className="mx-auto mt-6 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-[#e2e0dc]">
        <div className="h-full w-1/3 animate-[auth-preparing-slide_1.2s_ease-in-out_infinite] rounded-full bg-[var(--brand)] motion-reduce:animate-none motion-reduce:w-full" />
      </div>

      <p className="mt-4 text-xs font-medium text-[#9a978f]">{STEP_LABEL[step]}</p>
    </div>
  );
}
