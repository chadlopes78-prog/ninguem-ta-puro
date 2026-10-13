import type { Metadata } from "next";
import Link from "next/link";
import { Workflow } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { listFunnels } from "@/server/services/funnels";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/filters/list-filters";
import { RowMenu } from "@/components/ui/row-menu";
import { NewFunnelButton } from "@/components/funnels/new-funnel-button";
import { NewWizardFunnelButton } from "@/components/funnels/new-wizard-funnel-button";
import { prisma } from "@/server/db";
import { ArrowRight } from "lucide-react";
import { STEP_ICON, STEP_TINT } from "@/components/funnels/step-visuals";
import { createFunnelAction, createWizardFunnelAction, deactivateFunnelAction, deleteFunnelAction, duplicateFunnelAction, activateFunnelAction } from "./actions";

export const metadata: Metadata = { title: "Funis de vendas" };

const STATUS = { DRAFT: <Badge>Rascunho</Badge>, ACTIVE: <Badge tone="success" dot>Ativo</Badge>, INACTIVE: <Badge tone="warning">Inativo</Badge> };

export default async function FunnelsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo, settings } = await getScope();
  const [funnels, products] = await Promise.all([
    listFunnels({ isDemo, q: sp.q?.slice(0, 100), status: sp.status }),
    prisma.product.findMany({ where: { isDemo, status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Funis de vendas {isDemo && <DemoBadge />}</span>}
        description="Defina o que acontece depois de cada compra: upsell e página de obrigado."
        actions={
          <>
            <NewFunnelButton action={createFunnelAction} label="Funil avançado" />
            <NewWizardFunnelButton action={createWizardFunnelAction} products={products} />
          </>
        }
      />
      <div className="mb-4">
        <ListFilters
          placeholder="Pesquisar funis…"
          selects={[{ name: "status", label: "Estado", options: [{ value: "", label: "Todos" }, { value: "ACTIVE", label: "Ativos" }, { value: "DRAFT", label: "Rascunhos" }, { value: "INACTIVE", label: "Inativos" }] }]}
        />
      </div>
      {funnels.length === 0 ? (
        <Card>
          <EmptyState
            icon={Workflow}
            title={sp.q || sp.status ? "Nenhum funil encontrado" : "Sem funis"}
            description={sp.q || sp.status ? undefined : "Escolha um produto e defina o que acontece depois do pagamento: um upsell ou uma página de obrigado."}
            action={!sp.q && !sp.status ? <NewWizardFunnelButton action={createWizardFunnelAction} products={products} label="Criar funil" /> : undefined}
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {funnels.map((f) => {
            const types = [...new Set(f.steps.map((s) => s.type))];
            return (
              <li key={f.id}>
                <Card className="flex h-full flex-col p-5 transition-colors hover:border-line-strong">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/funis/${f.id}`} className="min-w-0 hover:text-accent">
                      <h2 className="truncate font-display text-base font-semibold">{f.name}</h2>
                      {f.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{f.description}</p>}
                    </Link>
                    <RowMenu
                      label={`Ações para ${f.name}`}
                      items={[
                        { kind: "link", label: "Abrir editor", href: `/funis/${f.id}` },
                        { kind: "action", label: "Duplicar", run: duplicateFunnelAction.bind(null, f.id) },
                        f.status === "ACTIVE"
                          ? { kind: "action", label: "Desativar", run: deactivateFunnelAction.bind(null, f.id) }
                          : { kind: "action", label: "Ativar", run: activateFunnelAction.bind(null, f.id) },
                        { kind: "action", label: "Eliminar", danger: true, confirm: "Eliminar este funil e todas as suas etapas? Funis ativos ou com pedidos não podem ser eliminados.", run: deleteFunnelAction.bind(null, f.id) },
                      ]}
                    />
                  </div>
                  {f.product ? (
                    <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[12.5px]" aria-label="Fluxo do funil" data-testid="funnel-card-flow">
                      <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 font-medium text-fg">{f.product.name}</span>
                      {types.includes("UPSELL") && (
                        <>
                          <ArrowRight className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
                          <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-muted">Upsell</span>
                        </>
                      )}
                      <ArrowRight className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
                      <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-muted">Página de obrigado</span>
                    </div>
                  ) : (
                  <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Tipos de etapa">
                    {types.map((t) => {
                      const Icon = STEP_ICON[t];
                      return (
                        <span key={t} className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface-2" title={t}>
                          <Icon className="h-3.5 w-3.5" style={{ color: STEP_TINT[t] }} aria-hidden="true" />
                        </span>
                      );
                    })}
                  </div>
                  )}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5 text-[12.5px] text-subtle">
                    {STATUS[f.status]}
                    <span>
                      {f._count.steps} etapas · {f._count.checkouts} checkouts · atualizado {formatDate(f.updatedAt, settings.timezone)}
                    </span>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
