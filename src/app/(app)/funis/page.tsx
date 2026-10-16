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
import { NewWizardFunnelButton } from "@/components/funnels/new-wizard-funnel-button";
import { prisma } from "@/server/db";
import { ArrowRight } from "lucide-react";
import { STEP_ICON, STEP_TINT } from "@/components/funnels/step-visuals";
import { createWizardFunnelAction, deactivateFunnelAction, deleteFunnelAction, duplicateFunnelAction, activateFunnelAction } from "./actions";
import { own } from "@/server/scope";
import { readinessMap } from "@/server/services/product-readiness";
import { STAGE_LABELS } from "@/lib/product-setup";
import { CheckCircle2, Circle, Star } from "lucide-react";

export const metadata: Metadata = { title: "Funis de vendas" };

const STATUS = { DRAFT: <Badge>Rascunho</Badge>, ACTIVE: <Badge tone="success" dot>Ativo</Badge>, INACTIVE: <Badge tone="warning">Inativo</Badge> };

export default async function FunnelsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo, settings, scope } = await getScope();
  const [funnels, products] = await Promise.all([
    listFunnels({ scope, q: sp.q?.slice(0, 100), status: sp.status }),
    prisma.product.findMany({ where: { ...own(scope), status: { not: "ARCHIVED" } }, select: { id: true, name: true, mainFunnelId: true, deliveryMethod: true }, orderBy: { name: "asc" } }),
  ]);
  const ready = await readinessMap([...new Set(funnels.map((f) => f.productId).filter((x): x is string => !!x))], scope);
  const productInfo = new Map(products.map((p) => [p.id, p]));
  const preselect = sp.criar && /^[a-z0-9]{10,40}$/i.test(sp.criar) ? sp.criar : undefined;

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Funis de vendas {isDemo && <DemoBadge />}</span>}
        description="Defina o que acontece depois de cada compra: upsells, downsells e página de obrigado."
        actions={<NewWizardFunnelButton action={createWizardFunnelAction} products={products} initialProductId={preselect} />}
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
            description={sp.q || sp.status ? undefined : "Escolha um produto e defina o que acontece depois do pagamento: upsells, downsells e a página de obrigado."}
            action={!sp.q && !sp.status ? <NewWizardFunnelButton action={createWizardFunnelAction} products={products} testId="new-wizard-funnel-empty" /> : undefined}
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
                    <Link href={`/funis/${f.id}`} className="-my-1 min-w-0 py-1 hover:text-accent">
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
                      {f.steps
                        .filter((s) => s.type === "UPSELL" || s.type === "DOWNSELL" || s.type === "THANK_YOU")
                        .map((s, i) => (
                          <span key={i} className="contents">
                            <ArrowRight className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
                            <span className="max-w-full truncate rounded-full border border-line bg-surface-2 px-2.5 py-1 text-muted" title={s.label}>
                              {s.type === "THANK_YOU" ? ((s.config as { useSitePage?: boolean } | null)?.useSitePage === false ? "Obrigado (externa)" : "Página de obrigado") : s.label || (s.type === "DOWNSELL" ? "Downsell" : "Upsell")}
                            </span>
                          </span>
                        ))}
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
                  {f.productId && (() => {
                    const r = ready.get(f.productId);
                    const info = productInfo.get(f.productId);
                    if (!r) return null;
                    const isMain = info?.mainFunnelId === f.id;
                    const reqOk = (k: string) => r.requirements.find((x) => x.key === k)?.ok ?? false;
                    const row = (label: string, ok: boolean, value?: string) => (
                      <li className="flex items-center justify-between gap-2">
                        <span className="text-muted">{label}</span>
                        <span className={ok ? "flex items-center gap-1 text-success" : "flex items-center gap-1 text-warning"}>
                          {ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
                          {value ?? (ok ? "Concluído" : "Pendente")}
                        </span>
                      </li>
                    );
                    return (
                      <ul className="mt-4 flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-line bg-surface-2/50 p-3 text-[12.5px]" data-testid="funnel-card-status">
                        <li className="flex items-center justify-between gap-2">
                          <span className="text-muted">Produto</span>
                          <span className="flex min-w-0 items-center gap-1 truncate font-medium">
                            {isMain && <Star className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Funil principal" />}
                            <span className="truncate">{f.product?.name}</span>
                          </span>
                        </li>
                        {row("Funil principal", isMain, isMain ? "Sim" : "Não")}
                        {row("Página de obrigado", isMain ? reqOk("thankYou") : true)}
                        {row("Número WhatsApp", reqOk("whatsapp"))}
                        {row("Entrega", reqOk("delivery") && reqOk("deliveryContent"), info?.deliveryMethod === "FILE" ? "Ficheiro (PDF)" : info?.deliveryMethod === "EXTERNAL_LINK" ? "Link externo" : info?.deliveryMethod === "INTERNAL_PAGE" ? "Página interna" : "Por escolher")}
                        {row("Conclusão", isMain && r.ready, STAGE_LABELS[r.stage])}
                      </ul>
                    );
                  })()}
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
