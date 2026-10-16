"use client";
// Conceder acesso às credenciais do administrador a um utilizador (um ou os dois gateways).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/validation/common";

export function GrantForm({
  userId,
  gateways,
  action,
}: {
  userId: string;
  gateways: { id: string; name: string; adminActive: boolean; alreadyActive: boolean }[];
  action: (userId: string, providers: string[]) => Promise<ActionResult>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const submit = () =>
    start(async () => {
      const r = await action(userId, selected);
      if (r.ok) {
        toast(r.message ?? "Acesso concedido.", "success");
        setSelected([]);
        router.refresh();
      } else toast(r.error, "error");
    });
  return (
    <div data-testid="grant-form">
      <p className="mb-2 text-[13px] font-medium text-fg">Métodos disponíveis para partilha</p>
      <div className="flex flex-col gap-2">
        {gateways.map((g) => (
          <label key={g.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2 text-[13.5px] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={selected.includes(g.id)} disabled={g.alreadyActive} onChange={() => toggle(g.id)} data-testid={`grant-${g.id}`} />
            <span className="font-medium text-fg">{g.name}</span>
            <span className="ml-auto text-right text-[12px] text-muted">
              {g.alreadyActive ? "Já autorizado" : g.adminActive ? "Ativo na sua conta" : "Inativo na sua conta — só funciona depois de o ativar"}
            </span>
          </label>
        ))}
      </div>
      <Button className="mt-3 w-full sm:w-auto" onClick={submit} disabled={!selected.length || pending} data-testid="grant-submit">
        {pending ? "A conceder…" : "Conceder acesso"}
      </Button>
    </div>
  );
}
