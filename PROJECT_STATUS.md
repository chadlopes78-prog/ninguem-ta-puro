# PROJECT_STATUS — Ninguém Tá Puro

Última atualização: 2026-10-31 · Sessão 34 (janela «Confirme no seu telemóvel» sem «Ver estado do pedido» enquanto aguarda o PIN) · Sessão 33 (apresentação no checkout por produto: mostrar e-mail e mostrar nome do produto) · Sessão 32 (notificações BARÃO: venda aprovada, bom dia, boa noite e resultado da semana) · Sessão 31 (foto do produto sem cortes, checkout sempre igual ao produto, limpar histórico de vendas, pedir email opcional por produto, nome/cor do botão no formulário do editor) · Sessão 30 (produto: banner, Publicar produto, redireccionamento após a compra por prioridades, página de obrigado com PDF; Tipo/Categoria removidos) · Sessão 29 (novo checkout padrão «PayGate», fiel à referência do proprietário) · Sessão 28 (pagamentos: resultado real de cada transação — cancelado pelo cliente, saldo insuficiente, PIN, tempo excedido — com justificativa em Operações e reconciliação automática) · Sessão 27 (produto: Pixel do Facebook por produto e link de upsell com funil automático) · Sessão 26 (checkout: confirmação do PIN numa janela sem sair do checkout; ícones M-Pesa/e-Mola; produtos só Publicado/Rascunho e Eliminar) · Sessão 25 (Pagar: modo de teste e modo real nas Integrações; checkout com +258 e marcas M-Pesa/e-Mola) · Sessão 24 (Pagar API: pagamentos C2B assinados, webhooks validados, confirmação por consulta autenticada) · Sessão 23 (novo design padrão do checkout: claro e proporcionado; cupão só com cupões ativos) · Sessão 22 (preparação para tráfego pago: carga, concorrência, telemóvel, imagens otimizadas, limites CGNAT) · Sessão 21 (página de obrigado personalizada; área Operações com abas; Dashboard com atividades de hoje e metas de faturamento; partilha das credenciais de pagamento do administrador; logótipos sem fundo) · Sessão 20 (modo simples: vender sem funil; logótipos nas Integrações) · Sessão 19 (entrega do produto PDF/link no produto, área «Os meus produtos», recuperação de acesso, Integrações em cartões) · Sessão 18 (funis: entrada única, várias ofertas, páginas externas com código de integração, obrigado externo) · Sessão 17 (Facebook Pixel / API de Conversões) · Sessão 16 (formulário de produto simplificado, foto por upload, ofertas e downsell nos funis) · Sessão 15 (auditoria de interface e dispositivos, aba Cupom removida) · Sessão 14 (checkout simplificado, cronómetro, editor simples, revisão mobile) · Sessão 13 (produtos incompletos, WhatsApp de suporte, entrega do produto, configurações e recuperação da palavra-passe) · Sessão 12 (editor visual do checkout tipo Elementor) · Sessão 11 (desempenho no telemóvel) · Sessão 10 (multiutilizador, aprovação de contas, Administração da Plataforma, credenciais de pagamento por conta)

## Estado geral

As 7 fases do Documento Mestre estão implementadas. A plataforma opera em **MZN** e tem **dois gateways de pagamento independentes: EPay e E2Payments** (sessão 7). A **integração EPay está implementada conforme a documentação oficial** (checkout alojado, aviso assinado, consulta de estado, cancelamento, idempotência, entrega após confirmação, auditoria). Para ficar ativa só falta definir `EPAY_SECRET_KEY` no servidor e fazer o teste no sandbox da EPay, porque os servidores da EPay não são acessíveis a partir do ambiente de desenvolvimento.

| Verificação | Comando | Resultado (última execução) |
|---|---|---|
| Lint | `npm run lint` | ✅ 0 erros, 0 avisos |
| Tipos TypeScript | `npm run typecheck` | ✅ sem erros |
| Testes unitários + integração | `npm test` | ✅ 308/308 (5 do modo simples sem funil, 9 de entrega do produto/área de acesso/recuperação, 12 de funis com páginas externas/obrigado externo, 10 da API de Conversões da Meta, 10 do formulário de produto/imagem/downsell, 16 do checkout renderizado/editor simples, 13 de publicação/entrega/configurações/palavra-passe, 6 de operações do editor, 5 da biblioteca de imagens, 16 de personalização do checkout, 12 de multiutilizador A–G, 16 de notificações/relatórios, 10 de funis, 18 de gateways) |
| Testes E2E (Playwright, build de produção) | `npm run test:e2e` | ✅ 130/130 (5 de entrega do produto e integrações, 5 de funis com páginas externas e obrigado externo, 2 do Pixel da Meta, 5 do formulário de produto e ofertas nos funis, 13 da auditoria em 12 larguras, 13 de interações com toque, 3 de revisão mobile a 320/375/414 px e 3 da aba Produtos no computador a 1024/1280/1440 px, 4 de configurações/palavra-passe/telemóvel, 6 do editor visual com arrastar e soltar real, 1 de navegação lenta no telemóvel, 5 de várias contas, 10 de notificações/PWA/relatórios, 8 de funis, 9 de pagamentos, 4 de personalização, 3 de gateways) |
| Build de produção | `npm run build` | ✅ sem erros |
| Fuga de segredos | build com `EPAY_SECRET_KEY`, `E2PAYMENTS_CLIENT_ID/SECRET` e `INTEGRATIONS_ENCRYPTION_KEY` fictícias + `grep` em `.next/` e log | ✅ valor ausente do bundle do browser, do output do servidor e do log; nenhuma variável `NEXT_PUBLIC_`; `.env` com segredos fora do Git |

## Fases

| Fase | Estado | Notas |
|---|---|---|
| 1 — Fundação | ✅ Concluída | Next.js 15 + TS + Tailwind 4 + Prisma/PostgreSQL, design system, auth, navegação |
| 2 — Dashboard | ✅ Concluída | 8 KPIs, 4 visualizações, comparação de períodos, filtros, atividade recente, estados vazios |
| 3 — Produtos e checkouts | ✅ Concluída | CRUD, ofertas/preços, checkout principal criado automaticamente com link legível, editor visual com rascunho/publicação |
| 4 — Funis | ✅ Concluída | Opcionais desde a sessão 20 (modo simples sem funil). Entrada única «Funil avançado»: mapa do funil, vários upsells/downsells com página externa opcional (código de integração), obrigado interno ou externo (sessão 18); vendas reais por etapa (sessão 8); editor visual antigo mantido para funis sem produto |
| 5 — Operação | ✅ Concluída | Pedidos (filtros, detalhe, transições), clientes, cupões (com testador), relatórios |
| 6 — Preparação para pagamentos | ✅ Concluída | Abstração de fornecedores, página de integrações, webhooks com assinatura/idempotência (sem fornecedores reais) |
| 7 — Qualidade | ✅ Concluída | Testes, responsividade (320–1440 px), auditoria visual/funcional, build |

## Apresentação no checkout por produto: e-mail e nome (sessão 33)

Análise prévia: o e-mail já tinha a opção `Product.collectEmail` (sessão 31). A descrição enviada aos gateways já vinha do nome guardado do produto (`payment-flow.ts`: `«Nome — Oferta»`), independente da apresentação. Reutilizado sem duplicar.

- **Formulário do produto** (criar e editar): cartão «Apresentação no checkout» com dois interruptores independentes:
  - «Mostrar campo de e-mail no checkout» (`collectEmail`);
  - «Mostrar nome do produto no checkout» (`Product.showName`, migração aditiva `20261106090000_product_show_name`, predefinição ativo).
  Os valores enviam-se sempre com o formulário e persistem ao criar, publicar, editar e recarregar.
- **Nome oculto:** desaparece do checkout público (cartão do produto, título «Nome do produto» do modelo clássico, resumo, texto alternativo das imagens, título da página do browser → «Checkout seguro») e da página de pagamento (`/pagamento/…` mostra «A tua compra»). Os elementos seguintes sobem; no editor aparece um aviso no lugar do título. O nome continua na BD, nos pedidos (`OrderItem.description`), no Dashboard, em Operações e nos Relatórios.
- **Gateways (sem alterar APIs, referências nem confirmação):**
  - EPay: `description` (≤255) = nome do produto — oferta;
  - Pagar: `title` (≤120) = nome do produto — oferta;
  - E2Payments: o pedido C2B só tem `reference` (sem campo de descrição na API documentada) → mantém a referência do pedido.
  - Correção: compradores sem e-mail já não enviam o endereço interno `…@sem-email.invalid` à EPay (`customer_email` é opcional na documentação).
- **E-mail desativado:** sem campo, sem validação, o pagamento segue só com nome e número (que passa a ser obrigatório). Ativado: campo validado como antes.
- Testes: `tests/integration/checkout-display.test.ts` (testes 1–6 pedidos), EPay (descrição com o nome e sem `customer_email` interno), E2E em `e2e/25-email-button-history.spec.ts`. 417 testes unitários/integração e 155 E2E a passar.

## Notificações BARÃO (sessão 32)

Infraestrutura existente reutilizada (sem reconstruir): `notifyUsers` (preferências, idempotência por `(userId, eventKey)`, fila push persistente `PushDelivery`), `recordOrderEvent("sale")` chamado só depois da aprovação no servidor, service worker `public/sw.js`, cron `/api/cron/notifications` e tarefas ao abrir o painel.

- **Venda aprovada** (`events.ts`): título «👑 Venda aprovada!» e 5 variações («Parabéns, Barão! Acabaste de receber uma venda de 250,00 MT. 💰», …) com o valor REAL da transação (`order.totalCents`). Nunca o produto nem o cliente. A variação muda a cada venda (rotação pelo número de vendas já notificadas). Sem duplicados (chave `sale:<orderId>`). Pagamentos falhados/cancelados nunca geram esta notificação. Pagamentos de teste levam a linha «Pagamento de teste — não conta como receita.».
- **Bom dia, Barão / Boa noite, Barão / Resultado da semana** (`src/server/notifications/barao.ts`, textos em `src/lib/barao.ts`):
  - janelas no fuso da conta (por omissão Africa/Maputo): manhã 07:00–11:59, noite 19:00–23:59; domingo à noite o resumo semanal substitui a mensagem da noite;
  - uma por período e por conta (`morning:<dia>`, `evening:<dia>`, `weekly:<segunda>`);
  - lucro semanal = vendas confirmadas − reembolsos (mesmo cálculo dos Relatórios: `loadFinanceData` + `financeKpis.netAfterRefundsCents`, sem pagamentos de teste nem demonstração), só da própria conta;
  - manhã/noite mostram o lucro 1 em cada 3 dias (nunca zero; só é calculado nesses dias); resumo sem lucro → mensagem motivacional sem valores;
  - rotação: cada conta percorre todas as mensagens antes de repetir; dias seguidos nunca repetem.
- **Agendamento:** cron às 05:10 e 17:10 UTC (07:10 e 19:10 em Maputo, `vercel.json`). Ao abrir o painel, só é tratada a conta de quem o abriu.
- **Preferências** (migração aditiva `20261105090000_barao_notifications`): novos tipos `MORNING_MESSAGE`, `EVENING_MESSAGE`, `WEEKLY_SUMMARY` e interruptores «Bom dia, Barão», «Boa noite, Barão», «Resultado da semana» (ativos por omissão). O «Resumo diário» antigo mantém-se opcional e inalterado.
- **Apresentação push:** carga com `kind` e `ts`; o service worker mostra a hora real do evento, `lang` pt-PT, ícone/emblema da aplicação e vibração própria das vendas (Android). «Bom dia»/«Boa noite» expiram em 4 h (não chegam fora de horas), o resumo em 12 h.
- Testes: `tests/integration/barao.test.ts` e os testes de notificações existentes atualizados. 410 testes unitários/integração e 154 E2E a passar.

## Foto sem cortes, checkout = produto, limpar histórico e email opcional (sessão 31)

- **Foto do produto sem cortes:** o cartão do produto mostra a imagem inteira, com as proporções reais e no máximo no seu tamanho real (as dimensões vêm de `MediaAsset.width/height`; `cardImageSize` em `checkout-view-data.ts`). Sem banner, aparece a foto do produto. O modelo clássico usa proporção «Original» na imagem do produto.
- **Checkout sempre igual ao produto:** o checkout principal de um produto lê SEMPRE o nome, a descrição e a imagem do produto (`productFacing`). Antes, um título/imagem guardados no checkout podiam sobrepor-se às alterações do produto. Os checkouts criados à parte mantêm os seus textos.
- **Limpar histórico de vendas** (`src/server/services/sales-history.ts`):
  - Configurações → «Limpar histórico de vendas»: «Limpar pagamentos de teste» (só `isTestPayment`) ou «Limpar todo o histórico» (pedidos, pagamentos, avisos dos gateways, entregas, reembolsos, notificações de vendas, visitas dos checkouts, percursos de funil, metas celebradas; clientes sem pedidos).
  - Página do pedido → «Eliminar pedido» (com os upsells/downsells associados).
  - Só dados reais da conta autenticada; produtos, checkouts, funis, integrações e dados de demonstração não são tocados. Confirmação obrigatória; não pode ser desfeito.
- **Pedir email no checkout (por produto):** `Product.collectEmail` (migração aditiva `20261104090000_product_collect_email`, predefinição ativo). Interruptor «Pedir email no checkout» ao criar e editar. Desativado: o checkout só pede nome e número, o telefone fica obrigatório e o cliente é guardado com um endereço interno não entregável (`tel-…@sem-email.invalid`, `src/lib/buyer-email.ts`), mostrado no painel como «Sem email» e nunca enviado à Meta.
- **Botão de pagamento:** ao clicar no formulário de compra no editor aparece «Botão de pagamento» com o nome (aceita `{valor}`) e a cor (também em «Estilo da página»).
- Testes: `tests/integration/sales-history.test.ts` (limpeza, isolamento entre contas, checkout segue o produto, tamanho real da imagem, email opcional) e `e2e/25-email-button-history.spec.ts`. 402 testes unitários/integração e 154 E2E a passar.

## Produtos: banner, publicação directa e destino após a compra (sessão 30)

- **Formulário do produto:**
  - Sem «Tipo» e «Categoria» (valores guardados mantêm-se em campos ocultos; novos produtos ficam «Produto digital»).
  - **Banner promocional** (`Product.bannerUrl`, migração aditiva `20261103090000_product_banner`), independente da imagem principal: carregar, pré-visualizar (2:1), substituir e remover. Mesma biblioteca e otimização das imagens (variantes WebP redimensionadas, CDN), com validação de propriedade no servidor. A biblioteca recusa apagar uma imagem usada como banner.
  - No checkout, o cartão do produto (imagem «Do produto») mostra o banner; sem banner, a imagem principal.
  - Produto novo: ação principal **Publicar produto** (cria → envia o PDF, se houver → publica com a mesma validação do servidor → página do produto com «Produto publicado com sucesso!»). Também há **Guardar rascunho**. Se faltar algo (ex.: entrega), fica em rascunho com a mensagem do que falta. Os botões ficam bloqueados durante o processo (sem publicações duplicadas).
  - Produto existente: **Actualizar produto** (o estado continua a poder ser escolhido).
  - Secção **Redireccionamento após a compra** com «Link do upsell (opcional)» e a explicação das regras. O Pixel tem um cartão próprio.
- **Destino depois do pagamento CONFIRMADO** (`finalDestination` em `post-purchase.ts`, usado pela página de pagamento):
  1. upsell (link de upsell do produto ou ofertas do funil), mesmo para PDF;
  2. sem upsell e com link de acesso (https) → directamente para o link de acesso (só produtos sem funil, compra de um produto, sem upsells pagos; com funil mantém-se a página de obrigado do funil);
  3. PDF → página de obrigado «Parabéns! O teu pagamento foi aprovado.» com o botão **📥 Baixar o meu PDF** (download autenticado pelo acesso da compra paga);
  4. caso contrário, a página de obrigado/acesso habitual.
  - Pendente, falhado ou cancelado nunca redireccionam nem dão acesso (`nextDestination` só actua com encomenda aprovada; os ficheiros exigem o token de uma encomenda paga).
- Testes: `tests/integration/post-purchase-redirect.test.ts` (testes 1–7 pedidos); 396 testes unitários/integração e 151 E2E a passar. E2E ajustados (Publicar/Guardar rascunho/Actualizar, link de acesso directo, página do PDF). Sem alterações a gateways, webhooks ou confirmação.

## Novo checkout padrão «PayGate» (sessão 29)

- Reprodução da referência enviada pelo proprietário (captura de iPhone):
  - cronómetro numa faixa vermelha («OFERTA EXPIRA EM» · 15:00 por visita, só visual);
  - selo «Checkout seguro · {loja}»;
  - cartão do produto com imagem larga e texto em destaque opcional numa faixa preta, nome e preço em azul-violeta;
  - prova social;
  - avaliações em cartões com estrelas;
  - cartão «Dados do comprador»: nome, email, número com **+258** em destaque, «Detectamos automaticamente M-Pesa ou e-Mola», métodos em cartões com logótipo, operadora e indicador de selecção, botão verde «QUERO PAGAR {valor} AGORA», selos e consentimento;
  - **botão fixo** no fundo com o valor (sticky, respeita a safe area do iPhone e não provoca saltos).
- **Modelo padrão:** `defaultDesign` no `src/lib/checkout-design.ts`. Aplica-se a checkouts novos e a todos os que não têm personalização publicada. Os checkouts personalizados e publicados mantêm-se intactos. O modelo anterior continua disponível como `classicDesign` e no editor pelo botão «Usar modelo clássico».
- **Novos elementos e opções no editor**, todas aditivas e com predefinições que não mudam designs antigos: `productCard`, `socialProof`, cronómetro «faixa», avaliações «compactas», selos «discretos», formulário «cartão» (textos do número, selos e consentimento editáveis), largura «Telemóvel (520 px)», «Botão de pagamento fixo no fundo» e `{valor}` no texto do botão.
- **Honestidade:**
  - A prova social usa por omissão dados REAIS: compras pagas deste checkout nas últimas 24 h e visitas nos últimos 5 minutos. Esconde-se sem dados, nunca «0 pessoas». Os números personalizados ficam ao critério do vendedor, com aviso.
  - As avaliações do modelo vêm vazias e não aparecem até o vendedor escrever avaliações reais.
- **Detecção do método pelo número:** 84/85 → M-Pesa, 86/87 → e-Mola, só entre as opções reais activas da conta.
- **Diferença assumida face à referência:** o email continua obrigatório (é usado para a entrega e para a recuperação do acesso).
- Pagamentos, gateways, webhooks e redireccionamentos não foram alterados.

## Pagamentos: resultado real de cada transação (sessão 28)

**Auditoria (antes das alterações):**
- Gateways: **Pagar** (C2B assíncrono, webhook + consulta autenticada), **E2Payments** (C2B síncrono: a resposta HTTP já é o resultado; sem webhook nem consulta), **EPay** (página alojada, webhook + consulta) e o fornecedor de teste local.
- Já existia: assinatura dos webhooks (HMAC por gateway), evento único por gateway e id (sem duplicados), validação de referência, valor e moeda, transições condicionais e idempotentes, e aprovação só por confirmação do gateway (`confirm.ts`).
- **Falhas encontradas:**
  1. O motivo devolvido pelo gateway perdia-se. `NormalizedStatus` não tinha campo de motivo, `applyPaymentStatus` nunca o gravava, e a Pagar (`failureReason`/`safeMessage`) era ignorada nos webhooks e na consulta.
  2. «Cancelado pelo cliente» e «saldo insuficiente» ficavam iguais: o estado da encomenda dependia só do estado bruto (FAILED → Falhou, CANCELLED → Cancelado), mesmo quando o texto do gateway dizia o contrário.
  3. Pendentes só eram verificados quando o comprador tinha a página aberta, ou com «Verificar pendentes» (só EPay). Um pagamento podia ficar pendente indefinidamente com o resultado já disponível no gateway.
  4. A aba Operações não mostrava justificativa.

**Implementado:**
- `src/server/payments/outcome.ts`: normalização igual para todos os gateways.
  - Códigos: `CUSTOMER_CANCELLED` (Cancelado pelo cliente), `INSUFFICIENT_FUNDS` (Saldo insuficiente na carteira do cliente), `WRONG_PIN`, `TIMEOUT`, `GATEWAY_ERROR` (motivo real do gateway), `NOT_STARTED`, `UNKNOWN` (o gateway não indicou o motivo).
  - Reconhece texto em PT/EN e os códigos da API M-Pesa (INS-5, INS-9, INS-2006) quando o gateway os repassa. Nunca inventa motivos.
  - Só reclassifica entre estados finais não pagos (falhou ↔ cancelado). Nunca torna um pendente em final nem toca num pago.
- Migração aditiva `20261102090000_payment_outcome`: `Payment.failureCode` e `Payment.gatewayMessage` (`failureReason` passa a guardar a justificativa).
- `applyPaymentStatus` grava código, justificativa e mensagem bruta, e regista-os na auditoria e no registo da integração.
- Pagar: `failureReason` + `safeMessage` vêm da consulta autenticada (o corpo do webhook continua sem decidir nada). E2Payments: a `message` da resposta 400 é classificada.
- **Limitação documentada:** a EPay não devolve motivo (só `failed`/`cancelled`, e `cancelled` = «cancelado pela loja ou reembolsado»), por isso aparece «O gateway não indicou o motivo». A E2Payments não tem consulta de estado: sem resposta, o pagamento fica «por verificar» (verificação manual já existente).
- Reconciliação automática (`reconcileStalePayments`): pendentes com mais de 1 minuto são consultados nos gateways com consulta (Pagar, EPay), no cron diário e, no máximo a cada 5 minutos, quando o painel é aberto. Nunca falha um pagamento só por demorar.
- **Operações:** estado «Falhou» (antes «Falhado») ou «Cancelado», com a justificativa por baixo, guardada na BD. O detalhe do pedido mostra também a resposta do gateway. Aprovado sem justificativa.
- **Comprador:** a janela do checkout e a página de estado mostram só motivos normalizados (ex.: «Saldo insuficiente na carteira do cliente»), nunca o texto bruto do gateway.

**Testes:** `tests/integration/payment-outcomes.test.ts` (testes 1–6 pedidos + valor errado, assinatura falsa, motivo desconhecido, sem motivo, 16 casos de classificação) e um teste da Pagar com os motivos devolvidos pela consulta. 384 testes unitários/integração.

## Produto: Pixel por produto e link de upsell (sessão 27)

- **Pixel do Facebook no produto** (secção «Depois da compra e anúncios» do formulário): ID do Pixel e token da API de Conversões.
  - Com um Pixel novo, o token é obrigatório e fica cifrado. Com um Pixel já existente na conta, basta o ID.
  - O produto fica ligado a esse Pixel (um Pixel por produto; a ligação anterior é substituída) e aparece automaticamente em Integrações → Facebook Pixel com o produto marcado.
  - Campo vazio: o produto deixa de enviar compras (o Pixel continua nas Integrações).
  - Usa os modelos existentes (`MetaPixel`, `MetaPixelProduct`); o envio continua só para compras confirmadas.
- **Link de upsell no produto:** depois do pagamento CONFIRMADO, o comprador é levado para o link.
  - O funil principal do produto é criado automaticamente (motor de funis existente, `src/server/services/product-upsell.ts`) e ativado. A etapa final fica «Upsell (link)», a redirecionar para o endereço (`useSitePage: false`), por isso o fluxo aparece na aba Funis.
  - Remover o link volta à página de obrigado/acesso. Não há funis duplicados.
  - Nota: com o link, o comprador não vê a página de acesso da plataforma; recupera o acesso em `/acesso`.
- Validação antes de gravar (formato do ID do Pixel, token em falta, link https), para não criar produtos a meio.
- Testes: `tests/integration/product-extras.test.ts` (4 cenários: Pixel por produto e isolamento, upsell com pagamento confirmado, produto em rascunho, sem link). Sem migração.

## Checkout com janela de confirmação, ícones dos métodos e produtos simplificados (sessão 26)

**Pagamento por telemóvel sem sair do checkout** (pedido do proprietário):
- Ao carregar em pagar com M-Pesa/e-Mola, o comprador fica no checkout. Uma janela por cima diz «Confirme no seu telemóvel»: vai aparecer o pedido da operadora para introduzir o PIN.
- A janela consulta `/api/public/pagamento/:token` (3 s, depois 10 s; até ~15 min). Com o pagamento **confirmado pelo servidor**, segue para `/pagamento/:token`, que continua a decidir o destino (funil, obrigado ou acesso). Recusado ou cancelado: mensagem na janela com «Tentar novamente» (nova chave de idempotência). Sem confirmação: «Ver estado do pedido».
- A confirmação do pagamento (webhook + consulta autenticada, `confirm.ts`) não foi alterada; a janela só lê o estado.
- Gateways com página alojada (EPay) continuam a redirecionar como antes.
- E2E: novo helper `toPaymentPage` (clica em «Ver estado do pedido» ou espera o avanço automático).

**Ícones dos métodos:** ícones em SVG desenhados a partir das imagens enviadas pelo proprietário. M-Pesa: fundo vermelho, telemóvel e nota verde. e-Mola: fundo laranja, telemóvel e nota branca com $. Aparecem nas opções de pagamento e nos chips da EPay.

**Produtos:**
- Só dois estados visíveis: **Publicado** e **Rascunho**. «Despublicado», «Incompleto» e «Pronto para publicar» aparecem como Rascunho; o atalho para o que falta configurar continua por baixo.
- Filtro com «Todos / Publicado / Rascunho». «Despublicar» passou a «Passar a rascunho».
- «Arquivar» passou a **Eliminar**: o produto sai da lista e o checkout deixa de funcionar. Internamente continua a ser `ARCHIVED`, para não apagar pedidos, pagamentos e relatórios (o histórico financeiro é preservado). Sem migração.

## Pagar: modo de teste / modo real; telefone +258 e marcas dos métodos (sessão 25)

**Modo de processamento da Pagar (Integrações → Pagar):**
- Cada conta guarda dois conjuntos de credenciais, cifrados: **teste** (`sk_test_…`) e **produção / modo real** (`sk_live_…`), cada um com o seu signing secret e webhook secret. Formato antigo (um só conjunto) continua a ser lido e é classificado pelo prefixo da key.
- O modo ativo fica em `IntegrationConfig.publicConfig.mode` (e `environment` SANDBOX/PRODUCTION). Só o conjunto do modo ativo inicia pagamentos.
- «Ativar modo real» pede confirmação e só muda se a Pagar aceitar a key de produção (`GET /wallet`); caso contrário o modo fica igual e o erro da Pagar é mostrado. «Usar modo de teste» volta atrás. Mudanças registadas no registo da integração.
- Guardar credenciais do outro modo não mexe no modo em uso (só são testadas). Uma key de teste no formulário de produção (ou vice-versa) é recusada.
- Conta proprietária: as variáveis `PAGAR_*` continuam a valer; opcionalmente `PAGAR_LIVE_API_KEY`, `PAGAR_LIVE_SIGNING_SECRET`, `PAGAR_LIVE_WEBHOOK_SECRET` para produção. Credenciais guardadas no painel têm prioridade sobre as variáveis do mesmo modo.
- Webhooks: aceita a assinatura do webhook secret de qualquer um dos modos da conta e consulta o pagamento com a API key desse mesmo modo.
- Limitação: depois de mudar de modo, a consulta periódica de pagamentos pendentes iniciados no modo anterior usa as credenciais do modo atual (a Pagar invalida a key antiga ao mudar a app para LIVE).
- Requisito externo: o modo real só funciona depois de a app estar aprovada para LIVE na Pagar (KYC, endereços verificados, key LIVE criada — guia secção 11).
- Corrigido: o botão «Testar ligação» da Pagar devolvia «não disponível» (a ação só aceitava a E2Payments).

**Checkout:**
- Campo do telefone com o indicativo fixo **🇲🇿 +258** (bandeira em SVG, porque os emojis de bandeira não aparecem no Windows); o comprador escreve só os 9 dígitos, formatados como `84 123 4567`; colar `+258…` ou `258…` funciona.
- Marcas M-Pesa (vermelho) e e-Mola (laranja) nas opções de pagamento e nos chips da EPay. Os logótipos oficiais nunca foram enviados para o projeto; podem substituir as marcas quando forem fornecidos.
- Erro de teste reportado pelo proprietário («No sandbox use 860000001…»): a Pagar está em modo TESTE e só aceita os números de teste — comportamento esperado.

**Verificação do domínio na Pagar (LIVE):** ficheiro público `public/.well-known/pagar-verification.txt` (prefixo `/.well-known/` liberto no middleware). Os tokens da Pagar são públicos por natureza (não são segredos). Frontend e backend usam o mesmo hostname com tokens diferentes: publica-se um de cada vez (primeiro o do Frontend — verificado em 2026-10-29 —, depois o do Backend, publicado a seguir).

Testes: 354 unitários/integração (novo: modos de teste/real, confirmação, recusa da key LIVE, pagamento e webhook com as credenciais de produção). Sem migração.

## Pagar API (sessão 24)

Implementada **só a partir do guia oficial**, `https://pagar.co.mz/docs/ai-integration.md`. O domínio está bloqueado neste ambiente, por isso o guia foi colado pelo proprietário; a cópia de referência está em `docs/pagar-api.md`. A Pagar é um terceiro gateway, ao lado da EPay e da E2Payments, sem alterar estas duas.

**Análise prévia**
- **Backend:** Next.js (server actions e rotas `route.ts`) na Vercel.
- **Base de dados:** PostgreSQL com Prisma.
- **Pedidos:** `Order`, `OrderItem` e um `Payment` por tentativa.
  - O preço vem de `Offer.priceCents` e a referência é `Payment.idempotencyKey`, única por tentativa.
  - O dono da venda é `Order.ownerId`.
- **Webhooks:** entram em `POST /api/webhooks/[provider]`, com o registo único em `PaymentEvent` e a confirmação em `confirm.ts`.

**Como funciona**
- **Fornecedor** `src/server/payments/providers/pagar.ts`, com o cliente do guia:
  - GET com `Authorization: Bearer <API key>`;
  - POST com `X-Pagar-Timestamp`, `X-Pagar-Nonce`, `X-Pagar-Signature: v1=HMAC-SHA256(signing secret, "timestamp\nnonce\nPOST\n<pathname>\nsha256(body)")` e `Idempotency-Key`.
- **Pagamento** `POST /payments`:
  - `reference` é a referência interna da tentativa;
  - `title` é «produto — oferta» e `description` é «Pedido NTP-…», ambos da BD;
  - `amountMzn` é o preço da oferta, inteiro entre 20 e 40 000;
  - `method` é MPESA ou EMOLA e `payerPhone` o número normalizado;
  - a idempotency key é `payment:<reference>`.
- **Falhas de rede e 5xx:** até 2 repetições com a mesma key e o mesmo body, gerando só timestamp e nonce novos. Se continuar sem resposta, fica «estado incerto» e recupera-se com `GET /payments/by-reference/:reference`, sem nova cobrança.
- **Restantes respostas:**
  - 400 e outros 4xx: «não iniciado», nada cobrado;
  - 401/403: erro de configuração, e o gateway deixa de aceitar novos pagamentos;
  - 409: estado incerto, consulta antes de decidir;
  - 429: não iniciado.
- **Nunca se liberta o produto com a resposta inicial (202).** Mesmo um «PAID» inicial é tratado como pendente. A entrega só acontece com PAID obtido por consulta autenticada (`GET /payments/:id`, a cada 10–15 s com jitter enquanto a página de estado está aberta) ou por webhook validado.
- **Estados:**
  - `RECONCILIATION_REQUIRED`, `PENDING` e `PROCESSING` ficam pendentes;
  - `FAILED` e `CANCELLED` encerram a encomenda sem entrega.
- **Webhook** `POST /api/webhooks/pagar` (`src/server/payments/pagar-webhook.ts`):
  - `Pagar-Event-Id` é obrigatório (400 se faltar);
  - `Pagar-Signature: t=…,v1=…` é validado com HMAC-SHA256 do webhook secret sobre `t.rawBody`, em tempo constante e com ±300 s (401 se falhar);
  - a conta é encontrada tentando o webhook secret de cada conta configurada, sem confiar no corpo;
  - o evento é registado uma única vez (`PaymentEvent` único por fornecedor e `Pagar-Event-Id`);
  - o estado **não** vem do corpo (o guia não descreve o seu formato): o servidor consulta a Pagar com a API key da conta e só PAID dessa consulta aprova, pela confirmação existente.
  - Eventos sem pagamento (carteira, payouts, `webhook.test`) são ignorados com 200.
- **Credenciais (nunca no Git):**
  - **conta proprietária:** variáveis `PAGAR_API_KEY`, `PAGAR_SIGNING_SECRET`, `PAGAR_WEBHOOK_SECRET` (e opcional `PAGAR_API_BASE_URL`), que só valem para essa conta;
  - **outras contas:** Integrações → Pagar, guardadas cifradas e nunca devolvidas (só um fragmento da API key).
  - Guardar faz o teste de ligação `GET /wallet` e só depois a Pagar pode ser ativada.
  - A página mostra o endereço do webhook a registar na app da Pagar.
- A partilha de credenciais do administrador (sessão 21) também funciona com a Pagar.
- **Não implementado de propósito:** top-ups e payouts, porque a plataforma não tem levantamentos.

**Testes**
- `tests/integration/pagar.test.ts` (11 testes), com a API simulada no formato do guia e credenciais fictícias:
  - assinatura e cabeçalhos do POST;
  - título e valor da BD;
  - PAID inicial não entrega;
  - limites 19, 20, 40 000 e 40 001 MZN e valor decimal;
  - repetições com a mesma key e o mesmo body, seguidas de recuperação por reference;
  - respostas 400, 409 e 401;
  - webhook válido aprova uma única vez e o mesmo `Pagar-Event-Id` não repete;
  - o estado vem da consulta e não do corpo;
  - assinatura errada, segredo errado, fora do prazo ou sem event id;
  - FAILED/CANCELLED e eventos ignorados;
  - credenciais cifradas e nunca devolvidas;
  - variáveis só para a conta proprietária.
- E2E `07-integrations`: cartão, formulário só com campos protegidos, endereço do webhook e validação no servidor.
- **Não testado contra a API real:** `api.pagar.co.mz` não é acessível neste ambiente. Antes de vender, fazer um pagamento TEST com os números do guia (840000001 sucesso, 840000002 falha, 840000003 processamento) e confirmar o webhook.

## Novo design padrão do checkout (sessão 23)

- **Antes:** o modelo padrão era escuro com verde-néon, título enorme (até 38 px), imagem muito grande e o campo «Cupão de desconto» sempre visível, apesar de a aba de cupões ter sido retirada.
- **Agora (`defaultDesign` em `src/lib/checkout-design.ts`):**
  - **Tema claro:** fundo `#F6F7F9`, formulário em cartão branco, botão verde `#16A34A` e tipo de letra Inter também no título.
  - **Proporções:** título com 28 px no computador e 22 px no telemóvel, preço com 26/24 px e imagem 16:9 com cantos de 14 px.
  - **Estrutura:** a mesma numa coluna (nome, imagem, preço, dados, pagamento, total e botão), sem Subtotal nem Taxa de entrega.
- **Cores próprias:** se o vendedor escolheu cores para o checkout, diferentes das de fábrica, essas cores são respeitadas.
- **Checkouts personalizados e publicados:** não mudam.
- **«Restaurar estilo padrão» no editor:** repõe o tema claro.
- **Campo de cupão:** só aparece se a conta tiver cupões ativos e dentro da validade (`hasUsableCoupons`). Os cupões existentes continuam a funcionar.
- **Testes:** unitário do modelo padrão; testes de tema atualizados (E2E 08 e unitários do editor e da renderização).

## Preparação para tráfego pago: auditoria, carga, concorrência e telemóvel (sessão 22)

**Ambiente dos testes (o que foi realmente medido).**
- Build de produção (`next start`) num único processo Node: 4 vCPU, 16 GB e Postgres 16 local (`ntp_test`).
- Pagamentos com o fornecedor de **teste** local. Não houve chamadas à EPay ou à E2Payments reais nem testes contra produção (este ambiente não tem acesso à Vercel).
- Os números são de **uma instância**. Na Vercel cada instância escala horizontalmente, mas a base de dados (Neon), a latência Vercel↔BD e os limites dos gateways não foram medidos.

Scripts reutilizáveis em `scripts/load/`:
- `seed.ts`: dados de carga;
- `http-load.mjs`: N clientes simultâneos com p50/p95/p99, códigos HTTP, memória e ligações à BD;
- `webhook-load.ts`: confirmações duplicadas em massa;
- `mobile-perf.mjs`: LCP, CLS, INP e bytes em perfis de telemóvel emulados.

**Arquitetura relevante.**
- **Checkout:** página `/checkout/<slug>` renderizada no servidor a cada visita, mais `POST /api/public/checkout/<id>/session` (estatística).
- **Compra:** uma server action (`submitCheckoutAction`) cria a encomenda e o pagamento numa transação. Depois chama o gateway fora da transação: na EPay redireciona; na E2Payments espera a confirmação no telemóvel, até 180 s (`maxDuration = 180`).
- **Confirmação:** aviso assinado (EPay) e/ou consulta do estado (`/api/public/pagamento/<token>`, de 4 em 4 s e depois de 10 em 10 s). É idempotente, com o evento único por fornecedor e as transições condicionais.
- **Imagens:** imagens dos produtos guardadas na base de dados (`MediaAsset.data`).

**Problemas encontrados (medidos) e correções.**

1. **CGNAT, bloqueava clientes reais.** Os limites anti-abuso eram por IP: 10 compras por IP e checkout a cada 10 min, 60 aberturas e 120 consultas de estado. As operadoras móveis em Moçambique põem muitos clientes atrás do mesmo IP.
   - Teste com 25 clientes no mesmo IP: **98,6% das compras recusadas** («Demasiadas tentativas») e 46% das aberturas com 429.
   - Correção (`src/server/rate-limit.ts` e rotas públicas): os limites passam a ser por comprador ou percurso (telefone ou email por checkout, token da encomenda, run do funil), com um teto por IP alto (3000 por 10 min; 30000 por 10 min na consulta de estado).
   - Depois: **0% de falhas** com 25 e 100 clientes no mesmo IP.
2. **Imagem do produto em tamanho original e sem cache na CDN.** A rota só enviava `max-age` (a CDN da Vercel ignora-o) e cada visita lia o original da BD.
   - Com uma foto de 1600 px: 782 KB por visita, ~135 pedidos/s e a memória do servidor a subir para 1,1 GB.
   - Correção (`/api/public/media/<id>`): variantes `?w=160…1080` e `&f=webp` geradas com `sharp`, sem aumentar a imagem; se `sharp` falhar, serve o original. Junta `CDN-Cache-Control: immutable` e uma cache LRU de 48 MB por instância. Novo componente `ResponsiveImg` (`<picture>` com WebP e srcset) no checkout, no resumo, no banner e na página de obrigado.
   - Depois: imagem de 143 KB num telemóvel de 360 px, ~450 pedidos/s e memória estável (~850 MB sob carga).
3. **Resposta perdida no browser do Facebook/Instagram.** Se a WebView recarregar a página enquanto o comprador confirma no telemóvel, a chave de idempotência era nova e um segundo clique podia criar uma **segunda encomenda e cobrança**.
   - Correção (só no formulário; a API de pagamento não mudou): a chave da tentativa sem resposta fica em `localStorage` durante 30 min e é reutilizada, para que o servidor devolva a mesma encomenda. É apagada logo que o servidor responde.
   - Mensagem de erro de rede: «não será cobrado duas vezes».
   - Aviso «A ligação está lenta…» ao fim de 10 s.
4. **Consultas do checkout.**
   - A leitura do checkout era feita duas vezes (metadados e página): agora usa `cache()` e é feita uma só vez.
   - As configurações e os gateways passaram a ser lidos em paralelo.
   - Localmente o ganho não é mensurável (BD local); em produção poupa idas à BD por visita.

**Capacidade medida (1 processo, depois das correções).** Valores de p95; nenhum erro HTTP em nenhum nível.

| Clientes simultâneos | 10 | 25 | 50 | 100 | 250 |
|---|---|---|---|---|---|
| Abrir checkout (página + sessão), pedidos/s | 110 | 139 | 145 | 136 | 138 |
| Abrir checkout, p95 | 0,17 s | 0,32 s | 0,58 s | 1,3 s | 5,5 s |
| Submeter compra, compras/s | 68 | 77 | 82 | 73 | 78 |
| Submeter compra, p95 | 0,21 s | 0,42 s | 0,75 s | 1,6 s | 4,7 s |
| Consulta de estado, p95 | 0,10 s | 0,17 s | 0,39 s | 0,72 s | 8,1 s |
| Imagem (variante WebP), pedidos/s | 347 | 405 | 403 | 427 | 451 |

- Um processo satura em ~70 aberturas completas/s (CPU do render) e em ~75–90 compras/s (pool de 10 ligações à BD). Acima disso a latência cresce, mas sem erros.
- **Avisos de pagamento:** 2000 confirmações, cada uma enviada em duplicado e em simultâneo (até 250 em paralelo).
- **Integridade** (5418 compras de carga): 0 aprovações duplicadas, entregas duplicadas, notificações duplicadas, pagamentos duplicados por encomenda, chaves repetidas, preços errados ou clientes trocados.

**Pagamentos: os 10 cenários obrigatórios** (`tests/integration/checkout-concurrency.test.ts`, 7 testes, todos a passar sem alterar a lógica de pagamento):
1. 40 compras simultâneas em 2 produtos;
2. produtos e preços certos;
3. dados de clientes não misturados (incluindo na página de estado);
4. 15 envios simultâneos com a mesma chave dão 1 encomenda e 1 pagamento;
5. reenvio depois de atualizar a página devolve a mesma encomenda;
6. falha de rede no gateway deixa «estado incerto», sem nova cobrança automática;
7. aviso repetido 6× em simultâneo dá 1 venda;
8. confirmação só pelo aviso, com o browser fechado;
9. confirmação demorada não é dada como falhada (não existe expiração por tempo);
10. regresso ao checkout mostra o estado certo;
- e ainda: o mesmo email em dois separadores e isolamento entre lojas.
- E2E `e2e/24-checkout-resilience.spec.ts`: link do anúncio com UTM e fbclid no browser do Facebook, resposta perdida seguida de recarregamento (a mesma chave é reutilizada), e rede lenta (botão desativado, 1 único envio, aviso).

**Telemóvel (emulação no Chromium com CPU e rede limitadas; não são dispositivos físicos nem Safari/WebKit).** Mediana de 3 execuções, primeira visita sem cache.

| Perfil | LCP antes | LCP depois | CLS | INP | Bytes depois |
|---|---|---|---|---|---|
| Android económico (Android 8, CPU ×6) · 4G lento | 5,4 s | **2,3 s** | 0 | ≤ 96 ms | 381 KB |
| Android económico · 3G lento (400 kbps) | 21,5 s | **8,6 s** | 0 | 56 ms | 381 KB |
| Android recente · 4G | 1,1 s | 0,64 s | 0 | 32 ms | 433 KB |
| Browser do Facebook (Android) · 4G lento | 5,4 s | 2,2 s | 0 | 48 ms | 381 KB |
| Browser do Instagram (Android) · 4G lento | 5,4 s | 2,2 s | 0 | 48 ms | 381 KB |
| iPhone SE (UA iOS, emulado) · 4G lento | 5,4 s | 2,3 s | 0 | 40 ms | 381 KB |
| iPhone + Facebook (emulado) · 4G | 1,1 s | 0,64 s | 0 | 16 ms | 433 KB |
| Computador · rede rápida | 0,12 s | 0,18 s | 0 | 16 ms | 344 KB |

- Em todos os perfis: preço e imagem visíveis, teclado de telefone (`type=tel`) e de email, botão visível depois de deslocar e sem deslocamento horizontal.
- O checkout não usa pop-ups nem cookies de terceiros; só `sessionStorage` e `localStorage`, com falha silenciosa.
- **Objetivo de 3G lento (4 s) não cumprido:** 381 KB (JS 145, imagem 143, fontes 70) a 400 kbps levam ~7,6 s só a descarregar.

**Problemas que permanecem / limites da infraestrutura.**
- **Não medido em produção:**
  - latência Vercel↔Neon e região;
  - limite de ligações do Neon (usar o URL *pooled* em `DATABASE_URL`);
  - limites das APIs EPay/E2Payments;
  - plano da Vercel (a E2Payments precisa de `maxDuration = 180`).
- **E2Payments:** cada compra ocupa uma função até 180 s à espera da confirmação no telemóvel. Com muitos compradores em simultâneo isto multiplica funções ativas e custo. Mudar para confirmação assíncrona exige alterar o fluxo de pagamento: **fica proposto, por aprovar**.
- **Limites de pedidos em memória por instância:** com várias instâncias são aproximados. Para limites globais seria precisa uma loja partilhada (ex.: Redis/Upstash).
- **Render do checkout:** a página é renderizada a cada visita (`force-dynamic`). Uma cache curta da página aumentaria muito a capacidade por instância, mas exige invalidação em todas as edições de produto, preço e checkout; não foi feito.
- **Safari/WebKit e dispositivos físicos não testados.** Recomenda-se uma compra real de valor baixo num iPhone (Safari e Instagram) e num Android económico antes de aumentar o orçamento.
- O pico de memória do processo sob carga foi de ~870 MB.

## Partilha das credenciais de pagamento do administrador (sessão 21)

**O que faz.** O administrador (conta proprietária) pode autorizar um utilizador concreto a cobrar os **seus próprios produtos** com a EPay e/ou a E2Payments do administrador. Cada utilizador continua a poder configurar, ativar e gerir as suas próprias credenciais, como antes. A partilha é apenas uma opção adicional e nunca é global.

**Onde o administrador concede e revoga.**
- Administração → **Integrações partilhadas** (`/admin/integracoes`). Também se chega por Integrações → «Partilhar acesso às minhas credenciais de pagamento», onde aparecem os pedidos de remoção pendentes.
- A página tem:
  - lista de utilizadores aprovados, com pesquisa por nome, email ou identificação;
  - para o utilizador escolhido: nome, email e caixas EPay / E2Payments, com o estado do gateway na conta do administrador, e o botão «Conceder acesso»;
  - lista das permissões concedidas: Ativa ou Revogada, «Remoção solicitada», datas e botão «Revogar» com confirmação.
- Cada autorização é individual (utilizador + método). Revogar uma não afeta as outras. Voltar a conceder cria um novo registo e o histórico fica guardado.

**Onde o utilizador autorizado vê a integração.**
- Integrações → cartões acima das suas próprias integrações. Mostram o estado («Ativo», «Indisponível de momento» se o gateway do administrador estiver desligado, ou «Remoção solicitada») e as linhas «Método disponibilizado pelo administrador.» e «Credenciais: Geridas pelo administrador.».
- Não há campos, link de configuração nem valores.
- «Solicitar remoção do acesso» abre uma confirmação. Depois regista o pedido, notifica o administrador (nova notificação «Alerta da conta») e mostra «Remoção solicitada». Não revoga: o administrador decide.

**Como funciona nos pagamentos** (alteração mínima autorizada pelo proprietário):
1. `registry.getActivePaymentProviders(conta)`:
   - usa as credenciais da própria conta, como até agora;
   - só quando a conta não tem esse gateway ativo **e** tem uma autorização ATIVA dada pela conta OWNER aprovada **e** o gateway do administrador aceita pagamentos, cria o fornecedor com as credenciais do administrador.
   As credenciais próprias ativas têm sempre prioridade.
2. Ao criar o pagamento (checkout e upsell/downsell), grava em `Payment.credentialOwnerId` de que conta são as credenciais. `null` significa as da conta dona da encomenda, como em todos os pagamentos antigos.
3. A consulta de estado, o cancelamento, a verificação manual e o aviso (webhook) da EPay carregam a chave pela conta gravada no pagamento (`getProviderForPayment`).
   - A verificação HMAC, os payloads, os URLs, a idempotência e `confirm.ts` não mudaram.
   - A encomenda continua da conta do vendedor, por isso `applyPaymentStatus` continua a exigir que pertença a essa conta.
4. A venda, o produto, o faturamento, o Dashboard, os relatórios, as notificações de venda e a entrega ficam no vendedor (`Order.ownerId`). O administrador não recebe a venda.
5. **Revogar** impede novos pagamentos de imediato. Os pagamentos já iniciados continuam a ser confirmados com as credenciais gravadas.
6. **Sem levantamentos**: não foi criado nenhum botão, página, endpoint ou mecanismo de saque ou transferência.

**Proteção das credenciais.**
- As credenciais nunca saem do servidor. `listSharedForUser` devolve apenas id, gateway, nome, datas e um booleano de disponibilidade. Não devolve chaves, tokens, segredos nem o id do administrador.
- As ações do administrador usam `requireOwner` e o serviço volta a verificar `canAdminister`. Para outras contas, `/admin/integracoes` responde 404.
- O pedido de remoção só aceita autorizações do próprio utilizador. O id do utilizador vem sempre da sessão, nunca do browser.
- Os registos (IntegrationLog) não contêm valores.

**Dados.** Migração aditiva `20261101090000_payment_credential_grants`:
- tabela `PaymentCredentialGrant` (quem concedeu, utilizador, método, estado, data de concessão, data de revogação, data do pedido de remoção), com índice único parcial: uma autorização ativa por utilizador e método;
- coluna `Payment.credentialOwnerId`, nula nos dados existentes;
- valor `ACCOUNT_ALERT` no tipo de notificação.

**Ficheiros.**
- Novos: `src/server/services/credential-grants.ts`, `src/app/(app)/admin/integracoes/page.tsx`, `src/components/admin/grant-form.tsx`.
- Alterados:
  - `src/server/payments/registry.ts`, `src/server/payments/webhooks.ts` (só a conta da chave);
  - `src/server/services/payment-flow.ts`, `orders.ts`, `post-purchase.ts`, `purchase.ts` (comentário);
  - `src/app/(app)/integracoes/page.tsx` e `actions.ts`, `src/app/(app)/admin/actions.ts`;
  - `src/components/admin/admin-ui.tsx` (entrada no menu da Administração);
  - `src/lib/notifications.ts` e a página Notificações (novo tipo).

**Testes.**
- `tests/integration/credential-grants.test.ts` (7 testes):
  - credenciais próprias sem autorização;
  - EPay partilhada: cobra com a chave do administrador; o aviso assinado com a chave do vendedor é rejeitado e com a do administrador é aceite; venda e notificação no vendedor; nada no administrador; sem segredos nas respostas nem nos registos;
  - prioridade das credenciais próprias;
  - E2Payments partilhada com outra utilizadora; quem não tem autorização não a usa;
  - revogação com o pagamento em curso confirmado, sem afetar outros utilizadores;
  - pedido de remoção (notificação única, não revoga, isolamento);
  - permissões: só o administrador; não a si próprio nem a contas pendentes; métodos inválidos recusados.
- `e2e/23-shared-credentials.spec.ts`: conceder, ver sem credenciais, pedir remoção, ver o pedido, revogar, 404 para quem não é administrador, telemóvel.

## Dashboard: atividades de hoje e metas de faturamento (sessão 21)

**Atividades recentes (corrigido)**

- Problema: a secção mostrava sempre os últimos 8 pedidos, de qualquer dia, por isso os pedidos de ontem continuavam a aparecer no dia seguinte.
- Agora mostra apenas o que aconteceu **hoje**, no fuso da conta (`Settings.timezone`, por omissão `Africa/Maputo`). O dia começa às 00:00 locais (22:00 UTC em Maputo), calculado com `zonedTodayBounds` em `src/lib/activity.ts`, que reutiliza `startOfZonedDay` e `zonedDayKey`. Não é uma comparação em UTC.
- Cada atividade usa a data real do evento do pedido:
  - criação (`createdAt`): «Novo pedido»;
  - confirmação do pagamento (`approvedAt`): «Pagamento confirmado»;
  - cancelamento (`canceledAt`): «Pedido cancelado»;
  - reembolso (`refundedAt`): «Pedido reembolsado».
  Um pedido criado ontem e pago hoje aparece hoje como pagamento confirmado.
- A lista vai da atividade mais recente para a mais antiga (até 10) e mostra a hora no fuso da conta. Sem atividades, mostra «Ainda não existem atividades hoje».
- A página é dinâmica (`force-dynamic`): recarregar ou mudar o filtro de período volta a ler os dados.
- Nada é apagado: só mudou a forma como os dados são filtrados e apresentados.

**Meta de faturamento**

- Barra no topo do Dashboard, acima dos indicadores e das atividades (`src/components/dashboard/revenue-goal.tsx`). Mostra:
  - o valor faturado;
  - a meta;
  - a barra de progresso e a percentagem;
  - quanto falta: «Faturaste X MZN. Faltam Y MZN para atingir a tua primeira meta».
- Metas: 10.000 → 50.000 → 100.000 → 500.000 → 1.000.000 MZN (`src/lib/revenue-goals.ts`). A percentagem é o faturamento a dividir pela próxima meta, arredondada para baixo, para nunca mostrar 100% antes de a meta ser atingida.
- Ao atingir 1 milhão, a barra fica concluída (100%) com «meta máxima atual atingida». Não recomeça nos 10.000.
- **Cálculo do faturamento** (`lifetimeRevenueCents` em `src/server/services/dashboard-extras.ts`): usa a mesma definição da «Faturação bruta» do Dashboard (`computeKpis`), ou seja, a soma de `totalCents` dos pedidos com estado **APROVADO** da conta (`ownerId` e modo real/demo), sem pagamentos de teste, em MZN e sem limite de datas.
  - Pendentes, recusados, cancelados e reembolsados não contam.
  - Cada pedido conta uma única vez (os upsells e downsells são pedidos próprios).
  - Os valores das vendas não são alterados.
- **Celebrações**:
  - Ao atingir uma meta pela primeira vez aparece a mensagem de parabéns, com um confetti discreto que é desativado com `prefers-reduced-motion`.
  - Se várias metas forem atingidas de uma vez, aparece uma única mensagem que as lista todas.
  - A celebração fica registada logo que é mostrada, na tabela `RevenueMilestone` (por utilizador e meta, única). Recarregar a página não a repete.
  - O servidor só aceita registar metas que o faturamento real já atingiu.
  - No modo de demonstração não há celebrações.
- Migração aditiva: `20261031090000_revenue_milestones`.
- Não foram alterados pagamentos, webhooks, confirmação, checkout, produtos, funis nem relatórios. Fora do Dashboard só foi acrescentada uma animação CSS (`goal-confetti`) em `globals.css`.
- Testes:
  - `tests/unit/dashboard-goals.test.ts` (8): percentagens, sequência das metas, 1 milhão, celebrações múltiplas, meia-noite em Maputo, ordenação, lista vazia;
  - `tests/integration/dashboard-goals.test.ts` (5): só pedidos aprovados (igual à Faturação bruta), celebrar uma vez, várias metas de uma vez, isolamento entre contas, modo demo, atividades de hoje e de ontem;
  - `e2e/22-dashboard-goals.spec.ts`: barra acima das atividades, sem repetir a celebração depois de recarregar, responsivo a 375, 768 e 1280 px.

## Área Operações com abas (sessão 21)

- O menu principal tem agora **uma única entrada «Operações»** no lugar de Pedidos, Clientes, Relatórios e Notificações. As restantes entradas (Dashboard, Produtos, Personalizar Checkout, Funis de vendas, Integrações, Configurações, Administração) mantêm nome, ordem e comportamento.
- «Operações» abre `/operacoes`, que leva à primeira aba (Pedidos). Por cima do conteúdo aparece o título **Operações** e as abas **Pedidos · Clientes · Relatórios · Notificações** (`src/components/layout/operations-tabs.tsx`, lista em `OPERATIONS_TABS` de `nav.ts`), com a aba atual destacada (`aria-current`).
- **Rotas inalteradas**: cada aba é a rota que já existia (`/pedidos`, `/pedidos/<id>`, `/clientes`, `/clientes/<id>`, `/relatorios`, `/relatorios/exportar`, `/notificacoes`). Recarregar mantém a aba e os links antigos continuam a funcionar. As páginas foram movidas para o grupo de rotas `src/app/(app)/(operacoes)/`, que não muda os URLs, e o `layout.tsx` desse grupo acrescenta o título e as abas só a estas páginas. O conteúdo, os formulários e as ações de cada página não mudaram. A única alteração fora de Operações é o caminho de importação das ações de notificações em Configurações.
- O contador de notificações por ler aparece na entrada Operações e na aba Notificações. O sino do topo continua a abrir `/notificacoes`.
- No telemóvel as abas ficam numa grelha de 2×2: nenhuma aba fica cortada e não há deslocamento horizontal.
- Permissões: as mesmas de antes (`requireUser` em cada página; `/operacoes` é privada como as restantes rotas).
- Testes: `e2e/21-operations.spec.ts` (4 testes: menu e ordem das entradas, cada aba com refresh, links antigos e outras áreas sem abas, telemóvel); `e2e/04-responsive.spec.ts` foi adaptado ao novo menu.

## Página de obrigado personalizada (sessão 21)

- **Personalizar Checkout** tem duas opções em abas: «Personalizar checkout» (o editor existente, que não mudou) e «Personalizar página de obrigado» (`/checkouts?tab=obrigado`), com o estado de cada produto: Página padrão / Personalizada / Alterações por publicar.
- O editor (`/checkouts/personalizar/<produto>/obrigado`) tem:
  - nome da página, título, mensagem, texto do botão de acesso e imagem/banner (carregada para a biblioteca da conta);
  - aparência: modo escuro ou claro, cor principal, cor de fundo, tamanho do título, alinhamento e resumo da compra;
  - pré-visualização em computador e telemóvel;
  - guardar rascunho, publicar e restaurar a página padrão.
- **O botão de acesso usa sempre a entrega real**, decidida no servidor:
  - PDF: descarga protegida pelo token da encomenda;
  - SaaS: o link de acesso do produto;
  - também mostra o acesso a todos os upsells e downsells pagos;
  - com o pagamento ainda por confirmar, a página não mostra botões nem produtos.
- A personalização só muda textos e aparência. Não altera produtos, preços, credenciais, pagamentos ou o que é entregue.
- **Sem funil**: depois do pagamento confirmado, o comprador vai para `/obrigado/<token>` com a página publicada. Se não houver página publicada, continua a ir para a área de acesso, como antes.
- **Com funil**: o funil continua a decidir o percurso (upsell e downsell). A página final usa a personalização publicada em vez da página do funil. A página do funil não é apagada e o editor do funil indica onde editar a página personalizada.
- Dados: migração aditiva `20261030090000_checkout_thank_you` (tabela `CheckoutThankYou` com `draft`, `published` e `version`, 1:1 com o checkout). Não apaga nenhuma configuração existente. «Restaurar padrão» remove apenas a personalização desse checkout.
- Ficheiros:
  - `src/lib/custom-thank-you.ts` (validação Zod);
  - `src/server/services/thank-you-custom.ts`;
  - `getThankYouView` e `hasCustomThankYou` em `post-purchase.ts`;
  - `src/components/checkout-editor/thank-you-editor.tsx`.
  `confirm.ts`, os webhooks, a EPay e a E2Payments não foram alterados.
- Testes: `tests/integration/custom-thank-you.test.ts` (6) e `e2e/20-thank-you-customization.spec.ts` (4).
- Logótipos das Integrações: o quadrado branco por trás das imagens foi removido; os logótipos aparecem sem fundo.

## Modo simples: vender sem funil (sessão 20)

**Antes:** a publicação (`assertPublishable`, `src/server/services/product-readiness.ts`) exigia funil principal, página de obrigado, WhatsApp e entrega; o editor de funis recusava guardar um produto publicado sem WhatsApp; Produtos mostrava «Falta: funil associado, página de obrigado…» com «Completar configuração →»; sem funil, a página de pagamento não encaminhava o comprador para lado nenhum.

**Agora — dois modos de venda:**
- **Modo simples:** Criar produto (nome, descrição, imagem, preço, entrega: PDF ou link) → **Publicar** → checkout padrão (criado automaticamente com o produto) → pagamento confirmado (fluxo existente EPay/E2Payments) → **página de acesso ao produto** (`/acesso/<token>`: nome, imagem, «Descarregar produto» ou «Aceder ao meu produto»). Sem funil, sem página de obrigado, sem WhatsApp e sem email.
- **Modo com funil (opcional):** associar um funil ao produto (aba Funis ou «Adicionar upsells/downsells» no produto) → upsell/downsell/página de obrigado configurados; o produto principal mantém sempre o acesso; ofertas só entregues depois do pagamento confirmado (inalterado).

**Validação (servidor = interface):** requisitos para publicar passam a ser só **produto** (nome, descrição ≥ 10, preço ativo > 0), **checkout principal**, **método de entrega** e **conteúdo de entrega** (ficheiro / link válido / página interna com conteúdo). Funil, obrigado, WhatsApp, upsell e downsell nunca bloqueiam. O editor de funis deixou de exigir WhatsApp em produtos publicados (a entrega continua obrigatória). Com funil principal válido, publicar continua a ativá-lo no checkout; um funil de outra conta nunca é usado.

**Interface:** removidos «Falta: funil…», «Completar configuração» e o título «Produto incompleto — configure o funil…»; o produto mostra «Pronto para publicar / Pronto para vender» ou «Para publicar falta a entrega do produto», mais uma linha «Funil (opcional)». A lista de Produtos só assinala a entrega em falta («Configurar entrega →»). Textos do formulário atualizados. Cartões da aba Funis sem as linhas de WhatsApp/obrigado.

**Entrega sem funil:** reutiliza a entrega existente — `purchasedProducts`/`getAccessArea` e o download autenticado `/acesso/<token>/ficheiro/<id>`; `/pagamento/<token>` redireciona para `/acesso/<token>` quando não há funil (com funil segue `nextDestination`, como antes). Página de acesso mostra a imagem do produto. Sem novas tabelas nem migração.

**Testes:** `tests/integration/simple-mode.test.ts` (5: PDF sem funil publica; compra pendente sem acesso, paga com acesso direto e sem duplicados; SaaS sem funil; produto sem entrega bloqueado; produto com funil com upsell/downsell); `product-publishing.test.ts` atualizado às novas regras; E2E 02, 08, 13, 15 e 19 atualizados (19 inclui modo simples PDF e SaaS no browser, sem «Completar configuração»).

**Limitações:** produtos antigos publicados sem entrega continuam publicados («Publicado · configuração em falta») mas, depois de despublicados, só voltam a publicar com entrega. Sem funil, a página de acesso é a da plataforma (não personalizável); quem quiser personalizar usa um funil com página de obrigado.

## Entrega do produto, área de acesso do comprador e Integrações reorganizadas (sessão 19)

**Análise prévia:** a entrega existia como método no produto (`EXTERNAL_LINK` ou `INTERNAL_PAGE`), configurada só no editor de funis; PDFs privados guardados na base de dados (`ProductFile`) e descarregados apenas por `/acesso/<token>/ficheiro/<id>` (token secreto da encomenda + pagamento confirmado); cada encomenda (principal, upsell, downsell) recebe o seu `Delivery` só quando é aprovada por `applyPaymentStatus`. A aba Integrações mostrava todos os formulários e explicações numa só página.

**Entrega do produto (formulário de criar/editar produto):**
- Nova secção **«Entrega do produto» → «Como o cliente vai receber este produto?»**:
  - **Produto digital (PDF)**: carregar do computador/telemóvel, ver nome e tamanho, **Substituir**, **Remover**. Guardado na base de dados (privado, sem URL público). Num produto novo o ficheiro fica em memória e é enviado logo após a criação.
  - **SaaS ou acesso online**: link da aplicação/área de membros, validado (`https://…`), com «Testar link».
  - Produtos que já usavam a **página de entrega interna** continuam com essa opção (editada no funil).
- Não enviar a secção = manter a configuração; produto **publicado** não pode ficar sem entrega (remover o ficheiro entregue ou mudar para PDF sem ficheiro é recusado).
- Substituir o ficheiro elimina o anterior (se não for usado noutra página), para deixar de poder ser descarregado.
- Requisitos de publicação: método + conteúdo (ficheiro ou link) com ligação para `/produtos/<id>#entrega`.
- O editor de funis («Entrega do produto») também oferece o método **Ficheiro (PDF)**, sincronizado com o produto.
- **Migração aditiva** `20261028090000_delivery_file`: valor `FILE` no enum `DeliveryMethod` e `Product.deliveryFileId` (FK `SET NULL`). Nenhum dado alterado.

**Entrega depois do pagamento (principal, upsell, downsell):**
- `purchasedProducts()` (`src/server/services/delivery.ts`) junta a compra principal e cada upsell/downsell **pago**; cada produto usa o seu método de entrega e o acesso (token) da encomenda que o pagou.
- Página de obrigado: «O seu produto: <nome>» + **Descarregar produto** (PDF) ou **Aceder ao meu produto** (link); upsells/downsells pagos aparecem com o seu próprio botão; pendentes ou falhados não aparecem. Recusar ofertas nunca retira o produto principal.
- **Área «Os meus produtos»** (`/acesso/<token>`): todos os produtos pagos da compra (a partir do token de qualquer encomenda da compra), com o link pessoal para guardar/copiar. Reembolso revoga o acesso.
- O download continua a validar o token **da encomenda que pagou o produto** — conhecer o ID do ficheiro ou o token de outra compra não dá acesso.

**Recuperação do acesso (sem email):** `/acesso` — o comprador indica o **email da compra + código da encomenda** (mostrado na página de obrigado) ou **email + telemóvel do pagamento**; recebe as ligações das compras **confirmadas**. Limitado por IP e por email; respostas iguais quando nada é encontrado.

**Integrações:**
- `/integracoes`: cartões compactos por categoria (Pagamentos: EPay, E2Payments; Rastreamento: Facebook Pixel) com ícone, nome, estado, descrição curta, métodos/resumo, **Configurar** e **Ativar/Desativar** (Meta: ativa/desativa todos os Pixels). Registo de integrações recolhido.
- `/integracoes/epay`, `/integracoes/e2payments`, `/integracoes/meta`: página de configuração com credenciais (mesmos formulários e ações), estado e ações; «Detalhes técnicos» e «Como funciona» em secções recolhidas.
- Nenhum campo, endpoint, webhook, credencial ou ação foi removido; credenciais continuam cifradas e mascaradas (testado que as guardadas se mantêm).

**Testes:** `tests/integration/product-delivery.test.ts` (9: PDF e SaaS, preservação, substituir/remover, publicado protegido, isolamento entre contas, entrega só após pagamento, sem URL público, reembolso, principal PDF + upsell SaaS + downsell PDF, recusar mantém o principal, sem duplicados, recuperação); `e2e/19-delivery-integrations.spec.ts` (5: integrações preservadas e interruptores, criar produto PDF com upload, criar SaaS com validação, compra/pendente/download/área/recuperação, telemóvel); specs 07, 08, 10 e 17 adaptados.

**Limitações / dependem de configuração externa:**
- Ficheiros até 4 MB (limite de pedido da Vercel) e só PDF; ficheiros maiores exigem armazenamento de objetos (S3/Vercel Blob) — não configurado.
- Sem envio de email: o acesso depende do link pessoal e da recuperação por email + código/telemóvel. Com um fornecedor de email (Resend já existe para a palavra-passe) seria possível enviar o link automaticamente.
- O link pessoal é permanente enquanto a compra estiver paga (como um bilhete): quem o tiver acede. Não o partilhar.

## Funis: entrada única, várias ofertas, páginas externas e página de obrigado externa (sessão 18)

**Objetivo:** área de Funis com uma só entrada («Funil avançado»), etapas organizadas num mapa, upsells/downsells com página externa opcional (código de integração), página de obrigado interna ou externa e registo correto de cada venda — sem tocar na EPay, na E2Payments, nos webhooks, na confirmação de pagamentos, no checkout principal nem na entrega.

**Análise da estrutura existente (antes de alterar):**
- Dois tipos de funil: o do «assistente» (com `productId`, o que faz vendas reais: checkout do produto, upsell pago, página de obrigado, suporte, entrega e publicação) e o «avançado» antigo (React Flow, sem produto, usado sobretudo em simulação/demonstração).
- O motor real (`src/server/services/post-purchase.ts`) já criava uma **encomenda própria** para cada upsell/downsell aceite (`parentOrderId`, `funnelId`, `funnelStepKey`, item `UPSELL`/`DOWNSELL`), cobrada pelos gateways existentes e só aprovada por `applyPaymentStatus` — por isso o registo de vendas (ponto 9) foi mantido e reforçado com testes, não reescrito.

**O que mudou:**
| Área | Alteração |
|---|---|
| Entrada | Botão único **«Funil avançado»** (nome + produto principal); «Criar funil» removido. Abre o editor com mapa. O endereço `/funis?criar=<produto>` («Completar configuração») continua a funcionar. |
| Editor | Mapa do funil (Compra principal → ofertas com ramos **Se aceitar / Se recusar** → Página de obrigado; Suporte e Entrega do produto) e painel da etapa selecionada. Vários upsells/downsells (até 10), destinos escolhidos por etapa (só para etapas seguintes ou para o obrigado — sem ciclos nem saltos para trás), «Tipo de venda» Upsell/Downsell, remover etapa. |
| Etapa de oferta | Nome da etapa · Produto · Preço cobrado (por omissão o preço principal; preço especial criável na etapa) · **Link da página** (opcional) · Botão de aceitar · Botão de recusar · destinos · se o pagamento falhar. Título/texto/imagem/vídeo antigos deixaram de ser editados aqui mas **são preservados** e continuam a aparecer na página de oferta da plataforma. |
| Página de obrigado | Nome da etapa · Título · Mensagem · **Usar página de obrigado do site** (ativado/desativado) · **Redirecionar para**. Ativado: página da plataforma (com botão «Continuar» se houver endereço). Desativado: o comprador vai para o endereço externo **só depois do pagamento confirmado**. A página interna nunca é apagada; aparência e textos adicionais ficam num bloco recolhido. |
| Editor visual antigo | Paleta sem «Checkout principal», «Página de vendas» e «Oferta adicional»; etapas destes tipos já existentes mantêm-se e continuam editáveis. |
| Lista de funis | Cartão mostra a sequência real (upsells/downsells pelo nome e o tipo de obrigado). |

**Páginas externas (código de integração):**
- Com «Link da página», depois do pagamento confirmado o comprador é enviado para essa página com `?ntp_run=<percurso>&ntp_step=<etapa>` (parâmetros existentes da página mantidos). `ntp_run` é o identificador aleatório (20 caracteres) do percurso dessa compra; não dá acesso a dados pessoais nem permite marcar pagamentos.
- O editor mostra o código para colar: `<script src="<site>/ntp-funil.js" defer></script>` + botões `href="#ntp-aceitar"` / `href="#ntp-recusar"` (também `data-ntp-accept`/`data-ntp-decline` ou as classes `ntp-aceitar`/`ntp-recusar`). Funciona em HTML simples e em construtores que só permitem ligações. Sem segredos.
- `public/ntp-funil.js` envia a decisão por formulário (navegação de topo, sem CORS) para `POST /api/public/funil/v1/aceitar|recusar`; expõe também `NTPFunil.estado()` (`GET …/estado`, CORS, sem dados pessoais) para personalizar a página.
- O servidor valida percurso, etapa **atual**, compra inicial aprovada e ação. **Aceitar não cria venda**: leva ao pagamento da oferta na plataforma (`/oferta/<percurso>`, EPay/E2Payments). **Recusar** avança o percurso para o destino configurado (outra oferta — interna ou externa — ou o obrigado). Etapa errada, percurso inventado ou oferta já decidida → o comprador segue para onde o percurso realmente está; nada é aceite nem saltado.

**Registo das vendas:** compra principal e cada upsell/downsell são encomendas distintas (código único, produto, valor pago, moeda, `funnelId`, `funnelStepKey`, tipo `MAIN`/`UPSELL`/`DOWNSELL`, pagamento com referência do gateway e estado). Só ficam pagas quando o gateway confirma; webhooks repetidos e cliques repetidos não duplicam (chaves de idempotência e encomenda única por etapa). A integração Meta (sessão 17) envia cada uma como compra própria, respeitando os produtos selecionados.

**Ficheiros:** `src/lib/funnels/wizard.ts` (modelo `offers[]`, conversão do formato antigo, grafo), `src/server/services/funnel-wizard.ts`, `src/server/services/post-purchase.ts` (destinos externos, obrigado externo, etapas não autorizadas), `src/app/api/public/funil/v1/[acao]/route.ts`, `public/ntp-funil.js`, `src/components/funnels/funnel-wizard.tsx` (editor reescrito), `new-wizard-funnel-button.tsx`, `funnel-builder.tsx` (paleta), `src/app/(app)/funis/*`, `thank-you-content.tsx`, `src/lib/funnels/validate.ts` (título da oferta passa a opcional). **Sem migração** (configuração guardada no JSON das etapas).

**Compatibilidade:** pedidos no formato anterior (`afterPayment`/`upsell`/`downsell`) continuam aceites e são convertidos; funis existentes reabrem com as suas ofertas, textos e preços; o mesmo grafo e o mesmo motor servem funis novos e antigos.

**Testes:** `tests/integration/funnels-external.test.ts` (12) cobre os 15 cenários pedidos (obrigado interno/externo/desativado, upsell com produto, página externa, aceitar/recusar, downsell, cliques sem venda, pagamentos por confirmar, duplicados, comunicação com páginas externas, etapas não autorizadas, funis antigos, vários upsells em sequência); `e2e/18-funnels-external.spec.ts` (5) faz o fluxo completo no browser com uma página externa servida pelo teste e o código copiado do editor; specs 03, 04, 08 e 16 atualizadas para a nova interface.

**Limitações / dependem de configuração externa:**
- A oferta numa página externa é **paga sempre na plataforma** (EPay/E2Payments). Um checkout externo (pago fora da plataforma) não pode ser confirmado com segurança e por isso não é suportado: a página externa apresenta a oferta; o botão de aceitar leva ao pagamento seguro.
- A página externa tem de incluir o script e manter os parâmetros `ntp_run`/`ntp_step`; construtores que bloqueiam scripts precisam de permitir HTML personalizado.
- Com a página de obrigado externa, o comprador não vê o botão de acesso nem o suporte WhatsApp da plataforma: a página externa deve explicar como aceder ao produto.

## Facebook Pixel / API de Conversões (sessão 17)

**Onde:** Integrações → «Rastreamento de anúncios» → cartão «Facebook Pixel / API de Conversões».

- Por conta: ID do Pixel, **token da API de Conversões cifrado** (AES-256-GCM, `secret-box`), código de eventos de teste opcional, ativo/inativo, produtos selecionados por caixas. O token nunca é devolvido ao browser (só `••••últimos4`), nem posto em URLs, logs ou mensagens de erro (removido de qualquer texto de erro da Meta).
- Evento **Purchase** enviado pelo servidor (`POST https://graph.facebook.com/v21.0/{pixel_id}/events`, token no corpo) **apenas para encomendas APROVADAS** (aprovação exclusiva de `applyPaymentStatus`; `confirm.ts` não foi alterado) que tenham um produto selecionado, num Pixel ativo da mesma conta, aprovadas depois da seleção e com menos de 7 dias. Nunca para checkout aberto, pagamento iniciado/pendente/falhado, abandonado ou demonstração. Pagamentos de teste só com código de eventos de teste.
- Conteúdo: `event_name`, `event_time` (aprovação), `event_id` = `purchase_<encomenda>` (o mesmo em todas as tentativas), `action_source: website`, `event_source_url` (sem query), `user_data` só com hash SHA-256 (email, telefone, ID de cliente) + navegador e `fbc` (clique do anúncio), `custom_data` (moeda, valor pago proporcional aos produtos selecionados, `content_ids`, `content_name`, `num_items`, `order_id`).
- Fila idempotente `MetaEvent` (única por Pixel + encomenda), reivindicação com `lockedUntil`, novas tentativas com espera exponencial (até 5), erros 4xx permanentes não repetem; estado e estatísticas no cartão; falhas no registo de integrações (sem token).
- Disparo: depois de cada venda (mesmo `after()` das notificações) e na rotina diária (`/api/cron/notifications`) como rede de segurança. Contexto do navegador gravado pela ação do checkout depois de criar a compra (nunca altera a compra).
- Upsell/downsell: cada encomenda confirmada gera o seu evento com o produto e o valor pagos (contexto do navegador herdado da compra principal).
- Migração **aditiva** `20261026090000_meta_conversions` (MetaPixel, MetaPixelProduct, MetaEvent, OrderTrackingContext).
- Testes: `tests/integration/meta-capi.test.ts` (10) e `e2e/17-meta-pixel.spec.ts` (2).
- Não incluído (por decisão de segurança/âmbito): o script do Pixel no browser (o evento é só servidor), reembolsos (a API de Conversões não tem evento de reembolso padrão).

## Formulário de produto simplificado, foto por upload e ofertas centralizadas nos funis (sessão 16)

### Análise antes de alterar
| Campo/secção | Onde é usado | Decisão |
|---|---|---|
| URL da imagem (`Product.imageUrl`) | cartões, checkout, editor; EPay só recebe `image_url` se for https | Saiu da interface → upload para a biblioteca de imagens já existente; URLs antigos continuam válidos |
| Preço de referência (`Offer.compareAtCents`) | checkout (preço riscado), página de upsell | Saiu do formulário; **o valor guardado mantém-se** (antes, guardar sem o campo apagava-o) |
| Configurações adicionais (só «Página de vendas», `salesPageUrl`) | não usada por checkout, pagamentos nem entrega | Saiu do formulário; o valor guardado mantém-se |
| Ofertas e preços (tabela `Offer`) | upsell do funil escolhe um preço; checkouts | Cartão removido do produto; os preços passam a criar-se no funil; nada foi apagado |

**Base de dados: sem migração.** Nenhum campo, tabela ou dado foi apagado.

### O que mudou
- **Formulário de produto** (criar e editar): Nome do produto → Descrição → **Imagem do produto** → Preço principal + Moeda → Tipo + Categoria → (Estado, na edição) → **Guardar produto**. Nota a indicar que upsells, downsells e outras ofertas se configuram na aba Funis.
- **Imagem do produto**: botão «Carregar imagem» (seletor nativo: galeria, câmara ou ficheiros em computador/Android/iPhone), pré-visualização, «Substituir imagem», «Remover». Validação no browser (tipo e 3 MB) e no servidor (tipo real pelos bytes, tamanho, dimensões); mensagem clara em caso de erro; fotos grandes reduzidas no browser. A imagem é guardada na biblioteca da conta e o produto aponta para ela ao guardar (persiste ao recarregar). O servidor recusa imagens de outra conta e caminhos forjados; uma imagem usada como foto de produto não pode ser apagada da biblioteca. Aparece nos cartões/tabela de Produtos, no checkout, no editor, nos funis e — novo — no Dashboard («Desempenho por produto»).
- **Funis (assistente)**: «Criar um preço especial para esta oferta» diretamente no upsell/downsell (mesmo serviço `addOffer`, conta verificada). **Downsell**: no upsell, «Destino após recusar → Mostrar downsell» abre a etapa Downsell (produto, preço, textos, destinos). Implementado com a etapa `DOWNSELL` que o motor de funis já suportava — não é um sistema novo. Funis existentes não mudam.
- **Correção no motor de funis** (pós-compra, sem tocar em pagamentos): ao recusar uma oferta, o percurso ia sempre para a página de obrigado mesmo que a ligação seguinte fosse outra oferta — o downsell (também em funis do editor avançado) nunca era mostrado. Agora o percurso continua na oferta seguinte; se o pagamento de uma oferta falhar, o destino configurado para a falha prevalece (como antes). A compra feita num downsell fica registada como «Downsell» (antes «Upsell»; só etiqueta, sem mudança de valores).

### Ficheiros principais
`src/components/products/{product-form,product-image-field}.tsx` (novo campo), `src/lib/image-upload.ts` (novo, partilhado com o editor), `src/components/checkout-editor/media-picker.tsx`, `src/server/validation/schemas.ts`, `src/server/services/{products,media,funnel-wizard,post-purchase}.ts`, `src/lib/funnels/wizard.ts`, `src/components/funnels/funnel-wizard.tsx`, `src/app/(app)/funis/{actions.ts,[id]/page.tsx}`, `src/app/(app)/produtos/{actions.ts,novo/page.tsx,[id]/page.tsx}`, `src/app/(app)/dashboard/page.tsx`, `src/app/oferta/[runId]/{page,real-offer}.tsx`. Removido: `src/components/products/offers-card.tsx` e as ações `addOfferAction`/`setOfferActiveAction` do produto (o serviço `addOffer` mantém-se e é usado pelo funil).

### Testes
- Integração (`tests/integration/product-form-funnels.test.ts`, 10): criar/substituir/remover imagem e persistência; imagem de outra conta e caminhos forjados recusados; URL antigo mantido; foto de produto protegida contra eliminação; preço de referência e página de vendas preservados ao guardar (e preço riscado limpo se deixar de fazer sentido); ofertas existentes preservadas; funil com upsell + downsell (grafo, reabrir, validação, preço de outra conta recusado); **compra real com o fornecedor de teste**: recusar upsell → downsell → aceitar → cobrança do preço do downsell, registada como DOWNSELL, compra inicial intacta; recusar também o downsell → página de obrigado; funil só com upsell igual ao anterior.
- E2E (`e2e/16-product-form-funnel-offers.spec.ts`, 5): criar produto com foto do dispositivo (ficheiro inválido → mensagem), campos removidos ausentes e ordem do formulário, persistência após recarregar, foto na lista e no checkout de um produto publicado com o preço correto, substituir/remover/persistir, criação no telemóvel por toque, funil com preço criado no funil + downsell, compra de teste completa com downsell. Testes anteriores atualizados para os novos textos («Nome do produto», «Preço principal», «Guardar produto»).
- Resultados: `npm test` ✅ 272/272 · `npm run test:e2e` ✅ 117/117 · lint ✅ · typecheck ✅ · build ✅.

### APIs e pagamentos
Não alterados: EPay, E2Payments, endpoints, webhooks, criação/confirmação de pagamentos, regras de cobrança, credenciais. A alteração em `post-purchase.ts` é só no encaminhamento do percurso do funil depois de uma oferta (e na etiqueta do item).

### Pendências
- **EPay e imagens carregadas**: a EPay só recebe a imagem do produto se for um endereço `https://` completo (`epay.ts`); imagens carregadas são caminhos internos (`/api/public/media/…`), por isso a página de pagamento alojada da EPay deixa de mostrar a foto desses produtos (campo opcional; o pagamento funciona). Corrigir exige enviar o endereço absoluto no fluxo de pagamento — aguarda autorização.
- Ofertas antigas ficam guardadas e utilizáveis nos funis; já não há ecrã para as desativar (antes no cartão do produto).
- **Erro de hidratação intermitente** (React #418): visto 1 vez por corrida completa em páginas diferentes (Relatórios, utilizador da Administração), não reproduzido em 60+ carregamentos em produção e desenvolvimento; o React recupera sozinho. A auditoria recarrega a página uma vez e regista a ocorrência. Causa por identificar.
- Fotos HEIC escolhidas em «Ficheiros» no Android são recusadas com mensagem (o iPhone converte para JPEG automaticamente).

## Auditoria de interface, compatibilidade entre dispositivos e remoção da aba Cupom (sessão 15)

### Diagnóstico (como foi feito)
- Varrimento automático (`e2e/14-audit.spec.ts`) de **todas as páginas do painel** (Dashboard, Produtos, criar/editar produto, Funis e funil, Personalizar Checkout e editor, Pedidos e pedido, Clientes e cliente, Relatórios, Notificações, Integrações, Configurações, Administração, utilizadores e utilizador) e das páginas públicas (checkout, login, registo, recuperar) em **12 larguras**: 320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1366, 1440 e 1920 px. Procura deslocamento horizontal, conteúdo fora do ecrã, áreas com deslocamento lateral escondido, textos cortados/invisíveis/< 10,5 px, controlos de toque < 28 px (telemóvel/tablet) e erros na consola.
- Revisão do código à procura de controlos que só aparecem com o rato (hover), menus/modais que podem ficar cortados e campos que provocam zoom no iPhone.
- Testes de interação reais com toque (`e2e/15-touch-interactions.spec.ts`) a 375 px (telemóvel) e 768 px (tablet).
- **Limitação honesta**: os testes usam o Chromium com simulação de telemóvel/tablet (toque, `isMobile`, larguras). Não foram usados aparelhos físicos Android/iPhone, nem o Safari real, nem o teclado virtual real.

### Problemas encontrados e corrigidos
| # | Problema | Onde | Correção |
|---|---|---|---|
| 1 | A página do pedido ficava mais larga do que o ecrã (telemóvel **e** computador 1024/1280) por causa da referência de pagamento longa | `pedidos/[id]` | O valor quebra linha (`overflow-wrap`/`break-all`); só apresentação — a referência não foi alterada |
| 2 | Página do produto a 320 px com 7 px de deslocamento (selos do «Link de Checkout») | `ui/card.tsx` (CardHeader) | Ações do cabeçalho podem quebrar linha |
| 3 | Dicas (ícone «?») dos indicadores **inacessíveis no iPhone** (só abriam com rato/foco; o Safari não dá foco a botões ao tocar), alvo de 14 px e podiam sair do ecrã | `ui/tooltip.tsx` | Toque alterna a dica, tocar fora/Escape fecha, área de toque de 32 px, posição corrigida para nunca sair do ecrã |
| 4 | Menu de ações (⋯) **cortado na última linha das tabelas** (o contentor com deslocamento lateral corta o menu) e fecho dependente de `mousedown` | `ui/row-menu.tsx` | Menu com posição fixa calculada a partir do botão (abre para cima se não houver espaço), fecha com `pointerdown`/Escape/deslocamento; itens mais altos para toque |
| 5 | Modal: botão «Fechar» com 24 px; altura `85vh` não encolhe com o teclado virtual do iPhone | `ui/modal.tsx` | Botão de 36 px; altura máxima em `85dvh` (com alternativa `85vh`) |
| 6 | Chips de período (Dashboard/Relatórios) e separadores da Administração escondidos numa faixa com deslocamento lateral (ex.: «Personalizado», «Contas suspensas» fora do ecrã) | `filters/range-filter.tsx`, `admin/admin-ui.tsx` | Quebram linha: todas as opções visíveis |
| 7 | Etapas do funil numa faixa de 1148 px — escondidas até em 1280–1440 px | `funnels/funnel-wizard.tsx` | Grelha de 2/3/5 colunas conforme a largura |
| 8 | Botão «Copiar link do checkout» esmagado (18–24 px) no funil | `funnel-wizard.tsx` | Não encolhe |
| 9 | Tabelas que precisavam de deslocamento lateral em tablets e portáteis: Pedidos (768–1280), Relatórios (até 1920), Clientes, Cliente, Administração | `ui/data-table.tsx` e páginas | Até 1023 px usam os cartões (mais fáceis ao toque); colunas secundárias só aparecem quando há espaço (Produto em Pedidos ≥ 1280; Gateway ≥ 1400; Referência ≥ 1800; Telefone, Registo, Último acesso ≥ 1280; Itens ≥ 1536); a Origem do pedido passou para junto do Estado (sempre visível); a coluna Moeda dos Relatórios saiu (o valor já mostra a moeda); a tabela de transações começa a 1280 px |
| 10 | Controlos só com hover: apagar imagem da biblioteca e «Substituir imagem» invisíveis em ecrãs táteis | `checkout-editor/media-picker.tsx`, `properties.tsx` | Sempre visíveis em ecrãs sem hover |
| 11 | Alvos de toque pequenos: breadcrumbs, «Ver todos →», «Relatórios», «Checkouts adicionais…», ordenação dos relatórios, títulos dos cartões de funis/checkouts, interruptores das notificações, botões de dispositivo do editor (28×24) | vários | Área de toque ≥ 28–36 px sem mudar o aspeto (padding/pseudo-elemento) |
| 12 | Barra do elemento selecionado no editor (mover ↑/↓, duplicar, eliminar — a alternativa ao arrastar) com 28 px | `checkout-editor/editor.tsx` | 36 px em ecrãs táteis (`pointer-coarse`) |

### Aba Cupom removida
- Antes de remover: a aba só existia em `nav.ts` (menu), `src/app/(app)/cupons/*` (lista, novo, editar, ações) e `src/components/coupons/*` (formulário e testador) — nenhum outro fluxo os usava.
- Removido: entrada do menu, páginas, ações e componentes exclusivos. Endereços antigos (`/cupons…`) redirecionam para o Dashboard (`next.config.ts`).
- **Mantido**: tabela e dados dos cupões na base de dados, serviço de cupões, validação/desconto no checkout e no pagamento, cupões em pedidos históricos, opção «Permitir cupões» do checkout. Os cupões já existentes continuam a funcionar no checkout.

### Funcionalidades testadas (navegador Chromium, simulação)
Menu lateral (abrir/navegar/fechar), criar e editar produto, publicação bloqueada para produto incompleto, menu dos cartões (dentro do ecrã) e «Duplicar», modal de alterar palavra-passe (cabe e fecha), dicas por toque, período dos relatórios, etapas do funil e guardar suporte WhatsApp, editor do checkout sem arrastar (adicionar título, editar texto, mover com botões, eliminar, guardar), separadores e utilizador da Administração; menu da última linha da tabela no computador; e toda a suíte anterior (pagamentos de teste, funis, entrega, editor com arrastar, notificações, multiutilizador, configurações).

### Resultados
`npm test` ✅ 262/262 · `npm run test:e2e` ✅ 112/112 (inclui a auditoria em modo estrito: 0 problemas nas 12 larguras, 0 erros na consola) · lint ✅ · typecheck ✅ · build ✅.

### APIs e pagamentos
**Não foram modificados**: EPay, E2Payments, endpoints, webhooks, criação/confirmação de transações, regras de cobrança, credenciais, variáveis de ambiente e configuração dos gateways. Nenhum ficheiro em `src/server/payments`, `src/server/services/{purchase,payment-flow,coupon-logic,coupons}`, `src/app/api`, `prisma` ou `.env*` foi alterado. Não foi encontrado nenhum problema nas integrações durante a auditoria.

### Pendências
- Testes em aparelhos físicos (Android/iPhone, Safari, teclado virtual real, zoom do sistema e orientação horizontal) — feitos apenas por simulação.
- **Decisão sua**: o campo «Cupão de desconto» continua no checkout (opção `allowCoupons`, ativa por predefinição). Sem a aba, não é possível criar cupões novos; os existentes funcionam. Se quiser, o campo pode ser escondido no checkout — não o fiz porque toca no checkout e pediu para não mexer em referências a cupões fora da aba.
- O editor de funil avançado (React Flow, `/checkouts/avancado` e funis avançados) não foi auditado em profundidade no telemóvel além do varrimento de carregamento.

## Checkout simplificado, cronómetro, editor simples e revisão mobile (sessão 14)

### O que mudou
- **Estrutura padrão do checkout** (uma coluna, como nas plataformas de produtos digitais): 1. nome do produto · 2. imagem (só se existir — sem marcador de iniciais no checkout público) · 3. preço · 4. dados do comprador · 5. métodos de pagamento · 6. total + botão de finalizar. Aplica-se a todos os checkouts sem personalização guardada; quem já personalizou pode usar «Restaurar estrutura padrão» no editor.
- **Sem duplicação**: o formulário já não repete «Produto · Preço principal / preço / Total». O total aparece **uma única vez**, junto ao botão; com cupão mostra só subtotal, desconto e total. Os valores continuam a vir do servidor (nada mudou no cálculo nem no que é cobrado).
- **EPay**: a mensagem «Pagamento seguro com M-Pesa, e-Mola ou IZI. Ao continuar, será encaminhado…» foi removida (tanto com a EPay como único gateway como quando é escolhida entre vários). Mostra-se apenas «Pagamento: M-Pesa · e-Mola · IZI» e, no ambiente de teste, um aviso curto. **Alteração só visual**: criação da transação, encaminhamento, confirmação, avisos (webhooks), estado da venda, idempotência e entrega não foram tocados. A E2Payments mantém o seu fluxo e o seu aviso de confirmação no telemóvel.
- **Cronómetro**: a cor escolhida preenche **todo** o componente (fundo, área dos números e das unidades — as áreas internas usam a mesma cor ligeiramente realçada, nunca branco/transparente); números e texto brancos (ou escuros se a cor for muito clara; ou a cor de texto escolhida). Tamanhos pequeno/médio/grande; grelha que se adapta à largura (não corta números nem ultrapassa o ecrã). A cor já não é aplicada à caixa exterior nem a outros elementos. Antes do primeiro cálculo mostra «--» (deixou de aparecer o texto de «terminado» por instantes). Novos campos no design (`bgColor`, `textColor`, `size`) com predefinições — designs antigos continuam válidos; um fundo antigo do elemento é usado como cor do cronómetro.
- **Editor simplificado** (mantém arrastar e soltar, mover para cima/baixo, desfazer/refazer, telemóvel/computador, rascunho/publicação):
  - Painel de elementos só com: Título, Texto, Imagem, Banner, Cronómetro, Benefícios, Depoimentos, Garantia, Espaçamento. Os restantes tipos (vídeo, perguntas, botão…) continuam a funcionar nos designs que já os têm, mas não aparecem na biblioteca.
  - **Protegidos**: nome do produto, preço e formulário de compra/pagamento — podem mudar de posição e aspeto, mas não podem ser eliminados (botão e tecla Delete bloqueados); o formulário continua obrigatório e visível também na validação do servidor.
  - Propriedades **por elemento**, sem separadores técnicos: título (texto, tamanho, cor, alinhamento), cronómetro (cor do fundo, cor do texto, tamanho, espaçamento, visibilidade), imagem (imagem, proporção, largura, cantos, alinhamento), etc. Espaçamento e visibilidade comuns.
  - **Estilo do checkout**: tema claro/escuro, cor principal, cor dos botões, cor dos textos, cor do cronómetro, fundo, texto do botão, faixa de anúncio; **Restaurar estilo padrão** (cores e tamanhos, mantém conteúdo) e **Restaurar estrutura padrão** (com confirmação; ambos podem ser desfeitos). Pré-visualização imediata.
- **Telemóvel**:
  - Aba Produtos: cartão com nome (até 2 linhas), preço e estado, **menu de ações visível** (antes ficava escondido no telemóvel), aviso de produto incompleto a toda a largura com «Completar configuração», botão «Copiar link» sem caminho cortado; filtros que não cortam o texto (uma coluna em ecrãs estreitos).
  - Campos de texto do checkout e do painel com 16 px no telemóvel (abaixo disso o iPhone amplia a página ao tocar); 15/14 px mantidos no computador.
  - Moeda apresentada como «MZN — Metical moçambicano» (não corta o código).
- **Aba Produtos no computador** (correção posterior): a tabela tinha ficado larga demais (link, pedidos e menu de ações escondidos à direita). Agora: Produto (nome em até 2 linhas + tipo/categoria) · Preço · Estado (com «Falta: …» e «Completar configuração» quando incompleto) · Copiar link · Pedidos (≥ 1280 px) · Criado em (≥ 1536 px) · ações — cabe sem deslocamento a partir de 1024 px. O cartão do telemóvel não mudou.

### Ficheiros principais
`src/lib/checkout-design.ts`, `src/components/checkouts/{checkout-view,purchase-form,checkout-elements}.tsx`, `src/components/checkout-editor/{editor,properties}.tsx`, `src/components/ui/{data-table,field}.tsx`, `src/components/filters/list-filters.tsx`, `src/app/(app)/produtos/page.tsx`, `src/components/products/product-form.tsx`, `vitest.config.ts`, `e2e/global-setup.ts` (opção `E2E_KEEP_DB=1` só para desenvolvimento).

### Base de dados
Sem migração: o design do checkout é JSON validado; os campos novos têm predefinições e os designs guardados continuam a ser lidos (testado).

### Preservado
Pagamentos EPay/E2Payments, avisos/webhooks, registos de vendas, proteção contra duplicados, regras de publicação (funil, página de obrigado, WhatsApp, entrega), página de obrigado e entrega só após confirmação — todos os testes anteriores destes fluxos continuam a passar.

### Testes
- Novos: `tests/unit/checkout-render.test.ts` (13 — checkout renderizado: nome/preço/total sem repetição e ordem; mensagem da EPay ausente com EPay ativa e em teste; fluxo da E2Payments mantido; cronómetro vermelho/azul/verde com fundo completo e texto branco, cor clara com texto escuro, cor do tema, tamanhos; cores dos botões e textos), 3 novos em `checkout-design-ops` (elementos permitidos/protegidos, restaurar estilo, compatibilidade de designs antigos), `e2e/13-mobile-review.spec.ts` (Produtos, produto, funis, editor e checkout a 320/375/414 px: sem deslocamento horizontal, sem textos fora do ecrã/cortados/invisíveis/minúsculos, menu de ações, margens, botão ≥ 44 px, campos ≥ 16 px) e `e2e/11` reescrito (estrutura simples, 9 elementos, protegidos, arrastar, cronómetro com cor completa e contagem real, estilo global e restauro, telemóvel).
- Resultados: `npm test` ✅ 262/262 · `npm run test:e2e` ✅ 86/86 · lint ✅ · typecheck ✅ · build ✅.

### Pendências desta sessão
- Checkouts **já personalizados** mantêm o seu design (não foram alterados automaticamente); o vendedor pode usar «Restaurar estrutura padrão». A duplicação do resumo e a mensagem da EPay desaparecem em todos, porque estão no formulário protegido.
- A EPay real não foi testada nesta sessão (sem acesso aos servidores; a alteração é só de apresentação).

## Produtos incompletos, WhatsApp de suporte, entrega do produto e configurações (sessão 13)

### O que mudou
- **Produtos nascem como rascunho** e só podem ser publicados (e vender) com a configuração obrigatória completa: **funil principal**, **página de obrigado**, **número WhatsApp de suporte** e **entrega do produto** (link externo **ou** página de entrega interna com conteúdo). Validação **centralizada no servidor** (`src/server/services/product-readiness.ts` → `assertPublishable`/`publishProduct`) usada por todos os caminhos: criar/editar produto, botão "Publicar", mudança de estado, "Guardar e publicar produto" no funil. Chamadas diretas às ações/serviços não contornam a regra (testado).
- **Estados visíveis**: Rascunho (configuração ainda não iniciada) · Incompleto · Pronto para publicar · Publicado (+ "Publicado · configuração em falta" para produtos antigos, ver migração). Lista de Produtos com coluna "Configuração" e a mensagem «Produto incompleto — configure o funil, a página de obrigado e a entrega do produto antes de publicar.», o que falta e «Completar configuração →» (abre a aba Funis com o produto já escolhido). No produto, cartão de requisitos com cada item clicável (leva ao passo certo do funil: `#suporte`, `#entrega`, `#obrigado`).
- **Aba Funis**: "Criar funil" → escolher produto (só da própria conta) → fluxo de compra/upsell (mantido) → página de obrigado → **Suporte WhatsApp** → **Entrega do produto** → guardar / "Guardar e publicar produto". Cada cartão mostra produto (★ se for o funil principal), página de obrigado, WhatsApp, método de entrega e conclusão. O funil principal de um produto publicado não pode ser desativado, apagado nem trocado de produto.
- **WhatsApp por produto (obrigatório)**: formato internacional validado e normalizado, link de teste `wa.me`, mensagem inicial opcional; guardado no produto (isolado por conta). Nunca é usado o número do proprietário nem um número inventado.
- **Página de obrigado**: botão «Precisa de ajuda? Fale connosco no WhatsApp» **acima** do botão de acesso; o acesso só aparece com o pagamento confirmado pelo processador.
- **Entrega**: (A) link externo validado, guardado por produto, só revelado depois da confirmação; (B) página de entrega interna `/entrega/<token>/<produto>` com título, boas-vindas, instruções, conteúdo, ficheiro ou link e texto do botão; ordem: 1.º WhatsApp «Precisa de ajuda? Fale com o nosso suporte no WhatsApp.», 2.º «ACEDER AO MEU PRODUTO» (ligado ao ficheiro/link/conteúdo real), depois o conteúdo. Ficheiros privados só pelo endpoint autenticado existente `/acesso/<token>/ficheiro/<id>`. A página de obrigado e a página de entrega são distintas (sem redirecionamentos circulares). Acesso exige encomenda **APROVADA**, não demo, que contenha o produto e seja da mesma conta (IDs/tokens alterados → "Acesso indisponível"/404).
- **Configurações** simplificadas: email da conta (só leitura), nome do utilizador, idioma, moeda padrão (só para produtos novos; preços existentes não mudam) e fuso horário. Removidos: nome do negócio editável (o painel mostra sempre "Ninguém Tá Puro"), email de suporte e o formulário permanente de palavra-passe. Segurança: «Alterar palavra-passe» (diálogo) e «Esqueceu-se da palavra-passe?». As colunas antigas de configuração não foram apagadas.
- **Recuperação da palavra-passe**: `/recuperar` → token aleatório de 32 bytes (só o hash SHA-256 é guardado), válido 30 min, uso único, pedidos novos invalidam os anteriores, máx. 3/hora por conta e 10/hora por IP, resposta genérica (não revela se o email existe); `/redefinir/<token>` define a nova palavra-passe e termina todas as sessões. Envio por email via API HTTP da Resend **apenas se** `RESEND_API_KEY` e `EMAIL_FROM` estiverem definidos. Sem isso, o proprietário gera o link em Administração → utilizador → "Palavra-passe" (auditado como `password_reset_link`; não funciona para contas OWNER).

### Ficheiros principais
`prisma/schema.prisma`, `prisma/migrations/20261024090000_product_readiness/`, `src/lib/product-setup.ts`, `src/server/services/{product-readiness,delivery,products,funnel-wizard,funnels,post-purchase,payment-flow,settings}.ts`, `src/server/auth/password-reset.ts`, `src/server/email.ts`, `src/app/entrega/[token]/[productId]/page.tsx`, `src/app/(auth)/{recuperar,redefinir}/`, `src/components/funnels/{product-setup-steps,funnel-wizard,new-wizard-funnel-button}.tsx`, `src/app/(app)/{produtos,funis,configuracoes,admin}/…`, `src/components/settings/settings-form.tsx`, `src/components/public/thank-you-content.tsx`, `src/middleware.ts`.

### Migração `20261024090000_product_readiness` (aditiva)
- Novas colunas em `Product` (`supportWhatsApp`, `supportMessage`, `deliveryMethod`, `mainFunnelId`), novo enum `DeliveryMethod`, tabelas `DeliveryPage` e `PasswordResetToken`. Nada é apagado; encomendas, pagamentos, entregas, webhooks e credenciais não são tocados.
- **Dados existentes**: `deliveryUrl` → método "link externo"; funil principal = funil do checkout principal (ou o mais recente do produto); da configuração antiga da página de obrigado copia o WhatsApp (local `8XXXXXXXX` recebe `258`) e a mensagem, o link do produto ou o PDF (→ página de entrega interna). Testada numa BD temporária com dados antigos: estados inalterados, campos corretos.
- **Produtos já publicados e incompletos** continuam publicados e a vender (estado "Publicado · configuração em falta", assinalado no painel); se forem despublicados, só voltam a publicar quando estiverem completos.
- Reverter (se necessário): `DROP TABLE "PasswordResetToken", "DeliveryPage"; ALTER TABLE "Product" DROP COLUMN "supportWhatsApp", DROP COLUMN "supportMessage", DROP COLUMN "deliveryMethod", DROP COLUMN "mainFunnelId"; DROP TYPE "DeliveryMethod";` e remover a linha em `_prisma_migrations` (perde só os dados novos).

### Testes
- Integração: `tests/integration/product-publishing.test.ts` (13 testes: rascunho obrigatório; bloqueio sem funil/obrigado/WhatsApp/entrega com a lista do que falta; WhatsApp e link inválidos rejeitados; chamadas diretas não publicam; publicação ativa o funil principal; entrega só após confirmação; página interna com ficheiro/conteúdo/link real; manipulação de IDs; isolamento entre contas; dados históricos; configurações; recuperação de palavra-passe) + `funnels-real` e `checkout-personalization` adaptados. Os outros testes passam a publicar pelo caminho real (`tests/helpers/products.ts`).
- E2E: 02 (rascunho → publicação recusada → "Completar configuração" → funil → publicar), 05/11 (compra paga → obrigado com WhatsApp acima do acesso → link externo), 08 (passo de suporte com validação e link de teste; página de entrega interna com PDF protegido; token/ID forjados recusados), **12 novo** (configurações só com os 5 campos; diálogo de alterar palavra-passe; recuperação genérica; link gerado na Administração funciona uma vez e termina sessões; telemóvel 375 px sem deslocamento horizontal em Configurações, Produtos, Funis, passo do funil e /recuperar).
- Resultados: `npm test` ✅ 246/246 · `npm run test:e2e` ✅ 79/79 · lint ✅ · typecheck ✅ · build ✅.

### Pendências desta sessão (honestas)
- **Email**: sem `RESEND_API_KEY`/`EMAIL_FROM` não há envio de email; a recuperação funciona pelo link gerado pelo proprietário. Para ativar: criar conta na Resend, verificar o domínio e definir as duas variáveis na Vercel (nunca no repositório).
- **Idioma**: a interface só existe em português; a escolha (pt-MZ/pt-PT/pt-BR) define o `lang` das páginas, não traduz textos.
- Os dados de demonstração continuam a criar produtos publicados diretamente (são fictícios e não vendem).
- Produtos gratuitos não existem (preço mínimo); a entrega exige sempre uma encomenda paga confirmada.
- Produtos antigos publicados e incompletos precisam de ser completados pelo vendedor (aparecem assinalados).

## Editor visual do checkout tipo Elementor (sessão 12)

### Análise (antes de alterar)

- O checkout era desenhado por `CheckoutView`, que juntava num só componente:
  - um cabeçalho fixo ("Nome do negócio" + "Ligação cifrada");
  - uma coluna de blocos (`checkout-blocks`), com o bloco "Compra segura" no modelo padrão;
  - o formulário de compra;
  - um rodapé ("© …" + "Suporte: …").
- A personalização era uma lista de blocos com botões ↑/↓ (`design-editor`), guardada em `CheckoutDesign.draft/published` (rascunho ≠ publicado).
- O formulário, a criação da encomenda, a EPay/E2Payments, os avisos, os funis e as páginas de obrigado/entrega estão no servidor (`purchase.ts`, `payment-flow.ts`, `post-purchase.ts`). Nada disso foi alterado.

### O que mudou

- **Remoções pedidas (só no checkout público):** saíram o "Compra segura" (também dos designs já publicados, convertidos automaticamente), o cabeçalho "Ninguém Tá Puro — Ligação cifrada" e o rodapé "© … / Suporte: …". Nada os substitui.
  - A marca continua no painel e na Administração.
  - O email de suporte continua configurável e é usado onde já era (por exemplo, na página de estado do pagamento).
  - Os mecanismos reais de segurança não mudaram.
- **Modelo padrão profissional para cada produto**, só com dados reais:
  - secção de 2 colunas (60/40);
  - à esquerda: imagem do produto (ou iniciais), nome (H1), descrição e preço com o preço anterior riscado;
  - à direita: formulário de compra, fixo ao deslocar no computador;
  - no telemóvel fica tudo numa coluna.
  - Benefícios, testemunhos, garantia e vídeo são opcionais na biblioteca, porque dependem de informação que só o vendedor tem.
- **Modelo de dados v2** (JSON em `CheckoutDesign`, validado com zod):
  - estrutura: `secções → colunas (1–3, com proporções) → elementos`, cada um com conteúdo e estilos;
  - estilos de elemento: tipo e tamanho de letra (computador e telemóvel), peso, cor, alinhamento, altura da linha, espaçamento entre letras, margens, espaço interno, largura máxima, fundo, contorno, cantos e visibilidade por dispositivo;
  - opções de secção: colunas, largura do conteúdo, espaços, alinhamento vertical, fundo, contorno e visibilidade.
  - Os designs antigos (v1) são convertidos à leitura, sem perder conteúdo. Não houve migração de dados.
- **Elementos:**
  - básicos: Título (próprio ou nome do produto), Subtítulo, Texto (próprio ou descrição do produto), Imagem, Banner, Botão, Espaçador, Divisor;
  - conteúdo: Vídeo (YouTube/Vimeo), Lista de benefícios, Testemunhos, Garantia, Bloco de informações, Elementos de confiança configuráveis, Perguntas frequentes, Cronómetro (só visual);
  - produto: Resumo do produto e Preço, sempre com os dados reais da oferta;
  - **Formulário de compra protegido**, que é a implementação real de sempre (`purchase-form.tsx`):
    - existe exatamente uma vez e não pode ser eliminado, duplicado nem ocultado;
    - pode mudar de posição e de título/texto;
    - mantém os campos obrigatórios, a validação, os cupões, os métodos EPay/E2Payments, o resumo, a idempotência e o redirecionamento.
  - O Botão só leva ao formulário ou abre um link https; nunca simula uma compra.
- **Editor** (`src/components/checkout-editor`), em ecrã inteiro:
  - biblioteca de elementos e secções à esquerda, página ao centro, propriedades à direita (separadores Conteúdo / Estilo / Avançado; definições de secção e de página);
  - **arrastar e soltar** (`@dnd-kit`, com rato, toque — premir sem largar — e teclado): da biblioteca para qualquer coluna, entre colunas e secções, e reordenar secções. Uma **linha verde mostra onde o elemento vai ficar** antes de largar;
  - duplicar, eliminar, mover ↑/↓ (também por teclado), desfazer/refazer (Ctrl+Z / Ctrl+Shift+Z), Ctrl+S, Ctrl+D e Delete;
  - pré-visualização em **Computador (1200 px reduzido à escala) / Tablet / Telemóvel**, com o layout responsivo real (consultas de contentor);
  - **Guardar rascunho**, **Pré-visualizar** (guarda o rascunho e abre-o num separador, sem publicar), **Publicar**, **Cancelar alterações** (com confirmação), **Descartar rascunho**, estado da gravação e aviso ao sair com alterações por guardar;
  - no telemóvel: separadores Elementos / Página / Propriedades, toque para adicionar, premir sem largar para arrastar.
- **Imagens:**
  - três origens: carregar do dispositivo (ou arrastar o ficheiro), biblioteca da conta (com opção de apagar) ou link https;
  - opções: largura (computador e telemóvel), largura máxima, proporção, altura, enquadramento (preencher ou mostrar toda), ponto focal, cantos, alinhamento, legenda, texto alternativo, substituir e remover;
  - as imagens grandes são reduzidas no browser (máximo 2000 px, WebP) antes do envio.
- **Desempenho:**
  - o checkout público não carrega o editor (133 kB de JavaScript inicial; o editor tem 173 kB e só carrega no painel);
  - a imagem do produto carrega com prioridade e as restantes em diferido;
  - as imagens da biblioteca são servidas com cache imutável.

### Modelo de dados e migração

- Migração `20261020090000_media_library`, apenas aditiva: tabela `MediaAsset` (`ownerId`, `filename`, `mimeType`, `sizeBytes`, `width`, `height`, `sha256`, `data`), com chave única `(ownerId, sha256)` e índice `(ownerId, createdAt)`.
- O design continua em `CheckoutDesign.draft/published` (JSON), agora com `version: 2`, secções, colunas, elementos, estilos, opções responsivas e o identificador do formulário protegido. Ao reabrir o editor, a página é reconstruída a partir da base de dados.

### Segurança

- Tudo o que o utilizador escreve é texto simples (o React escapa-o). Não há HTML, CSS livre nem scripts.
- As cores são `#RRGGBB` e os números têm limites. Os links e as imagens só aceitam `https://` ou `/api/public/media/<id>`. Os vídeos só aceitam YouTube e Vimeo, incorporados em `youtube-nocookie`.
- **Carregamento de imagens:**
  - só com sessão de uma conta aprovada e pedidos da própria origem;
  - formato verificado pelo conteúdo (JPEG, PNG, WebP ou GIF; SVG é recusado);
  - até 3 MB e até 8000 px de lado; nome do ficheiro limpo;
  - limite de 300 imagens por conta.
- **Isolamento:**
  - cada conta só lista e apaga as suas imagens;
  - uma imagem usada num rascunho ou checkout publicado não pode ser apagada;
  - ao guardar um design, o servidor confirma que todas as imagens da biblioteca pertencem à conta;
  - o editor só abre produtos da própria conta (ids de outra conta respondem 404).
- A leitura pública das imagens usa `nosniff`, CSP `sandbox` e `Content-Disposition: inline`.
- O editor mostra os métodos de pagamento ativos da conta só por nome, como o checkout público, e nunca credenciais.

### Testes executados (os 18 pontos pedidos)

`e2e/11-checkout-editor.spec.ts` (6 testes no browser, com arrastar e soltar real com o rato), `tests/unit/checkout-design-ops.test.ts` (6), `tests/integration/media.test.ts` (5) e `tests/integration/checkout-personalization.test.ts` (16, atualizados):

1. **Checkout padrão:** abre com nome, descrição, preço, formulário e resumo reais (computador e telemóvel).
2. **Remoções:** sem "Compra segura", "Ligação cifrada", "©" nem "Suporte:"; sem cabeçalho nem rodapé.
3. **Adicionar imagem:** arrastada da biblioteca, ficheiro carregado, validado e servido.
4. **Imagem acima do título:** arrastada para cima do título.
5. **Imagem abaixo do título:** movida para baixo do título.
6. **Reorganizar:** nova secção arrastada da biblioteca, descrição movida para essa secção e secção movida para o topo.
7. **Estilos:** tamanho de letra (44 px) e cor do título, com desfazer/refazer.
8. **Guardar:** rascunho guardado, com o estado visível.
9. **Persistência:** ao recarregar, a ordem, a imagem, o texto alternativo e os estilos vêm da base de dados.
10. **Publicar:** a publicação funciona e o rascunho não altera o checkout público antes disso.
11. **Versão publicada:** a página pública mostra a ordem, a imagem e os estilos publicados.
12. **Computador e telemóvel:** no telemóvel o título passa para 35 px automaticamente e não há deslocamento horizontal, também no editor.
13. **Compra de teste:** compra no checkout personalizado com o fornecedor de teste local.
14. **EPay** e 15. **E2Payments:** cobertos pelos testes de integração existentes (`epay`, `gateways`, `multi-tenant`), que continuam a passar. Os gateways são simulados; não houve pagamentos reais.
16. **Redirecionamento:** depois da confirmação oficial, o comprador é encaminhado para a página de acesso ao produto, com o link de entrega correto.
17. **Isolamento:**
    - o editor de um produto inexistente ou de outra conta responde 404;
    - apagar uma imagem de outra conta responde 404;
    - um carregamento a partir de outro site responde 403;
    - um SVG é recusado com 400;
    - sem sessão, a lista de imagens responde 401;
    - nos testes de integração: imagens e checkouts de outra conta são recusados e uma imagem em uso não é apagada.
18. **Sem erros:** em todos os testes do editor, nenhum erro de consola nem de página.

Regressão: os testes anteriores continuam todos a passar (pagamentos, funis/upsell, notificações, relatórios, multiutilizador). As especificações 05, 06 e 08 foram adaptadas ao novo editor; os comportamentos verificados são os mesmos.

### Pendências / limitações

- Edição de texto diretamente na página (como no Elementor) não foi feita: o texto é editado no painel de propriedades e aparece de imediato.
- Não há modelos de página prontos além do padrão (a estrutura permite acrescentá-los).
- As imagens ficam na base de dados (PostgreSQL). Com muito volume, mover para armazenamento de ficheiros (Vercel Blob/S3).
- Ao reabrir o editor depois de publicar, o histórico de desfazer recomeça.

## Desempenho no telemóvel (sessão 11)

### Diagnóstico (medido)

O JavaScript das páginas já era pequeno (~110 kB), exceto Dashboard e Relatórios (217 kB, por causa da biblioteca de gráficos).

O atraso vinha sobretudo do servidor: cada navegação fazia 20–50 consultas à base de dados, muitas em sequência. Em produção, cada consulta paga a latência entre a função da Vercel e a base de dados. Por exemplo, em `/produtos` havia ~11 idas sequenciais:
- sessão, depois utilizador;
- *upsert* das configurações (BEGIN/SELECT/SELECT/COMMIT), feito duas vezes;
- contagens;
- produtos, depois ofertas, depois checkouts.

No telemóvel, o menu lateral só fechava quando a página nova chegava, por isso o toque parecia não responder.

### O que mudou

- **Consultas** (medidas com o registo de consultas do Prisma):

  | Página | Antes | Depois |
  |---|---|---|
  | `/produtos` | 20 | 5 |
  | `/dashboard` | 28 | 10 |
  | `/pedidos` | 24 | 7 |
  | `/relatorios` | 52 | 24 |

  - `relationJoins` do Prisma: as relações (`include`) carregam-se numa só consulta com JOIN.
  - Sessão e conta lidas numa só consulta, só com os campos necessários.
  - Configurações lidas com uma leitura simples; o *upsert* só acontece na primeira utilização.
  - Layout do painel: tudo em paralelo; o tema vem da sessão.
  - Dashboard e Relatórios: consultas em paralelo e encomendas lidas uma só vez.
- **Tarefas de notificações**: deixaram de correr em cada navegação. Correm no máximo a cada 5 minutos por instância, e o cron diário mantém-se.
- **Gráficos (Recharts)** carregam à parte, depois da página. O JavaScript inicial do Dashboard e dos Relatórios passou de 217 kB para 110 kB.
- **Resposta imediata ao toque**:
  - o menu do telemóvel fecha no toque;
  - o item tocado mostra um indicador;
  - uma barra de progresso no topo aparece até a página chegar;
  - pesquisas e filtros na mesma página não são afetados.

### Configuração recomendada na Vercel (não verificável a partir daqui)

A **região das funções** da Vercel (Settings → Functions → Function Region) deve ser a **mesma região da base de dados** (Storage → base de dados → região).
- Com regiões diferentes, cada consulta pode custar 80–150 ms em vez de 1–5 ms.
- A latência entre a função e a BD pesa mais do que a distância ao utilizador, porque cada página faz várias consultas e o browser só faz um pedido.

## Multiutilizador, aprovação de contas e Administração da Plataforma (sessão 10)

### Análise (antes de alterar)

A plataforma era de um só dono: nenhuma tabela tinha dono, as consultas filtravam só por `isDemo`, `Settings` era uma linha única (`id = "default"`), as credenciais EPay vinham de `EPAY_SECRET_KEY` e as da E2Payments de uma configuração global, e o aviso da EPay era verificado com essa chave global. Não foi reconstruído nada: acrescentou-se o dono a cada entidade e passou-se o âmbito da conta por todas as camadas existentes.

### O que foi implementado (funcional e testado)

- **Registo** (`/registo`): nome, email, password e confirmação. A conta é criada sempre como `USER` + `PENDING_APPROVAL` no servidor; campos `role`/`status` enviados no pedido são ignorados. Limite de 5 registos por hora por IP. Um email rejeitado não pode registar-se de novo (o proprietário pode aprová-lo mais tarde).
- **Estados**: `PENDING_APPROVAL`, `APPROVED`, `REJECTED` e, à parte, a suspensão (`bannedAt`). Desbanir devolve exatamente o estado de aprovação anterior. Política central e pura em `src/server/auth/policy.ts`: `canUseApp`, `canAdminister`, `canApplyAdminAction`.
- **Página `/conta`** com os textos pedidos para pendente ("A sua conta está pendente de aprovação", estado "Em análise"), rejeitada e suspensa, mais o email, "Verificar novamente" (relê o estado da base de dados) e "Sair da conta".
- **Bloqueio real**: todas as páginas do painel (`requireUser`), todas as server actions (`guarded`) e todas as APIs privadas (`getActiveUser`) recusam contas não aprovadas ou suspensas. Banir apaga as sessões ativas. Os checkouts públicos de uma conta suspensa ou não aprovada deixam de vender. Os dados são sempre preservados.
- **Administração da Plataforma** (`/admin`, só OWNER; outros recebem 404):
  - visão geral com contagens reais (total, pendentes, aprovadas, rejeitadas, suspensas, ativas em 30 dias), registos recentes e estado da plataforma;
  - lista de utilizadores com filtros (Todos/Pendentes/Aprovados/Rejeitados/Banidos), pesquisa e paginação;
  - detalhe com dados da conta, contagens de atividade, estado das integrações (sem segredos) e histórico administrativo;
  - ações aprovar, rejeitar, banir e desbanir, com confirmação para rejeitar e banir. Cada ação é validada no servidor (estado esperado + `role = USER` num `updateMany` condicional) e registada em `AdminAuditLog`.
- **Navegação**: o grupo "Plataforma › Administração", com contador de pendentes, só aparece ao proprietário.
- **Isolamento total por conta**: produtos, ofertas, checkouts, sessões, funis, execuções, clientes, pedidos, cupões, eventos analíticos, reembolsos, configurações, integrações, registos de integração, notificações, relatórios, exportação CSV, dados de demonstração e resumo diário.
- **Credenciais de pagamento por conta**: cada conta guarda a sua chave EPay e as suas credenciais E2Payments na aba Integrações.
  - Ficam cifradas (`IntegrationConfig.secretConfig`, único por `(ownerId, provider)`) e nunca são devolvidas; a página mostra só um fragmento mascarado.
  - Cada gateway tem guardar, ativar/desativar, testar ligação (E2Payments) e estado.
  - As variáveis de ambiente `EPAY_SECRET_KEY` / `E2PAYMENTS_*` aplicam-se **só à conta proprietária** (compatibilidade com a configuração atual). Nunca há fallback para elas noutras contas: sem integração própria, o checkout dessa conta mostra "pagamentos indisponíveis" e nenhum pedido é feito ao gateway.
- **Pagamentos e avisos encaminhados para a conta certa**:
  - a cobrança usa as credenciais da conta dona do checkout;
  - o aviso EPay (`/api/webhooks/epay`) lê o id de pagamento (ainda não confiável), encontra a encomenda e a conta dona e só então verifica a assinatura HMAC com a chave **dessa** conta;
  - assinatura de outra conta ou inválida → 401; pagamento desconhecido → 404;
  - `applyPaymentStatus` confirma ainda que o pagamento pertence à conta esperada;
  - a idempotência mantém-se.
- **Dashboard e relatórios por conta**: o proprietário vê os seus dados pessoais, não estatísticas globais misturadas; o que é global está só em Administração.
- **Notificações**: as vendas notificam só a conta dona; o resumo diário é calculado por conta, no fuso horário dessa conta.

### Modelo de dados e migração

- **`User`**:
  - novos campos `role` (`OWNER`/`USER`), `status` (`AccountStatus`), `bannedAt`, `banReason`, `approvedAt`, `rejectedAt`, `lastLoginAt`;
  - índice único parcial `User_single_owner_key` (no máximo um `OWNER`, garantido pela BD).
- **`AdminAuditLog`** (novo): ator, conta alvo, ação, estado anterior/novo, motivo, data.
- **`ownerId` obrigatório** (FK `Restrict`, com índice) em `Product`, `Checkout`, `CheckoutSession`, `Funnel`, `FunnelRun`, `Customer`, `Order`, `Coupon`, `AnalyticsEvent`, `Refund` e `IntegrationConfig`; **opcional** em `IntegrationLog` e `PaymentEvent`.
- **`Settings`**: uma linha por conta (`ownerId` único).
- **Chaves únicas por conta**: `Customer (ownerId, email, isDemo)`, `Coupon (ownerId, code, isDemo)`, `IntegrationConfig (ownerId, provider)`.
- **Migração `20261016090000_multi_tenant_accounts`** (escrita à mão, aplicada por `prisma migrate deploy`, que já corre no build da Vercel):
  1. todas as contas existentes ficam `APPROVED`;
  2. a conta proprietária é a de email `chadlopesff@gmail.com` (sem distinguir maiúsculas); se não existir, a conta mais antiga;
  3. todos os dados existentes, a linha `Settings` e as configurações de integração (incluindo as credenciais E2Payments cifradas, sem as decifrar nem alterar) passam para essa conta;
  4. uma guarda aborta a migração se ficar alguma linha sem dono, antes de tornar `ownerId` obrigatório.
- Validada em cópias da base de dados: o hash das credenciais ficou inalterado e um segundo `OWNER` é recusado.
- **Atenção**: o índice parcial `User_single_owner_key` é SQL manual, que o `prisma migrate dev` não conhece. Ao gerar migrações futuras, confirmar que não incluem `DROP INDEX "User_single_owner_key"`.

### Identificação do proprietário

- O papel `OWNER` nunca vem do frontend nem da API.
- É definido pela migração, pelo `/setup` (só com a BD vazia) ou no servidor com `npm run user:set-owner -- email` (`scripts/set-owner.ts`). Este comando passa a conta anterior a `USER` e não move dados.
- O proprietário não pode ser banido, rejeitado nem alterado por ninguém (política + condição na BD).

### Isolamento: regras

- A identidade vem sempre da sessão no servidor (`getScope()` → `{ ownerId, isDemo }`), nunca de parâmetros do pedido.
- Todas as leituras e escritas usam `own(scope)` / `ownerId`. Um id de outra conta devolve "não encontrado", sem revelar que existe.
- Os fluxos públicos (checkout, pagamento, obrigado, upsell, avisos) obtêm a conta a partir do recurso (checkout → `ownerId`) e usam só os dados e credenciais dessa conta.
- `ownerId` é obrigatório no esquema, por isso o TypeScript recusa qualquer `create` sem dono.
- **Sem RLS do PostgreSQL**: o Prisma usa um pool de ligações partilhado e não definiria o utilizador por pedido de forma fiável. O isolamento é aplicado na camada de serviços e coberto pelos testes D/E/G.

### Testes (cenários A–G pedidos)

`tests/integration/multi-tenant.test.ts` (12) + `tests/unit/policy.test.ts` (3) + `e2e/10-multi-user.spec.ts` (5):

- **A**: registo → pendente; sem acesso a páginas, ações ou APIs; aprovado → entra sem novo registo.
- **B**: rejeição → sem acesso, conta não apagada; o mesmo email não se regista de novo.
- **C**: banir termina as sessões, bloqueia e preserva os dados; desbanir devolve o estado anterior; um utilizador comum não executa ações administrativas.
- **D**: isolamento de produtos, checkouts, funis, cupões, clientes, pedidos, reembolsos, relatórios, configurações e modo demo; leitura, edição e eliminação com ids de outra conta → não encontrado; uma conta não usa produtos de outra.
- **E**: credenciais separadas; alterar as de uma conta nunca muda as de outra nem as do proprietário; nada é revelado; sem fallback para as variáveis do proprietário.
- **F**: o proprietário mantém o acesso e a sua chave; o registo nunca cria `OWNER`; a BD recusa um segundo `OWNER`; ciclo aprovar/banir/desbanir/rejeitar auditado.
- **G**: a cobrança usa a chave da conta dona; um aviso válido confirma só essa venda; a repetição não duplica; um aviso assinado com a chave de outra conta ou do proprietário → 401; pagamento desconhecido → 404; a conta proprietária continua a vender com a EPay das variáveis de ambiente.
- **E2E**: registo → `/conta`; o proprietário aprova em Administração; a conta entra e não vê `/admin` (404) nem os produtos do proprietário; banir termina a sessão; desbanir; rejeitar com confirmação; telemóvel sem deslocamento horizontal.
- **Regressão**: todos os testes anteriores continuam a passar (EPay, E2Payments, checkout, funis, upsell, notificações, relatórios).
- Nenhum pagamento real foi feito; a EPay e a E2Payments foram simuladas com respostas controladas.

### Configuração em produção

1. Fazer deploy: o `vercel-build` aplica a migração. Abrir o painel com `chadlopesff@gmail.com`; o menu mostra "Administração".
2. Se a conta proprietária usar outro email, correr `npm run user:set-owner -- email` com a `DATABASE_URL` de produção.
3. As variáveis `EPAY_SECRET_KEY` / `E2PAYMENTS_*` existentes continuam a servir a conta proprietária, sem alterações. As outras contas configuram as suas credenciais na aba Integrações.

### Riscos e pendências

- Sem envio de email: o utilizador não é avisado quando é aprovado (vê-o em "Verificar novamente" ou ao entrar).
- O limite de registos por IP está em memória (por instância). Com várias instâncias, mover para armazenamento partilhado.
- O índice parcial do `OWNER` não é gerido pelo diff do Prisma (ver acima).
- A E2Payments não tem aviso de pagamento (webhook) nesta plataforma: a confirmação faz-se por consulta oficial, por conta.
- Falta uma compra real de valor baixo com a EPay de uma conta não proprietária para validar o fluxo com chaves reais.

### Ficheiros principais

- Âmbito e política: `src/server/scope.ts`, `src/server/auth/policy.ts`.
- Autenticação e Administração: `src/server/auth/session.ts`, `src/server/services/admin.ts`, `src/app/(auth)/registo`, `src/app/(auth)/conta`, `src/app/(app)/admin`.
- Gateways e avisos: `src/server/payments/gateways.ts`, `src/server/payments/webhooks.ts`.
- Migração: `prisma/migrations/20261016090000_multi_tenant_accounts`.
- Script do proprietário: `scripts/set-owner.ts`.

## Notificações push, alertas de vendas e relatórios de faturamento (sessão 9)

### Análise da arquitetura (antes de alterar)
- **Pagamentos**: a única via confiável de aprovação é `applyPaymentStatus` (`src/server/payments/confirm.ts`), chamada por webhooks assinados, consulta oficial de estado, resposta síncrona do gateway e verificação manual auditada. Os eventos de venda são gerados **aí, dentro da mesma transação** que aprova o pedido. `epay.ts` e `e2payments.ts` **não foram alterados**; nenhuma variável de ambiente existente foi alterada.
- **Alojamento**: Vercel (funções serverless). Não há fila nem processos permanentes → fila persistente na BD (outbox) + `after()` (waitUntil) + Vercel Cron diário + execução oportunista ao abrir o painel.
- **Utilizadores**: loja única; todos os utilizadores administram a mesma loja (não existe propriedade de produtos por vendedor). As notificações, preferências e dispositivos são **por utilizador**.
- **Reembolsos**: a API da EPay não faz reembolsos (documentação: "reembolso pelo painel"); a E2Payments também não documenta reembolsos. A plataforma passa a **registar** reembolsos (parciais/totais) feitos no painel do gateway.

### O que foi implementado (funcional)
- **PWA**: `manifest.webmanifest` (standalone, ícones 192/512 + maskable), ícone Apple 180 px, metadados `apple-mobile-web-app-*`, service worker `/sw.js` **só para push** (sem cache, não interceta pedidos), servido com `no-cache`.
- **Web Push com VAPID + cifra aes128gcm** (biblioteca `web-push`, RFC 8030/8291/8292). Chaves: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` se definidas; senão **geradas na primeira utilização e guardadas na BD com a privada cifrada** (secret-box) — funciona sem configurar a Vercel. A chave privada nunca chega ao browser.
- **Subscrições**: `POST/DELETE /api/push/subscription` (sessão + mesma origem + JSON + limite de pedidos); só aceita endpoints dos serviços de push conhecidos (Google/FCM, Apple, Mozilla, Microsoft) — impede SSRF; máx. 20 dispositivos por utilizador; um endpoint pertence a um só utilizador; revogação pelo utilizador, por 404/410 do serviço de push ou por mudança de chaves.
- **Fila persistente (`PushDelivery`)**: notificação + entregas gravadas na transação do evento; envio depois da resposta; até 5 tentativas com espera crescente (1 min → 2 h); 404/410 revoga; 4xx definitivo; erros registados no dispositivo e na entrega.
- **Confirmação de receção**: o conteúdo cifrado leva um token aleatório; o service worker do dispositivo chama `/api/push/receipt` ao mostrar a notificação. O botão **"Enviar notificação de teste"** mostra separadamente "Aceite pelo serviço de push (HTTP 201)" e "Recebida pelo dispositivo" — nunca afirma entrega sem essa confirmação.
- **Central de Notificações** (`/notificacoes`): lista, não lidas, contador no menu e no sino do telemóvel, marcar como lida, marcar todas, abrir o pedido/relatório, filtro por tipo, estado do push por notificação, **histórico de eventos** (auditoria dos pedidos).
- **Eventos automáticos** (idempotentes por `userId + eventKey`): venda confirmada (`sale:<pedido>`), pagamento pendente, pagamento falhado/não concluído, reembolso confirmado, resumo diário, teste. Pagamentos com credenciais de teste aparecem como "Pagamento de teste confirmado". Pedidos de demonstração não geram alertas.
- **Resumo diário**: dia anterior no fuso da plataforma, a partir das 07:00 locais, uma vez por dia (`JobRun`), com vendas, bruto, reembolsos, após reembolsos e mais vendidos.
- **Preferências** (Configurações → **Notificações e Alertas**): push on/off, novas vendas, pendentes, falhados, reembolsos, resumo diário; dispositivos subscritos com remoção; botão de teste; instruções para iPhone (instalar pelo Safari → ecrã principal → abrir a app → ativar → Permitir), para permissão recusada (Android/iPhone/computador), navegadores internos (WhatsApp/Instagram) e HTTP. A autorização **só é pedida depois do clique**.
- **Relatórios** (`/relatorios`): faturamento bruto, reembolsos, após reembolsos, vendas confirmadas, ticket médio, pendentes, falhados, nº de reembolsos, taxas registadas; comparação com o período anterior; aviso explícito **"faturamento não é lucro nem saldo disponível"** (lucro e saldo não são calculados por falta de dados de custos/liquidações); gráficos de evolução do faturamento, vendas por dia, reembolsos por dia, vendas por produto e por gateway; períodos Hoje, **Ontem**, 7/30/90 dias, este mês, mês anterior, personalizado; **tabela de transações** com pesquisa, filtros (estado, gateway, produto), ordenação (data/valor) e paginação; **exportação CSV** (`;`, UTF-8 com BOM, fórmulas neutralizadas, máx. 5000 linhas, só com sessão).
- **Reembolsos**: botão "Registar reembolso" no pedido pago (parcial ou total; soma nunca excede o total; bloqueio da linha contra registos simultâneos; em pedidos reais exige confirmar que foi feito no painel do gateway); com o total o pedido passa a REEMBOLSADO; auditoria e notificação.
- **Dashboard**: mantém os indicadores existentes (definição documentada) + ligação ao relatório financeiro detalhado.

### Regras financeiras
| Situação | Regra |
|---|---|
| Pagamento confirmado | Pedido com `approvedAt` e estado Pago/Reembolsado; conta no dia da confirmação (fuso da plataforma) |
| Pendente | Não entra no faturamento; contado à parte |
| Falhado / cancelado / expirado | Não entra no faturamento; contados à parte |
| Reembolso parcial/total | Registo próprio (`Refund`), subtraído no dia do registo; o pedido continua a ser venda no dia em que foi pago |
| Eventos duplicados | Soma-se por pedido (não por evento/tentativa); a aprovação é uma transição condicional única |
| Pagamento extra num pedido já pago | Não é somado; fica registado para reembolso manual (comportamento existente) |
| Várias moedas | Nunca somadas; seleção de moeda |
| Pagamentos de teste / demonstração | Fora dos relatórios reais |
| Limites dos dias | 00:00–23:59 no fuso `Settings.timezone` (Africa/Maputo por omissão) |

### Variáveis de ambiente (novas, todas opcionais)
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` (ver `.env.example`). Nenhuma variável da EPay/E2Payments foi alterada.

### Configuração do Web Push em produção
1. Nada obrigatório: as chaves VAPID são geradas e guardadas automaticamente. (Opcional: fixá-las com `npx web-push generate-vapid-keys` → `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`; mudar as chaves obriga a reativar os dispositivos.)
2. Recomendado: definir `CRON_SECRET` (≥ 16 caracteres) na Vercel para o cron diário (`vercel.json`, 05:10 UTC = 07:10 em Maputo). Sem ele, o resumo e os reenvios correm quando alguém abre o painel.
3. Em cada telemóvel: Configurações → Notificações e Alertas → **Ativar notificações** → **Enviar notificação de teste**.

### Testes (16 cenários pedidos)
| # | Cenário | Onde | Resultado |
|---|---|---|---|
| 1 | Pagamento confirmado → uma única notificação de venda | integração `notifications` 1; E2E 09 "venda confirmada" | ✅ |
| 2 | Eventos repetidos sem duplicar notificações/faturamento | integração 2 (webhook repetido, outro id, consulta de estado) | ✅ |
| 3 | Pendentes não contam como confirmados | integração 3 (2 testes); E2E 09 relatórios | ✅ |
| 4 | Reembolsos atualizam relatórios | integração 4 (parcial+total, excesso recusado, demo); E2E 09 reembolso pela interface | ✅ |
| 5 | Separação por gateway | integração 5 (EPay vs E2Payments) | ✅ |
| 6 | Subscrever dispositivo | integração 6 (válido, endpoint malicioso, chaves inválidas) | ✅ (servidor) |
| 7 | Revogar subscrição | integração 7 | ✅ |
| 8 | Notificação de teste | integração 8 (aceite vs recebida, token de receção); E2E 09 (sem dispositivo) | ✅ |
| 9 | Instalação da PWA | E2E 09 (manifest, ícones, service worker ativo, metadados Apple) | ✅ (critérios técnicos) |
| 10 | Android | E2E 09 com agente Android (autorização só após clique) | ⚠️ simulado no Chromium |
| 11 | iPhone: instalação e autorização | E2E 09 com agente iPhone (instruções) | ⚠️ simulado; sem iPhone real |
| 12 | Permissões recusadas | E2E 09 (instruções de correção; recusa não regista) | ✅ |
| 13 | Notificações internas mantêm-se se o push falhar | integração 12–13 (503 com tentativas, 410 revoga); E2E 09 | ✅ |
| 14 | Filtros e cálculos | integração 3/4/5/14 ("Ontem" no fuso, resumo diário); E2E 09 (filtros, CSV) | ✅ |
| 15 | Vendedor não vê vendas de outro | integração 15 (notificações, dispositivos, estados de entrega isolados por utilizador) | ⚠️ ver limitação (loja única) |
| 16 | EPay e E2Payments continuam funcionais | testes existentes de gateways (18) + E2E 05/07 sem alterações | ✅ (servidores simulados) |

Cifra e VAPID verificados com uma chave de dispositivo real gerada no teste: o conteúdo só é decifrável com a chave privada do dispositivo (RFC 8291) e o cabeçalho `Authorization: vapid t=…, k=…` está correto.

### Limitações (não comprovado neste ambiente)
- **Entrega real em Android e iPhone não foi testada**: o ambiente não tem acesso aos serviços de push da Google/Apple nem a dispositivos físicos. Testado: cifra, VAPID, fila, tentativas, revogação e fluxo da interface. Primeiro passo em produção: ativar num Android (Chrome) e num iPhone (iOS ≥ 16.4, app instalada pelo Safari) e usar o botão de teste — o resultado indica se o dispositivo confirmou a receção.
- **iPhone**: push só na app instalada no ecrã principal, iOS/iPadOS 16.4+; o sistema pode atrasar/agrupar notificações; "Não incomodar"/Foco pode escondê-las.
- **Loja única**: não existe conceito de "vendedor" dono de produtos; todos os utilizadores autenticados veem todas as vendas da loja. O isolamento implementado é por utilizador para notificações, preferências e dispositivos. Separar vendas por vendedor exigiria um modelo de propriedade (multi-loja) — não foi inventado.
- **Reembolsos**: a plataforma não executa reembolsos nos gateways (sem API); regista-os. Os webhooks de loja da EPay (`refund.approved`) poderiam automatizar este registo no futuro, mas exigem um segredo `whsec_…` próprio e não foram ligados para não alterar a configuração EPay.
- **Vercel Hobby**: cron no máximo diário; reenvios dentro do dia acontecem a cada abertura do painel e logo após cada evento.
- **Lucro e saldo disponível**: não calculados (faltam custos, impostos, comissões e liquidações).

### Ficheiros principais
`src/server/notifications/{push,events,service,http}.ts`, `src/server/services/{finance,finance-logic}.ts`, `src/lib/notifications.ts`, `public/sw.js`, `src/app/manifest.ts`, `public/icons/*`, `src/app/api/push/*`, `src/app/api/cron/notifications/route.ts`, `vercel.json`, `src/app/(app)/notificacoes/*`, `src/app/(app)/relatorios/{page.tsx,exportar/route.ts}`, `src/components/notifications/*`, `src/components/orders/refund-panel.tsx`, migração `20261015090000_notifications_refunds` (aditiva; backfill de reembolsos de pedidos já reembolsados), `tests/integration/notifications.test.ts`, `e2e/09-notifications.spec.ts`.

## Funis, upsell, página de obrigado e temas (sessão 8)

### Análise e plano
- **Reutilizado sem alterar**: motor de funis em grafo (`START → CHECKOUT → UPSELL → THANK_YOU → END`, saídas `accept`/`decline`), `validateFunnel`/`activateFunnel`, checkout principal automático por produto, `chargeWithProvider` (EPay/E2Payments/teste), `applyPaymentStatus` (única via de aprovação + token de entrega), webhooks e consulta de estado. **`epay.ts` e `e2payments.ts` não foram tocados.**
- **Plano executado**: (1) migração aditiva; (2) assistente que gera o mesmo grafo; (3) encaminhamento pós-pagamento decidido no servidor; (4) upsell como encomenda filha paga pelos gateways existentes; (5) página de obrigado editável com destino Produto (PDF/link) ou WhatsApp; (6) PDF privado; (7) tema do checkout; (8) tema do painel; (9) testes e correções.

### O que foi implementado (funcional, não apenas visual)
- **Aba Funis → "Novo funil"**: escolhe-se o produto inicial (nome, imagem, preço, estado e link do checkout já gerado, com copiar). "O que acontece depois do pagamento?" → **Upsell** ou **Página de Obrigado**. Fluxo visual Produto inicial → Upsell → Página de Obrigado. O editor de grafo anterior continua disponível em "Funil avançado".
- **Upsell**: produto e oferta (preço vem sempre da oferta no servidor — regras comerciais do produto), título, descrição, imagem ou vídeo, textos de aceitar/recusar, destino depois de aceitar e pagar / depois de recusar / se o pagamento falhar (tentar de novo ou página de obrigado), pré-visualização computador/telemóvel.
- **Pagamento do upsell**: aceitar cria uma **nova encomenda** (`parentOrderId` → encomenda inicial) e um **novo pagamento** pelo gateway escolhido. Clicar não marca nada como pago; a entrega só existe depois de `applyPaymentStatus` confirmar. Idempotente (uma encomenda filha por etapa; repetir devolve a mesma). Recusar ou falhar não altera a compra inicial.
- **Encaminhamento pós-pagamento** (`nextDestination`): só com a encomenda **APPROVED na base de dados**; parâmetros de URL nunca contam. Pendente fica na página de estado; percurso de funil manipulado ou de encomenda não paga fica bloqueado.
- **Página de obrigado**: título, subtítulo, mensagem, instruções, logótipo, imagem de destaque, cores, tipografia, alinhamento, espaçamento, texto do botão, texto auxiliar, suporte, resumo da compra; modelo padrão escuro/claro; pré-visualização computador/telemóvel. Estados: **confirmada** (botão visível), **pendente** ("Estamos a confirmar o seu pagamento", sem botão, atualiza sozinha), **falhada**.
- **Botão principal**: *Aceder ao produto* → **PDF protegido** (só `%PDF-`, máx. 4 MB, guardado na BD, sem URL público permanente; descarga em `/acesso/{token}/ficheiro/{id}` só para encomenda paga, não-demo, que contém o produto; `Cache-Control: private, no-store`) ou **link** (https validado, aviso de link externo). *WhatsApp* → número normalizado (`84…` → `258…`), mensagem codificada em `https://wa.me/…?text=…`; a interface diz que a conversa abre com a mensagem preenchida (o envio é sempre do comprador).
- **Tema do checkout**: cartões "Negrito/Escuro" e "Claro" no editor de personalização, pré-visualização imediata, guardado por checkout de produto e aplicado ao checkout público e às páginas de oferta.
- **Tema do painel**: claro / escuro / sistema na conta (barra lateral), guardado por utilizador (`User.themePreference` + cookie para evitar piscar), independente dos checkouts públicos.
- **Base de dados** (migração `20261014090000_funnels_thank_you_theme`, só aditiva): `Funnel.productId`, `ThankYouPage`, `ProductFile`, `Order.parentOrderId`/`funnelStepKey`, `FunnelRun.orderId` único, `User.themePreference`. Nenhum dado existente é alterado.

### Testes (18 cenários pedidos)
| # | Cenário | Onde | Resultado |
|---|---|---|---|
| 1 | Funil com produto inicial e página de obrigado | integração `funnels-real` #1, #7 | ✅ |
| 2 | Funil com produto inicial e upsell | integração #2; E2E 08 "assistente" | ✅ |
| 3 | Selecionar/configurar produto de upsell | integração #2 (produto/preço/oferta validados); E2E 08 | ✅ |
| 4 | Encaminhamento após pagamento confirmado | integração #3; E2E 08 "pagamento confirmado → upsell" | ✅ |
| 5 | Pendente não é aprovado | integração #3, #6; E2E 08 "compra pendente" | ✅ |
| 6 | Recusar o upsell | integração #3; E2E 08 | ✅ |
| 7 | Falha no pagamento do upsell | integração #5 | ✅ |
| 8 | Página de obrigado → WhatsApp | integração #8; E2E 08 | ✅ |
| 9 | Página de obrigado → link do produto | integração #9 | ✅ |
| 10 | PDF com controlo de acesso | integração #10–11; E2E 08 "PDF protegido" | ✅ |
| 11 | Só compradores autorizados descarregam | integração #10–11 (token inventado, encomenda pendente, demo, outro produto → 404); E2E 08 | ✅ |
| 12 | Alterar tema do checkout escuro/claro | E2E 08 "tema do checkout" | ✅ |
| 13 | Pré-visualização e checkout público usam o tema | E2E 08 "tema do checkout" | ✅ |
| 14 | Tema do painel e persistência | E2E 08 "tema do painel" (recarregar mantém) | ✅ |
| 15 | Tema do painel não muda os checkouts | E2E 08 "tema do painel" | ✅ |
| 16 | EPay e E2Payments continuam funcionais | 18 testes de gateways + E2E 05/07 sem alterações | ✅ (com servidores simulados — ver abaixo) |
| 17 | Outros produtos/checkouts não afetados | E2E 06 e 08 (outro checkout continua escuro, preço inalterado) + suite completa | ✅ |
| 18 | Novas interfaces em computador e telemóvel | E2E 08 "telemóvel" (sem deslocamento horizontal) + verificação visual 1440 px e 390 px | ✅ |

Correções feitas durante os testes: o assistente transbordava no telemóvel (grelhas sem `minmax(0,1fr)`), o título do funil ficava cortado no telemóvel, a página de oferta clara deixava uma faixa escura no fundo, "Ana, Obrigado" com maiúscula, tamanho "0 KB" em ficheiros pequenos.

### Dependem de credenciais reais (não testáveis aqui)
- Upsell pago com **EPay** real (checkout alojado + aviso assinado) e com **E2Payments** real (push no telemóvel). Testado com o fornecedor de teste local e com servidores simulados; fazer uma compra real de valor baixo com upsell em cada gateway.

### Limitações (explicadas, não contornadas)
- **E2Payments** não tem webhook nem consulta de estado documentados: o upsell é confirmado na resposta síncrona; se a resposta não chegar, fica "por verificar" com resolução manual (igual ao checkout).
- **EPay**: o upsell abre o checkout alojado da EPay (nova página) e volta pela página de estado; a confirmação chega pelo aviso assinado.
- **Um vendedor por loja**: a plataforma é de loja única (todos os utilizadores administram a mesma loja; a separação existente é dados reais vs demonstração). Não existe propriedade por vendedor, por isso o isolamento "vendedor A não edita o funil do vendedor B" não se aplica; os ficheiros e funis são validados contra o produto e o modo (real/demo).
- **PDF até 4 MB** (limite do corpo de pedido das funções da Vercel); guardado no PostgreSQL. Ficheiros maiores → usar a opção "link".
- Não há envio de email: o acesso aparece na página de obrigado/estado após confirmação.

### Ficheiros principais
`src/lib/thank-you.ts`, `src/lib/funnels/wizard.ts`, `src/lib/panel-theme.ts`, `src/server/services/{funnel-wizard,post-purchase,product-files}.ts`, `src/components/funnels/funnel-wizard.tsx`, `src/components/public/{thank-you-content,upsell-content}.tsx`, `src/app/obrigado/[token]/`, `src/app/oferta/[runId]/`, `src/app/acesso/[token]/ficheiro/[fileId]/route.ts`, `src/components/layout/theme-toggle.tsx`, `tests/integration/funnels-real.test.ts`, `e2e/08-funnels.spec.ts`.

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

`User` (papel OWNER/USER, estado de aprovação, suspensão), `AdminAuditLog`, `MediaAsset` (imagens por conta), `Session`, `LoginAttempt` · `Product`, `Offer` · `Checkout`, `CheckoutSession` · `Funnel`, `FunnelStep`, `FunnelEdge`, `FunnelRun` · `Customer`, `Order`, `OrderItem` · `Coupon`, `CouponProduct` · `AnalyticsEvent` · `Settings` · `IntegrationConfig`, `IntegrationLog` · `PaymentEvent`. Todas as entidades comerciais têm `ownerId` (conta dona). Esquema completo em `prisma/schema.prisma`; migração inicial em `prisma/migrations/`.

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

# 3. Conta proprietária: abrir /setup no browser (BD vazia) ou, numa conta existente:
npm run user:set-owner -- dono@exemplo.com
#    contas comuns já aprovadas (opcional): npm run user:create -- email "Nome" "password-com-10+-caracteres"

# 4. (opcional) Dados de demonstração
npm run db:seed-demo -- dono@exemplo.com    # requer DEMO_TOOLS_ENABLED=true
npm run db:clear-demo -- dono@exemplo.com

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
3. Upsell/downsell com pagamento real: implementados (sessões 8, 16 e 18, incluindo páginas externas); falta uma compra real de valor baixo com upsell e downsell em cada gateway e um teste com uma página externa publicada num construtor real.
3b. Meta: confirmar no Events Manager (separador «Testar eventos») com um código de teste e depois uma venda real; a rotina diária da Vercel (plano Hobby) só corre uma vez por dia — as novas tentativas também correm a cada nova venda.
4. Envio do link de acesso por email: o envio via Resend existe para a recuperação da palavra-passe (sessão 13, ativo só com `RESEND_API_KEY`/`EMAIL_FROM`); o acesso ao produto continua a ser mostrado na página de obrigado/entrega após confirmação.
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
- **Sessão 21: base de desenvolvimento local (`ntp`) deste contentor sem histórico de migrações.** Uma verificação `prisma migrate diff --shadow-database-url` foi feita, por engano, com o URL da base de desenvolvimento como base sombra: o URL tem `?schema=public` e a troca do nome da base não funcionou. Essa base foi recriada e ficou vazia, com o esquema atual mas sem a tabela `_prisma_migrations`, por isso `migrate deploy` dá P3005. A produção (Vercel) e a base de testes (`ntp_test`) não foram afetadas. Correção, a fazer por quem administra o ambiente (as duas tentativas automáticas foram bloqueadas pelas regras de segurança da sessão): `npx prisma migrate resolve --applied <migração>` para cada pasta de `prisma/migrations`, ou recriar a base vazia e correr `npx prisma migrate deploy`. Para a verificação com base sombra, usar sempre um URL que termine explicitamente em `/ntp_shadow`; sem base sombra, comparar só para leitura com `npx prisma migrate diff --from-url <URL de ntp_test> --to-schema-datamodel prisma/schema.prisma`.

## Registo de sessões

- **Sessão 34 (2026-10-31)**: janela «Confirme no seu telemóvel» sem a ligação «Ver estado do pedido» enquanto aguarda o PIN (o resto da janela igual; segue sozinha quando o pagamento é confirmado). A ligação só aparece se o tempo de espera terminar sem confirmação. Testes E2E abrem a página de estado pelo atributo `data-status-href`.
- **Sessão 33 (2026-10-30)**: «Mostrar nome do produto no checkout» por produto (migração aditiva) e «Mostrar campo de e-mail no checkout» no mesmo cartão; nome sempre enviado aos gateways que o aceitam; EPay sem o e-mail interno.
- **Sessão 32 (2026-10-30)**: notificações BARÃO — venda aprovada só com o valor real, bom dia/boa noite com rotação, resultado da semana com o lucro real após reembolsos; novas preferências (migração aditiva); cron das 19:10.
- **Sessão 31 (2026-10-30)**: foto do produto sem cortes no checkout; checkout principal sempre igual ao produto; limpar histórico de vendas (testes, tudo ou um pedido); «Pedir email no checkout» por produto (migração aditiva); nome e cor do botão no formulário do editor.
- **Sessão 30 (2026-10-30)**: produto com banner promocional (migração aditiva), «Publicar produto»/«Guardar rascunho»/«Actualizar produto», secção «Redireccionamento após a compra», destino por prioridades depois do pagamento confirmado (upsell → link de acesso → página de obrigado com «Baixar o meu PDF»); «Tipo» e «Categoria» removidos do formulário.
- **Sessão 29 (2026-10-30)**: novo checkout padrão fiel à referência (cronómetro, selo seguro, cartão do produto, prova social real, avaliações, número +258 com detecção M-Pesa/e-Mola, métodos em cartões, botão verde com o valor, botão fixo); checkouts personalizados intactos.
- **Sessão 28 (2026-10-30)**: resultado real de cada pagamento (cancelado pelo cliente, saldo insuficiente, PIN, tempo excedido, erro do gateway) guardado na BD e mostrado em Operações; motivos da Pagar e da E2Payments classificados; reconciliação automática dos pendentes. Migração aditiva. 384 testes unitários/integração.
- **Sessão 27 (2026-10-29)**: Pixel do Facebook e link de upsell no formulário do produto (Pixel aparece nas Integrações; upsell cria o funil automaticamente e redireciona só depois do pagamento confirmado). Sem migração. 358 testes unitários/integração.
- **Sessão 26 (2026-10-29)**: checkout mantém o comprador na página com uma janela «Confirme no seu telemóvel» até o servidor confirmar o pagamento; ícones M-Pesa/e-Mola; produtos só com Publicado/Rascunho e «Eliminar» (sem apagar histórico). Sem migração.
- **Sessão 25 (2026-10-29)**: Pagar com modo de teste e modo real nas Integrações (credenciais separadas cifradas, mudança só com confirmação e com a key LIVE aceite pela Pagar); checkout com indicativo +258 e bandeira de Moçambique, marcas M-Pesa/e-Mola. Sem migração. 354 testes unitários/integração.
- **Sessão 24 (2026-10-29)**: integração da Pagar API seguindo só o guia oficial (POST /payments assinado com HMAC e Idempotency-Key, título/valor da BD, repetições seguras, recuperação por reference, webhook com Pagar-Signature e Pagar-Event-Id único, entrega só com PAID por consulta autenticada); credenciais em variáveis do servidor (conta proprietária) ou cifradas por conta no painel; sem top-ups nem payouts. Sem migração. 353 testes unitários/integração e 151 E2E a passar.
- **Sessão 23 (2026-10-19)**: novo design padrão do checkout (tema claro, título/preço proporcionados, imagem com cantos suaves, botão verde; cores próprias do vendedor respeitadas; checkouts publicados inalterados); campo de cupão só quando a conta tem cupões ativos. A análise do checkout da RatixPay não foi possível (domínio bloqueado neste ambiente). Sem migração. 342 testes unitários/integração a passar; E2E 150 (1 falha intermitente conhecida de hidratação React #418 na lista de Produtos, que passou ao repetir).
- **Sessão 22 (2026-10-16)**: auditoria para tráfego pago com testes de carga reais (10–250 clientes, 1 processo), concorrência de pagamentos e telemóvel emulado; correções: limites anti-abuso por comprador (CGNAT), imagens redimensionadas em WebP com cache na CDN, tentativa de compra preservada quando a WebView recarrega, aviso de ligação lenta, menos consultas no checkout. Lógica de pagamento e APIs EPay/E2Payments inalteradas. Sem migração. 341 testes unitários/integração e 150 E2E a passar.
- **Sessão 21 (2026-10-16)**: página de obrigado personalizada em Personalizar Checkout (rascunho, pré-visualização, publicação e restauro; botão ligado à entrega real; com e sem funil); área **Operações** com uma única entrada no menu e abas Pedidos/Clientes/Relatórios/Notificações (rotas antigas preservadas); logótipos das Integrações sem fundo; **Dashboard**: atividades recentes só do dia atual no fuso da conta (data real de cada evento) e barra de meta de faturamento (10 mil → 1 milhão MZN) com celebrações únicas guardadas por utilizador. **Partilha das credenciais de pagamento do administrador** por utilizador e método (EPay/E2Payments), sem expor credenciais, com venda e faturamento no vendedor, revogação só para novos pagamentos e pedidos de remoção. Migrações aditivas `CheckoutThankYou`, `RevenueMilestone` e `PaymentCredentialGrant` (+ `Payment.credentialOwnerId`). 334 testes unitários/integração e 147 E2E a passar.
- **Sessão 20 (2026-10-16)**: logótipos oficiais (fundo removido) na aba Integrações; **modo simples** — publicar só exige produto, checkout e entrega (funil, página de obrigado e WhatsApp opcionais, no servidor e na interface); sem funil, o comprador vai do pagamento confirmado diretamente para a página de acesso ao produto. Funis, upsell e downsell inalterados. Sem migração. 308 testes unitários/integração e E2E completos a passar.
- **Sessão 19 (2026-10-16)**: «Entrega do produto» no formulário do produto (PDF carregado do dispositivo, privado, substituir/remover; ou link de acesso validado para SaaS/área de membros), entrega automática só depois do pagamento confirmado com o acesso de cada produto pago (principal, upsell, downsell) na página de obrigado e na área «Os meus produtos», recuperação do acesso em `/acesso` (email + código ou telemóvel), aba Integrações em cartões com páginas de configuração por integração. Migração aditiva (`FILE`, `deliveryFileId`); EPay/E2Payments/webhooks/checkout intactos. 303 testes unitários/integração e 129 E2E a passar.
- **Sessão 18 (2026-10-16)**: área de Funis com entrada única «Funil avançado» (removido «Criar funil»), editor com mapa do fluxo, vários upsells/downsells com destinos por aceitar/recusar, link de página externa por etapa com código de integração (`/ntp-funil.js` + `POST /api/public/funil/v1/aceitar|recusar`, validação de percurso e etapa no servidor), página de obrigado do site ou externa, paleta do editor antigo sem Checkout principal/Página de vendas/Oferta adicional (etapas existentes preservadas). Vendas de upsell/downsell continuam encomendas próprias confirmadas só pelo gateway. Sem migração; EPay/E2Payments/webhooks/confirmação intactos. 294 testes unitários/integração e 124 E2E a passar.
- **Sessão 17 (2026-10-15/16)**: Facebook Pixel / API de Conversões (token cifrado, produtos selecionados, Purchase só para compras confirmadas, fila idempotente com event_id estável, isolamento por conta). Migração aditiva. Testes de integração e E2E.
- **Sessão 16 (2026-10-15)**: formulário de produto simplificado (nome, descrição, foto carregada do dispositivo, preço principal, tipo), sem preço de referência/página de vendas/ofertas (valores guardados preservados); ofertas centralizadas nos funis (preço criado no funil + downsell com a etapa existente do motor); correção do motor para mostrar a oferta seguinte depois de uma recusa. Sem migração. 272 testes unitários/integração e 117 E2E a passar.
- **Sessão 15 (2026-10-15)**: auditoria de todas as páginas em 12 larguras e de interações com toque (simulação no Chromium); 12 grupos de problemas corrigidos (página do pedido mais larga que o ecrã, dicas inacessíveis no iPhone, menu de ações cortado nas tabelas, modais com teclado, faixas de chips/separadores/etapas do funil escondidas, tabelas com deslocamento lateral, controlos só com hover, alvos de toque pequenos); aba Cupom removida da interface sem apagar dados nem lógica do checkout. APIs e pagamentos não alterados. 262 testes unitários/integração e 112 E2E a passar.
- **Sessão 14 (2026-10-15)**: checkout simples numa coluna (nome, imagem, preço, dados, pagamento, total único e botão), mensagem longa da EPay removida (só visual), cronómetro com a cor em todo o componente e texto legível, editor simplificado (9 elementos, produto/preço/pagamento protegidos, propriedades por elemento, estilo global e restauro do padrão) e correções no telemóvel (menu de ações e avisos na aba Produtos, filtros, campos de 16 px). Sem migração. 262 testes unitários/integração e 83 E2E a passar.
- **Sessão 13 (2026-10-14)**: produtos nascem como rascunho e só publicam com funil principal, página de obrigado, WhatsApp de suporte e entrega (validação centralizada no servidor); WhatsApp por produto acima do botão de acesso; entrega por link externo ou página de entrega interna protegida; aba Funis com estado de cada requisito; Configurações simplificadas; recuperação da palavra-passe por token temporário (email opcional via Resend, ou link gerado pelo proprietário). Migração aditiva com passagem dos dados antigos; pagamentos e credenciais intactos. 246 testes unitários/integração e 79 E2E a passar.
- **Sessão 12 (2026-10-14)**: editor visual do checkout tipo Elementor (secções/colunas/elementos, arrastar e soltar com indicadores, propriedades de conteúdo/estilo/avançado, dispositivos, desfazer/refazer, rascunho/publicação, aviso ao sair), modelo padrão profissional com dados reais, biblioteca de imagens por conta (carregamento validado), formulário de compra protegido e remoção do "Compra segura", do cabeçalho "Ligação cifrada" e do rodapé do checkout público. Pagamentos, funis e redirecionamentos intactos. 233 testes unitários/integração e 75 E2E a passar.
- **Sessão 11 (2026-10-14)**: desempenho no telemóvel: menos consultas e em paralelo (JOIN do Prisma, sessão numa consulta, configurações sem upsert, layout e relatórios em paralelo), tarefas de notificações limitadas, gráficos carregados à parte (Dashboard/Relatórios 217 → 110 kB) e resposta imediata ao toque (menu fecha logo, indicador e barra de progresso). 221 testes unitários/integração e 69 E2E a passar.
- **Sessão 10 (2026-10-14)**: sistema multiutilizador com registo pendente, aprovação/rejeição/suspensão pelo proprietário, Administração da Plataforma, isolamento total por conta (`ownerId` em todas as entidades), credenciais EPay/E2Payments por conta (cifradas, sem fallback) e avisos de pagamento verificados com a chave da conta dona. A migração atribui os dados existentes e as credenciais ao proprietário sem as alterar. 221 testes unitários/integração e 68 E2E a passar.
- **Sessão 9 (2026-10-13)**: notificações push via PWA/Web Push (VAPID + aes128gcm, sem Pushcut), fila persistente com tentativas e confirmação de receção, central de notificações, preferências e dispositivos, resumo diário (cron + execução oportunista), relatórios de faturamento (indicadores, gráficos, transações, CSV) e registo de reembolsos parciais/totais. EPay/E2Payments intactas; migração aditiva. 206 testes unitários/integração e 63 E2E a passar; entrega em dispositivos reais por comprovar.
- **Sessão 8 (2026-10-13)**: funis por produto com upsell pago a sério (nova encomenda + novo pagamento pelos gateways existentes, entrega só após confirmação, sem duplicados), página de obrigado editável (WhatsApp, link ou PDF protegido), encaminhamento pós-pagamento decidido no servidor, tema claro/escuro por checkout e tema do painel por utilizador. Migração só aditiva; EPay/E2Payments intactas. 190 testes unitários/integração e 53 E2E a passar; build OK.
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
