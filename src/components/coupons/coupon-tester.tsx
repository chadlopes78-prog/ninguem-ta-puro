"use client";

import { useState } from "react";
import type { ActionResult } from "@/server/validation/common";
import type { ProductOption } from "@/server/services/products";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";

export function CouponTester({ action, products }: { action: (fd: FormData) => Promise<ActionResult<{ summary: string }>>; products: ProductOption[] }) {
  const [result, setResult] = useState<string | null>(null);
  const { onSubmit, pending, fieldErrors: fe, error } = useFormAction(action, { onSuccess: (d) => setResult(d?.summary ?? null) });
  return (
    <form onSubmit={(e) => { setResult(null); onSubmit(e); }} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate>
      <Field label="Oferta" name="offerId" error={fe.offerId}>
        {(p) => (
          <Select {...p} defaultValue="">
            <option value="">Selecione…</option>
            {products.flatMap((pr) => pr.offers.map((o) => <option key={o.id} value={o.id}>{pr.name} — {o.name} ({formatMoney(o.priceCents, o.currency)})</option>))}
          </Select>
        )}
      </Field>
      <Field label="Código" name="code" error={fe.code}>
        {(p) => <Input {...p} className="font-mono uppercase" maxLength={32} />}
      </Field>
      <Button type="submit" variant="secondary" loading={pending}>Testar</Button>
      {result && !error && <p className="text-sm font-medium text-success sm:col-span-3" role="status">{result}</p>}
    </form>
  );
}
