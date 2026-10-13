"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";

/** Registo de reembolso (parcial ou total). Em pedidos reais regista um reembolso já feito no painel do gateway. */
export function RefundButton({
  remainingLabel,
  remainingInput,
  isDemo,
  gatewayName,
  action,
}: {
  remainingLabel: string;
  remainingInput: string;
  isDemo: boolean;
  gatewayName: string;
  action: (input: { amount: string; reason: string; confirmedAtGateway: boolean }) => Promise<ActionResult<unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(remainingInput);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await action({ amount, reason, confirmedAtGateway: confirmed });
      if (!r.ok) return setError(r.error);
      toast(r.message ?? "Reembolso registado.");
      setOpen(false);
      router.refresh();
    });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="refund-open">
        <RotateCcw className="h-4 w-4" /> Registar reembolso
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Registar reembolso" description={`Pode reembolsar até ${remainingLabel}. Um valor inferior fica registado como reembolso parcial.`}>
        <div className="grid gap-4">
          {!isDemo && (
            <Alert tone="warning">
              A plataforma não devolve dinheiro automaticamente: os reembolsos são feitos no painel do gateway. Faça primeiro o reembolso no painel da {gatewayName} e depois registe-o aqui para atualizar os relatórios e enviar a notificação.
            </Alert>
          )}
          <Field label="Valor a reembolsar (MZN)">{(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="refund-amount" />}</Field>
          <Field label="Motivo (opcional)">{(p) => <Input {...p} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          {!isDemo && (
            <label className="flex items-start gap-2.5 text-sm text-fg">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" data-testid="refund-confirm" />
              Confirmo que este reembolso já foi efetuado no painel da {gatewayName}.
            </label>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} loading={pending} disabled={!isDemo && !confirmed} data-testid="refund-submit">Registar reembolso</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
