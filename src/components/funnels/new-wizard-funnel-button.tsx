"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

/** Novo funil a partir de um produto: usa o checkout que já existe para esse produto. */
export function NewWizardFunnelButton({
  action,
  products,
  label = "Criar funil",
  initialProductId,
  testId = "new-wizard-funnel",
}: {
  action: (productId: string) => Promise<ActionResult<{ id: string }>>;
  products: { id: string; name: string }[];
  label?: string;
  /** Vindo de "Completar configuração" de um produto: abre já com esse produto escolhido */
  initialProductId?: string;
  testId?: string;
}) {
  const preselected = initialProductId && products.some((p) => p.id === initialProductId) ? initialProductId : undefined;
  const [open, setOpen] = useState(Boolean(preselected));
  const [productId, setProductId] = useState(preselected ?? products[0]?.id ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const create = () =>
    start(async () => {
      const r = await action(productId);
      if (!r.ok) return toast(r.error, "error");
      toast(r.message ?? "Funil criado.");
      router.push(`/funis/${r.data!.id}`);
    });
  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid={testId}>
        <Plus className="h-4 w-4" /> {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Criar funil" description="Selecione um produto da sua conta. A seguir configura o fluxo de compra, a página de obrigado, o suporte WhatsApp e a entrega.">
        {products.length === 0 ? (
          <p className="text-sm text-muted">Ainda não tem produtos. Crie primeiro um produto em Produtos.</p>
        ) : (
          <Field label="Produto">
            {(p) => (
              <Select {...p} value={productId} onChange={(e) => setProductId(e.target.value)} autoFocus>
                {products.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={create} loading={pending} disabled={!productId} data-testid="create-wizard-funnel">
            Criar funil
          </Button>
        </div>
      </Modal>
    </>
  );
}
