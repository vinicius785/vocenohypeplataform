import {
  Briefcase,
  Calendar,
  LayoutGrid,
  MessageSquare,
  Megaphone,
  Star,
  Target,
  TrendingUp,
  Users,
  UserCog,
  Wallet,
} from "lucide-react";
import type { SectionKey } from "@/lib/section-nav";

export type NavItem = { key: SectionKey; label: string; icon: typeof LayoutGrid };
export type NavGroup = { title: string; items: NavItem[] };

/** Sidebar = navegação GLOBAL. Funcionalidades internas de cada módulo
 * (abas do Financeiro, Objetivos/Indicadores de Metas, Kanban/Blog/Arquivos
 * de um projeto...) vivem dentro do próprio módulo, nunca como item aqui.
 * Fonte ÚNICA: a sidebar (desktop) e a barra inferior + "Mais" (mobile) leem daqui. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Geral",
    items: [{ key: "inicio", label: "Início", icon: LayoutGrid }],
  },
  {
    title: "Operação",
    items: [
      { key: "clientes", label: "Clientes", icon: Users },
      { key: "campanhas", label: "Campanhas", icon: Megaphone },
      { key: "projetos", label: "Projetos", icon: Briefcase },
      { key: "reunioes", label: "Reuniões", icon: Calendar },
    ],
  },
  {
    title: "Gestão",
    items: [
      { key: "comercial", label: "Comercial", icon: TrendingUp },
      { key: "financeiro", label: "Financeiro", icon: Wallet },
      { key: "time", label: "Time", icon: UserCog },
      { key: "influenciadores", label: "Influenciadores", icon: Star },
      { key: "metas", label: "Metas", icon: Target },
    ],
  },
  {
    title: "Comunicação",
    items: [{ key: "chat", label: "Chat", icon: MessageSquare }],
  },
];

/** Destinos prioritários da barra inferior (mobile), nesta ordem; o 5º botão é "Mais". */
export const MOBILE_PRIMARY_KEYS = ["campanhas", "projetos", "comercial", "chat"] as const;
export type MobilePrimaryKey = (typeof MOBILE_PRIMARY_KEYS)[number];

export const itemByKey = (key: SectionKey): NavItem | undefined =>
  NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === key);

/** Grupos do "Mais": tudo da sidebar que NÃO está na barra, na mesma ordem e com os mesmos títulos. */
export function moreGroups(): NavGroup[] {
  const primary = new Set<string>(MOBILE_PRIMARY_KEYS);
  return NAV_GROUPS.map((g) => ({
    title: g.title,
    items: g.items.filter((i) => !primary.has(i.key)),
  })).filter((g) => g.items.length > 0);
}

/** "Mais" fica ativo quando a seção atual não é um dos 4 destinos da barra
 * (inclui Configurações e Problemas, que vivem no rodapé da sidebar). */
export const isMoreActive = (active: SectionKey): boolean =>
  !(MOBILE_PRIMARY_KEYS as readonly string[]).includes(active);
