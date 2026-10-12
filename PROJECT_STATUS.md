# PROJECT_STATUS — Ninguém Tá Puro

Última atualização: 2026-10-12 · Sessão 2 (integração EPay / MZN)

## Estado geral

As 7 fases do Documento Mestre estão implementadas e verificadas. Na sessão 2 a plataforma passou a operar em **metical moçambicano (MZN)** e foi construído todo o **fluxo de pagamento real** (encomenda pendente, cobrança, confirmação idempotente, entrega após confirmação e auditoria). Esse fluxo está testado de ponta a ponta com um fornecedor de teste local.

**A EPay ainda NÃO cobra.** A documentação oficial (https://painel.epay.co.mz/docs/api) não foi acessível a partir do ambiente de desenvolvimento: o domínio está bloqueado pela política de rede e não resolve nas ferramentas web. Por regra do documento, nenhum endpoint, campo, estado ou mecanismo de assinatura foi inventado. O adaptador EPay está isolado e desativado até esses pontos serem confirmados (ver "Integração EPay — o que falta").

| Verificação | Comando | Resultado (última execução) |
|---|---|---|
| Lint | `npm run lint` | ✅ 0 erros, 0 avisos |
| Tipos TypeScript | `npm run typecheck` | ✅ sem erros |
| Testes unitários + integração | `npm test` | ✅ 116/116 (9 ficheiros; 18 de pagamentos) |
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

## Integração EPay / MZN (sessão 2)

### Concluído e verificado (testes automáticos)

- **MZN em toda a plataforma**: novo valor `MZN` no enum `Currency` (migração `20261012052344_add_mzn_currency`); moeda padrão MZN, região `pt-MZ` e fuso `Africa/Maputo` (migração `20261012060000_epay_payments_delivery_audit`, que também atualiza o registo de Configurações existente). Formulários de produtos, ofertas e cupões só aceitam MZN. Formatação `12 450,00 MZN` (o CLDR `pt-MZ` não agrupa números de 4 dígitos: `1250,00 MZN`). O parser aceita "MZN", "MT" e "MTn". Os registos antigos noutras moedas continuam legíveis mas não podem ser pagos online. Dados de demonstração em MZN.
- **Encomenda e pagamento** (`src/server/services/payment-flow.ts`):
  - O preço vem sempre da BD; campos de valor enviados pelo browser são ignorados (há teste para isto).
  - É criada uma encomenda `PENDING` com código único, um `publicToken` aleatório para a página de estado e uma `idempotencyKey` gerada por carregamento do checkout, para que o duplo clique ou um reenvio não dupliquem a encomenda.
  - Cada tentativa fica num registo `Payment` com fornecedor, método, telefone mascarado, montante, moeda, estado, referência externa, estado bruto e datas.
  - O telemóvel é validado no formato moçambicano (`8[2-7]XXXXXXX`, com ou sem +258).
  - O cupão é reservado de forma atómica e libertado se o pagamento falhar ou for cancelado.
- **Confirmação centralizada** (`src/server/payments/confirm.ts`): é a única via pela qual uma encomenda real passa a paga. Valida a referência, o montante e a moeda contra a BD e faz transições condicionais. É idempotente: repetições não duplicam vendas, entregas nem utilizações de cupões. Um "pago" sem montante é ignorado (exige consulta oficial). Um "pago" depois de uma expiração é aceite, porque o dinheiro foi recebido. Um pagamento em duplicado numa encomenda já paga é registado para reembolso manual.
- **Webhooks** (`/api/webhooks/<fornecedor>`, `src/server/payments/webhooks.ts`):
  - A assinatura é verificada sobre o corpo bruto, com comparação em tempo constante.
  - Cada evento é registado com idempotência por `(fornecedor, id do evento)`.
  - Um evento que falhe a meio é reprocessado na nova tentativa do fornecedor (que recebe 500).
  - Assinatura inválida → 401 sem alterações; corpo inválido → 400.
- **Consulta oficial de estado**: feita pela página de estado e pelo endpoint `/api/public/pagamento/<token>`, no máximo uma vez a cada 8 s por pagamento. Um erro de rede na criação deixa o pagamento "incerto": continua pendente, com aviso ao comprador, e nunca se assume sucesso.
- **Páginas do comprador**:
  - `/pagamento/<token>`: estados "a iniciar", "a aguardar confirmação", "pago", "falhado", "cancelado/expirado" e "reembolsado"; atualiza sozinha.
  - O antigo `/checkout/<id>/sucesso` redireciona as encomendas reais para a página de estado, por isso o retorno do browser nunca mostra "obrigado" nem marca nada como pago.
  - O checkout mostra os métodos do fornecedor ativo e o campo do número; nunca pede cartão.
- **Entrega digital** (`Delivery`, `/acesso/<token>`): o token é criado uma única vez, só quando o pagamento é confirmado; o acesso é revogado se a encomenda deixar de estar paga (reembolso); o número de acessos fica registado.
- **Auditoria** (`OrderAuditLog`): todas as transições de estado ficam registadas com o autor (`checkout`, `webhook:<fornecedor>`, `status-check:<fornecedor>`, `charge-response:<fornecedor>`, `admin:<email>`). O detalhe da encomenda mostra tentativas de pagamento, notificações, entrega e auditoria.
- **Estados apresentados**: Pendente / Pago / Falhado / Reembolsado / Cancelado. Só as encomendas pagas contam como receita; o valor líquido usa as taxas devolvidas pelo fornecedor (nunca estimadas).
- **Segredos**:
  - Lidos só no servidor (`EPAY_SECRET_KEY`, `EPAY_API_BASE_URL`, `APP_BASE_URL`); nunca usam `NEXT_PUBLIC_`, nunca são guardados na BD e nunca são registados em logs.
  - A página **Integrações → Verificar configuração** indica apenas se cada variável existe.
  - O `.gitignore` cobre `.env`, `.env.local`, `.env.*.local`, `.env.production`, `.env.development`, `*.pem` e `*.key`. O `.env.example` não tem valores reais.

### Cenários testados (com o fornecedor de TESTE local, não com a EPay)

Integração (`tests/integration/payments.test.ts`):
- criação pendente com preço vindo da BD;
- submissão duplicada;
- validação de método, telefone e chave;
- webhook pago com taxa, evento repetido e evento distinto com o mesmo resultado;
- assinatura inválida, segredo errado, corpo alterado e cabeçalho em falta;
- montante, moeda ou referência errados, e montante em falta;
- falhado (com libertação do cupão) e cancelado;
- pago depois de expirado;
- recusa imediata e erro de rede (estado incerto);
- consulta oficial a devolver "pago" e "expirado";
- visitas repetidas à página de estado sem marcar como pago;
- entrega só após confirmação e revogada por reembolso;
- auditoria de alterações administrativas;
- moeda não-MZN recusada;
- EPay nunca ativa sem contrato, sem expor a chave;
- o fornecedor de teste só existe na BD de testes.

E2E (`e2e/05-payments.spec.ts`):
- checkout em MZN com métodos de pagamento;
- estado pendente persistente após várias visitas;
- webhook assinado: 401 com assinatura inválida, 200 normal e duplicado; passa a pago, link de acesso funciona, auditoria com uma única transição, líquido com a taxa devolvida;
- atualização automática da página por consulta oficial;
- recusa com opção de "Tentar novamente", expiração e erro de comunicação;
- tokens inválidos;
- dashboard a contar só os pagamentos confirmados.

O fornecedor de teste (`src/server/payments/providers/test-local.ts`) só é registado com `NTP_ENABLE_TEST_PROVIDER=true` **e** uma `DATABASE_URL` que aponte para `ntp_test`.

### Integração EPay — o que falta (depende da documentação oficial e de ti)

O adaptador está em `src/server/payments/providers/epay.ts`. Enquanto `EPAY_CONTRACT.confirmed` for `false`:
- `isConfigured()` devolve `false`, por isso o checkout informa que o pagamento não está disponível e não cobra nada;
- o webhook `/api/webhooks/epay` responde 404;
- nenhuma assinatura é aceite.

Pontos a confirmar na documentação (também listados na página Integrações):
1. URL base da API e se existe ambiente de testes (sandbox) com credenciais próprias.
2. Formato da autenticação (cabeçalho e esquema) com a chave secreta.
3. Endpoint, método e campos para criar o pagamento: montante em unidades ou em cêntimos, código de moeda `MZN`, referência do comerciante, telefone e método.
4. Códigos dos métodos ativos para a tua conta (ex.: M-Pesa, e-Mola) e formato do telefone.
5. Resposta à criação: identificador da transação, URL de checkout alojado (se houver) e estados.
6. Endpoint de consulta do estado.
7. Lista de estados e o seu significado.
8. Notificações: configuração do URL, campos e identificador único do evento.
9. Assinatura: cabeçalho, algoritmo, segredo usado e se é calculada sobre o corpo bruto.
10. Código HTTP e corpo que a EPay espera receber como resposta; política de reenvio.
11. Taxas devolvidas e códigos de erro.

Informação não verificada, obtida apenas por um motor de pesquisa a partir da página inicial da EPay (não usada no código):
- aceita M-Pesa, e-Mola e IZI via Millennium bim, sem cartões;
- API REST com chave Bearer e webhooks;
- o exemplo de pedido usa montante em cêntimos, um código de tipo de pagamento e o telefone.

Tudo isto tem de ser confirmado na documentação oficial.

**Quando a documentação estiver disponível**: preencher `createCharge`, `getStatus`, `methods`, `verifySignature`, `parseEvent` e `webhookAck` exatamente como documentado (a mapear para os tipos normalizados em `src/server/payments/types.ts`), mudar `EPAY_CONTRACT.confirmed` para `true` e acrescentar testes com exemplos reais da documentação. O resto do fluxo não precisa de alterações.

### Como inserir as credenciais (sem as colocar no código nem na conversa)

- **Local**: criar `.env` (já ignorado pelo Git) a partir de `.env.example` e preencher:
  - `EPAY_SECRET_KEY` — a chave do painel da EPay;
  - `EPAY_API_BASE_URL` — copiada da documentação;
  - `APP_BASE_URL` — o URL público.
- **Alojamento** (ex.: Vercel ou outro): definir as mesmas três variáveis no painel de variáveis de ambiente/segredos do projeto. Usar valores distintos em produção e em pré-visualização/testes, se a EPay der credenciais de teste.
- **No painel da EPay**: configurar o URL de notificações como `https://<o-teu-domínio>/api/webhooks/epay`. Tem de ser HTTPS.
- **Verificar** em Integrações → "Verificar configuração": mostra ✓/✗ sem revelar valores.
- **Se uma chave for exposta** (commit, captura de ecrã, conversa): revogá-la no painel da EPay e gerar uma nova; depois atualizar a variável no alojamento.

### Ficheiros principais desta sessão

`prisma/schema.prisma` e as 2 novas migrações · `src/lib/money.ts` · `src/server/payments/{types,confirm,webhooks,registry}.ts` · `src/server/payments/providers/{epay,test-local}.ts` · `src/server/services/{payment-flow,purchase,orders,integrations}.ts` · `src/app/pagamento/[token]/*` · `src/app/acesso/[token]/page.tsx` · `src/app/api/public/pagamento/[token]/route.ts` · `src/app/api/webhooks/[provider]/route.ts` · `src/components/checkouts/checkout-view.tsx` · `src/app/(app)/pedidos/[id]/page.tsx` · `src/app/(app)/integracoes/page.tsx` · `.env.example` · `.gitignore` · `tests/integration/payments.test.ts` · `e2e/05-payments.spec.ts`.

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

1. **EPay**: obter a documentação oficial (colar o conteúdo/PDF no repositório, por exemplo em `docs/epay-api.md`, ou permitir o domínio `painel.epay.co.mz` na configuração de rede do ambiente); implementar os 11 pontos acima; testar no ambiente de testes da EPay, se existir, e depois com uma transação real de valor baixo. **Não declarar produção pronta antes disso.**
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

- **Sessão 2 (2026-10-12)**: leitura do documento de integração EPay/MZN; documentação oficial da EPay inacessível a partir do ambiente (domínio bloqueado), por isso nada da API foi inventado; MZN em toda a plataforma; fluxo de pagamento real completo e agnóstico ao fornecedor; adaptador EPay isolado e desativado; 116 testes unitários/integração e 38 E2E a passar; build OK; verificação de fuga de segredos OK.
- **Sessão 1 (2026-10-12)**: análise do ambiente (repositório vazio), arquitetura, implementação das fases 1–7, 99 testes unitários/integração + 29 E2E, auditoria responsiva em 6 larguras, build de produção. Commits no ramo `claude/jolly-babbage-eg28n3`.
