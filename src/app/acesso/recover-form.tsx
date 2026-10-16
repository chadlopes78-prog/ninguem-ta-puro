"use client";

import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { recoverAccessAction, type RecoverResult } from "./actions";

export function RecoverAccessForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [usePhone, setUsePhone] = useState(false);
  const [result, setResult] = useState<RecoverResult | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        setResult(await recoverAccessAction({ email, code: usePhone ? "" : code, phone: usePhone ? phone : "" }));
      } catch {
        setResult({ ok: false, error: "Erro de rede. Tente novamente." });
      }
    });
  };
  return (
    <div className="mt-8 flex flex-col gap-5">
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-5" noValidate data-testid="recover-form">
        <Field label="Email usado na compra" required>
          {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.co.mz" data-testid="recover-email" />}
        </Field>
        {usePhone ? (
          <Field label="Telemóvel usado no pagamento" required>
            {(p) => <Input {...p} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="84 123 4567" data-testid="recover-phone" />}
          </Field>
        ) : (
          <Field label="Código da encomenda" required>
            {(p) => <Input {...p} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="NTP-AB12CD34" autoCapitalize="characters" data-testid="recover-code" />}
          </Field>
        )}
        <button type="button" onClick={() => setUsePhone((v) => !v)} className="min-h-9 self-start text-[13px] font-medium text-accent hover:underline">
          {usePhone ? "Tenho o código da encomenda" : "Não tenho o código — usar o telemóvel"}
        </button>
        <Button type="submit" loading={pending} data-testid="recover-submit">
          Recuperar acesso
        </Button>
        {result && !result.ok && (
          <p role="alert" className="text-[13px] font-medium text-danger" data-testid="recover-error">
            {result.error}
          </p>
        )}
      </form>
      {result?.ok && (
        <ul className="flex flex-col gap-3" data-testid="recover-results">
          {result.purchases.map((p) => (
            <li key={p.code} className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
              <p className="text-[12px] text-subtle">
                <span className="font-mono">{p.code}</span> · {p.date} · {p.business}
              </p>
              <p className="mt-1 font-medium">{p.products.join(", ")}</p>
              <a href={p.href} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-accent-ink" data-testid="recover-open">
                Abrir os meus produtos <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
