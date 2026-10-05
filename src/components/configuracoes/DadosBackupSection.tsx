import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LockedSection } from "@/components/LockedSection";
import { logSettingsAudit } from "@/lib/settings-audit";
import { SettingsCard, SettingsRow, SettingsSectionHeader } from "./settings-shared";

export function DadosBackupSection({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return <LockedSection title="Dados e backup" />;
  return <DadosBackupContent />;
}

function DadosBackupContent() {
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);

  const handleExport = () => {
    setExporting(true);
    setDone(false);
    try {
      const data: Record<string, unknown> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        try {
          data[key] = JSON.parse(localStorage.getItem(key) ?? "null");
        } catch {
          data[key] = localStorage.getItem(key);
        }
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vnh-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      logSettingsAudit({ category: "export", action: "Exportou dados do workspace (.json)" });
      setDone(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        icon={<Download className="h-4 w-4" />}
        title="Dados e backup"
        description="Exportação manual dos dados do workspace guardados neste navegador."
        adminOnly
        actions={
          <Button type="button" onClick={handleExport} disabled={exporting}>
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Gerando..." : "Exportar dados (.json)"}
          </Button>
        }
      />

      <div role="status" aria-live="polite" className="min-h-4">
        {done && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Exportação concluída.</p>
        )}
      </div>

      <SettingsCard
        layout="split"
        title="Sobre a exportação"
        description="Útil como backup manual, já que parte da plataforma depende de dados sincronizados no navegador."
      >
        <SettingsRow
          title="O que será exportado"
          description="Clientes, projetos, comercial, financeiro e senhas (criptografadas), entre outros."
        />
        <SettingsRow title="Formato" description="Arquivo .json, baixado direto pelo navegador." />
        <SettingsRow
          title="Quem pode executar"
          description="Somente administradores. Cada exportação fica registrada na Auditoria."
        />
      </SettingsCard>
    </div>
  );
}
