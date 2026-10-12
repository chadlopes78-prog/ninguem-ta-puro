// Verificação antes do build de produção (Vercel): falha cedo, com mensagem clara, se faltar configuração essencial.
// Nunca imprime valores — apenas se cada variável existe.
const missing = [];
if (!process.env.DATABASE_URL) missing.push("DATABASE_URL (ligação PostgreSQL — ex.: Vercel → Storage → Neon/Postgres)");
const appUrl = process.env.APP_BASE_URL ?? process.env.APP_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
if (!appUrl && !process.env.VERCEL) console.warn("[check-env] Aviso: APP_BASE_URL não definida (ex.: https://ninguem-ta-puro.vercel.app). Necessária para os pagamentos.");
if (!process.env.EPAY_SECRET_KEY) console.warn("[check-env] Aviso: EPAY_SECRET_KEY não definida — o checkout mostrará 'pagamento indisponível'.");
if (missing.length) {
  console.error(`\n[check-env] Configuração em falta para o build de produção:\n  - ${missing.join("\n  - ")}\n\nDefina as variáveis em Vercel → Project → Settings → Environment Variables e volte a fazer deploy.\n`);
  process.exit(1);
}
console.log("[check-env] DATABASE_URL definida. As migrações serão aplicadas antes do build.");
