"use client";

import { useRef, useState } from "react";
import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";

export interface MetaProductOption {
  id: string;
  name: string;
  status: string;
}

/**
 * Pixel da Meta DESTA conta. O token da API de Conversões nunca é enviado para o browser: o campo começa sempre
 * vazio e só um fragmento (••••abcd) indica que existe. Deixar vazio na edição mantém o token guardado.
 */
export function MetaPixelForm({
  action,
  products,
  initial,
}: {
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  products: MetaProductOption[];
  initial?: { id: string; pixelId: string; tokenHint: string; testEventCode: string; enabled: boolean; productIds: string[] };
}) {
  const form = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState(() => new Set(initial?.productIds ?? []));
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action, {
    onSuccess: () => {
      // o token escrito nunca fica no formulário depois de guardado
      const t = form.current?.elements.namedItem("token") as HTMLInputElement | null;
      if (t) t.value = "";
      if (!initial) {
        form.current?.reset();
        setSelected(new Set());
      }
    },
  });
  const all = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const tid = initial ? `meta-form-${initial.pixelId}` : "meta-form-new";

  return (
    <form ref={form} onSubmit={onSubmit} noValidate autoComplete="off" className="flex flex-col gap-4" data-testid={tid}>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="ID do Pixel" name="pixelId" error={fe.pixelId} hint="Events Manager → Origens de dados → o seu Pixel (só algarismos)." required>
          {(p) => <Input {...p} inputMode="numeric" spellCheck={false} defaultValue={initial?.pixelId ?? ""} placeholder="123456789012345" data-testid="meta-pixel-id" />}
        </Field>
        <Field
          label="Token de acesso da API de Conversões"
          name="token"
          error={fe.token}
          required={!initial}
          hint={initial ? `Guardado: ${initial.tokenHint}. Deixe vazio para manter, ou cole um novo para o atualizar.` : "Events Manager → Definições → API de Conversões → Gerar token de acesso."}
        >
          {(p) => <Input {...p} type="password" autoComplete="new-password" spellCheck={false} placeholder={initial?.tokenHint ?? "Cole o token aqui"} data-testid="meta-token" />}
        </Field>
      </div>
      <Field label="Código de eventos de teste (opcional)" name="testEventCode" error={fe.testEventCode} hint="Só para pagamentos de teste: aparecem no separador “Testar eventos”. As vendas reais são sempre enviadas sem este código.">
        {(p) => <Input {...p} spellCheck={false} defaultValue={initial?.testEventCode ?? ""} placeholder="TEST12345" className="sm:max-w-[240px]" data-testid="meta-test-code" />}
      </Field>

      <fieldset className="flex flex-col gap-2" data-testid="meta-products">
        <legend className="mb-1 text-[13px] font-medium text-fg/90">Produtos que enviam o evento de compra</legend>
        {products.length === 0 ? (
          <p className="text-[12.5px] text-subtle">Ainda não tem produtos. Crie um produto para o poder escolher aqui.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
              <span data-testid="meta-selected-count">
                {selected.size} de {products.length} selecionado(s)
              </span>
              <button type="button" className="min-h-9 rounded-md px-2 font-medium text-accent hover:underline" onClick={() => setSelected(all ? new Set() : new Set(products.map((p) => p.id)))}>
                {all ? "Desmarcar todos" : "Selecionar todos"}
              </button>
            </div>
            <div className="grid max-h-64 grid-cols-1 gap-x-4 overflow-y-auto rounded-[var(--radius-md)] border border-line px-3 py-2 sm:grid-cols-2">
              {products.map((p) => (
                <Checkbox
                  key={p.id}
                  name="productIds"
                  value={p.id}
                  checked={selected.has(p.id)}
                  onChange={(e) => toggle(p.id, e.target.checked)}
                  label={p.name}
                  description={p.status === "ARCHIVED" ? "Arquivado" : p.status === "DRAFT" ? "Rascunho" : undefined}
                  data-testid={`meta-product-${p.id}`}
                />
              ))}
            </div>
            {fe.productIds && (
              <p role="alert" className="text-[12px] font-medium text-danger">
                {fe.productIds}
              </p>
            )}
          </>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Checkbox name="enabled" defaultChecked={initial?.enabled ?? true} label="Integração ativa" description="Desativada: nenhum evento é enviado para este Pixel." data-testid="meta-enabled" />
        <Button type="submit" size="sm" loading={pending} data-testid="meta-save">
          {initial ? "Guardar alterações" : "Guardar Pixel"}
        </Button>
      </div>
    </form>
  );
}
