"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";

export function NewFunnelButton({ action, label = "Novo funil" }: { action: (fd: FormData) => Promise<ActionResult<{ id: string }>>; label?: string }) {
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action, { redirectTo: (d) => (d ? `/funis/${d.id}` : undefined) });
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Novo funil" description="Começa com um modelo base: início → checkout → compra aprovada → obrigado.">
        <form id="new-funnel" onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field label="Nome" name="name" error={fe.name} required>
            {(p) => <Input {...p} autoFocus maxLength={100} placeholder="Ex.: Lançamento — Guia" />}
          </Field>
          <Field label="Descrição" name="description" error={fe.description}>
            {(p) => <Textarea {...p} rows={2} maxLength={500} />}
          </Field>
        </form>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="new-funnel" loading={pending}>
            Criar e abrir editor
          </Button>
        </div>
      </Modal>
    </>
  );
}
