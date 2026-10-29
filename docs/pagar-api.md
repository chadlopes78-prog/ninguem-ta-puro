# Pagar API — guia oficial (cópia de referência)

Fonte: https://pagar.co.mz/docs/ai-integration.md (conteúdo fornecido pelo proprietário em 2026-10-29, porque o
domínio não está acessível a partir do ambiente de desenvolvimento). A implementação em
`src/server/payments/providers/pagar.ts` segue **apenas** o que está descrito aqui. Não contém segredos.

**Âmbito implementado na plataforma:** pagamentos C2B (`POST /payments`), consultas (`GET /payments/:id`,
`GET /payments/by-reference/:reference`, `GET /wallet` para verificar as credenciais) e webhooks
(`payment.succeeded` / `payment.failed`). **Não implementado de propósito:** top-ups e payouts (a plataforma não tem
levantamentos nem movimenta saldo dos vendedores).

## 01 Fluxo

O browser ou a app móvel fala com o seu backend; apenas o seu backend fala com a Pagar.

1. O cliente inicia: escolhe o método e informa o número no seu site ou app.
2. O seu backend valida: carrega o pedido e o preço da sua própria base de dados.
3. A Pagar processa: cria a operação e pede confirmação ao M-Pesa ou eMola.
4. O webhook confirma: a Pagar avisa o seu backend quando existe um resultado final.
5. O seu sistema conclui: entrega o produto ou atualiza o saldo apenas depois da confirmação.

Conceitos: App (projeto isolado com ambiente, credenciais, carteira, endereços e histórico próprios); Carteira;
Pagamento (C2B); Top-up; Payout (B2C); Webhook; Reference (ID comercial criado pelo seu sistema; uma entrada
definitivamente falhada pode ser tentada novamente com a mesma reference); Idempotência.

Uma resposta HTTP 202 significa “operação aceite para processamento”. Não significa que o dinheiro já entrou ou saiu.

PayPal Wallet e cartão estão disponíveis apenas no checkout dos produtos digitais vendidos dentro da Pagar. Não fazem
parte da API direta.

## 02 Preparar a app

- Crie uma app para um único projeto. Cada app tem a sua própria key, carteira, histórico e endereços.
- Adicione os endereços (frontend: site usado pelo cliente; backend: servidor que chama a API e recebe o webhook).
- Crie a API key. Copie a API key e o signing secret no momento da criação. Eles não voltam a ser mostrados.
- Adicione o webhook: rota pública do seu backend; guarde o webhook secret.

| Secret | Função |
|---|---|
| API key | Identifica a app e autoriza os endpoints permitidos. |
| Signing secret | Assina cada POST e prova que o body não foi alterado. |
| Webhook secret | Permite ao seu backend confirmar que o webhook veio da Pagar. |

Guarde os três secrets no gestor de variáveis do servidor. Nunca use localStorage, código frontend, aplicação móvel,
URL, screenshot ou Git.

## 03 O que fica protegido

Integração backend-to-backend. O domínio identifica o projeto; a API key identifica a app; o HMAC protege o request
(método, caminho e body); a idempotência protege o efeito. Em LIVE a Pagar revalida app, KYC, aprovação e endereços em
cada chamada. Cabe ao seu backend autenticar o utilizador, verificar permissões e carregar o preço da sua base de
dados. DNS, CORS, Origin e Referer não autenticam o servidor. Nunca aceite preço, título ou permissões do frontend.

## 04 Ligar o backend

Variáveis do servidor:

```
PAGAR_API_BASE_URL=https://api.pagar.co.mz/api/v1
PAGAR_API_KEY=sk_test_xxx
PAGAR_SIGNING_SECRET=sig_test_xxx
PAGAR_WEBHOOK_SECRET=whsec_test_xxx
```

Cliente Node.js (guia):

```js
async function readResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || 'Pedido rejeitado pela Pagar API');
    error.code = data.error;
    error.requestId = data.requestId;
    throw error;
  }
  return data;
}

export async function pagarGet(path) {
  const response = await fetch(API_URL + path, { headers: { Authorization: 'Bearer ' + API_KEY } });
  return readResponse(response);
}

export async function pagarPost(path, body, idempotencyKey) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(18).toString('base64url');
  const rawBody = JSON.stringify(body);
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const url = API_URL + path;
  const canonicalPath = new URL(url).pathname;
  const canonical = [timestamp, nonce, 'POST', canonicalPath, bodyHash].join('\n');
  const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(canonical).digest('hex');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + API_KEY,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'X-Pagar-Timestamp': timestamp,
      'X-Pagar-Nonce': nonce,
      'X-Pagar-Signature': 'v1=' + signature,
    },
    body: rawBody,
  });
  return readResponse(response);
}
```

Pedidos GET usam a API key. Pedidos POST usam também HMAC, timestamp, nonce e Idempotency-Key. A assinatura inclui o
pathname completo, por exemplo `/api/v1/payments`. Ao repetir a mesma operação, mantenha a mesma idempotency key e o
mesmo body; gere apenas timestamp e nonce novos.

## 05 Receber um pagamento C2B — `POST /payments`

Mínimo 20 MZN · Máximo 40 000 MZN · Inteiro.

Body: `reference`, `title`, `description`, `amountMzn`, `method` (`MPESA`/`EMOLA`), `payerPhone`.
Idempotency key no exemplo do guia: `'payment:' + order.id`.

Resposta pública (202):

```json
{ "payment": { "id": "pay_xxx", "status": "PROCESSING", "amountMzn": 2500, "currency": "MZN", "method": "MPESA",
  "environment": "LIVE", "purpose": "PAYMENT", "reference": "pedido-123", "title": "Curso de Excel",
  "description": "Acesso completo", "payerPhone": "*****1234", "providerTransactionId": null, "failureReason": null,
  "paidAt": null, "failedAt": null, "receipt": null } }
```

Guarde `payment.id`. Se a resposta se perder, repita o POST com a mesma idempotency key, consulte pelo ID ou use
`GET /payments/by-reference/:reference` (o retry não dispara um segundo USSD Push). Depois de FAILED ou CANCELLED pode
tentar novamente a mesma reference com uma nova idempotency key, somente quando `retryAllowed` for verdadeiro.
`payerPhone` é o número cobrado e que recebe o recibo. Não aceite `title` ou `amountMzn` do frontend.

## 06 Confirmar antes de entregar

Estados: `PENDING`, `PROCESSING` (não entregue nem inicie outra cobrança), `PAID` (aplicar o efeito uma única vez),
`CANCELLED` (também após três minutos sem confirmação; nova tentativa com nova idempotency key quando
`retryAllowed`), `FAILED` (recusa conclusiva), `RECONCILIATION_REQUIRED` (não entregue e não repita). Use
`safeMessage` na interface. A entrega só pode acontecer com PAID recebido por webhook validado ou confirmado por uma
consulta autenticada.

Webhook (guia):

```js
const rawBody = req.body.toString('utf8');
const eventId = req.header('Pagar-Event-Id');
const signatureHeader = req.header('Pagar-Signature') || '';
const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=')));
const timestamp = parts.t;
const received = parts.v1;
if (!eventId) return res.sendStatus(400);
if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(received)) return res.sendStatus(401);
if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return res.sendStatus(401);
const expected = crypto.createHmac('sha256', process.env.PAGAR_WEBHOOK_SECRET)
  .update(timestamp + '.' + rawBody).digest('hex');
const valid = crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
if (!valid) return res.sendStatus(401);
const event = JSON.parse(rawBody);
// insert com índice UNIQUE em eventId e aplicar a alteração na mesma transação
await processPagarEventOnce(eventId, event);
return res.sendStatus(200);
```

Eventos: `payment.succeeded`, `payment.failed`, `wallet.topup.succeeded`, `wallet.topup.failed`, `payout.succeeded`,
`payout.failed`; `webhook.test` só para o botão de teste do painel. Um pagamento confirmado inclui `receipt.number` e
`receipt.url`. Guarde `Pagar-Event-Id` com índice único: webhooks podem ser repetidos.

## 07–08 Carteira, top-ups e payouts

`POST /wallet/topups`, `POST /payouts`, `GET /payouts/:id` — **não usados nesta plataforma**.

## 09 Consultar e reconciliar

```
GET /wallet
GET /payments/pay_xxx
GET /payments/by-reference/pedido-123
GET /payments?status=PAID&limit=20&cursor=pay_xxx
```

Com o checkout aberto, consulte a cada 10–15 segundos com jitter; pare num estado terminal. HTTP 429: espere o
`Retry-After`.

Erros: 400 (corrija os dados; não repita), 401/403 (key, assinatura, ambiente, estado da app, permissões), 409
(conflito de reference, idempotência, saldo ou estado — consulte antes de decidir), 429 (atraso progressivo com
jitter), 5xx/rede (resultado incerto — repita com a mesma idempotency key e o mesmo body). Toda a resposta de erro
inclui `error`, `message` e, quando disponível, `requestId` (guardar nos logs sem secrets nem telefones completos).

## 10 Testar (TEST, dinheiro fictício)

| Resultado | M-Pesa | eMola |
|---|---|---|
| Sucesso | 840000001 | 860000001 |
| Falha | 840000002 | 860000002 |
| Processamento | 840000003 | 860000003 |

## 11 Passar para LIVE

KYC, endereços LIVE com HTTPS verificados por DNS ou `.well-known`, taxa única de análise, aprovação, mudar a app para
LIVE e criar a key LIVE; trocar as variáveis no servidor e fazer uma operação real de baixo valor. Ao mudar o
ambiente, a key anterior deixa de autenticar; TEST e LIVE ficam separados.
