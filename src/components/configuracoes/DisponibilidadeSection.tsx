import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { DisponibilidadeTab } from "@/components/meetings/DisponibilidadeTab";
import { getMe } from "@/lib/chat-store";
import {
  loadMeetings,
  loadDisponibilidades,
  saveMyDisponibilidade,
  onDisponibilidadesChange,
  defaultAvailability,
} from "@/lib/reunioes-store";
import { SettingsCard, SettingsSectionHeader } from "./settings-shared";

/**
 * Wrapper de apresentação só — `DisponibilidadeTab` (compartilhado com
 * Reuniões) continua dono de toda a lógica de dias/horários/exceções;
 * aqui só aplicamos o cabeçalho e o card padrão de Configurações ao
 * redor, sem tocar no componente original.
 */
export function DisponibilidadeSection() {
  const me = getMe();
  const [meetings] = useState(() => loadMeetings());
  const [disponibilidades, setDisponibilidades] = useState(() => loadDisponibilidades());
  const myAvail = useMemo(
    () => disponibilidades.find((a) => a.id === me.id) ?? defaultAvailability(me.id),
    [disponibilidades, me.id],
  );
  useEffect(() => onDisponibilidadesChange(() => setDisponibilidades(loadDisponibilidades())), []);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<Clock className="h-4 w-4" />}
        title="Disponibilidade"
        description="Seu horário semanal de reuniões e bloqueios pontuais."
      />
      <SettingsCard>
        <DisponibilidadeTab
          avail={myAvail}
          meetings={meetings}
          onChange={(next) => saveMyDisponibilidade(next)}
        />
      </SettingsCard>
    </div>
  );
}
