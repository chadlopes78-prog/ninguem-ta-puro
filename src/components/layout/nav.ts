import { BarChart3, Bell, CreditCard, ShieldCheck, LayoutDashboard, Package, Plug, Receipt, Settings, TicketPercent, Users, Workflow, type LucideIcon } from "lucide-react";

export const NAV: { href: string; label: string; icon: LucideIcon; group: "main" | "ops" | "system" | "platform"; ownerOnly?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "main" },
  { href: "/produtos", label: "Produtos", icon: Package, group: "main" },
  { href: "/checkouts", label: "Personalizar Checkout", icon: CreditCard, group: "main" },
  { href: "/funis", label: "Funis de vendas", icon: Workflow, group: "main" },
  { href: "/pedidos", label: "Pedidos", icon: Receipt, group: "ops" },
  { href: "/clientes", label: "Clientes", icon: Users, group: "ops" },
  { href: "/cupons", label: "Cupons", icon: TicketPercent, group: "ops" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, group: "ops" },
  { href: "/notificacoes", label: "Notificações", icon: Bell, group: "ops" },
  { href: "/integracoes", label: "Integrações", icon: Plug, group: "system" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, group: "system" },
  // Só a conta proprietária vê esta entrada; o acesso é sempre verificado no servidor (requireOwner)
  { href: "/admin", label: "Administração", icon: ShieldCheck, group: "platform", ownerOnly: true },
];

export const GROUP_LABELS = { main: "Vendas", ops: "Operação", system: "Sistema", platform: "Plataforma" } as const;
