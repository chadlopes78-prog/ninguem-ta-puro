# PROJECT_STATUS — Ninguém Tá Puro

Última atualização: 2026-10-15 · Sessão 15 (auditoria de interface e dispositivos, aba Cupom removida) · Sessão 14 (checkout simplificado, cronómetro, editor simples, revisão mobile) · Sessão 13 (produtos incompletos, WhatsApp de suporte, entrega do produto, configurações e recuperação da palavra-passe) · Sessão 12 (editor visual do checkout tipo Elementor) · Sessão 11 (desempenho no telemóvel) · Sessão 10 (multiutilizador, aprovação de contas, Administração da Plataforma, credenciais de pagamento por conta)

## Estado geral

As 7 fases do Documento Mestre estão implementadas. A plataforma opera em **MZN** e tem **dois gateways de pagamento independentes: EPay e E2Payments** (sessão 7). A **integração EPay está implementada conforme a documentação oficial** (checkout alojado, aviso assinado, consulta de estado, cancelamento, idempotência, entrega após confirmação, auditoria). Para ficar ativa só falta definir `EPAY_SECRET_KEY` no servidor e fazer o teste no sandbox da EPay, porque os servidores da EPay não são acessíveis a partir do ambiente de desenvolvimento.

| Verificação | Comando | Resultado (última execução) |
|---|---|---|
| Lint | `npm run lint` | ✅ 0 erros, 0 avisos |
| Tipos TypeScript | `npm run typecheck` | ✅ sem erros |
| Testes unitários + integração | `npm test` | ✅ 262/262 (16 do checkout renderizado/editor simples, 13 de publicação/entrega/configurações/palavra-passe, 6 de operações do editor, 5 da biblioteca de imagens, 16 de personalização do checkout, 12 de multiutilizador A–G, 16 de notificações/relatórios, 10 de funis, 18 de gateways) |
| Testes E2E (Playwright, build de produção) | `npm run test:e2e` | ✅ 112/112 (13 da auditoria em 12 larguras, 13 de interações com toque, 3 de revisão mobile a 320/375/414 px e 3 da aba Produtos no computador a 1024/1280/1440 px, 4 de configurações/palavra-passe/telemóvel, 6 do editor visual com arrastar e soltar real, 1 de navegação lenta no telemóvel, 5 de várias contas, 10 de notificações/PWA/relatórios, 8 de funis, 9 de pagamentos, 4 de personalização, 3 de gateways) |
| Build de produção | `npm run build` | ✅ sem erros |
| Fuga de segredos | build com `EPAY_SECRET_KEY`, `E2PAYMENTS_CLIENT_ID/SECRET` e `INTEGRATIONS_ENCRYPTION_KEY` fictícias + `grep` em `.next/` e log | ✅ valor ausente do bundle do browser, do output do servidor e do log; nenhuma variável `NEXT_PUBLIC_`; `.env` com segredos fora do Git |

## Fases

| Fase | Estado | Notas |
|---|---|---|
| 1 — Fundação | ✅ Concluída | Next.js 15 + TS + Tailwind 4 + Prisma/PostgreSQL, design system, auth, navegação |
| 2 — Dashboard | ✅ Concluída | 8 KPIs, 4 visualizações, comparação de períodos, filtros, atividade recente, estados vazios |
| 3 — Produtos e checkouts | ✅ Concluída | CRUD, ofertas/preços, checkout principal criado automaticamente com link legível, editor visual com rascunho/publicação |
| 4 — Funis | ✅ Concluída | Assistente por produto (produto inicial → upsell → página de obrigado) com upsell pago a sério (sessão 8); editor avançado React Flow mantido ("Funil avançado") |
| 5 — Operação | ✅ Concluída | Pedidos (filtros, detalhe, transições), clientes, cupões (com testador), relatórios |
| 6 — Preparação para pagamentos | ✅ Concluída | Abstração de fornecedores, página de integrações, webhooks com assinatura/idempotência (sem fornecedores reais) |
| 7 — Qualidade | ✅ Concluída | Testes, responsividade (320–1440 px), auditoria visual/funcional, build |

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
3. Upsell com pagamento real: implementado na sessão 8 (assistente de funis); falta uma compra real de valor baixo com upsell em cada gateway. Downsell continua só no editor avançado/simulação.
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

## Registo de sessões

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
