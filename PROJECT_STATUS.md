# PROJECT_STATUS — Ninguém Tá Puro

Última atualização: 2026-10-13 · Sessão 7 (E2Payments como segundo gateway, EPay preservada)

## Estado geral

As 7 fases do Documento Mestre estão implementadas. A plataforma opera em **MZN** e tem **dois gateways de pagamento independentes: EPay e E2Payments** (sessão 7). A **integração EPay está implementada conforme a documentação oficial** (checkout alojado, aviso assinado, consulta de estado, cancelamento, idempotência, entrega após confirmação, auditoria). Para ficar ativa só falta definir `EPAY_SECRET_KEY` no servidor e fazer o teste no sandbox da EPay, porque os servidores da EPay não são acessíveis a partir do ambiente de desenvolvimento.

| Verificação | Comando | Resultado (última execução) |
|---|---|---|
| Lint | `npm run lint` | ✅ 0 erros, 0 avisos |
| Tipos TypeScript | `npm run typecheck` | ✅ sem erros |
| Testes unitários + integração | `npm test` | ✅ 174/174 (12 ficheiros; 18 de gateways EPay + E2Payments) |
| Testes E2E (Playwright, build de produção) | `npm run test:e2e` | ✅ 45/45 (9 de pagamentos, 4 de personalização, 3 de gateways) |
| Build de produção | `npm run build` | ✅ sem erros |
| Fuga de segredos | build com `EPAY_SECRET_KEY`, `E2PAYMENTS_CLIENT_ID/SECRET` e `INTEGRATIONS_ENCRYPTION_KEY` fictícias + `grep` em `.next/` e log | ✅ valor ausente do bundle do browser, do output do servidor e do log; nenhuma variável `NEXT_PUBLIC_`; `.env` com segredos fora do Git |

## Fases

| Fase | Estado | Notas |
|---|---|---|
| 1 — Fundação | ✅ Concluída | Next.js 15 + TS + Tailwind 4 + Prisma/PostgreSQL, design system, auth, navegação |
| 2 — Dashboard | ✅ Concluída | 8 KPIs, 4 visualizações, comparação de períodos, filtros, atividade recente, estados vazios |
| 3 — Produtos e checkouts | ✅ Concluída | CRUD, ofertas/preços, checkout principal criado automaticamente com link legível, editor visual com rascunho/publicação |
| 4 — Funis | ✅ Concluída | Editor React Flow, 9 tipos de etapa, upsell/downsell com saídas aceita/recusa, validação, persistência, simulador |
| 5 — Operação | ✅ Concluída | Pedidos (filtros, detalhe, transições), clientes, cupões (com testador), relatórios |
| 6 — Preparação para pagamentos | ✅ Concluída | Abstração de fornecedores, página de integrações, webhooks com assinatura/idempotência (sem fornecedores reais) |
| 7 — Qualidade | ✅ Concluída | Testes, responsividade (320–1440 px), auditoria visual/funcional, build |

## Gateways de pagamento: EPay + E2Payments (sessão 7)

### Análise prévia (antes de alterar código)
- **EPay**: adaptador em `src/server/payments/providers/epay.ts` (checkout alojado, aviso assinado `X-EducavelPay-Signature`, consulta `GET /payments/{id}`, cancelamento). A credencial está só na variável de ambiente `EPAY_SECRET_KEY` (Vercel). Os pedidos são criados por `startRealPayment` (`payment-flow.ts`), que guarda `Order.provider`, `Payment.provider/method/externalId/idempotencyKey`. As confirmações passam por `applyPaymentStatus` (`confirm.ts`), de forma idempotente, vindas do webhook `/api/webhooks/[provider]`, da consulta de estado ou da reconciliação.
- **Pontos de risco identificados**: o registo de fornecedores escolhia "o primeiro configurado" (só um gateway de cada vez) e o checkout só sabia apresentar um fornecedor. Ambos foram generalizados **sem alterar o ficheiro da EPay**: `epay.ts` não foi modificado.

### O que foi implementado
- **E2Payments** (`src/server/payments/providers/e2payments.ts`): token OAuth (`client_credentials`) e depois `POST /v1/c2b/{mpesa|emola}-payment/{wallet_id}`, conforme o SDK e a aplicação oficiais da Explicador. Ver **docs/e2payments-api.md**: o site da documentação não estava acessível a partir do ambiente, e esse ficheiro lista o que foi e o que não foi confirmado.
- **Confirmação E2Payments**: a chamada é síncrona e só um 200/201 dessa chamada autenticada servidor-a-servidor marca o pedido como pago.
  - 400: recusado.
  - 401/403: nada é cobrado e o gateway passa a "Erro de configuração", saindo do checkout até um novo teste de ligação.
  - Tempo esgotado, falha de rede ou 5xx: o pagamento fica **"por verificar"** e nunca é marcado como pago automaticamente. O dono resolve-o no pedido ("Confirmar como pago" ou "Não foi pago") depois de verificar no painel da E2Payments; a resolução fica auditada.
  - Não há webhooks nem consulta de estado documentados, por isso `/api/webhooks/e2payments` responde 404.
- **Vários gateways** (`src/server/payments/gateways.ts`, `registry.ts`):
  - cada gateway tem um estado `enabled` próprio (`IntegrationConfig.enabled`);
  - o checkout usa os gateways **ativados e configurados**; a E2Payments exige ainda a ligação verificada e nenhum erro;
  - cada opção identifica o gateway (`epay`, `e2payments:mpesa`, `e2payments:emola`) e o servidor só cobra no gateway escolhido, se estiver ativo.
- **Desativar** um gateway bloqueia apenas novos pagamentos. As credenciais, a configuração e o histórico ficam, e os webhooks, consultas e reconciliação de pagamentos já iniciados continuam a funcionar.
- **Credenciais E2Payments**: geridas no próprio site, no formulário da aba Integrações, e alteráveis a qualquer momento sem mexer na Vercel. Em alternativa, podem vir de variáveis de ambiente, que têm prioridade.
  - Ficam **cifradas (AES-256-GCM)** na BD. A chave é `INTEGRATIONS_ENCRYPTION_KEY`, se definida; caso contrário, é derivada do segredo do servidor `DATABASE_URL`, que nunca está na BD.
  - Cada valor guarda a versão da chave usada. Se a palavra-passe da BD mudar, o painel avisa e pede as credenciais de novo.
  - O Client Secret nunca é devolvido ao browser e o Client ID aparece mascarado (`••••1234`).
  - Os registos de integração não contêm valores.
- **Aba Integrações → "Gateways de Pagamento"**: dois cartões (EPay e E2Payments) com:
  - estado: Ativo, Inativo, Credenciais por configurar, Erro de configuração ou Ligação não verificada;
  - estado das credenciais;
  - botões Ativar e Desativar;
  - Testar ligação (E2Payments) ou Verificar configuração (EPay, cuja API não documenta um teste);
  - formulário de credenciais da E2Payments.

  **Ativar a E2Payments executa o teste de ligação**: não basta carregar no botão.
- **Checkout**:
  - **Apenas EPay ativa**: apresentação igual à anterior.
  - **Ambos ativos**: o comprador escolhe "EPay — M-Pesa, e-Mola ou IZI", "M-Pesa via E2Payments" ou "e-Mola via E2Payments".
  - **Nenhum ativo**: aparece "Não existem métodos de pagamento disponíveis" e o servidor recusa qualquer tentativa sem criar encomendas.
  - Na E2Payments, o número é validado por operadora (84/85 ou 86/87) e aparece "Confirme o pagamento no telemóvel…" enquanto se espera pela resposta.
- **Base de dados**: migração aditiva `20261013120000_payment_gateways` (colunas `enabled`, `secretConfig`, `verifiedAt`). O registo existente da EPay fica com `enabled = true`; nenhum pedido ou pagamento é alterado. A reversão está documentada no próprio ficheiro.
- **Rastreabilidade**: cada pedido mostra o gateway (EPay/E2Payments), o método, a referência, o estado e as datas de criação e confirmação, e o motivo de falha sem dados sensíveis.

### Testes (cenários pedidos)
| # | Cenário | Onde |
|---|---|---|
| 1 | EPay continua a funcionar com a configuração existente | `gateways.test.ts` + os 24 testes EPay existentes inalterados (`epay.test.ts`) |
| 2 | Credenciais E2Payments não alteram a EPay | `gateways.test.ts` (registo EPay idêntico antes/depois, `EPAY_SECRET_KEY` intacta) |
| 3 | Ativar E2Payments (com ligação verificada) permite usá-la | `gateways.test.ts` (pedido conforme o SDK: URL, cabeçalhos, corpo) |
| 4 | Desativar E2Payments impede novos pagamentos | `gateways.test.ts` (nenhuma chamada nem encomenda) |
| 5 | Desativar EPay preserva a configuração | `gateways.test.ts` |
| 6 | Ambos ativos: o comprador escolhe, cada pagamento vai só ao gateway escolhido | `gateways.test.ts` |
| 7 | Nenhum ativo: sem pagamentos inválidos | `gateways.test.ts` |
| 8 | Transação associada ao gateway correto | `gateways.test.ts` (`Order.provider`, `Payment.provider`) |
| 9 | Pendentes não ficam pagos indevidamente | `gateways.test.ts` (tempo esgotado → por verificar; página de estado/reconciliação não confirma) |
| 10 | Confirmação conforme cada fornecedor | EPay: aviso assinado (`gateways.test.ts`, `epay.test.ts`); E2Payments: 200/201, 400, 401/403, tempo esgotado |
| 11 | Credenciais fora do frontend e dos logs | `gateways.test.ts` + E2E 07 (HTML sem o segredo) + build com segredos fictícios sem fugas |
| 12 | Pagamentos anteriores mantêm o gateway (e confirmam com gateway desativado) | `gateways.test.ts` |
| 13 | Checkout responsivo | E2E 04 (larguras de referência) + E2E 07 (375 px) + verificação visual com os dois gateways |
| 14 | Restantes recursos | suite completa: 174 testes unitários/integração e 45 E2E |

**Dependem de credenciais reais (não executáveis neste ambiente, que não acede às APIs):** o teste de ligação real e um pagamento real M-Pesa e e-Mola na E2Payments, e o teste no sandbox ou um pagamento real na EPay.

### Ficheiros principais
`src/server/payments/providers/e2payments.ts`, `src/server/payments/gateways.ts`, `src/server/payments/registry.ts`, `src/server/secret-box.ts`, `src/server/services/integrations.ts`, `src/server/services/payment-flow.ts` (opções e resolução manual), `src/app/(app)/integracoes/*`, `src/components/integrations/e2payments-form.tsx`, `src/components/checkouts/checkout-view.tsx`, `prisma/migrations/20261013120000_payment_gateways`, `docs/e2payments-api.md`, `tests/integration/gateways.test.ts`, `e2e/07-integrations.spec.ts`.

## Checkout automático por produto e Personalização do Checkout (sessão 6)

### O que mudou
- **Criar um produto cria automaticamente o seu checkout principal e o link público** (na mesma transação). O link usa um endereço legível derivado do nome: `/checkout/handwriting-heroes` (sem acentos; em caso de colisão `-2`, `-3`, …). A secção **Link de Checkout** aparece no topo do produto com o link completo, Copiar link, Abrir checkout, Personalizar checkout e o estado (Pronto a vender / Indisponível + estado da personalização). Ao criar o produto aparece "Produto criado com sucesso! O link do checkout já está pronto a partilhar."
- **Sem duplicados**: `Checkout.primaryProductId` é único na BD (um checkout principal por produto) e `Checkout.slug` é único. Atualizar a página, voltar a guardar ou pedidos em paralelo não criam outro checkout (testado).
- **Link estável**: mudar o nome do produto não altera o endereço; o título do checkout acompanha o nome apenas se ainda não foi personalizado. Links antigos com `publicId` continuam a funcionar.
- **Recuperação**: se um produto não tiver checkout principal (produtos anteriores a esta alteração ou falha), `ensurePrimaryCheckout` cria-o ao abrir o produto ou a lista de personalização; o checkout mais antigo existente passa a principal e mantém o link antigo. A migração marca automaticamente o checkout mais antigo de cada produto como principal (dados preservados).
- O separador do menu chama-se **Personalizar Checkout**: mostra um cartão por produto real (miniatura, nome, preço, estado do produto, estado da personalização — Modelo padrão / Personalização publicada / Alterações por publicar) com o botão **Personalizar Checkout** e pré-visualização. **Não mostra links**: escolhe-se o produto e personaliza-se. Estado vazio: "Ainda não tem produtos. Crie o seu primeiro produto para gerar automaticamente o respetivo link de checkout." com botão para criar produto.
- **O link do checkout está na aba Produtos**: coluna "Link do checkout" na lista com o botão **Copiar link** (e "Abrir checkout" no menu de cada produto), e a secção "Link de Checkout" na página de cada produto. A lista técnica (checkouts adicionais) está em `/checkouts/avancado`, acessível a partir da página do produto.
- **Editor visual** (`/checkouts/personalizar/<produto>`): elementos Cabeçalho do produto (obrigatório), Banner, Texto, Vídeo (YouTube/Vimeo), Depoimentos, Contagem decrescente (data fixa ou por visitante), Benefícios, Garantia, Perguntas frequentes, Imagem e Separador; reordenar/remover; tema (cores, texto do botão, disposição, faixa de anúncio); pré-visualização ao vivo; separadores Editar/Pré-visualizar no telemóvel. **Guardar rascunho** não altera o checkout público; **Publicar** aplica ao checkout do produto (o link mantém-se); **Descartar** volta à versão publicada. Produtos novos usam um modelo padrão profissional (cabeçalho + "Compra segura").
- **O que a personalização não pode alterar**: id do produto, preço, moeda, formulário de compra, integração EPay, regras de confirmação e entrega digital. O design é validado no servidor (Zod, campos desconhecidos removidos, só `https://` em imagens, vídeo apenas YouTube/Vimeo, exatamente um cabeçalho de produto) e o preço continua a vir sempre da BD.
- Produtos em rascunho, despublicados ou arquivados, ou checkouts desativados, mostram "Link indisponível" e não aceitam compras. O checkout principal não pode ser eliminado (só desativado).
- Todas as ações passam por `guarded()` (sessão obrigatória) e validam que o produto pertence ao âmbito atual (real/demo).

### Testes (cenários pedidos)
| # | Cenário | Onde |
|---|---|---|
| 1 | Criar produto gera link automaticamente | integração + E2E 02/05 |
| 2 | Atualizar a página não altera nem duplica | integração (incl. pedidos em paralelo) + E2E 02 |
| 3 | Vários produtos têm links próprios | integração + E2E 06 |
| 4 | Copiar e abrir o link público | E2E 02 (copiar na lista de produtos e na página do produto, abrir em nova janela; aba Personalizar Checkout sem links) |
| 5 | Personalizar um produto não afeta outros | integração + E2E 06 |
| 6 | Rascunho não substitui a versão publicada | integração + E2E 06 |
| 7 | Publicar aparece no checkout correto | integração + E2E 06 |
| 8 | Renomear mantém o link | integração + E2E 06 |
| 9 | Preço e moeda validados no servidor | integração (design não injeta preço; compra usa o preço da BD) |
| 10 | Fluxo EPay continua a funcionar | integração (compra via slug) + E2E 05 completo |
| 11 | Permissões e proteção dos dados | integração (âmbito real/demo, checkout principal não eliminável, slugs inválidos) + E2E 01 |
| 12 | Computador e telemóvel | E2E 04 (sem deslocamento horizontal em 6 larguras, incl. novas rotas) + E2E 06 (375 px) + verificação visual |

### Ficheiros principais
`prisma/migrations/20261013090000_checkout_per_product_design`, `src/server/services/primary-checkout.ts`, `src/server/services/checkout-design.ts`, `src/lib/checkout-design.ts`, `src/components/checkouts/{design-editor,checkout-blocks,checkout-view}.tsx`, `src/components/products/checkout-link-card.tsx`, `src/app/(app)/checkouts/{page.tsx,avancado,personalizar}`, `tests/integration/checkout-personalization.test.ts`, `e2e/06-personalization.spec.ts`.

## Integração EPay / MZN (sessões 2 e 3)

### Estado

A **integração EPay está implementada conforme a documentação oficial**. O proprietário colou a documentação na sessão 3; a cópia de referência está em [`docs/epay-api.md`](./docs/epay-api.md). A integração fica ativa assim que `EPAY_SECRET_KEY` estiver definida no servidor.

**Ainda não foi testada contra os servidores reais da EPay**: `painel.epay.co.mz` e `checkout.epay.co.mz` estão bloqueados pela política de rede do ambiente de desenvolvimento. Todos os testes usam respostas simuladas no formato exato da documentação. Antes de vender a sério, fazer o teste no sandbox descrito abaixo. **Não declarar produção pronta antes disso.**

### Como funciona (conforme a documentação)

1. O checkout envia nome, email e uma chave de idempotência (nunca o preço). O servidor cria a encomenda `PENDING` e chama `POST https://checkout.epay.co.mz/api/v1/payments` com `Authorization: Bearer <EPAY_SECRET_KEY>` e os campos:
   - `amount` — número em meticais, calculado a partir dos cêntimos guardados na BD;
   - `currency: "MZN"`;
   - `description`;
   - `external_reference` — referência única da tentativa, `NTP-XXXXXXXX-xxxxxxxx`;
   - `customer_name`, `customer_email`;
   - `return_url` → `/pagamento/<token>`;
   - `cancel_url` → `/pagamento/<token>?desistiu=1`;
   - `callback_url` → `<APP_BASE_URL>/api/webhooks/epay` (só enviado quando é HTTPS);
   - `image_url` (opcional).
2. O comprador é redirecionado para o `payment_url`; só se aceitam URLs `https://checkout.epay.co.mz/…`. Escolhe M-Pesa, e-Mola ou IZI e confirma no telemóvel. Se a EPay devolver um valor ou moeda diferentes, o pagamento é cancelado e o comprador não é redirecionado.
3. Aviso por pagamento (`POST /api/webhooks/epay`):
   - a assinatura `X-EducavelPay-Signature` é verificada como HMAC-SHA256 hexadecimal do corpo bruto, com a chave `sk_…` e comparação em tempo constante;
   - inválida → 401;
   - aceite (incluindo duplicados ou rejeitados por valor/moeda) → 200, para não haver reenvios inúteis;
   - idempotência por `id:status`, porque a EPay reenvia de 10 em 10 minutos até 12 vezes.
4. Só depois de validar referência, montante (`"1500.00"` → 150000 cêntimos) e moeda é que a encomenda passa a **Paga**. Nesse momento regista-se a `fee` da EPay (líquido = valor − fee), cria-se o acesso ao produto e regista-se a auditoria.
5. Consulta `GET /v1/payments/{id}`:
   - quando o comprador regressa ou a página de estado atualiza (no máximo de 8 em 8 s por pagamento, para respeitar o limite de 60 pedidos/min);
   - no botão **Integrações → Verificar pagamentos pendentes** (reconciliação).

   Mapeamento de estados: `pending` → pendente · `paid` → paga · `failed` → falhada · `cancelled` → cancelada.
6. Cancelar no painel uma encomenda pendente chama primeiro `POST /v1/payments/{id}/cancel`. Se a EPay responder 422 (já paga), o cancelamento é recusado e o estado é atualizado para pago. O reembolso faz-se no painel da EPay.
7. Erros da API (401/403/422/429/503) ou falha de rede ao criar o pagamento: nada é criado nem cobrado; a encomenda é cancelada, o cupão é libertado e o comprador vê "Não foi possível iniciar o pagamento. Nada foi cobrado…" e pode tentar de novo. O código HTTP e o `X-Request-Id` ficam no registo de integrações; a chave nunca fica.
8. **Chave de teste (`sk_test_…`)**: as encomendas ficam marcadas como "Pagamento de teste" e **não contam como receita** no dashboard, nos relatórios nem nos clientes. O checkout mostra "Ambiente de teste da EPay".
9. **Chave de produção (`sk_live_…`)**: só fica ativa com `APP_BASE_URL` em HTTPS, para os avisos chegarem.

Não usado (documentado como opcional): `POST /v1/payments/{id}/settle` (marca como pago sem dinheiro) e os "Webhooks da loja" (`X-Epay-Signature` com `whsec_…`). O aviso por pagamento cobre as vendas feitas por esta plataforma.

### Testes executados (resultado real)

| Suite | Resultado |
|---|---|
| `npm test` (unitários + integração) | ✅ 139/139 — inclui 24 testes EPay (`tests/integration/epay.test.ts`) e 17 do fluxo genérico (`payments.test.ts`) |
| `npm run test:e2e` (build de produção) | ✅ 38/38 — inclui 9 do fluxo de pagamento no navegador (fornecedor de teste local) |
| `npm run lint` / `typecheck` / `build` | ✅ sem erros |
| Verificação manual: servidor de produção com chave `sk_test_` fictícia | ✅ checkout mostra o modo EPay (M-Pesa, e-Mola ou IZI · ambiente de teste); ao pagar, a rede bloqueada fez falhar o pedido à EPay → encomenda cancelada, nada cobrado, mensagem segura ao comprador, chave ausente dos logs |
| Fuga de segredos | ✅ chave ausente do bundle do browser, do output do servidor e dos logs; nenhuma variável `NEXT_PUBLIC_`; `.env` com segredos fora do Git |

Os testes EPay cobrem:
- formato exato do pedido (URL, método, cabeçalho Bearer, campos e valores);
- preço vindo da BD (o valor enviado pelo browser é ignorado);
- `callback_url` só com HTTPS;
- erros 401/403/422/429/503 e falha de rede;
- `payment_url` fora do domínio da EPay e valor divergente;
- idempotência da submissão;
- aviso pago com taxa, reenvios duplicados, assinatura de outra chave, corpo alterado, cabeçalho em falta, assinatura em maiúsculas;
- valor/moeda divergentes, aviso falhado, pagamento desconhecido;
- consulta `paid`/`failed`/`cancelled`, 429 na consulta, reconciliação;
- cancelamento (200 e 422);
- receita: teste vs produção;
- configuração: teste/produção, HTTPS e formato da chave, sem expor o segredo.

### O que falta fazer (do teu lado)

1. **Chave de teste**: no painel da EPay → Integrações → API → Chaves de API, criar uma chave `sk_test_…`. A chave completa só aparece uma vez.
2. **Definir no servidor** (nunca no código nem na conversa):
   - **Local**: `cp .env.example .env` e preencher `EPAY_SECRET_KEY` e `APP_BASE_URL`. O `.env` está no `.gitignore`.
   - **Alojamento**: definir `EPAY_SECRET_KEY` e `APP_BASE_URL` (HTTPS, ex.: `https://loja.exemplo.co.mz`) nas variáveis secretas do projeto.
3. **Verificar**: Integrações → "Verificar configuração" deve mostrar ✓ e "Ativo · Teste".
4. **Teste no sandbox** (resultado decidido pelo valor em MZN): criar produtos de teste com estes preços e comprar pelo checkout:
   - **100 MZN** (qualquer outro valor) → deve ficar **Pago**, com acesso ao produto;
   - **300 MZN** ou **400 MZN** → pagamento recusado → **Falhado**;
   - **250 MZN** ou **500 MZN** → o pedido falha logo (erro do banco) → **Falhado** na página da EPay ou "não iniciado".

   Confirmar em cada caso a página de estado, o detalhe da encomenda (pagamentos, avisos, auditoria) e o registo em Integrações. Para receber os avisos, `APP_BASE_URL` tem de ser um endereço HTTPS público; em `localhost` funciona apenas a consulta de estado.
5. **Produção**: com a empresa verificada na EPay, trocar para `sk_live_…` no alojamento, fazer uma compra real de valor baixo e confirmar que fica "Paga" e conta como receita.
6. **Se uma chave for exposta**: revogá-la no painel da EPay, criar outra e atualizar a variável no alojamento.

### Outras pendências

- Reembolsos: feitos no painel da EPay; o estado `cancelled` chega pela consulta. Podem ser sincronizados automaticamente através dos "Webhooks da loja" (`refund.approved`), que exigiriam um novo segredo `EPAY_WEBHOOK_SECRET` (`whsec_…`) — opcional, não implementado.
- Upsell/downsell com pagamento real: exige um novo pagamento EPay por oferta; hoje só existe como simulação em modo demo.
- Envio do link de acesso por email: a EPay envia o recibo ao `customer_email`, mas o link de acesso ao produto só aparece na página de estado.
- Agendamento automático da reconciliação (ex.: cron a cada 15 min); hoje é manual, pelo botão em Integrações.

### Ficheiros principais

`docs/epay-api.md` · `src/server/payments/providers/epay.ts` · `src/server/payments/{types,confirm,webhooks,registry}.ts` · `src/server/services/{payment-flow,orders,metrics,integrations}.ts` · `src/components/checkouts/checkout-view.tsx` · `src/app/checkout/[publicId]/page.tsx` · `src/app/pagamento/[token]/page.tsx` · `src/app/(app)/integracoes/*` · `src/app/(app)/pedidos/*` · `src/lib/money.ts` · `prisma/schema.prisma` + migração `20261012080000_epay_hosted_checkout` · `.env.example` · `tests/integration/epay.test.ts` · `e2e/05-payments.spec.ts`.

## Deploy na Vercel

Causa do erro "Application error: a server-side exception has occurred" no primeiro deploy: a aplicação arrancou **sem base de dados configurada** (`DATABASE_URL`) ou **sem as tabelas criadas**, porque o build não aplicava as migrações. Foi reproduzido localmente: com uma BD vazia, `/login` respondia 500.

Correções (sessão 4):
- Novo script `vercel-build` (a Vercel usa-o automaticamente). Executa `scripts/check-env.mjs` (falha o build com uma mensagem clara se faltar `DATABASE_URL`), `prisma generate`, `prisma migrate deploy` (usa `DATABASE_URL_UNPOOLED` quando existir, como na integração Neon) e `next build`.
- `postinstall: prisma generate`.
- Se a instalação estiver incompleta, `/login` e `/setup` mostram a página **"Configuração incompleta"**, que indica o que falta sem revelar valores, em vez de um erro genérico.
- `GET /api/health` devolve o estado da BD (`ok`, `missing_url`, `unreachable`, `not_migrated`) e se cada variável existe (nunca o valor).
- Página de erro global com a referência (digest) para procurar nos logs.

Testado localmente:
- sem `DATABASE_URL` → página de configuração e health `missing_url`;
- BD vazia → página de configuração e health `not_migrated`;
- `npm run vercel-build` numa BD vazia → 4 migrações aplicadas e build OK;
- `check-env` sem `DATABASE_URL` → build falha com instruções.

Passos na Vercel:
1. **Project → Storage → Create Database → Neon (Postgres)** e ligar ao projeto. Isto define `DATABASE_URL` (e `DATABASE_URL_UNPOOLED`) em Production e Preview. Em alternativa, usar outro PostgreSQL e definir `DATABASE_URL` manualmente.
2. **Settings → Environment Variables**: `EPAY_SECRET_KEY` (Type Secret). `APP_BASE_URL` **já não é obrigatória na Vercel**: o endereço é detetado automaticamente através de `VERCEL_PROJECT_PRODUCTION_URL` ou, em último caso, do domínio do pedido (sempre HTTPS na Vercel). Defina-a apenas para forçar um domínio próprio. Não definir `DEMO_TOOLS_ENABLED` em produção.
3. **Deployments → Redeploy** (o build cria as tabelas).
4. Abrir `https://ninguem-ta-puro.vercel.app/api/health` → deve devolver `"ok": true`.
5. Abrir `/setup` e criar a conta de proprietário. **Faça-o logo após o deploy**: a primeira pessoa a abrir `/setup` cria a conta.
6. **Settings → Git → Production Branch**: o repositório só tem o ramo `claude/jolly-babbage-eg28n3`. Ou se define esse ramo como Production Branch, ou se faz merge para `main` (por exemplo, através de um pull request).

## Funcionalidades concluídas e verificadas (sessão 1)

Cada item abaixo tem verificação automática (unitária, integração ou E2E) e/ou verificação manual no browser.

- **Autenticação**: configuração inicial do proprietário (`/setup`, só uma vez), login, logout, sessões em BD (token aleatório guardado só como hash SHA-256, cookie httpOnly/SameSite), passwords com scrypt, limite de tentativas falhadas (por email+IP na BD e por IP em memória), alteração de password revoga sessões. Middleware + `requireUser()` em todas as páginas e server actions.
- **Dashboard**: faturação bruta, aprovados, total, ticket médio, conversão (só com sessões), líquido estimado, pendentes, reembolsos; gráficos de faturação (vs. período anterior), pedidos por dia, desempenho por produto, distribuição de estados; filtros hoje/7/30/90 dias/este mês/mês anterior/personalizado; seletor de moeda quando há várias.
- **Produtos**: lista com pesquisa, filtros (estado, tipo) e ordenação; criar/editar/duplicar/publicar/despublicar/arquivar/restaurar; validação; preço em cêntimos + moeda; preço de referência (promoção); ofertas alternativas (único/parcelado/assinatura — só estrutura).
- **Checkouts**: produto + oferta, título, descrição, imagem, botão, cores, campos (telefone/documento, opcionais ou obrigatórios), cupões, página de sucesso, funil associado, ativar/desativar, duplicar, eliminar (se sem pedidos), pré-visualização ao vivo e dedicada, link `/checkout/<id aleatório de 14 caracteres>`, copiar link.
- **Checkout público**: produto, descrição, preço, resumo, cupão validado no servidor, espaço para métodos de pagamento futuros, suporte, rodapé; nunca pede cartão; em modo real informa que o pagamento não está configurado e **não cria pedido**; links inativos/inexistentes mostram página de indisponibilidade genérica; sessões de checkout registadas para conversão.
- **Funis**: criar/nomear, adicionar/mover/remover etapas, ligar com setas, zoom/pan/minimapa, guardar e reabrir, duplicar, ativar/desativar, validação ao vivo (erros bloqueiam ativação: etapas incompletas, ligações inválidas, produtos/ofertas/checkouts inexistentes ou arquivados, destinos aceita/recusa em falta, ciclos), aviso de alterações por guardar, simulador local dos caminhos aceitar/recusar.
- **Percurso pós-compra (demo)**: compra simulada → `/oferta/<run>` → upsell → (recusa) downsell → obrigado; itens UPSELL/DOWNSELL adicionados ao pedido de demonstração; decisões idempotentes; eventos analíticos registados.
- **Pedidos**: lista com pesquisa (código/nome/email), filtros por estado/período/produto, paginação, detalhe completo; pedidos manuais de teste (nunca aprovados fora do modo demo); cancelamento de pendentes; aprovar/recusar/reembolsar só em modo demo (simulação).
- **Clientes**: lista com pesquisa e filtro "com compras"; detalhe com histórico, nº de pedidos, compras confirmadas por moeda, primeiro pedido; documento mascarado.
- **Cupões**: código único por âmbito, percentagem ou valor fixo (com moeda), produtos elegíveis, datas (fim inclusivo no fuso do negócio), limite de utilizações (consumo atómico), estado; testador sem consumir utilizações.
- **Relatórios**: KPIs, faturação vs. período anterior, produtos mais vendidos, composição por tipo de item (principal/upsell/downsell/oferta adicional), desempenho por checkout (sessões, submissões, aprovados, conversão), desempenho de funis (visualizações, aceites, recusas, taxa), secção de definições e limitações.
- **Integrações**: catálogo informativo (Stripe, Mercado Pago, Pagar.me, ifthenpay) sem credenciais inventadas; "Verificar estado" honesto (nunca mostra ligado sem implementação+credenciais); registo de integrações.
- **Configurações**: nome, logótipo, proprietário, emails, moeda padrão, idioma/região, fuso horário; modo de demonstração (ativar/desativar, gerar, remover); alteração de password.
- **Modo de demonstração**: dados com `isDemo = true`, isolados em todas as consultas; badge "DADOS DE DEMONSTRAÇÃO" e faixa global; conjunto seed com 12.450,00 / 42 aprovados / 3 pendentes / 1 reembolso / pedidos A–E em todos os estados / cupões TESTE10, EXPIRADO, ESGOTADO, CURSO50 / funil com upsell 97,00 e downsell 47,00; nunca criado automaticamente; só gerável com `DEMO_TOOLS_ENABLED=true`; remoção segura.
- **Responsividade**: sidebar recolhível (desktop), gaveta (mobile), tabelas → cartões em ecrãs pequenos, construtor de funis empilhado no telemóvel, sem scroll horizontal em 320/375/390/768/1024/1440 px (teste E2E).

## Decisões técnicas

| Tema | Decisão | Motivo |
|---|---|---|
| Stack | Next.js 15.5 (App Router, Server Actions), React 19, TypeScript estrito, Tailwind 4 | Recomendado pelo documento; versões estáveis |
| BD/ORM | PostgreSQL 16 + Prisma 6.19 | Migrações, tipos, relações e índices |
| Dinheiro | Inteiros em cêntimos + `Currency` explícita; parsing próprio de "1.234,56"/"1,234.56"; arredondamento half-up | Sem vírgula flutuante; moedas nunca somadas |
| IDs | `cuid` interno; `publicId` de checkout com 14 caracteres aleatórios (crypto); códigos de pedido `NTP-XXXXXXXX` | Não sequenciais/previsíveis |
| Auth | Implementação própria com sessões em BD | Aplicação de utilizador único; sem dependências extra; testável |
| Demo vs real | Coluna `isDemo` em todas as entidades + `Settings.demoMode` decide o âmbito | Isolamento total e remoção simples |
| Métricas | Calculadas no servidor a partir de pedidos persistidos (funções puras testadas) | Consistência entre dashboard e relatórios |
| Faturação bruta | Soma dos pedidos **APROVADOS** criados no período (após descontos) | Reembolsados deixam de estar aprovados → listados à parte, sem dupla subtração |
| Líquido | Bruto − taxas registadas nos pedidos (sem custos estimados) | "Não inventar custos ausentes" |
| Conversão | Aprovados com checkout de origem ÷ sessões de checkout × 100; `—` sem sessões | Definição do documento |
| Fuso horário | Agrupamento por dia no fuso das Configurações (`America/Sao_Paulo` por omissão) | Datas consistentes |
| Funis | Grafo guardado em `FunnelStep`/`FunnelEdge` (chave estável por funil); gravação transacional; validação partilhada cliente/servidor | Mesmas regras no editor e na ativação |
| Gráficos | Recharts (área/barras) + barras HTML com rótulos diretos | Legíveis em mobile; paleta validada (lima vs. cinzento tracejado, ΔE CVD 39.9) |
| Pagamentos | Interface `PaymentProvider` + registo vazio; webhooks com HMAC em tempo constante, idempotência por `(provider, externalEventId)`, validação de valor/moeda/estado | Preparado; nada processa cobranças |
| Rate limiting | BD para login (email+IP); memória para endpoints públicos | Suficiente para instância única (ver pendências) |
| Testes | Vitest (BD `ntp_test`, limpeza por TRUNCATE com guarda pelo nome da BD); Playwright contra `next start` | Prisma bloqueia `migrate reset` por agentes — não foi contornado |

## Modelo de dados (resumo)

`User`, `Session`, `LoginAttempt` · `Product`, `Offer` · `Checkout`, `CheckoutSession` · `Funnel`, `FunnelStep`, `FunnelEdge`, `FunnelRun` · `Customer`, `Order`, `OrderItem` · `Coupon`, `CouponProduct` · `AnalyticsEvent` · `Settings` · `IntegrationConfig`, `IntegrationLog` · `PaymentEvent`. Esquema completo em `prisma/schema.prisma`; migração inicial em `prisma/migrations/`.

## Como continuar (instruções exatas)

```bash
# 1. PostgreSQL (no contentor de desenvolvimento usado nesta sessão)
pg_ctlcluster 16 main start
# criar utilizador/BDs se ainda não existirem:
su postgres -c "psql -c \"CREATE USER ntp WITH PASSWORD 'ntp' CREATEDB;\" -c \"CREATE DATABASE ntp OWNER ntp;\" -c \"CREATE DATABASE ntp_test OWNER ntp;\""

# 2. Dependências e ambiente
npm install
cp .env.example .env            # ajustar DATABASE_URL (e, quando houver, as variáveis EPAY_*)
npx prisma migrate deploy        # ou: npm run db:migrate (desenvolvimento)

# 3. Utilizador proprietário (ou abrir /setup no browser)
npm run user:create -- dono@exemplo.com "Nome" "password-com-10+-caracteres"

# 4. (opcional) Dados de demonstração
npm run db:seed-demo             # requer DEMO_TOOLS_ENABLED=true
npm run db:clear-demo

# 5. Desenvolvimento
npm run dev                      # http://localhost:3000

# 6. Qualidade
npm run lint && npm run typecheck && npm test
npm run build
npm run test:e2e                 # usa ntp_test, porta 3100; exige build prévio
# Em ambientes com Chromium pré-instalado:
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
```

## Pendências e próximos passos

1. **EPay**: definir `EPAY_SECRET_KEY` (`sk_test_…`) e `APP_BASE_URL`, fazer o teste no sandbox e depois uma transação real de valor baixo com `sk_live_…` (ver "O que falta fazer"). **Não declarar produção pronta antes disso.**
2. Reembolsos reais através da API EPay (se a API os suportar); hoje só existem como simulação em modo demo.
3. Upsell/downsell com pagamento real: exige uma nova cobrança por oferta e só funciona em modo demo (simulação).
4. Envio do link de acesso por email (não há fornecedor de email); hoje o acesso é mostrado na página de estado após confirmação.
3. Rate limiting de endpoints públicos em memória → mover para armazenamento partilhado (Redis) se houver várias instâncias.
4. Upload de imagens: atualmente por URL; adicionar armazenamento de ficheiros (ex.: S3/Blob) se necessário.
5. Envio de emails (confirmação/acesso) — sem fornecedor de email configurado.
6. Exportação CSV de relatórios/pedidos (não pedida explicitamente; útil).
7. Conversão entre moedas: não implementada por decisão (moedas são apresentadas separadamente).
8. Prompt de auditoria visual/funcional (secções 24–25) executado nesta sessão de forma resumida; repetir após integrar pagamentos.

## Problemas conhecidos

- `next lint` está obsoleto no Next 15.5; o script `lint` usa o ESLint CLI diretamente.
- Os testes não usam `prisma migrate reset` (bloqueado pelo Prisma para agentes de IA); a BD de teste é limpa com `TRUNCATE` (apenas quando `DATABASE_URL` contém `/ntp_test`).
- O seletor de "pedidos manuais de teste" no modo real só permite Pendente/Recusado/Cancelado — intencional.

## Registo de sessões

- **Sessão 7e (2026-10-13)**: causa provável do `invalid_client` encontrada na integração anterior do dono (Lovable/NEXAPAY): a E2Payments serve a API em dois domínios, `e2payments.explicador.co.mz` (original) e `mpesaemolatech.com` (novo), e algumas contas só autenticam num deles. A plataforma passa a tentar os dois, memoriza o que aceita as credenciais (aparece no cartão como "Servidor") e paga nesse domínio; o valor passa a ser enviado em texto. 180 testes a passar.
- **Sessão 7d (2026-10-13)**: `invalid_client` persistente com credenciais corretas. O pedido de token passa a tentar as três formas OAuth padrão (JSON, formulário, HTTP Basic), cada uma também com os campos trocados, e deteta segredos copiados mascarados ou cifrados (`$2y$…`); 179 testes a passar.
- **Sessão 7c (2026-10-13)**: "A E2Payments rejeitou o Client ID ou o Client Secret" — o teste de ligação passa a mostrar o erro exato devolvido pela E2Payments (ex.: `invalid_client`), deteta e corrige automaticamente Client ID/Secret colados nos campos trocados (os exemplos oficiais da Explicador mostram formatos contraditórios) e remove espaços invisíveis/aspas coladas; 177 testes a passar.
- **Sessão 7b (2026-10-13)**: credenciais da E2Payments configuráveis no site sem nenhuma variável na Vercel (cifra com chave derivada do segredo do servidor quando `INTEGRATIONS_ENCRYPTION_KEY` não existe); 174 testes e 45 E2E a passar.
- **Sessão 7 (2026-10-13)**: E2Payments adicionada como segundo gateway sem alterar a EPay (`epay.ts` intacto). Ativação e desativação independentes, credenciais cifradas, checkout com vários gateways, pagamentos "por verificar" com resolução manual auditada. Documentação oficial inacessível a partir do ambiente: implementação baseada no SDK e na aplicação oficiais da Explicador (docs/e2payments-api.md). 174 testes unitários/integração e 45 E2E a passar; build OK; sem fugas de segredos.
- **Sessão 6b (2026-10-12)**: aba renomeada para "Personalizar Checkout" e sem links (só escolher o produto e personalizar); link do checkout com "Copiar link" na lista de Produtos; 156 testes unitários/integração e 42 E2E a passar.
- **Sessão 6 (2026-10-12)**: checkout principal gerado automaticamente com cada produto (link legível estável, sem duplicados, recuperação/backfill, migração que preserva links); página "Personalização do Checkout" com cartões por produto; editor visual por blocos com rascunho, pré-visualização e publicação; secção "Link de Checkout" no produto; 156 testes unitários/integração e 42 E2E a passar; build OK; verificação visual em computador e telemóvel.
- **Sessão 5 (2026-10-12)**: deteção automática do endereço do site na Vercel (`src/server/app-url.ts`): APP_BASE_URL → VERCEL_PROJECT_PRODUCTION_URL → domínio do pedido; 141 testes unitários/integração e 38 E2E a passar.
- **Sessão 4 (2026-10-12)**: erro no deploy da Vercel diagnosticado (BD não configurada/migrada; sem acesso aos logs da Vercel a partir do ambiente — 403 no âmbito da equipa); `vercel-build` com migrações e verificação de ambiente, página "Configuração incompleta", `/api/health`, página de erro global; validação local dos três cenários.
- **Sessão 3 (2026-10-12)**: documentação EPay fornecida pelo proprietário (`docs/epay-api.md`); adaptador EPay implementado (checkout alojado, aviso `X-EducavelPay-Signature`, consulta, cancelamento, chaves de teste/produção, encomendas de teste fora da receita, reconciliação); 139 testes unitários/integração e 38 E2E a passar; build OK; verificação manual com chave fictícia; sem acesso aos servidores reais da EPay.
- **Sessão 2 (2026-10-12)**: leitura do documento de integração EPay/MZN; documentação oficial da EPay inacessível a partir do ambiente (domínio bloqueado), por isso nada da API foi inventado; MZN em toda a plataforma; fluxo de pagamento real completo e agnóstico ao fornecedor; adaptador EPay isolado e desativado; 116 testes unitários/integração e 38 E2E a passar; build OK; verificação de fuga de segredos OK.
- **Sessão 1 (2026-10-12)**: análise do ambiente (repositório vazio), arquitetura, implementação das fases 1–7, 99 testes unitários/integração + 29 E2E, auditoria responsiva em 6 larguras, build de produção. Commits no ramo `claude/jolly-babbage-eg28n3`.
