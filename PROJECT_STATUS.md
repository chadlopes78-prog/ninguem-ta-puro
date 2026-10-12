# PROJECT_STATUS — Ninguém Tá Puro

Última atualização: 2026-10-12 · Sessão 3 (integração EPay implementada conforme a documentação)

## Estado geral

As 7 fases do Documento Mestre estão implementadas. A plataforma opera em **MZN** e tem a **integração de pagamentos EPay implementada conforme a documentação oficial** (checkout alojado, aviso assinado, consulta de estado, cancelamento, idempotência, entrega após confirmação, auditoria). Para ficar ativa só falta definir `EPAY_SECRET_KEY` no servidor e fazer o teste no sandbox da EPay, porque os servidores da EPay não são acessíveis a partir do ambiente de desenvolvimento.

| Verificação | Comando | Resultado (última execução) |
|---|---|---|
| Lint | `npm run lint` | ✅ 0 erros, 0 avisos |
| Tipos TypeScript | `npm run typecheck` | ✅ sem erros |
| Testes unitários + integração | `npm test` | ✅ 139/139 (10 ficheiros; 24 EPay + 17 fluxo de pagamento) |
| Testes E2E (Playwright, build de produção) | `npm run test:e2e` | ✅ 38/38 (9 de pagamentos) |
| Build de produção | `npm run build` | ✅ sem erros |
| Fuga de segredos | build com `EPAY_SECRET_KEY` fictícia + `grep` em `.next/` e log | ✅ valor ausente do bundle do browser, do output do servidor e do log; nenhuma variável `NEXT_PUBLIC_`; `.env` com segredos fora do Git |

## Fases

| Fase | Estado | Notas |
|---|---|---|
| 1 — Fundação | ✅ Concluída | Next.js 15 + TS + Tailwind 4 + Prisma/PostgreSQL, design system, auth, navegação |
| 2 — Dashboard | ✅ Concluída | 8 KPIs, 4 visualizações, comparação de períodos, filtros, atividade recente, estados vazios |
| 3 — Produtos e checkouts | ✅ Concluída | CRUD, ofertas/preços, checkouts com link público aleatório, personalização, pré-visualização ao vivo |
| 4 — Funis | ✅ Concluída | Editor React Flow, 9 tipos de etapa, upsell/downsell com saídas aceita/recusa, validação, persistência, simulador |
| 5 — Operação | ✅ Concluída | Pedidos (filtros, detalhe, transições), clientes, cupões (com testador), relatórios |
| 6 — Preparação para pagamentos | ✅ Concluída | Abstração de fornecedores, página de integrações, webhooks com assinatura/idempotência (sem fornecedores reais) |
| 7 — Qualidade | ✅ Concluída | Testes, responsividade (320–1440 px), auditoria visual/funcional, build |

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
2. **Settings → Environment Variables**: `APP_BASE_URL = https://ninguem-ta-puro.vercel.app` (ou o domínio próprio). Mais tarde, `EPAY_SECRET_KEY = sk_test_…`. Não definir `DEMO_TOOLS_ENABLED` em produção.
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

- **Sessão 4 (2026-10-12)**: erro no deploy da Vercel diagnosticado (BD não configurada/migrada; sem acesso aos logs da Vercel a partir do ambiente — 403 no âmbito da equipa); `vercel-build` com migrações e verificação de ambiente, página "Configuração incompleta", `/api/health`, página de erro global; validação local dos três cenários.
- **Sessão 3 (2026-10-12)**: documentação EPay fornecida pelo proprietário (`docs/epay-api.md`); adaptador EPay implementado (checkout alojado, aviso `X-EducavelPay-Signature`, consulta, cancelamento, chaves de teste/produção, encomendas de teste fora da receita, reconciliação); 139 testes unitários/integração e 38 E2E a passar; build OK; verificação manual com chave fictícia; sem acesso aos servidores reais da EPay.
- **Sessão 2 (2026-10-12)**: leitura do documento de integração EPay/MZN; documentação oficial da EPay inacessível a partir do ambiente (domínio bloqueado), por isso nada da API foi inventado; MZN em toda a plataforma; fluxo de pagamento real completo e agnóstico ao fornecedor; adaptador EPay isolado e desativado; 116 testes unitários/integração e 38 E2E a passar; build OK; verificação de fuga de segredos OK.
- **Sessão 1 (2026-10-12)**: análise do ambiente (repositório vazio), arquitetura, implementação das fases 1–7, 99 testes unitários/integração + 29 E2E, auditoria responsiva em 6 larguras, build de produção. Commits no ramo `claude/jolly-babbage-eg28n3`.
