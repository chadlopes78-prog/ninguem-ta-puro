"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import type { ProductOption } from "@/server/services/products";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useFormAction } from "@/hooks/use-form-action";

export function ManualOrderButton({ action, products, isDemo }: { action: (fd: FormData) => Promise<ActionResult<{ id: string }>>; products: ProductOption[]; isDemo: boolean }) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const product = products.find((p) => p.id === productId);
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {isDemo ? "Pedido de demonstração" : "Pedido manual de teste"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={isDemo ? "Novo pedido de demonstração" : "Novo pedido manual de teste"}>
        <Alert tone={isDemo ? "demo" : "info"} className="mb-4">
          {isDemo
            ? "Pedido fictício, identificado como demonstração e isolado dos dados reais."
            : "Pedidos manuais ficam identificados como teste. Nunca podem ser aprovados sem confirmação do processador de pagamentos, por isso não contam como faturação."}
        </Alert>
        <form id="manual-order" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="Produto" name="productId" error={fe.productId} required>
            {(p) => (
              <Select {...p} value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Selecione…</option>
                {products.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Oferta" name="offerId" error={fe.offerId} required>
            {(p) => (
              <Select {...p} key={productId} defaultValue={product?.offers[0]?.id ?? ""} disabled={!product}>
                {product?.offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} — {formatMoney(o.priceCents, o.currency)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Nome do cliente" name="customerName" error={fe.customerName} required>
            {(p) => <Input {...p} />}
          </Field>
          <Field label="Email do cliente" name="customerEmail" error={fe.customerEmail} required>
            {(p) => <Input {...p} type="email" />}
          </Field>
          <Field label="Estado inicial" name="status" error={fe.status} required>
            {(p) => (
              <Select {...p} defaultValue="PENDING">
                <option value="PENDING">Pendente</option>
                {isDemo && <option value="APPROVED">Aprovado (demonstração)</option>}
                <option value="DECLINED">Falhado</option>
                <option value="CANCELED">Cancelado</option>
              </Select>
            )}
          </Field>
          <Field label="Notas" name="notes" error={fe.notes} className="sm:col-span-2">
            {(p) => <Textarea {...p} rows={2} maxLength={500} />}
          </Field>
        </form>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" form="manual-order" loading={pending}>Criar pedido</Button>
        </div>
      </Modal>
    </>
  );
}
