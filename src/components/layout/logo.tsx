import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8 shrink-0", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#C8F135" />
      <path d="M9 23V9h3.2l7.6 9.3V9H23v14h-3.2L12.2 13.7V23z" fill="#0A0B0D" />
      <circle cx="24.5" cy="24.5" r="2" fill="#0A0B0D" />
    </svg>
  );
}

export function Logo({ name = "Ninguém Tá Puro", collapsed }: { name?: string; collapsed?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <LogoMark />
      {!collapsed && <span className="truncate font-display text-[15px] font-semibold tracking-tight text-fg">{name}</span>}
    </span>
  );
}
