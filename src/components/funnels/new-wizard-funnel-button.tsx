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
  label = "Novo funil",
}: {
  action: (productId: string) => Promise<ActionResult<{ id: string }>>;
  products: { id: string; name: string }[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
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
      <Button onClick={() => setOpen(true)} data-testid="new-wizard-funnel">
        <Plus className="h-4 w-4" /> {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Novo funil" description="Escolha o produto inicial. O funil usa o checkout que já foi gerado para esse produto.">
        {products.length === 0 ? (
          <p className="text-sm text-muted">Ainda não tem produtos. Crie primeiro um produto em Produtos.</p>
        ) : (
          <Field label="Selecionar produto inicial">
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
