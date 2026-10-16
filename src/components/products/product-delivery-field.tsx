"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Globe, Loader2, PackageOpen, RefreshCw, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidDeliveryUrl } from "@/lib/product-setup";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/validation/common";

export type DeliveryChoice = "FILE" | "EXTERNAL_LINK" | "INTERNAL_PAGE" | "";
export interface DeliveryFile {
  id: string;
  filename: string;
  sizeBytes: number;
}

const MAX_BYTES = 4 * 1024 * 1024;
const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * "Entrega do produto": como o cliente recebe o produto depois de pagar.
 *  - Ficheiro (PDF): carregado do computador/telemóvel, guardado de forma privada (sem endereço público).
 *  - Acesso online: link da aplicação/área de membros, validado.
 * Produto já existente: o ficheiro é guardado logo ao carregar. Produto novo: fica em memória e é enviado
 * a seguir à criação (o formulário trata disso). Configurações anteriores ("página de entrega") mantêm-se.
 */
export function ProductDeliveryField({
  productId,
  initial,
  errors,
  disabled,
  pendingFile,
  onPendingFile,
  removeFileAction,
  funnelHref,
}: {
  productId: string | null;
  initial: { method: DeliveryChoice; url: string; file: DeliveryFile | null };
  errors: Record<string, string>;
  disabled?: boolean;
  pendingFile: File | null;
  onPendingFile: (f: File | null) => void;
  removeFileAction?: () => Promise<ActionResult<unknown>>;
  funnelHref?: string;
}) {
  const toast = useToast();
  const [method, setMethod] = useState<DeliveryChoice>(initial.method);
  const [url, setUrl] = useState(initial.url);
  const [file, setFile] = useState<DeliveryFile | null>(initial.file);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const urlOk = isValidDeliveryUrl(url);
  const shown: DeliveryFile | null = pendingFile ? { id: "pending", filename: pendingFile.name, sizeBytes: pendingFile.size } : file;

  const pick = async (f: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!f) return;
    setProblem(null);
    if (f.type && f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return setProblem("Formato não suportado. Carregue um ficheiro PDF.");
    if (f.size > MAX_BYTES) return setProblem("O ficheiro tem mais de 4 MB. Reduza o tamanho e tente novamente.");
    if (f.size === 0) return setProblem("O ficheiro está vazio.");
    if (!productId) return onPendingFile(f); // produto novo: enviado depois de criar
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`/api/produtos/${productId}/ficheiros?entrega=1`, { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { file?: DeliveryFile; error?: string };
      if (!res.ok || !j.file) throw new Error(j.error ?? "Não foi possível carregar o ficheiro.");
      setFile(j.file);
      toast("Ficheiro guardado. Fica privado: só compradores com o pagamento confirmado o descarregam.");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Não foi possível carregar o ficheiro.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setProblem(null);
    if (pendingFile) return onPendingFile(null);
    if (!removeFileAction) return;
    setBusy(true);
    const r = await removeFileAction().catch(() => ({ ok: false as const, error: "Erro de rede. Tente novamente." }));
    setBusy(false);
    if (!r.ok) return setProblem(r.error);
    setFile(null);
    toast("Ficheiro removido.");
  };

  const choice = (m: Exclude<DeliveryChoice, "">, Icon: React.ElementType, title: string, text: string, testId: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={method === m}
      disabled={disabled}
      onClick={() => setMethod(m)}
      className={cn("flex min-h-20 items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-left transition-colors disabled:opacity-60", method === m ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong")}
      data-testid={testId}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", method === m ? "text-accent" : "text-muted")} aria-hidden="true" />
      <span>
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="block text-[12.5px] text-muted">{text}</span>
      </span>
    </button>
  );

  return (
    <div className="grid gap-4" data-testid="product-delivery">
      <input type="hidden" name="deliveryMethod" value={method} />
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-fg/90" id="delivery-question">
          Como o cliente vai receber este produto?
        </p>
        <div className={cn("grid grid-cols-1 gap-3", initial.method === "INTERNAL_PAGE" ? "lg:grid-cols-3" : "sm:grid-cols-2")} role="radiogroup" aria-labelledby="delivery-question">
          {choice("FILE", FileText, "Produto digital (PDF)", "Ebook, guia, apostila, worksheet: o cliente descarrega o ficheiro.", "delivery-choice-file")}
          {choice("EXTERNAL_LINK", Globe, "SaaS ou acesso online", "Aplicação, plataforma ou área de membros: o cliente recebe o link.", "delivery-choice-link")}
          {initial.method === "INTERNAL_PAGE" && choice("INTERNAL_PAGE", PackageOpen, "Página de entrega", "Configuração atual (página da plataforma, editada no funil).", "delivery-choice-page")}
        </div>
        {errors.deliveryMethod && <p role="alert" className="text-[12px] font-medium text-danger">{errors.deliveryMethod}</p>}
      </div>

      {method === "FILE" && (
        <div className="grid gap-2" data-testid="delivery-file-panel">
          <span className="text-[13px] font-medium text-fg/90">Carregar ficheiro do produto</span>
          {shown ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2.5" data-testid="delivery-file-current">
              <FileText className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg" data-testid="delivery-file-name">
                  {shown.filename}
                </span>
                <span className="block text-[12px] text-subtle">
                  {size(shown.sizeBytes)} · {pendingFile ? "será guardado ao criar o produto" : "guardado de forma privada"}
                </span>
              </span>
              <label className={cn("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-line px-3 text-[13px] font-medium hover:bg-surface-hover", (busy || disabled) && "pointer-events-none opacity-60")}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Substituir
                <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy || disabled} onChange={(e) => void pick(e.target.files?.[0])} data-testid="delivery-file-replace" />
              </label>
              <button type="button" onClick={() => void remove()} disabled={busy || disabled} className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-[13px] text-muted hover:bg-surface-hover hover:text-danger disabled:opacity-60" data-testid="delivery-file-remove">
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover
              </button>
            </div>
          ) : (
            <label className={cn("flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-surface-2 px-4 py-4 text-sm text-muted hover:border-accent/50 hover:text-fg focus-within:ring-2 focus-within:ring-accent/40", (busy || disabled) && "pointer-events-none opacity-60")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
              {busy ? "A carregar…" : "Escolher PDF do computador ou telemóvel"}
              <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy || disabled} onChange={(e) => void pick(e.target.files?.[0])} data-testid="delivery-file-input" />
            </label>
          )}
          {busy && shown && <p className="flex items-center gap-2 text-[12.5px] text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> A guardar…</p>}
          {(problem || errors.deliveryFileId) && (
            <p role="alert" className="text-[12.5px] font-medium text-danger" data-testid="delivery-file-error">
              {problem ?? errors.deliveryFileId}
            </p>
          )}
          <p className="text-[12px] text-subtle">PDF até 4 MB. O ficheiro não tem endereço público: só é descarregado depois do pagamento confirmado, pelo acesso pessoal do comprador.</p>
        </div>
      )}

      {method === "EXTERNAL_LINK" && (
        <div className="grid gap-2" data-testid="delivery-link-panel">
          <Field label="Link de acesso ao produto" name="accessUrl" error={errors.accessUrl} hint="Endereço da aplicação ou plataforma. Só é mostrado ao comprador depois do pagamento confirmado.">
            {(p) => <Input {...p} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://meusite.com/app" maxLength={2000} disabled={disabled} data-testid="delivery-access-url" />}
          </Field>
          {url &&
            (urlOk ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 w-fit items-center gap-2 rounded-[var(--radius-md)] border border-line px-3 text-[13px] font-medium hover:bg-surface-2" data-testid="delivery-access-test">
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Testar link
              </a>
            ) : (
              <p className="text-[12.5px] text-warning" data-testid="delivery-access-invalid">
                Link inválido. Use o endereço completo, ex.: https://meusite.com/app
              </p>
            ))}
        </div>
      )}

      {method === "INTERNAL_PAGE" && (
        <p className="rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 text-[12.5px] text-muted">
          Este produto usa a página de entrega da plataforma (ficheiro, conteúdo ou link).{" "}
          {funnelHref && (
            <Link href={`${funnelHref}#entrega`} className="font-medium text-accent hover:underline">
              Editar no funil
            </Link>
          )}
        </p>
      )}
      {!method && <p className="text-[12.5px] text-subtle">Escolha uma opção. Sem entrega configurada o produto não pode ser publicado.</p>}
    </div>
  );
}
