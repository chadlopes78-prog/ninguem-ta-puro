import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs && (
          <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-[12.5px] text-subtle">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {b.href ? (
                  <Link href={b.href} className="hover:text-fg">
                    {b.label}
                  </Link>
                ) : (
                  <span className="text-muted">{b.label}</span>
                )}
                {i < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
