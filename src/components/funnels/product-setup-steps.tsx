"use client";

// Passos obrigatórios do funil: suporte via WhatsApp e entrega do produto (link externo ou página interna),
// mais o painel com o estado dos requisitos de publicação. A validação final é sempre feita no servidor.
import { useRef } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink, FileText, Globe, Loader2, MessageCircle, PackageOpen, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidDeliveryUrl, normalizeWhatsApp, supportLink, type DeliveryPageInput } from "@/lib/product-setup";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

export interface RequirementView {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  href: string;
}

export function RequirementsPanel({ requirements, stageLabel, onJump, publish }: { requirements: RequirementView[]; stageLabel: string; onJump?: (key: string) => void; publish?: React.ReactNode }) {
  const done = requirements.filter((r) => r.ok).length;
  return (
    <Card data-testid="requirements-panel">
      <CardHeader
        title="Requisitos para publicar o produto"
        description={`${done} de ${requirements.length} concluídos (estado guardado). Guarde o funil para atualizar.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={done === requirements.length ? "success" : "warning"}>{stageLabel}</Badge>
            {publish}
          </div>
        }
      />
      <CardBody>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {requirements.map((r) => (
            <li key={r.key}>
              <button type="button" onClick={() => onJump?.(r.key)} className="flex w-full items-start gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-[13px] hover:bg-surface-2" data-testid={`req-${r.key}`} data-ok={r.ok}>
                {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="font-medium">{r.label}:</span> <span className={r.ok ? "text-success" : "text-warning"}>{r.ok ? "concluído" : "pendente"}</span>
                  {!r.ok && r.detail && <span className="block text-[12px] text-muted">{r.detail}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function SupportStep({ phone, message, onChange, error }: { phone: string; message: string; onChange: (v: { phone: string; message: string }) => void; error?: string }) {
  const normalized = phone ? normalizeWhatsApp(phone) : null;
  const link = supportLink(phone, message);
  return (
    <Card id="suporte" className="scroll-mt-6">
      <CardHeader title="Suporte via WhatsApp" description="Obrigatório. Aparece na página de obrigado (acima do botão de acesso) e na página de entrega. Use o número de suporte deste produto." />
      <CardBody className="grid grid-cols-1 gap-4">
        <Field label="Número de suporte via WhatsApp" error={error} hint="Formato internacional, com indicativo do país. Ex.: +258 84 123 4567. Números moçambicanos (84…) recebem o indicativo 258." required>
          {(p) => <Input {...p} value={phone} onChange={(e) => onChange({ phone: e.target.value, message })} inputMode="tel" placeholder="+258 84 123 4567" maxLength={30} data-testid="support-phone" />}
        </Field>
        <Field label="Mensagem inicial (opcional)" hint="Texto que já aparece escrito quando o cliente abre a conversa.">
          {(p) => <Textarea {...p} value={message} onChange={(e) => onChange({ phone, message: e.target.value })} rows={2} maxLength={300} placeholder="Olá! Comprei o produto e preciso de ajuda." />}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-line px-3 text-[13px] font-medium hover:bg-surface-2" data-testid="support-test">
              <MessageCircle className="h-4 w-4 text-[#25D366]" aria-hidden="true" /> Testar link do WhatsApp
            </a>
          ) : (
            <span className="text-[12.5px] text-warning" data-testid="support-invalid">
              {phone ? "Número inválido — o link não pode ser criado." : "Ainda sem número: o produto fica incompleto."}
            </span>
          )}
          {normalized && <span className="font-mono text-[12px] text-subtle">wa.me/{normalized}</span>}
        </div>
      </CardBody>
    </Card>
  );
}

type Method = "EXTERNAL_LINK" | "INTERNAL_PAGE" | null;

export function DeliveryStep({
  method,
  url,
  page,
  onMethod,
  onUrl,
  onPage,
  files,
  uploading,
  onUpload,
  onRemoveFile,
  errors,
  productName,
  supportOk,
}: {
  method: Method;
  url: string;
  page: DeliveryPageInput;
  onMethod: (m: Method) => void;
  onUrl: (u: string) => void;
  onPage: (p: Partial<DeliveryPageInput>) => void;
  files: { id: string; filename: string; sizeBytes: number }[];
  uploading: boolean;
  onUpload: (f: File) => void;
  onRemoveFile: (id: string) => void;
  errors: Record<string, string>;
  productName: string;
  supportOk: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const urlOk = isValidDeliveryUrl(url);
  const choice = (m: Exclude<Method, null>, icon: React.ElementType, title: string, text: string, testId: string) => {
    const Icon = icon;
    return (
      <button type="button" role="radio" aria-checked={method === m} onClick={() => onMethod(m)} className={cn("flex items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-left transition-colors", method === m ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong")} data-testid={testId}>
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", method === m ? "text-accent" : "text-muted")} aria-hidden="true" />
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-[12.5px] text-muted">{text}</span>
        </span>
      </button>
    );
  };
  const hasContent = Boolean(page.fileId) || isValidDeliveryUrl(page.resourceUrl) || page.bodyText.trim().length >= 10;
  return (
    <Card id="entrega" className="scroll-mt-6">
      <CardHeader title="Entrega do produto" description="Obrigatório. Escolha um dos dois métodos — o botão de acesso da página de obrigado leva o cliente para o método escolhido, só depois do pagamento confirmado." />
      <CardBody className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Método de entrega">
          {choice("EXTERNAL_LINK", Globe, "Usar link externo de entrega", "Área de membros, curso, plataforma de conteúdos ou página de download.", "delivery-external")}
          {choice("INTERNAL_PAGE", PackageOpen, "Criar página de entrega na Ninguém Tá Puro", "Página da plataforma com o seu ficheiro, conteúdo ou link.", "delivery-internal")}
        </div>
        {errors["delivery.method"] && <p role="alert" className="text-[12px] font-medium text-danger">{errors["delivery.method"]}</p>}

        {method === "EXTERNAL_LINK" && (
          <div className="grid grid-cols-1 gap-3" data-testid="delivery-external-section">
            <Field label="Link de acesso ao produto" error={errors["delivery.url"]} hint="Só é mostrado ao cliente depois do pagamento confirmado. O acesso nesse destino depende das permissões da plataforma externa." required>
              {(p) => <Input {...p} value={url} onChange={(e) => onUrl(e.target.value.trim())} placeholder="https://minha-area.com/curso" maxLength={2000} data-testid="delivery-url" />}
            </Field>
            {url && (urlOk ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 w-fit items-center gap-2 rounded-[var(--radius-md)] border border-line px-3 text-[13px] font-medium hover:bg-surface-2" data-testid="delivery-url-test">
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Testar link
              </a>
            ) : (
              <p className="text-[12.5px] text-warning" data-testid="delivery-url-invalid">Link inválido. Use o endereço completo, ex.: https://minha-area.com/curso</p>
            ))}
          </div>
        )}

        {method === "INTERNAL_PAGE" && (
          <div className="grid grid-cols-1 gap-4" data-testid="delivery-internal-section">
            <Field label="Título da página" error={errors["delivery.page.title"]} required>
              {(p) => <Input {...p} value={page.title} onChange={(e) => onPage({ title: e.target.value })} maxLength={140} data-testid="delivery-page-title" />}
            </Field>
            <Field label="Mensagem de boas-vindas">
              {(p) => <Textarea {...p} value={page.welcome} onChange={(e) => onPage({ welcome: e.target.value })} rows={2} maxLength={2000} placeholder="Obrigado pela confiança! Aqui está o seu produto." />}
            </Field>
            <Field label="Instruções para aceder ao produto">
              {(p) => <Textarea {...p} value={page.instructions} onChange={(e) => onPage({ instructions: e.target.value })} rows={3} maxLength={3000} placeholder="Ex.: Descarregue o PDF e guarde-o no telemóvel." />}
            </Field>

            <div className="grid grid-cols-1 gap-2">
              <p className="text-[13px] font-medium">Ficheiro entregue pelo botão (PDF, opcional)</p>
              <input ref={fileInput} type="file" accept="application/pdf" className="sr-only" id="delivery-file" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} data-testid="delivery-file-input" />
              <label htmlFor="delivery-file" className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-surface-2 px-4 py-4 text-sm text-muted hover:border-accent/50 hover:text-fg", uploading && "pointer-events-none opacity-60")}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {uploading ? "A carregar…" : "Carregar PDF (máx. 4 MB)"}
              </label>
              {files.length > 0 && (
                <ul className="flex flex-col gap-2" aria-label="Ficheiros do produto">
                  {files.map((f) => (
                    <li key={f.id} className={cn("flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2", page.fileId === f.id ? "border-accent bg-accent-soft" : "border-line")}>
                      <input type="radio" name="delivery-file-choice" checked={page.fileId === f.id} onChange={() => onPage({ fileId: f.id })} aria-label={`Entregar ${f.filename}`} style={{ accentColor: "var(--color-accent)" }} />
                      <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm">{f.filename}</span>
                      <button type="button" onClick={() => onRemoveFile(f.id)} className="grid h-8 w-8 place-items-center rounded text-subtle hover:text-danger" aria-label={`Eliminar ${f.filename}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                  {page.fileId && (
                    <li>
                      <button type="button" onClick={() => onPage({ fileId: null })} className="text-[12px] text-muted underline">
                        Não entregar ficheiro pelo botão
                      </button>
                    </li>
                  )}
                </ul>
              )}
              {errors["delivery.page.fileId"] && <p role="alert" className="text-[12px] font-medium text-danger">{errors["delivery.page.fileId"]}</p>}
              <p className="text-[12px] text-subtle">O ficheiro fica privado: não tem endereço público. Só quem tem a compra confirmada o descarrega, pelo seu acesso pessoal.</p>
            </div>

            <Field label="Conteúdo apresentado na página (opcional)" error={errors["delivery.page.bodyText"]} hint="Texto simples: aulas, códigos de acesso, passos… Fica visível só para quem comprou.">
              {(p) => <Textarea {...p} value={page.bodyText} onChange={(e) => onPage({ bodyText: e.target.value })} rows={5} maxLength={10000} data-testid="delivery-page-body" />}
            </Field>
            <Field label="Link complementar (opcional)" error={errors["delivery.page.resourceUrl"]}>
              {(p) => <Input {...p} value={page.resourceUrl} onChange={(e) => onPage({ resourceUrl: e.target.value.trim() })} placeholder="https://…" maxLength={2000} data-testid="delivery-page-resource" />}
            </Field>
            <Field label="Texto do botão de acesso" error={errors["delivery.page.buttonText"]} hint="Máximo de 40 caracteres.">
              {(p) => <Input {...p} value={page.buttonText} onChange={(e) => onPage({ buttonText: e.target.value })} maxLength={40} />}
            </Field>
            {!hasContent && <p className="text-[12.5px] text-warning">Adicione pelo menos um ficheiro, um link complementar ou conteúdo — sem isso o produto fica incompleto.</p>}

            <div className="rounded-[var(--radius-lg)] border border-line bg-canvas p-4" data-testid="delivery-preview">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Pré-visualização da página de entrega</p>
              <p className="text-center text-[11px] uppercase tracking-wider text-subtle">{productName}</p>
              <p className="text-center font-display text-lg font-semibold">{page.title || "O seu produto está pronto"}</p>
              {page.welcome && <p className="mt-1 text-center text-[13px] text-muted">{page.welcome}</p>}
              <div className="mt-3 flex flex-col gap-2">
                <span className={cn("flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] font-semibold", !supportOk && "opacity-50")}>
                  <MessageCircle className="h-4 w-4 text-[#25D366]" /> Precisa de ajuda? Fale com o nosso suporte no WhatsApp.
                </span>
                <span className="flex items-center justify-center rounded-lg bg-accent px-3 py-2.5 text-[13px] font-bold uppercase text-accent-ink">{page.buttonText || "ACEDER AO MEU PRODUTO"}</span>
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function SetupLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[12.5px] font-medium text-accent hover:underline">
      {children}
    </Link>
  );
}
