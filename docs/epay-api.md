# EPay — referência da API (cópia fornecida pelo proprietário, 2026-10-12)

Fonte: https://painel.epay.co.mz/docs/api — texto colado pelo proprietário porque o domínio não era acessível
a partir do ambiente de desenvolvimento. É a referência usada em `src/server/payments/providers/epay.ts`.
Em caso de dúvida, prevalece sempre a versão online.

## Como funciona
1. O servidor cria o pagamento com `POST /v1/payments`.
2. O cliente é enviado para o `payment_url` devolvido; escolhe o método (M-Pesa, e-Mola, IZI) e confirma no telemóvel.
3. Quando o pagamento fica `paid` ou `failed`, a EPay envia um POST assinado para o `callback_url`.
4. A loja confirma a assinatura e dá a encomenda como paga.

HTTPS e JSON. Valores em meticais, como texto com duas casas decimais (`"350.00"`); datas ISO 8601.

## URL base
`https://checkout.epay.co.mz/api/v1`

## Autenticação
`Authorization: Bearer sk_live_xxx` — chave secreta da loja (painel → Integrações → API → Chaves de API).
A chave completa só aparece uma vez. Usar apenas no servidor. Se escapar, revogar e criar outra.

| Chave | Dinheiro | Quando funciona |
|---|---|---|
| `sk_test_…` | Não há dinheiro real (sandbox) | Logo após criar a conta |
| `sk_live_…` | Dinheiro real | Depois de a empresa ser verificada |

Os ambientes não se misturam: um pagamento criado com chave de teste só se consulta/conclui/cancela com chave de teste.

### Como testar (sandbox payIZI/BIM — M-Pesa, e-Mola, IZI), resultado pelo valor em MZN
| Valor (MZN) | Resultado |
|---|---|
| 250 · 500 | O pedido falha logo (erro do banco) |
| 300 · 400 | O pedido sai, e o pagamento é recusado |
| Qualquer outro | O pagamento fica pago |

Nenhum pagamento de teste cobra dinheiro, credita saldo ou conta para receita. Produtos criados no painel e vendidos
pelo checkout da EPay são sempre cobrados em produção.

## Erros
Corpo de erro traz sempre `message`; 422 traz também `errors` (por campo). Todas as respostas trazem `X-Request-Id`.

| Código | Significado |
|---|---|
| 200 | Pedido bem-sucedido |
| 201 | Pagamento criado |
| 401 | Chave em falta, inválida ou revogada |
| 403 | Conta bloqueada, ou chave de produção numa conta ainda não verificada |
| 404 | O pagamento não existe nesta loja ou neste ambiente |
| 422 | Dados inválidos (ver `errors`) |
| 429 | Limite de pedidos excedido (60 pedidos/minuto por IP) |
| 503 | Pagamentos temporariamente suspensos |

## Objecto pagamento
`id` (string) · `status` (`pending` | `paid` | `failed` | `cancelled`) · `amount` (string, MZN) ·
`fee` (string|null, null até pago) · `net_amount` (string|null) · `currency` (sempre `MZN`) · `description` ·
`external_reference` · `payment_type` (`mpesa` | `emola` | `izi` | null) · `payment_url` · `created_at`.

| Estado | Significado |
|---|---|
| pending | Criado, à espera de o cliente pagar |
| paid | Pago e confirmado pelo banco ou pela operadora |
| failed | Recusado, expirado ou não confirmado |
| cancelled | Cancelado pela loja ou reembolsado |

## Criar um pagamento — `POST /v1/payments`
Obrigatórios: `amount` (number, meticais, 1–10 000 000), `currency` (`MZN`), `description` (≤255),
`external_reference` (≤255, volta no webhook).
Opcionais: `customer_name`, `customer_email`, `return_url`, `cancel_url`, `callback_url` (https público),
`image_url`, `product_reference`.
Resposta 201: objecto pagamento com `status: "pending"` e `payment_url`.

## Consultar — `GET /v1/payments/{id}`
Devolve o estado actual. Consultar quando o cliente volta ao `return_url`, mas não dar a encomenda por paga só por
ele ter voltado — confiar no `status`.

## Concluir à mão — `POST /v1/payments/{id}/settle` (não usado pela plataforma)
Marca como pago sem o dinheiro passar pela EPay (`credited: false`).

## Cancelar — `POST /v1/payments/{id}/cancel`
Cancela um pagamento pendente (`reason` opcional). Pagamento já pago → 422 (reembolso pelo painel).
Só funciona em pagamentos criados pela API com chave do mesmo ambiente; fora disso 404.

## Aviso do pagamento (callback por pagamento)
Quando um pagamento criado pela API fica `paid` ou `failed`: `POST <callback_url>`.
Responder 2xx logo. Sem resposta/erro → nova tentativa de 10 em 10 minutos, até 12 vezes durante uma semana.
O mesmo aviso pode chegar mais de uma vez — usar o `id` para não processar duas vezes.

Cabeçalho `X-EducavelPay-Signature`: HMAC-SHA256, em hexadecimal, do corpo em bruto, calculado com a chave secreta (`sk_…`).

```json
{
  "id": "01j9x7a2c3d4e5f6g7h8j9k0",
  "external_reference": "order-1042",
  "status": "paid",
  "amount": "350.00",
  "fee": "35.00",
  "net_amount": "315.00",
  "currency": "MZN",
  "payment_type": "mpesa",
  "paid_at": "2026-09-24T10:17:20+02:00"
}
```

## Webhooks da loja (não usados pela plataforma — opcional)
Eventos `payment.paid`, `payment.failed`, `refund.approved`, `refund.rejected`; cabeçalhos `X-Epay-Event`,
`X-Epay-Delivery`, `X-Epay-Signature: t=<hora>,v1=<assinatura>` = HMAC-SHA256 de `<hora>.<corpo>` com o segredo do
endereço (`whsec_…`); recusar horas antigas (exemplo oficial: 300 s).

## Verificar a assinatura
Usar o corpo exactamente como chegou, antes de converter de JSON, e comparar com função de tempo constante.
