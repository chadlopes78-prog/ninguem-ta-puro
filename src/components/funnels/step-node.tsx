"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AlertTriangle, XCircle } from "lucide-react";
import { STEP_META, type StepConfig, type StepType } from "@/lib/funnels/types";
import { cn } from "@/lib/utils";
import { STEP_ICON, STEP_TINT } from "./step-visuals";

export type StepNodeData = {
  type: StepType;
  label: string;
  config: StepConfig;
  summary?: string;
  errors?: number;
  warnings?: number;
  highlighted?: boolean;
};
export type StepNode = Node<StepNodeData, "step">;

function StepNodeView({ data, selected }: NodeProps<StepNode>) {
  const meta = STEP_META[data.type];
  const Icon = STEP_ICON[data.type];
  const tint = STEP_TINT[data.type];
  const branching = meta.handles.includes("accept");
  return (
    <div
      className={cn(
        "relative w-[208px] rounded-[12px] border bg-surface-2 shadow-[var(--shadow-card)] transition-[border-color,box-shadow]",
        selected ? "border-accent shadow-[0_0_0_3px_rgb(200_241_53/0.15)]" : data.errors ? "border-danger/50" : "border-line-strong",
        data.highlighted && "ring-2 ring-info ring-offset-2 ring-offset-canvas",
      )}
    >
      {meta.hasInput && <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2" />}
      <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: `${tint}1a`, color: tint }}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: tint }}>
            {meta.label}
          </p>
          <p className="truncate text-[13px] font-medium text-fg">{data.label || "Sem nome"}</p>
        </div>
        {data.errors ? (
          <span className="flex items-center gap-0.5 text-[11px] font-semibold text-danger" title={`${data.errors} erro(s)`}>
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {data.errors}
          </span>
        ) : data.warnings ? (
          <span className="flex items-center gap-0.5 text-[11px] font-semibold text-warning" title={`${data.warnings} aviso(s)`}>
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {data.warnings}
          </span>
        ) : null}
      </div>
      <div className={cn("px-3 py-2 text-[11.5px] text-muted", branching && "pb-9")}>
        <p className="line-clamp-2">{data.summary || meta.description}</p>
      </div>
      {branching ? (
        <>
          <span className="pointer-events-none absolute right-4 bottom-[30px] text-[10.5px] font-medium text-success">Aceita</span>
          <Handle id="accept" type="source" position={Position.Right} style={{ top: "auto", bottom: 34 }} className="!h-3 !w-3 !border-2 !border-success !bg-success/30" />
          <span className="pointer-events-none absolute right-4 bottom-[8px] text-[10.5px] font-medium text-danger">Recusa</span>
          <Handle id="decline" type="source" position={Position.Right} style={{ top: "auto", bottom: 12 }} className="!h-3 !w-3 !border-2 !border-danger !bg-danger/30" />
        </>
      ) : meta.handles.includes("next") ? (
        <Handle id="next" type="source" position={Position.Right} className="!h-3 !w-3 !border-2" />
      ) : null}
    </div>
  );
}

export const StepNodeComponent = memo(StepNodeView);
