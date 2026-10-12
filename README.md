# Ninguém Tá Puro

Plataforma privada de vendas digitais em **metical moçambicano (MZN)**: produtos, checkouts, funis com upsells/downsells, encomendas, clientes, cupões e analytics. Pagamentos reais pela **EPay** (M-Pesa, e-Mola, IZI) — ativos assim que `EPAY_SECRET_KEY` estiver definida no servidor. Referência da API: [docs/epay-api.md](./docs/epay-api.md).

Estado detalhado, decisões e próximos passos: [PROJECT_STATUS.md](./PROJECT_STATUS.md).

## Tecnologias

Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 6 · Zod · Recharts · React Flow (`@xyflow/react`) · Vitest · Playwright.

## Arquitetura

```
prisma/                 esquema e migrações
src/app/(auth)/         login e configuração inicial
src/app/(app)/          área privada (dashboard, produtos, checkouts, funis, pedidos, …)
src/app/checkout/       checkout público  /checkout/<publicId>
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
npm run user:create -- email@exemplo.com "Nome" "password-segura-10"   # ou /setup
npm run dev
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Ligação PostgreSQL |
| `APP_BASE_URL` | sim (produção) | URL público HTTPS — retorno do comprador e notificações de pagamento |
| `DEMO_TOOLS_ENABLED` | não | `true` permite gerar dados de demonstração. Manter `false` em produção |
| `INSECURE_COOKIES` | não | `true` apenas para testes locais em HTTP com `NODE_ENV=production` |
| `EPAY_SECRET_KEY` | para pagamentos | Chave secreta da EPay `sk_test_…` (sandbox) ou `sk_live_…` (produção). Só no servidor |
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
| `npm run db:seed-demo` / `db:clear-demo` | Dados de demonstração |
| `npm run user:create` | Criar utilizador |

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
- `EPAY_SECRET_KEY`, para cobrar.

Diagnóstico: `GET /api/health`. Passo a passo em [PROJECT_STATUS.md](./PROJECT_STATUS.md#deploy-na-vercel).
