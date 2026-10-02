import { useEffect, useState } from "react";
import {
  Mail,
  Calendar,
  Briefcase,
  DollarSign,
  KeyRound,
  User,
  Eye,
  ChevronDown,
  Check,
} from "lucide-react";

import {
  type Permission,
  PERMISSION_GROUPS,
  CONFIG_SUB_PERMISSIONS,
  ALL_PERMISSIONS,
} from "@/lib/permissions";
import { getStatus, STATUS_LABEL, STATUS_COLOR } from "@/lib/chat-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Photos are always shown in the Time tab (not gated by timeView) — a profile
// picture isn't sensitive the way birthday/salary/email are.
export type TimeField = "name" | "role" | "birthday" | "salary" | "email" | "startOfDay";
const TIME_FIELDS: { key: TimeField; label: string }[] = [
  { key: "name", label: "Nome" },
  { key: "role", label: "Cargo" },
  { key: "birthday", label: "Aniversário" },
  { key: "salary", label: "Salário" },
  { key: "email", label: "Email" },
  { key: "startOfDay", label: "Início do dia" },
];
const DEFAULT_TIME_VIEW: TimeField[] = ["name", "role", "email"];

/** Preset "padrão" pra criar membro novo sem precisar entender a lista
 * inteira de permissões — cobre a operação do dia a dia, exclui áreas
 * sensíveis (comercial, financeiro, configurações). "Personalizado" abre a
 * lista completa de checkboxes, como sempre existiu. */
type PermissionPreset = "padrao" | "personalizado";
const MEMBER_DEFAULT_PERMISSIONS: Permission[] = [
  "clientes",
  "campanhas",
  "projetos",
  "reunioes",
  "influenciadores",
  "time",
  "chat",
];

function isDefaultPermissionSet(permissions: Permission[]): PermissionPreset {
  if (permissions.length !== MEMBER_DEFAULT_PERMISSIONS.length) return "personalizado";
  const sortedA = [...permissions].sort();
  const sortedB = [...MEMBER_DEFAULT_PERMISSIONS].sort();
  return sortedA.every((p, i) => p === sortedB[i]) ? "padrao" : "personalizado";
}

export type Member = {
  id: string;
  photo?: string;
  name: string;
  role: string;
  birthday: string;
  salary: string;
  email: string;
  permissions: Permission[];
  timeView: TimeField[];
  startTimes?: Record<string, string>;
  isAdmin?: boolean;
};

export type MemberFormPayload = {
  isNew: boolean;
  id?: string;
  email: string;
  tempPassword: string;
  name: string;
  role: string;
  birthday: string;
  salary: string;
  permissions: Permission[];
  timeView: TimeField[];
  isAdminRole: boolean;
};

type AccessType = "padrao" | "personalizado" | "admin";

function accessTypeFor(isAdmin: boolean, permissions: Permission[]): AccessType {
  if (isAdmin) return "admin";
  return isDefaultPermissionSet(permissions);
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

const ACCESS_TYPE_OPTIONS: { key: AccessType; label: string; hint: string }[] = [
  { key: "padrao", label: "Membro padrão", hint: "Permissões padrão da equipe." },
  {
    key: "personalizado",
    label: "Personalizado",
    hint: "Escolha quais áreas este membro pode acessar.",
  },
  { key: "admin", label: "Administrador", hint: "Acesso completo ao workspace." },
];

export function MemberDialog({
  open,
  initial,
  isSelf,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  initial: Member | null;
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (p: MemberFormPayload) => void | Promise<void>;
}) {
  const isNew = !initial;
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [birthday, setBirthday] = useState("");
  const [salary, setSalary] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  // `permissions` guarda sempre o conjunto EDITÁVEL (usado de verdade só
  // quando `accessType === "personalizado"`) — pra padrão/admin, o
  // conjunto efetivo é calculado (`MEMBER_DEFAULT_PERMISSIONS`/
  // `ALL_PERMISSIONS`) só na hora de salvar, sem precisar ficar
  // sincronizado com este estado o tempo todo.
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [timeView, setTimeView] = useState<TimeField[]>(DEFAULT_TIME_VIEW);
  const [accessType, setAccessType] = useState<AccessType>("padrao");
  const [showIncluded, setShowIncluded] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Re-seed local form state whenever the dialog opens for a (possibly different) member.
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setRole(initial?.role ?? "");
    setBirthday(initial?.birthday ?? "");
    setSalary(initial?.salary ?? "");
    setEmail(initial?.email ?? "");
    setTempPassword("");
    const seedPermissions = initial ? initial.permissions : MEMBER_DEFAULT_PERMISSIONS;
    setPermissions(seedPermissions);
    setTimeView(initial?.timeView ?? DEFAULT_TIME_VIEW);
    // Abre no tipo de acesso que já bate com os dados salvos — sem isso,
    // um membro padrão sempre reabria marcado como Personalizado,
    // parecendo que a troca não salvou.
    setAccessType(accessTypeFor(!!initial?.isAdmin, seedPermissions));
    setShowIncluded(false);
    setError("");
  }, [open, initial]);

  const selectAccessType = (next: AccessType) => {
    if (isSelf) return;
    setAccessType(next);
    if (next === "padrao") setPermissions(MEMBER_DEFAULT_PERMISSIONS);
  };

  const togglePerm = (p: Permission) =>
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  const toggleField = (f: TimeField) =>
    setTimeView((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  const canSeeTime = permissions.includes("time");

  useEffect(() => {
    if (!canSeeTime && timeView.length > 0) setTimeView([]);
  }, [canSeeTime, timeView.length]);

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setTempPassword(out);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (isNew) {
      if (!email.trim()) return setError("Email é obrigatório.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Email inválido.");
      if (tempPassword.length < 6)
        return setError("Senha temporária precisa ter pelo menos 6 caracteres.");
    }
    const isAdminRole = accessType === "admin";
    const finalPermissions =
      accessType === "admin"
        ? ALL_PERMISSIONS
        : accessType === "padrao"
          ? MEMBER_DEFAULT_PERMISSIONS
          : permissions;
    setSubmitting(true);
    try {
      await onSave({
        isNew,
        id: initial?.id,
        email: email.trim(),
        tempPassword,
        name: name.trim(),
        role: role.trim(),
        birthday,
        salary,
        permissions: finalPermissions,
        timeView,
        isAdminRole,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const presenceStatus = initial ? getStatus(initial.id) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0">
        {isNew ? (
          <DialogHeader className="border-b border-border px-6 py-4 pr-10">
            <DialogTitle>Adicionar membro</DialogTitle>
            <DialogDescription>Cadastre os dados e defina o acesso deste membro.</DialogDescription>
          </DialogHeader>
        ) : (
          <div className="flex items-center gap-3 border-b border-border px-6 py-4 pr-10">
            <Avatar className="h-11 w-11 shrink-0">
              <AvatarImage src={initial?.photo} alt={initial?.name} />
              <AvatarFallback className="text-sm">
                {memberInitials(initial?.name || "?")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base">
                {initial?.name || "Sem nome"}
              </DialogTitle>
              <DialogDescription className="mt-0.5 truncate text-xs">
                {[initial?.role, initial?.email].filter(Boolean).join(" · ") ||
                  "Sem cargo definido"}
              </DialogDescription>
            </div>
            {presenceStatus && (
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[presenceStatus]}`} />
                {STATUS_LABEL[presenceStatus]}
              </span>
            )}
          </div>
        )}

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-6 px-6 py-5">
              <section className="space-y-3">
                <SectionTitle title="Dados do membro" />
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Field label="Nome" icon={<User className="h-3.5 w-3.5" />}>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </Field>
                  <Field label="Cargo" icon={<Briefcase className="h-3.5 w-3.5" />}>
                    <Input
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="h-9 text-sm"
                      placeholder="Ex: Designer"
                    />
                  </Field>
                  <Field label="Email" icon={<Mail className="h-3.5 w-3.5" />}>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-9 text-sm"
                      required
                      disabled={!isNew}
                    />
                  </Field>
                  {isNew ? (
                    <Field label="Senha temporária" icon={<KeyRound className="h-3.5 w-3.5" />}>
                      <div className="flex gap-1.5">
                        <Input
                          value={tempPassword}
                          onChange={(e) => setTempPassword(e.target.value)}
                          className="h-9 text-sm"
                          placeholder="•••••••"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 shrink-0"
                          onClick={generatePassword}
                        >
                          Gerar
                        </Button>
                      </div>
                    </Field>
                  ) : (
                    <Field label="Aniversário" icon={<Calendar className="h-3.5 w-3.5" />}>
                      <DateField
                        value={birthday || undefined}
                        onChange={(v) => setBirthday(v ?? "")}
                        className="h-9 text-sm"
                      />
                    </Field>
                  )}
                  {isNew && (
                    <Field label="Aniversário" icon={<Calendar className="h-3.5 w-3.5" />}>
                      <DateField
                        value={birthday || undefined}
                        onChange={(v) => setBirthday(v ?? "")}
                        className="h-9 text-sm"
                      />
                    </Field>
                  )}
                  <Field label="Salário" icon={<DollarSign className="h-3.5 w-3.5" />}>
                    <Input
                      value={salary}
                      onChange={(e) => setSalary(e.target.value)}
                      className="h-9 text-sm"
                      placeholder="R$ 0,00"
                      inputMode="decimal"
                    />
                  </Field>
                </div>
              </section>

              <Separator />

              <section className="space-y-2.5">
                <SectionTitle
                  title="Tipo de acesso"
                  hint={
                    isSelf
                      ? "Você não pode alterar seu próprio nível de acesso."
                      : "O que este membro pode acessar na plataforma."
                  }
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {ACCESS_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={isSelf}
                      onClick={() => selectAccessType(opt.key)}
                      className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        accessType === opt.key
                          ? "border-foreground/40 bg-muted"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span className="block font-medium text-foreground">{opt.label}</span>
                      <span className="text-muted-foreground">{opt.hint}</span>
                    </button>
                  ))}
                </div>

                {accessType === "padrao" && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3">
                    <p className="text-xs text-muted-foreground">
                      Este membro utilizará as permissões padrão do workspace.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowIncluded((v) => !v)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
                    >
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${showIncluded ? "rotate-180" : ""}`}
                      />
                      {showIncluded ? "Ocultar permissões incluídas" : "Ver permissões incluídas"}
                    </button>
                    {showIncluded && (
                      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                        {PERMISSION_GROUPS.map((group) => {
                          const items = group.items.filter((i) =>
                            MEMBER_DEFAULT_PERMISSIONS.includes(i.key),
                          );
                          if (items.length === 0) return null;
                          return (
                            <div key={group.label}>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {group.label}
                              </p>
                              <ul className="mt-1 space-y-0.5">
                                {items.map((i) => (
                                  <li
                                    key={i.key}
                                    className="flex items-center gap-1.5 text-xs text-foreground"
                                  >
                                    <Check className="h-3 w-3 shrink-0 text-muted-foreground" />
                                    {i.label}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {accessType === "admin" && (
                  <p className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3 text-xs text-muted-foreground">
                    Administradores possuem acesso completo ao workspace, incluindo configurações e
                    gerenciamento de membros.
                  </p>
                )}

                {accessType === "personalizado" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setPermissions(ALL_PERMISSIONS)}
                      >
                        Todas
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setPermissions([])}
                      >
                        Nenhuma
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                      {PERMISSION_GROUPS.map((group) => {
                        const groupKeys = group.items.map((i) => i.key);
                        const allOn = groupKeys.every((k) => permissions.includes(k));
                        const toggleGroup = () =>
                          setPermissions((prev) =>
                            allOn
                              ? prev.filter((k) => !groupKeys.includes(k))
                              : Array.from(new Set([...prev, ...groupKeys])),
                          );
                        return (
                          <div key={group.label}>
                            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {group.label}
                              </span>
                              <button
                                type="button"
                                onClick={toggleGroup}
                                className="text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                {allOn ? "Desmarcar tudo" : "Selecionar tudo"}
                              </button>
                            </div>
                            <div className="mt-2 space-y-1">
                              {group.items.map((p) => {
                                const checked = permissions.includes(p.key);
                                return (
                                  <label
                                    key={p.key}
                                    className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-foreground"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() => togglePerm(p.key)}
                                      className="h-3.5 w-3.5 rounded-[3px]"
                                    />
                                    {p.label}
                                  </label>
                                );
                              })}
                            </div>
                            {group.label === "Administração" &&
                              permissions.includes("configuracoes") && (
                                <div className="mt-2 border-t border-border/60 pt-2">
                                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                    Abas de Configurações
                                  </p>
                                  <div className="space-y-1">
                                    {CONFIG_SUB_PERMISSIONS.map((sp) => {
                                      const on = permissions.includes(sp.key);
                                      return (
                                        <label
                                          key={sp.key}
                                          className="flex cursor-pointer items-center gap-2 py-0.5 text-[11px] text-foreground"
                                        >
                                          <Checkbox
                                            checked={on}
                                            onCheckedChange={() => togglePerm(sp.key)}
                                            className="h-3.5 w-3.5 rounded-[3px]"
                                          />
                                          {sp.label}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            {group.label === "Gestão" && canSeeTime && (
                              <div className="mt-2 border-t border-border/60 pt-2">
                                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                                  <Eye className="h-2.5 w-2.5" /> Visibilidade na aba Time
                                </p>
                                <div className="space-y-1">
                                  {TIME_FIELDS.map((f) => {
                                    const checked = timeView.includes(f.key);
                                    return (
                                      <label
                                        key={f.key}
                                        className="flex cursor-pointer items-center gap-2 py-0.5 text-[11px] text-foreground"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={() => toggleField(f.key)}
                                          className="h-3.5 w-3.5 rounded-[3px]"
                                        />
                                        {f.label}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          </div>

          <DialogFooter className="border-t border-border bg-muted/30 px-6 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Salvando..." : isNew ? "Adicionar membro" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
        {icon}
        {title}
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <Label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
}
