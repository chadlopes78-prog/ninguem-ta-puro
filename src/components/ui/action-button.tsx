"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/server/validation/common";
import { Button, type ButtonProps } from "./button";
import { Modal } from "./modal";
import { useToast } from "./toast";

/**
 * Botão que executa uma server action, com confirmação opcional (ações destrutivas),
 * estado de carregamento e notificação de sucesso/erro.
 */
export function ActionButton({
  action,
  confirm,
  successMessage,
  redirectTo,
  children,
  ...buttonProps
}: Omit<ButtonProps, "onClick" | "action"> & {
  action: () => Promise<ActionResult<unknown>>;
  confirm?: { title: string; description: React.ReactNode; confirmLabel?: string; danger?: boolean };
  successMessage?: string;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const run = () =>
    start(async () => {
      try {
        const r = await action();
        setOpen(false);
        if (r.ok) {
          toast(r.message ?? successMessage ?? "Alteração guardada.", "success");
          if (redirectTo) router.push(redirectTo);
          else router.refresh();
        } else toast(r.error, "error");
      } catch {
        toast("Erro de rede. Verifique a ligação e tente novamente.", "error");
      }
    });

  return (
    <>
      <Button {...buttonProps} loading={pending && !confirm} onClick={() => (confirm ? setOpen(true) : run())}>
        {children}
      </Button>
      {confirm && (
        <Modal
          open={open}
          onClose={() => !pending && setOpen(false)}
          title={confirm.title}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button variant={confirm.danger ? "danger" : "primary"} onClick={run} loading={pending}>
                {confirm.confirmLabel ?? "Confirmar"}
              </Button>
            </>
          }
        >
          <div className="text-sm text-muted">{confirm.description}</div>
        </Modal>
      )}
    </>
  );
}
