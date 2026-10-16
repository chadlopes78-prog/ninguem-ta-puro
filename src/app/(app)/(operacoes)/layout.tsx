// Área Operações: título e abas comuns às páginas que já existiam (rotas inalteradas: /pedidos, /clientes,
// /relatorios, /notificacoes e respetivos detalhes). O conteúdo de cada página não muda.
import { requireUser } from "@/server/auth/session";
import { unreadCount } from "@/server/notifications/service";
import { OperationsTabs } from "@/components/layout/operations-tabs";

export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await unreadCount(user.id);
  return (
    <>
      <div className="mb-4">
        <p className="font-display text-xl font-semibold tracking-tight text-fg" data-testid="operations-title">Operações</p>
      </div>
      <OperationsTabs unread={unread} />
      {children}
    </>
  );
}
