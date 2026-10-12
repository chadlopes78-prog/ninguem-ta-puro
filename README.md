# Ninguém Tá Puro

Plataforma privada de vendas digitais: produtos, checkouts, funis com upsells/downsells, pedidos, clientes, cupões e analytics. **Pagamentos reais estão desativados nesta fase.**

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
| `APP_URL` | não | URL público (links absolutos) |
| `DEMO_TOOLS_ENABLED` | não | `true` permite gerar dados de demonstração. Manter `false` em produção |
| `INSECURE_COOKIES` | não | `true` apenas para testes locais em HTTP com `NODE_ENV=production` |
| `PAYMENTS_WEBHOOK_SECRET_<ID>` | futuro | Segredo de webhook por fornecedor (ainda não usado) |

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
