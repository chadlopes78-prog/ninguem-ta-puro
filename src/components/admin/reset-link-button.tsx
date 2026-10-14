"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";

export function ResetLinkButton({ action }: { action: () => Promise<ActionResult<{ link: string }>> }) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await action();
            if (!r.ok) return toast(r.error, "error");
            setLink(r.data!.link);
            toast(r.message ?? "Link gerado.");
          })
        }
        data-testid="admin-reset-link"
      >
        <KeyRound className="h-4 w-4" /> Gerar link de redefinição de palavra-passe
      </Button>
      {link && (
        <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-[12px]" data-testid="admin-reset-link-value">
            {link}
          </code>
          <CopyButton value={link} size="sm" label="Copiar" />
        </div>
      )}
      <p className="text-[11.5px] text-subtle">Válido durante 30 minutos e uma única vez. Use apenas quando o utilizador não recebe o email de recuperação.</p>
    </div>
  );
}
