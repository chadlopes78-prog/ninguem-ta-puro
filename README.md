# Ninguém Tá Puro

Plataforma privada de vendas digitais em **metical moçambicano (MZN)**: produtos, checkouts, funis com upsells/downsells, encomendas, clientes, cupões e analytics. Pagamentos reais por dois gateways independentes, ativados e desativados em **Integrações → Gateways de Pagamento**: **EPay** (M-Pesa, e-Mola, IZI; `EPAY_SECRET_KEY`) e **E2Payments** (M-Pesa, e-Mola; credenciais no servidor ou no painel, cifradas). Referências: [docs/epay-api.md](./docs/epay-api.md) e [docs/e2payments-api.md](./docs/e2payments-api.md).

Cada produto recebe automaticamente o seu checkout e um link público estável (ex.: `/checkout/handwriting-heroes`). O link está na aba **Produtos** (botão Copiar link). O aspeto de cada checkout é editado na aba **Personalizar Checkout** (editor visual com rascunho e publicação); o preço, a moeda e o pagamento vêm sempre do servidor.

Estado detalhado, decisões e próximos passos: [PROJECT_STATUS.md](./PROJECT_STATUS.md).

## Tecnologias

Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 6 · Zod · Recharts · React Flow (`@xyflow/react`) · Vitest · Playwright.

## Arquitetura

```
prisma/                 esquema e migrações
src/app/(auth)/         login e configuração inicial
src/app/(app)/          área privada (dashboard, produtos, checkouts, funis, pedidos, …)
src/app/checkout/       checkout público  /checkout/<slug-do-produto> (ou /checkout/<publicId>)
src/app/oferta/         upsell/downsell público (simulação em modo demo)
src/app/pagamento/      estado do pagamento do comprador (nunca confirma por si só)
src/app/acesso/         acesso ao produto digital (só após pagamento confirmado)
src/app/api/            sessão de checkout (pública) e webhooks de pagamento
src/components/         design system (ui/), layout, gráficos e componentes por domínio
src/lib/                lógica pura partilhada: dinheiro, datas, IDs, funis (validação/simulação)
src/server/             auth, acesso à BD, serviços de domínio, validação, pagamentos
tests/                  testes unitários e de integração (Vitest)
e2e/                    testes de navegador (Playwright)
scripts/                criar utilizador, gerar/remover dados de demonstração
```

Regras: lógica de negócio fica em `src/server/services` e `src/lib`; páginas e componentes só apresentam. Todas as server actions passam por `guarded()` (sessão validada no servidor + mensagens de erro seguras).

## Arranque

```bash
npm install
cp .env.example .env                 # definir DATABASE_URL
npx prisma migrate deploy
# primeira conta: abrir /setup (BD vazia) — fica a conta proprietária (OWNER)
npm run user:set-owner -- email@exemplo.com   # (opcional) definir/recuperar o proprietário no servidor
npm run dev
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Ligação PostgreSQL |
| `APP_BASE_URL` | sim (produção) | URL público HTTPS — retorno do comprador e notificações de pagamento |
| `DEMO_TOOLS_ENABLED` | não | `true` permite gerar dados de demonstração. Manter `false` em produção |
| `INSECURE_COOKIES` | não | `true` apenas para testes locais em HTTP com `NODE_ENV=production` |
| `EPAY_SECRET_KEY` | opcional | Chave secreta da EPay **da conta proprietária** (`sk_test_…`/`sk_live_…`). Nunca é usada por outras contas, que guardam a sua chave cifrada na aba Integrações. Só no servidor |
| `E2PAYMENTS_CLIENT_ID`, `E2PAYMENTS_CLIENT_SECRET`, `E2PAYMENTS_MPESA_WALLET_ID`, `E2PAYMENTS_EMOLA_WALLET_ID` | opcional | Credenciais E2Payments **da conta proprietária** (alternativa ao formulário). Nunca usadas por outras contas. Só no servidor |
| `INTEGRATIONS_ENCRYPTION_KEY` | opcional | Chave dedicada (≥ 32 caracteres) para cifrar as credenciais introduzidas na aba Integrações. Sem ela, usa-se uma chave derivada de `DATABASE_URL` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | opcional | Chaves das notificações push (Web Push). Sem elas, são geradas e guardadas cifradas na BD na primeira utilização |
| `CRON_SECRET` | opcional | Protege a tarefa diária `/api/cron/notifications` (resumo diário e reenvio de push). Sem ela, as tarefas correm quando o painel é aberto |
| `NTP_ENABLE_TEST_PROVIDER`, `TEST_PROVIDER_SECRET` | só testes | Fornecedor de pagamentos fictício; só funciona com a BD `ntp_test` |

Nenhum segredo é exposto ao frontend.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` / `build` / `start` | Desenvolvimento / build de produção / servidor |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm test` | Unitários + integração (BD `ntp_test` de `.env.test`) |
| `npm run test:e2e` | Playwright contra o build (porta 3100, BD `ntp_test`) |
| `npm run db:migrate` / `db:deploy` | Migrações Prisma |
| `npm run db:seed-demo -- email` / `db:clear-demo -- email` | Dados de demonstração de uma conta |
| `npm run user:create -- email "Nome" "password"` | Criar conta comum já aprovada (no servidor) |
| `npm run user:set-owner -- email` | Definir a conta proprietária (OWNER); só no servidor, nunca por HTTP |

## Contas e Administração

- Registo público em `/registo`: a conta fica **pendente de aprovação** (definido no servidor) e só vê a página `/conta`.
- O proprietário (OWNER, no máximo um — garantido por índice único parcial na BD) aprova, rejeita, suspende e reativa contas em **Administração** (`/admin`). Nenhum papel ou estado vem do formulário.
- Cada conta tem os seus produtos, checkouts, funis, clientes, pedidos, cupões, relatórios, notificações, configurações e credenciais de pagamento. O isolamento é aplicado no servidor (`ownerId` obrigatório + `Scope` em todos os serviços); os pagamentos e avisos dos gateways usam sempre as credenciais da conta dona do checkout.

## Fluxo de pagamento

1. O checkout envia nome, email, método e telefone, mais uma chave de idempotência. **Nunca envia o preço.**
2. O servidor cria a encomenda `PENDING` e a tentativa `Payment` com o preço da base de dados, e chama `createCharge` do fornecedor.
3. O comprador vê `/pagamento/<token>`, que consulta o estado oficial periodicamente.
4. A encomenda só passa a **paga** em `applyPaymentStatus`: notificação autenticada ou consulta oficial, com validação de montante, moeda e referência. A operação é idempotente.
5. Só depois disso é criado o acesso `/acesso/<token>` ao produto digital.
6. Todas as transições ficam no registo de auditoria da encomenda.

## Deploy (Vercel)

O script `vercel-build` verifica a configuração, aplica as migrações (`prisma migrate deploy`) e compila. É preciso:
- uma base de dados PostgreSQL (`DATABASE_URL`, por exemplo Vercel Storage → Neon);
- `APP_BASE_URL`;
- `EPAY_SECRET_KEY` (opcional) para a conta proprietária cobrar pela EPay; as outras contas configuram a sua chave na aba Integrações.

Diagnóstico: `GET /api/health`. Passo a passo em [PROJECT_STATUS.md](./PROJECT_STATUS.md#deploy-na-vercel).
