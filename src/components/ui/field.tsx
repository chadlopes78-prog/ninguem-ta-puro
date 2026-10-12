"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-subtle transition-colors hover:border-line-strong focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60 aria-[invalid=true]:border-danger/60 aria-[invalid=true]:focus:ring-danger/20";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23a0a7b1%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_0.75rem_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

/** Envolve um controlo com label, ajuda e erro acessíveis. */
export function Field({
  label,
  name,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: React.ReactNode;
  name?: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: (props: { id: string; name?: string; "aria-invalid"?: boolean; "aria-describedby"?: string; required?: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-fg/90">
        {label}
        {required && <span className="ml-0.5 text-accent" aria-hidden="true">*</span>}
      </label>
      {children({ id, name, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, required })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[12px] text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="text-[12px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, description, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] py-1", className)}>
      <input type="checkbox" className="peer mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface-2 transition-colors checked:border-accent checked:bg-accent checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%230a0b0d%22 stroke-width=%223.5%22><path d=%22M5 12l5 5L20 7%22/></svg>')] bg-[length:12px] bg-center bg-no-repeat" {...props} />
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {description && <span className="block text-[12px] text-subtle">{description}</span>}
      </span>
    </label>
  );
}
