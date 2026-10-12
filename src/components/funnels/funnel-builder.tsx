"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Play, Plus, Power, Save, Trash2, XCircle } from "lucide-react";
import { STEP_META, STEP_TYPES, OFFER_STEP_TYPES, HANDLE_LABELS, type FunnelGraph, type SourceHandle, type StepConfig, type StepType } from "@/lib/funnels/types";
import { validateFunnel, type FunnelIssue, type FunnelRefs } from "@/lib/funnels/validate";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import type { ActionResult } from "@/server/validation/common";
import type { FunnelValidation } from "@/lib/funnels/validate";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { StepNodeComponent, type StepNode, type StepNodeData } from "./step-node";
import { STEP_ICON, STEP_TINT } from "./step-visuals";
import { FunnelSimulator } from "./funnel-simulator";

export interface BuilderProduct {
  id: string;
  name: string;
  archived: boolean;
  offers: { id: string; name: string; priceCents: number; currency: CurrencyCode; isActive: boolean }[];
}
export interface BuilderCheckout {
  id: string;
  name: string;
  isActive: boolean;
}

interface Props {
  funnel: { id: string; name: string; description: string; status: "DRAFT" | "ACTIVE" | "INACTIVE" };
  initialGraph: FunnelGraph;
  products: BuilderProduct[];
  checkouts: BuilderCheckout[];
  isDemo: boolean;
  saveAction: (payload: { name: string; description?: string; graph: FunnelGraph }) => Promise<ActionResult<{ validation: FunnelValidation; deactivated: boolean }>>;
  activateAction: () => Promise<ActionResult<{ validation: FunnelValidation }>>;
  deactivateAction: () => Promise<ActionResult<unknown>>;
}

const nodeTypes = { step: StepNodeComponent };

const STATUS_BADGE = {
  DRAFT: <Badge>Rascunho</Badge>,
  ACTIVE: <Badge tone="success" dot>Ativo</Badge>,
  INACTIVE: <Badge tone="warning">Inativo</Badge>,
};

function edgeStyle(handle: SourceHandle): Partial<Edge> {
  const color = handle === "accept" ? "#4ade80" : handle === "decline" ? "#f87171" : "#6c737d";
  return {
    type: "smoothstep",
    label: handle === "next" ? undefined : HANDLE_LABELS[handle],
    labelStyle: { fill: color, fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: "#111316" },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
    style: { stroke: color, strokeWidth: 1.75 },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
  };
}

function toFlow(graph: FunnelGraph): { nodes: StepNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({ id: n.key, type: "step", position: n.position, data: { type: n.type, label: n.label, config: n.config } })),
    edges: graph.edges.map((e) => ({ id: e.key, source: e.source, target: e.target, sourceHandle: e.sourceHandle, ...edgeStyle(e.sourceHandle) })),
  };
}

function fromFlow(nodes: StepNode[], edges: Edge[]): FunnelGraph {
  return {
    nodes: nodes.map((n) => ({
      key: n.id,
      type: n.data.type,
      label: n.data.label,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      config: n.data.config,
    })),
    edges: edges.map((e) => ({ key: e.id, source: e.source, target: e.target, sourceHandle: (e.sourceHandle ?? "next") as SourceHandle })),
  };
}

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

function BuilderInner(props: Props) {
  const { funnel, products, checkouts, isDemo } = props;
  const initial = useMemo(() => toFlow(props.initialGraph), [props.initialGraph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [name, setName] = useState(funnel.name);
  const [description, setDescription] = useState(funnel.description);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const setSelectedId = (id: string | null) => {
    selectedRef.current = id;
    setSelectedIdState(id);
  };
  const [simOpen, setSimOpen] = useState(false);
  const [panel, setPanel] = useState<"inspector" | "issues">("inspector");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const rf = useReactFlow();


  const refs: FunnelRefs = useMemo(
    () => ({
      products: new Map(products.map((p) => [p.id, { name: p.name, archived: p.archived, offers: new Map(p.offers.map((o) => [o.id, { active: o.isActive }])) }])),
      checkouts: new Map(checkouts.map((c) => [c.id, { name: c.name, active: c.isActive }])),
    }),
    [products, checkouts],
  );

  const graph = useMemo(() => fromFlow(nodes, edges), [nodes, edges]);
  // "alterações por guardar" = estado atual diferente do último estado guardado
  const signature = useMemo(() => JSON.stringify({ name, description, graph }), [name, description, graph]);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const baseline = useRef<string | null>(null);
  if (baseline.current === null) baseline.current = signature;
  const dirty = signature !== (savedSignature ?? baseline.current);
  const setDirty = (v: boolean) => {
    if (!v) setSavedSignature(signature);
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const validation = useMemo(() => validateFunnel(graph, refs), [graph, refs]);

  const summaryFor = useCallback(
    (type: StepType, c: StepConfig): string | undefined => {
      if (type === "CHECKOUT") return c.checkoutId ? `Checkout: ${checkouts.find((x) => x.id === c.checkoutId)?.name ?? "inexistente"}` : "Selecione um checkout";
      if (OFFER_STEP_TYPES.includes(type)) {
        const p = products.find((x) => x.id === c.productId);
        const o = p?.offers.find((x) => x.id === c.offerId);
        if (!p) return "Selecione produto e oferta";
        return `${p.name}${o ? ` · ${formatMoney(o.priceCents, o.currency)}` : ""}`;
      }
      if (type === "SALES_PAGE") return c.url ?? (c.productId ? products.find((x) => x.id === c.productId)?.name : undefined);
      if (type === "THANK_YOU") return c.title;
      return undefined;
    },
    [products, checkouts],
  );

  // nós decorados com contagem de erros/avisos e resumo
  const viewNodes = useMemo(
    () =>
      nodes.map((n) => {
        const errors = validation.errors.filter((i) => i.nodeKey === n.id).length;
        const warnings = validation.warnings.filter((i) => i.nodeKey === n.id).length;
        return { ...n, data: { ...n.data, errors, warnings, summary: summaryFor(n.data.type, n.data.config) } };
      }),
    [nodes, validation, summaryFor],
  );

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const updateNode = (id: string, patch: Partial<StepNodeData>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));

  };
  const updateConfig = (id: string, patch: Partial<StepConfig>) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const config = { ...n.data.config, ...patch };
        for (const k of Object.keys(config) as (keyof StepConfig)[]) if (config[k] === "" || config[k] === undefined) delete config[k];
        return { ...n, data: { ...n.data, config } };
      }),
    );

  };

  const addStep = (type: StepType) => {
    const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const id = rid("n");
    const offset = (nodes.length % 5) * 24;
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      {
        id,
        type: "step",
        position: { x: center.x - 104 + offset, y: center.y - 40 + offset },
        selected: true,
        data: {
          type,
          label: STEP_META[type].label,
          config:
            type === "UPSELL" || type === "DOWNSELL" || type === "ORDER_BUMP"
              ? { acceptText: "Sim, quero adicionar", declineText: "Não, obrigado" }
              : type === "THANK_YOU"
                ? { title: "Obrigado pela sua compra!" }
                : {},
        },
      },
    ]);
    setSelectedId(id);
    setPanel("inspector");

  };

  const removeNode = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);

  };

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      const handle = (c.sourceHandle ?? "next") as SourceHandle;
      setEdges((es) =>
        addEdge(
          { ...c, id: rid("e"), sourceHandle: handle, ...edgeStyle(handle) },
          // cada saída tem um único destino: substitui a ligação anterior
          es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "next") === handle)),
        ),
      );

    },
    [setEdges],
  );

  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      if (c.source === c.target) return false;
      const target = nodes.find((n) => n.id === c.target);
      return Boolean(target && STEP_META[target.data.type].hasInput);
    },
    [nodes],
  );

  const focusIssue = (i: FunnelIssue) => {
    if (!i.nodeKey) return;
    const n = nodes.find((x) => x.id === i.nodeKey);
    if (!n) return;
    setSelectedId(n.id);
    setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === n.id })));
    rf.setCenter(n.position.x + 104, n.position.y + 40, { zoom: 1.1, duration: 400 });
    setPanel("inspector");
  };

  const save = () =>
    start(async () => {
      try {
        const r = await props.saveAction({ name, description, graph });
        if (r.ok) {
          setDirty(false);
          toast(r.message ?? "Funil guardado.", r.data?.deactivated ? "info" : "success");
          router.refresh();
        } else toast(r.error, "error");
      } catch {
        toast("Erro de rede. As alterações continuam no editor — tente guardar novamente.", "error");
      }
    });

  const toggleActive = () =>
    start(async () => {
      try {
        if (funnel.status === "ACTIVE") {
          const r = await props.deactivateAction();
          toast(r.ok ? (r.message ?? "Funil desativado.") : r.error, r.ok ? "success" : "error");
        } else {
          if (dirty) {
            const s = await props.saveAction({ name, description, graph });
            if (!s.ok) return toast(s.error, "error");
            setDirty(false);
          }
          const r = await props.activateAction();
          if (!r.ok) {
            setPanel("issues");
            toast(r.error, "error");
          } else toast(r.message ?? "Funil ativado.");
        }
        router.refresh();
      } catch {
        toast("Erro de rede. Tente novamente.", "error");
      }
    });

  const issues = [...validation.errors, ...validation.warnings];

  return (
    <div className={cn("-mx-4 -my-6 flex min-h-[calc(100dvh-3.5rem)] flex-col sm:-mx-6 lg:-mx-8 lg:-my-8 lg:min-h-0", isDemo ? "lg:h-[calc(100dvh-36px)]" : "lg:h-dvh")}>
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <Link href="/funis" className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" aria-label="Voltar aos funis">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nome do funil"
            className="min-w-0 max-w-[280px] flex-1 rounded-md bg-transparent px-2 py-1 font-display text-[15px] font-semibold text-fg hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
            maxLength={100}
          />
          <span className="hidden sm:inline">{STATUS_BADGE[funnel.status]}</span>
          {isDemo && <DemoBadge className="hidden md:inline-flex" />}
          {dirty && <span className="hidden text-[12px] text-warning sm:inline">Alterações por guardar</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPanel("issues")}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border px-3 text-[12.5px] font-medium",
              validation.errors.length ? "border-danger/40 text-danger" : validation.warnings.length ? "border-warning/40 text-warning" : "border-success/40 text-success",
            )}
          >
            {validation.errors.length ? <XCircle className="h-4 w-4" /> : validation.warnings.length ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {validation.errors.length ? `${validation.errors.length} erro(s)` : validation.warnings.length ? `${validation.warnings.length} aviso(s)` : "Válido"}
          </button>
          <Button variant="secondary" size="sm" className="h-9" onClick={() => setSimOpen(true)} disabled={!validation.valid} title={validation.valid ? "Simular percurso" : "Corrija os erros para simular"}>
            <Play className="h-4 w-4" /> Simular
          </Button>
          <Button variant={funnel.status === "ACTIVE" ? "secondary" : "outline"} size="sm" className="h-9" onClick={toggleActive} disabled={pending}>
            <Power className="h-4 w-4" /> {funnel.status === "ACTIVE" ? "Desativar" : "Ativar"}
          </Button>
          <Button size="sm" className="h-9" onClick={save} loading={pending} disabled={!dirty && !pending}>
            <Save className="h-4 w-4" /> Guardar
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Paleta */}
        <aside className="border-b border-line bg-surface lg:w-[200px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0" aria-label="Adicionar etapas">
          <p className="hidden px-4 pt-4 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-subtle lg:block">Adicionar etapa</p>
          <ul className="flex gap-1.5 overflow-x-auto p-2 scrollbar-thin lg:flex-col lg:gap-0.5 lg:px-2 lg:pt-0">
            {STEP_TYPES.map((t) => {
              const Icon = STEP_ICON[t];
              return (
                <li key={t} className="shrink-0">
                  <button
                    onClick={() => addStep(t)}
                    className="flex h-10 w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-line px-2.5 text-left text-[12.5px] text-fg hover:border-line-strong hover:bg-surface-2 lg:border-transparent"
                    data-testid={`add-${t}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: STEP_TINT[t] }} aria-hidden="true" />
                    <span className="whitespace-nowrap">{STEP_META[t].label}</span>
                    <Plus className="ml-auto hidden h-3.5 w-3.5 text-subtle lg:block" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Canvas */}
        <div className="relative h-[62dvh] min-h-[380px] flex-1 lg:h-auto" data-testid="funnel-canvas">
          <ReactFlow
            nodes={viewNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(c) => {
              onNodesChange(c);
              if (c.some((x) => x.type === "remove")) setSelectedId(null);
            }}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onSelectionChange={({ nodes: sel }) => {
              const id = sel[0]?.id ?? null;
              // só muda de separador quando a seleção muda de facto (não em cada re-render)
              if (id !== selectedRef.current) {
                selectedRef.current = id;
                setSelectedId(id);
                if (id) setPanel("inspector");
              }
            }}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1, minZoom: 0.6 }}
            minZoom={0.2}
            maxZoom={2}
            deleteKeyCode={["Delete", "Backspace"]}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#2a2f36" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden md:!block" nodeColor={(n) => STEP_TINT[(n.data as StepNodeData).type]} maskColor="rgb(11 12 14 / 0.7)" />
          </ReactFlow>
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-sm text-muted">
              Adicione etapas a partir do painel “Adicionar etapa”.
            </div>
          )}
        </div>

        {/* Inspetor / validação */}
        <aside className="flex flex-col border-t border-line bg-surface lg:w-[340px] lg:shrink-0 lg:border-t-0 lg:border-l" aria-label="Propriedades">
          <div className="flex border-b border-line" role="tablist">
            {(["inspector", "issues"] as const).map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={panel === p}
                onClick={() => setPanel(p)}
                className={cn("h-11 flex-1 text-[13px] font-medium", panel === p ? "border-b-2 border-accent text-fg" : "text-muted hover:text-fg")}
              >
                {p === "inspector" ? (selected ? "Etapa" : "Funil") : `Validação (${issues.length})`}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            {panel === "issues" ? (
              <IssuesList issues={issues} onFocus={focusIssue} />
            ) : selected ? (
              <Inspector
                key={selected.id}
                node={selected}
                products={products}
                checkouts={checkouts}
                issues={issues.filter((i) => i.nodeKey === selected.id)}
                onLabel={(label) => updateNode(selected.id, { label })}
                onConfig={(patch) => updateConfig(selected.id, patch)}
                onRemove={() => removeNode(selected.id)}
                edges={edges}
                nodes={nodes}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <Field label="Nome do funil" name="fname">
                  {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />}
                </Field>
                <Field label="Descrição" name="fdesc">
                  {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />}
                </Field>
                <div className="rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed text-muted">
                  <p className="mb-1 font-medium text-fg">Como funciona</p>
                  Arraste a partir do ponto à direita de uma etapa até outra para as ligar. Upsells e downsells têm duas saídas: <span className="text-success">Aceita</span> e{" "}
                  <span className="text-danger">Recusa</span>. Selecione uma etapa para a configurar; use Delete para remover. Nesta fase o percurso é apenas simulado — nenhuma cobrança é feita.
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      <Modal open={simOpen} onClose={() => setSimOpen(false)} title="Simular percurso" description="Simulação local: não cria pedidos nem altera métricas." size="lg">
        {simOpen && <FunnelSimulator graph={graph} products={products} />}
      </Modal>
    </div>
  );
}

function IssuesList({ issues, onFocus }: { issues: FunnelIssue[]; onFocus: (i: FunnelIssue) => void }) {
  if (!issues.length)
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
        <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />O funil está pronto para ativação.
      </div>
    );
  return (
    <ul className="flex flex-col gap-2" data-testid="funnel-issues">
      {issues.map((i, idx) => (
        <li key={idx}>
          <button
            onClick={() => onFocus(i)}
            disabled={!i.nodeKey}
            className={cn(
              "flex w-full items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-left text-[12.5px] leading-snug",
              i.level === "error" ? "border-danger/30 bg-danger/[0.06] text-fg" : "border-warning/30 bg-warning/[0.06] text-fg",
              i.nodeKey && "hover:border-line-strong",
            )}
          >
            {i.level === "error" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-label="Erro" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-label="Aviso" />}
            {i.message}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Inspector({
  node,
  products,
  checkouts,
  issues,
  onLabel,
  onConfig,
  onRemove,
  edges,
  nodes,
}: {
  node: StepNode;
  products: BuilderProduct[];
  checkouts: BuilderCheckout[];
  issues: FunnelIssue[];
  onLabel: (v: string) => void;
  onConfig: (p: Partial<StepConfig>) => void;
  onRemove: () => void;
  edges: Edge[];
  nodes: StepNode[];
}) {
  const { type, label, config: c } = node.data;
  const meta = STEP_META[type];
  const err = (field: string) => issues.find((i) => i.field === field && i.level === "error")?.message;
  const product = products.find((p) => p.id === c.productId);
  const isOffer = OFFER_STEP_TYPES.includes(type);
  const targetName = (h: SourceHandle) => {
    const e = edges.find((x) => x.source === node.id && (x.sourceHandle ?? "next") === h);
    return e ? nodes.find((n) => n.id === e.target)?.data.label : undefined;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: STEP_TINT[type] }}>
          {meta.label}
        </span>
      </div>
      <Field label="Nome da etapa" name="label" error={err("label")}>
        {(p) => <Input {...p} value={label} onChange={(e) => onLabel(e.target.value)} maxLength={80} />}
      </Field>

      {type === "CHECKOUT" && (
        <Field label="Checkout" name="checkoutId" error={err("checkoutId")} required>
          {(p) => (
            <Select {...p} value={c.checkoutId ?? ""} onChange={(e) => onConfig({ checkoutId: e.target.value })}>
              <option value="">Selecione…</option>
              {checkouts.map((ck) => (
                <option key={ck.id} value={ck.id}>
                  {ck.name}
                  {!ck.isActive ? " (inativo)" : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {type === "SALES_PAGE" && (
        <>
          <Field label="URL da página de vendas" name="url" error={err("url")}>
            {(p) => <Input {...p} type="url" value={c.url ?? ""} onChange={(e) => onConfig({ url: e.target.value })} placeholder="https://" />}
          </Field>
          <Field label="Produto apresentado" name="productId">
            {(p) => (
              <Select {...p} value={c.productId ?? ""} onChange={(e) => onConfig({ productId: e.target.value })}>
                <option value="">Nenhum</option>
                {products.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </>
      )}

      {isOffer && (
        <>
          <Field label="Produto" name="productId" error={err("productId")} required>
            {(p) => (
              <Select {...p} value={c.productId ?? ""} onChange={(e) => onConfig({ productId: e.target.value, offerId: products.find((x) => x.id === e.target.value)?.offers.find((o) => o.isActive)?.id ?? "" })}>
                <option value="">Selecione…</option>
                {products.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                    {pr.archived ? " (arquivado)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Oferta / preço" name="offerId" error={err("offerId")} required>
            {(p) => (
              <Select {...p} value={c.offerId ?? ""} onChange={(e) => onConfig({ offerId: e.target.value })} disabled={!product}>
                <option value="">Selecione…</option>
                {product?.offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} — {formatMoney(o.priceCents, o.currency)}
                    {!o.isActive ? " (inativa)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Título da oferta" name="headline" error={err("headline")} required>
            {(p) => <Input {...p} value={c.headline ?? ""} onChange={(e) => onConfig({ headline: e.target.value })} maxLength={160} />}
          </Field>
          <Field label="Texto" name="body">
            {(p) => <Textarea {...p} value={c.body ?? ""} onChange={(e) => onConfig({ body: e.target.value })} rows={3} maxLength={3000} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Botão aceitar" name="acceptText">
              {(p) => <Input {...p} value={c.acceptText ?? ""} onChange={(e) => onConfig({ acceptText: e.target.value })} maxLength={60} />}
            </Field>
            <Field label="Link recusar" name="declineText">
              {(p) => <Input {...p} value={c.declineText ?? ""} onChange={(e) => onConfig({ declineText: e.target.value })} maxLength={80} />}
            </Field>
          </div>
          <dl className="grid gap-1.5 rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 text-[12.5px]">
            <div className="flex justify-between gap-2">
              <dt className="text-success">Se aceitar →</dt>
              <dd className="truncate text-fg">{targetName("accept") ?? <span className="text-danger">por ligar</span>}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-danger">Se recusar →</dt>
              <dd className="truncate text-fg">{targetName("decline") ?? <span className="text-danger">por ligar</span>}</dd>
            </div>
          </dl>
        </>
      )}

      {type === "THANK_YOU" && (
        <>
          <Field label="Título" name="title">
            {(p) => <Input {...p} value={c.title ?? ""} onChange={(e) => onConfig({ title: e.target.value })} maxLength={160} />}
          </Field>
          <Field label="Mensagem" name="message">
            {(p) => <Textarea {...p} value={c.message ?? ""} onChange={(e) => onConfig({ message: e.target.value })} rows={3} maxLength={2000} />}
          </Field>
          <Field label="Redirecionar para (opcional)" name="redirectUrl">
            {(p) => <Input {...p} type="url" value={c.redirectUrl ?? ""} onChange={(e) => onConfig({ redirectUrl: e.target.value })} placeholder="https://" />}
          </Field>
        </>
      )}

      {issues.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {issues.map((i, idx) => (
            <li key={idx} className={cn("flex gap-2 text-[12px]", i.level === "error" ? "text-danger" : "text-warning")}>
              {i.level === "error" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              {i.message}
            </li>
          ))}
        </ul>
      )}

      <Button variant="danger" size="sm" onClick={onRemove} className="self-start">
        <Trash2 className="h-4 w-4" /> Remover etapa
      </Button>
    </div>
  );
}

export function FunnelBuilder(props: Props) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  );
}
