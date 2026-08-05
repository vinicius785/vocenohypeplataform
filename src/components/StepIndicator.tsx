import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StepIndicatorItem = {
  key: string;
  label: string;
  icon: LucideIcon;
};

type StepIndicatorProps = {
  steps: StepIndicatorItem[];
  currentStep: number;
  isReachable: (index: number) => boolean;
  onStepClick: (index: number) => void;
};

export default function StepIndicator({
  steps,
  currentStep,
  isReachable,
  onStepClick,
}: StepIndicatorProps) {
  return (
    <ol className="mt-4 flex items-start">
      {steps.map((s, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        const reachable = isReachable(i);
        const Icon = s.icon;
        const status = active ? "active" : done ? "complete" : "inactive";
        return (
          <li key={s.key} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 rounded-full ${i === 0 ? "invisible" : "bg-border"}`}>
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={false}
                  animate={{ width: done || active ? "100%" : "0%" }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <motion.button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onStepClick(i)}
                aria-label={`Ir para ${s.label}`}
                initial={false}
                animate={status}
                variants={{
                  inactive: { scale: 1 },
                  active: { scale: 1.08 },
                  complete: { scale: 1 },
                }}
                transition={{ duration: 0.25 }}
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors ${
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                      ? "border-primary text-primary ring-4 ring-primary/15"
                      : "border-border text-muted-foreground"
                } ${reachable ? "cursor-pointer" : "cursor-not-allowed"}`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </motion.button>
              <div
                className={`h-0.5 flex-1 rounded-full ${i === steps.length - 1 ? "invisible" : "bg-border"}`}
              >
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={false}
                  animate={{ width: done ? "100%" : "0%" }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
            <span
              className={`max-w-full truncate text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
