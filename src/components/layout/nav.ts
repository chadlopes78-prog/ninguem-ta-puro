import { BarChart3, Bell, ClipboardList, CreditCard, ShieldCheck, LayoutDashboard, Package, Plug, Receipt, Settings, Users, Workflow, type LucideIcon } from "lucide-react";

/** Abas da área Operações (rotas existentes, inalteradas). */
export const OPERATIONS_TABS = [
  { key: "pedidos", href: "/pedidos", label: "Pedidos", icon: Receipt },
  { key: "clientes", href: "/clientes", label: "Clientes", icon: Users },
  { key: "relatorios", href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { key: "notificacoes", href: "/notificacoes", label: "Notificações", icon: Bell },
] as const;

// `match`: outras rotas que também marcam a entrada como ativa
export const NAV: { href: string; label: string; icon: LucideIcon; group: "main" | "ops" | "system" | "platform"; ownerOnly?: boolean; match?: readonly string[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "main" },
  { href: "/produtos", label: "Produtos", icon: Package, group: "main" },
  { href: "/checkouts", label: "Personalizar Checkout", icon: CreditCard, group: "main" },
  { href: "/funis", label: "Funis de vendas", icon: Workflow, group: "main" },
  // Pedidos, Clientes, Relatórios e Notificações são abas dentro de Operações
  { href: "/operacoes", label: "Operações", icon: ClipboardList, group: "ops", match: OPERATIONS_TABS.map((t) => t.href) },
  { href: "/integracoes", label: "Integrações", icon: Plug, group: "system" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, group: "system" },
  // Só a conta proprietária vê esta entrada; o acesso é sempre verificado no servidor (requireOwner)
  { href: "/admin", label: "Administração", icon: ShieldCheck, group: "platform", ownerOnly: true },
];

export const GROUP_LABELS = { main: "Vendas", ops: "Operação", system: "Sistema", platform: "Plataforma" } as const;
