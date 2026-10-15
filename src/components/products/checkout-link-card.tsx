import Link from "next/link";
import { CheckCircle2, ExternalLink, Paintbrush } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

/** Secção "Link de Checkout" do produto (link gerado automaticamente ao criar o produto). */
export function CheckoutLinkCard({
  productId,
  url,
  path,
  live,
  reason,
  designLabel,
  justCreated,
}: {
  productId: string;
  url: string;
  path: string;
  live: boolean;
  reason?: string;
  designLabel: string;
  justCreated?: boolean;
}) {
  return (
    <Card className={justCreated ? "border-accent/40" : undefined} data-testid="checkout-link-card">
      {justCreated && (
        <div className="flex items-center gap-2 border-b border-accent/20 bg-accent-soft px-5 py-3 text-sm font-medium text-accent" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Produto criado com sucesso! O link do checkout já está pronto a partilhar.
        </div>
      )}
      <CardHeader
        title="Link de Checkout"
        description="Gerado automaticamente para este produto. Mantém-se igual mesmo que altere o nome ou o design."
        action={
          <div className="flex flex-wrap gap-1.5">
            {live ? <Badge tone="success" dot>Pronto a vender</Badge> : <Badge tone="warning">Indisponível</Badge>}
            <Badge>{designLabel}</Badge>
          </div>
        }
      />
      <CardBody className="flex flex-col gap-3">
        <div className="rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2.5">
          <p className="break-all font-mono text-[13px] text-fg" data-testid="product-checkout-url">
            {url}
          </p>
        </div>
        {!live && reason && <p className="text-[12.5px] text-warning">{reason}</p>}
        <div className="flex flex-wrap gap-2">
          <CopyButton value={path} label="Copiar link" size="md" />
          <a href={path} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface-3 px-4 text-sm font-medium hover:bg-surface-hover">
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir checkout
          </a>
          <LinkButton href={`/checkouts/personalizar/${productId}`} variant="secondary">
            <Paintbrush className="h-4 w-4" /> Personalizar checkout
          </LinkButton>
        </div>
        <Link href="/checkouts/avancado" className="-my-1 self-start py-1.5 text-[12.5px] text-muted underline-offset-2 hover:text-fg hover:underline">
          Checkouts adicionais e definições avançadas
        </Link>
      </CardBody>
    </Card>
  );
}
