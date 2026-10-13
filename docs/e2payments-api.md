# E2Payments — referência usada na integração

Fornecedor: **e2Payments**, da Explicador (Moçambique). Pagamentos M-Pesa e e-Mola em MZN, com confirmação no telemóvel do comprador.

## Fontes

O site da documentação (`https://e2payments.explicador.co.mz/docs`, referência da API em `/docs/api`) **não estava acessível** a partir do ambiente de desenvolvimento: a rede bloqueou o domínio e a pesquisa web não o conseguiu abrir. Por isso, a integração segue apenas o que a própria Explicador publicou e que diz implementar essa API REST:

1. **SDK PHP oficial** — `github.com/Explicador/e2Payments-php-sdk` (`src/Mpesa.php`, README, commit `545fb74`). O README diz: *"It is based on the REST API whose documentation is available on https://e2payments.explicador.co.mz/docs"*.
2. **Aplicação de exemplo oficial** — `github.com/Explicador/Mpesa-eMola-e2PaymentsApp` (`src/pages/Index.vue`, commit `1b3636f`), com M-Pesa e e-Mola.

## O que foi confirmado nessas fontes

| Tema | Confirmado |
|---|---|
| URL base | `https://e2payments.explicador.co.mz` |
| Credenciais | `client_id` e `client_secret` (painel → *Credenciais*); ID da carteira M-Pesa e/ou e-Mola (painel → *Carteiras*), **sem o "#"** |
| Autenticação | `POST /oauth/token`, JSON `{"grant_type":"client_credentials","client_id":…,"client_secret":…}` → resposta com `token_type` e `access_token`. O cabeçalho usado depois é `Authorization: <token_type> <access_token>` |
| Pagamento M-Pesa | `POST /v1/c2b/mpesa-payment/{wallet_id}` |
| Pagamento e-Mola | `POST /v1/c2b/emola-payment/{wallet_id}` |
| Cabeçalhos | `Authorization`, `Content-Type: application/json`, `Accept: application/json`. O SDK envia também `Origin` com o endereço do site |
| Corpo | `{"client_id", "amount", "phone", "reference"}`. O SDK envia também `wallet_id` (marcado "por remover") e `fromApp`; a aplicação de exemplo não os envia |
| Telefone | 9 dígitos sem indicativo. M-Pesa começa por 84/85 e e-Mola por 86/87 (validação da aplicação de exemplo) |
| Respostas | 200 *Request executed successfully*; 201 *The transaction executed successfully*; 400 problema de carteira, origem ou M-Pesa; 401 credenciais; 403 carteira inexistente ou sem acesso; 500 erro do servidor. Os erros podem trazer `message` |
| Natureza da chamada | Síncrona: o SDK espera até 180 s pela resposta (o comprador confirma no telemóvel) |
| Moeda | MZN (carteiras moçambicanas) |

## O que NÃO foi possível confirmar (e como a plataforma lida com isso)

| Tema | Decisão |
|---|---|
| **Notificações/webhooks** e verificação da sua autenticidade | Não documentados → não são aceites (`/api/webhooks/e2payments` responde 404). |
| **Consulta do estado** de uma transação | Não documentada → sem consulta automática. Um pagamento sem resposta (tempo esgotado, falha de rede, 5xx) fica **"por verificar"**: nunca é marcado como pago automaticamente. O dono confirma-o no pedido depois de verificar no painel da E2Payments. |
| Formato completo da resposta de sucesso (ID da transação) | Não é usado. Só o código HTTP 200/201 da chamada autenticada conta como confirmação. A referência guardada é a nossa (`reference`, ex.: `NTPAB23CD45`). |
| Ambiente de testes (sandbox) | Não documentado → as credenciais são tratadas como **produção** (os pagamentos contam como receita). |
| Validade do token, limites de pedidos, formato decimal do valor | O token é pedido a cada pagamento (como no SDK). O valor é enviado em meticais (`1500`, `247.9`). |

## Antes de usar em produção

Fazer **um pagamento real de valor baixo** com cada carteira configurada e confirmar, na aba Pedidos e no painel da E2Payments, que:

- o pedido ficou pago;
- o valor está correto;
- a referência aparece no painel.

Se a documentação oficial indicar notificações ou uma consulta de estado, estas devem ser acrescentadas ao adaptador (`src/server/payments/providers/e2payments.ts`).
