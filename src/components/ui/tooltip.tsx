import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tooltip acessível só com CSS (hover e foco). */
export function Tooltip({ content, children, className }: { content: string; children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children ?? (
        <button type="button" className="text-subtle hover:text-fg" aria-label={content}>
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[240px] -translate-x-1/2 rounded-[var(--radius-sm)] border border-line-strong bg-surface-3 px-2.5 py-1.5 text-[12px] font-normal leading-snug text-fg opacity-0 shadow-[var(--shadow-pop)] transition-opacity group-focus-within/tt:visible group-focus-within/tt:opacity-100 group-hover/tt:visible group-hover/tt:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
