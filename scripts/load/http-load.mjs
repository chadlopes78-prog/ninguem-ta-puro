// Teste de carga HTTP em circuito fechado (N clientes simultâneos, cada um repete o cenário durante D segundos).
// Só para ambientes de TESTE (servidor local com a base ntp_test e o fornecedor de pagamentos de teste).
// Nunca apontar para produção nem para os gateways reais.
//
// Uso:
//   node scripts/load/http-load.mjs --base http://localhost:3200 --seed seed.json --scenario open|submit|status|image
//        --levels 10,25,50,100,250 --duration 15 [--action <id da server action>] [--tokens res-submit.json] [--same-ip] [--pid <pid>] [--out res.json]
//
// Métricas por nível: pedidos, pedidos/s, latência p50/p95/p99/máx., códigos HTTP, erros de rede, memória e CPU do
// processo do servidor (se --pid) e ligações abertas à base de dados (via psql, se DATABASE_URL estiver definida).
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]);
    return acc;
  }, []),
);
const BASE = args.base ?? "http://localhost:3200";
const seed = JSON.parse(readFileSync(args.seed, "utf8"));
const LEVELS = (args.levels ?? "10,25,50,100,250").split(",").map(Number);
const DURATION = Number(args.duration ?? 15) * 1000;
const SCENARIO = args.scenario ?? "open";
const SAME_IP = args["same-ip"] === "true";
const tokens = args.tokens ? JSON.parse(readFileSync(args.tokens, "utf8")).tokens : [];

let ipSeq = 0;
const ipFor = (vu) => (SAME_IP ? "41.220.1.1" : `10.${(vu >> 8) & 255}.${vu & 255}.${(ipSeq++ % 250) + 1}`);

async function timed(fn) {
  const t0 = performance.now();
  try {
    const r = await fn();
    return { ms: performance.now() - t0, status: r.status, ok: r.ok, body: r.body };
  } catch (e) {
    return { ms: performance.now() - t0, status: 0, error: e.cause?.code ?? e.message };
  }
}

const scenarios = {
  // abrir o checkout como um browser: HTML da página + registo da sessão do checkout
  async open(vu) {
    const p = seed.products[vu % seed.products.length];
    const ip = ipFor(vu);
    const page = await timed(async () => {
      const r = await fetch(`${BASE}/checkout/${p.slug}`, { headers: { "x-forwarded-for": ip, "user-agent": "carga/1.0 (Android)" } });
      const text = await r.text();
      // a página tem de trazer este checkout (e não uma página de erro ou "indisponível" com 200)
      return { status: r.status, ok: r.ok && text.includes(p.publicId) };
    });
    const sess = await timed(async () => {
      const r = await fetch(`${BASE}/api/public/checkout/${p.publicId}/session`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ source: "facebook" }) });
      await r.arrayBuffer();
      return { status: r.status, ok: r.ok };
    });
    return [page, sess];
  },
  // submeter a compra (server action real) com o fornecedor de teste: telefone terminado em 3 → pagamento pendente
  async submit(vu, iter) {
    const p = seed.products[vu % seed.products.length];
    const key = `carga${Date.now().toString(36)}v${vu}i${iter}xxxxxxxx`.slice(0, 60);
    const res = await timed(async () => {
      const r = await fetch(`${BASE}/checkout/${p.slug}`, {
        method: "POST",
        headers: { "Next-Action": args.action, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", "x-forwarded-for": ipFor(vu) },
        body: JSON.stringify([p.publicId, { name: `Cliente ${vu}-${iter}`, email: `c${vu}x${iter}@carga.co.mz`, phone: `84${String((vu * 997 + iter) % 1000000).padStart(6, "0")}3`, method: "mpesa", idempotencyKey: key }]),
      });
      const text = await r.text();
      const m = /"kind":"(\w+)"(?:,"token":"([A-Za-z0-9_-]+)")?/.exec(text);
      if (m?.[2]) tokens.push(m[2]);
      return { status: r.status, ok: r.ok && m?.[1] === "payment_started", body: m?.[1] ?? text.slice(0, 120) };
    });
    return [res];
  },
  // o comprador à espera da confirmação (consulta periódica do estado)
  async status(vu, iter) {
    const t = tokens.length ? tokens[(vu + iter) % tokens.length] : "inexistente";
    const r = await timed(async () => {
      const x = await fetch(`${BASE}/api/public/pagamento/${t}`, { headers: { "x-forwarded-for": ipFor(vu) } });
      await x.arrayBuffer();
      return { status: x.status, ok: x.ok };
    });
    return [r];
  },
  async image(vu) {
    const r = await timed(async () => {
      const x = await fetch(`${BASE}${seed.imageUrl}`, { headers: { "x-forwarded-for": ipFor(vu), accept: "image/avif,image/webp,*/*" } });
      const b = await x.arrayBuffer();
      return { status: x.status, ok: x.ok && b.byteLength > 1000 };
    });
    return [r];
  },
};

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function sampleServer() {
  const out = {};
  if (args.pid) {
    try {
      const [rss, cpu] = execSync(`ps -o rss=,pcpu= -p ${args.pid}`).toString().trim().split(/\s+/).map(Number);
      out.rssMb = Math.round(rss / 1024);
      out.cpu = cpu;
    } catch {}
  }
  if (process.env.DATABASE_URL) {
    try {
      const url = process.env.DATABASE_URL.split("?")[0];
      out.dbConnections = Number(execSync(`psql "${url}" -Atc "select count(*) from pg_stat_activity where datname = current_database()"`).toString().trim());
    } catch {}
  }
  return out;
}

async function runLevel(n, scenario) {
  const lat = [];
  const codes = {};
  const errors = {};
  const bodies = {};
  let failed = 0;
  const samples = [];
  const until = Date.now() + DURATION;
  const sampler = setInterval(() => samples.push(sampleServer()), 1000);
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: n }, async (_, vu) => {
      let iter = 0;
      while (Date.now() < until) {
        for (const r of await scenarios[scenario](vu + n * 1000, iter++)) {
          lat.push(r.ms);
          codes[r.status] = (codes[r.status] ?? 0) + 1;
          if (r.error) errors[r.error] = (errors[r.error] ?? 0) + 1;
          if (r.body) bodies[r.body] = (bodies[r.body] ?? 0) + 1;
          if (!r.ok) failed++;
        }
      }
    }),
  );
  clearInterval(sampler);
  const secs = (performance.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  const max = (k) => Math.max(0, ...samples.map((s) => s[k] ?? 0));
  return {
    scenario,
    concurrency: n,
    sameIp: SAME_IP,
    requests: lat.length,
    rps: Math.round(lat.length / secs),
    p50: Math.round(pct(lat, 50)),
    p95: Math.round(pct(lat, 95)),
    p99: Math.round(pct(lat, 99)),
    max: Math.round(lat[lat.length - 1] ?? 0),
    failed,
    failRate: lat.length ? Math.round((failed / lat.length) * 10000) / 100 : 0,
    codes,
    errors,
    outcomes: bodies,
    serverMaxRssMb: max("rssMb"),
    serverMaxCpu: max("cpu"),
    dbMaxConnections: max("dbConnections"),
  };
}

const results = [];
for (const n of LEVELS) {
  const r = await runLevel(n, SCENARIO);
  results.push(r);
  console.log(JSON.stringify(r));
  await new Promise((res) => setTimeout(res, 2000));
}
if (args.out) writeFileSync(args.out, JSON.stringify({ results, tokens }, null, 2));
