"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

/**
 * Entrada única para criar funis ("Funil avançado"): nome + produto principal. O funil usa o checkout que já
 * existe para esse produto e abre o editor (etapas, upsells/downsells, página de obrigado, suporte e entrega).
 */
export function NewWizardFunnelButton({
  action,
  products,
  label = "Funil avançado",
  initialProductId,
  testId = "new-wizard-funnel",
}: {
  action: (productId: string, name?: string) => Promise<ActionResult<{ id: string }>>;
  products: { id: string; name: string }[];
  label?: string;
  /** Vindo de "Completar configuração" de um produto: abre já com esse produto escolhido */
  initialProductId?: string;
  testId?: string;
}) {
  const preselected = initialProductId && products.some((p) => p.id === initialProductId) ? initialProductId : undefined;
  const [open, setOpen] = useState(Boolean(preselected));
  const [productId, setProductId] = useState(preselected ?? products[0]?.id ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const productName = products.find((p) => p.id === productId)?.name ?? "";
  const create = () =>
    start(async () => {
      const r = await action(productId, name.trim() || undefined);
      if (!r.ok) {
        setError(r.fieldErrors?.name ?? null);
        return toast(r.error, "error");
      }
      toast(r.message ?? "Funil criado.");
      router.push(`/funis/${r.data!.id}`);
    });
  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid={testId}>
        <Plus className="h-4 w-4" /> {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Novo funil" description="Escolha o produto principal. As compras do checkout desse produto entram no funil: depois do pagamento confirmado seguem para os upsells, downsells e página de obrigado que configurar.">
        {products.length === 0 ? (
          <p className="text-sm text-muted">Ainda não tem produtos. Crie primeiro um produto em Produtos.</p>
        ) : (
          <div className="grid gap-4">
            <Field label="Produto principal">
              {(p) => (
                <Select {...p} value={productId} onChange={(e) => setProductId(e.target.value)} autoFocus data-testid="new-funnel-product">
                  {products.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Nome do funil" error={error ?? undefined} hint="Opcional. Só para si.">
              {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={productName ? `Funil — ${productName}` : "Ex.: Lançamento — Guia"} data-testid="new-funnel-name" />}
            </Field>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={create} loading={pending} disabled={!productId} data-testid="create-wizard-funnel">
            Criar e abrir editor
          </Button>
        </div>
      </Modal>
    </>
  );
}
