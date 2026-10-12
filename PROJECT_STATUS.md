# PROJECT_STATUS — Ninguém Tá Puro

Última atualização: 2026-10-12 · Sessão 1

## Estado geral

As 7 fases do Documento Mestre foram implementadas e verificadas nesta sessão. A aplicação arranca, autentica, persiste tudo em PostgreSQL e passa lint, verificação de tipos, testes unitários/integração, testes E2E e build de produção. **Pagamentos reais continuam desativados** (nenhum processador integrado).

| Verificação | Comando | Resultado (última execução) |
|---|---|---|
| Lint | `npm run lint` | ✅ 0 erros, 0 avisos |
| Tipos TypeScript | `npm run typecheck` | ✅ sem erros |
| Testes unitários + integração | `npm test` | ✅ 99/99 (9 ficheiros) |
| Testes E2E (Playwright, build de produção) | `npm run test:e2e` | ✅ 29/29 |
| Build de produção | `npm run build` | ✅ sem erros |

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

## Funcionalidades concluídas e verificadas

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
cp .env.example .env            # ajustar DATABASE_URL
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

1. **Integração de pagamentos (decisão explícita necessária)**: escolher fornecedor; implementar `PaymentProvider` em `src/server/payments/providers/<id>.ts`; registar em `registry.ts`; segredos em `PAYMENTS_WEBHOOK_SECRET_<ID>` e chave API em variáveis de ambiente; no checkout real criar pedido `PENDING` e chamar `createCharge`; aprovação apenas via webhook (`/api/webhooks/<id>`, já implementado e testado com fornecedor fictício).
2. Funcionalidades dependentes de pagamentos: cobrança real, aprovação/reembolso reais, taxas reais (valor líquido), upsell de 1 clique com cartão guardado no processador, entrega de acesso por email.
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

- **Sessão 1 (2026-10-12)**: análise do ambiente (repositório vazio), arquitetura, implementação das fases 1–7, 99 testes unitários/integração + 29 E2E, auditoria responsiva em 6 larguras, build de produção. Commits no ramo `claude/jolly-babbage-eg28n3`.
