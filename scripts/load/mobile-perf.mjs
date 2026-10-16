// Desempenho do checkout em perfis de telemóvel EMULADOS no Chromium (não são dispositivos físicos nem Safari/WebKit):
// limitação de CPU e de rede via Chrome DevTools Protocol. Mede LCP, CLS, INP aproximado (maior duração de evento
// ao escrever e tocar), TTFB, número de pedidos e bytes transferidos (total, JS, imagens, fontes).
//
// Uso: node scripts/load/mobile-perf.mjs --base http://localhost:3200 --path /checkout/<slug> [--runs 3] [--out res.json]
import { chromium } from "@playwright/test";
import { writeFileSync } from "fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const BASE = args.base ?? "http://localhost:3200";
const PATH = args.path;
const RUNS = Number(args.runs ?? 3);

// Redes (valores do Lighthouse/DevTools): débito em bytes/s e latência adicional em ms
const NET = {
  rapida: null,
  "4g": { latency: 85, down: (9 * 1024 * 1024) / 8, up: (1.5 * 1024 * 1024) / 8 },
  "4g-lento": { latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8 },
  "3g-lento": { latency: 400, down: (400 * 1024) / 8, up: (400 * 1024) / 8 },
};
const UA = {
  androidAntigo: "Mozilla/5.0 (Linux; Android 8.1.0; SM-J260M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36",
  androidRecente: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  facebook: "Mozilla/5.0 (Linux; Android 12; SM-A125F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/442.0.0.33.113;]",
  instagram: "Mozilla/5.0 (Linux; Android 11; Redmi 9A Build/RP1A.200720.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.5993.111 Mobile Safari/537.36 Instagram 307.0.0.34.111 Android (30/11; 320dpi; 720x1456; Xiaomi; Redmi 9A)",
  iphoneAntigo: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1",
  iphoneFacebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0.25.110;FBBV/556104542;FBDV/iPhone12,1;FBMD/iPhone;FBSN/iOS;FBSV/17.1;FBSS/2;FBID/phone;FBLC/pt_PT;FBOP/5]",
};
export const PROFILES = [
  { name: "Android económico (2 GB, Android 8) · 3G lento", ua: UA.androidAntigo, viewport: { width: 360, height: 640 }, dpr: 2, cpu: 6, net: "3g-lento" },
  { name: "Android económico (2 GB, Android 8) · 4G lento", ua: UA.androidAntigo, viewport: { width: 360, height: 640 }, dpr: 2, cpu: 6, net: "4g-lento" },
  { name: "Android recente · 4G", ua: UA.androidRecente, viewport: { width: 412, height: 915 }, dpr: 2.6, cpu: 2, net: "4g" },
  { name: "Browser do Facebook (Android, WebView) · 4G lento", ua: UA.facebook, viewport: { width: 360, height: 760 }, dpr: 2, cpu: 4, net: "4g-lento" },
  { name: "Browser do Instagram (Android, WebView) · 4G lento", ua: UA.instagram, viewport: { width: 360, height: 728 }, dpr: 2, cpu: 4, net: "4g-lento" },
  { name: "iPhone SE (emulado no Chromium) · 4G lento", ua: UA.iphoneAntigo, viewport: { width: 375, height: 667 }, dpr: 2, cpu: 4, net: "4g-lento" },
  { name: "iPhone + Facebook (emulado no Chromium) · 4G", ua: UA.iphoneFacebook, viewport: { width: 390, height: 844 }, dpr: 3, cpu: 2, net: "4g" },
  { name: "Computador · rede rápida", ua: undefined, viewport: { width: 1366, height: 800 }, dpr: 1, cpu: 1, net: "rapida" },
];

async function measure(browser, prof) {
  const ctx = await browser.newContext({ userAgent: prof.ua, viewport: prof.viewport, deviceScaleFactor: prof.dpr, isMobile: prof.viewport.width < 800, hasTouch: prof.viewport.width < 800, locale: "pt-PT" });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true }); // primeira visita (clique no anúncio)
  if (prof.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: prof.cpu });
  const n = NET[prof.net];
  if (n) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: n.latency, downloadThroughput: n.down, uploadThroughput: n.up });
  const bytes = { total: 0, js: 0, img: 0, font: 0, css: 0, doc: 0 };
  let requests = 0;
  const types = new Map();
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => {
    requests++;
    const t = types.get(e.requestId);
    bytes.total += e.encodedDataLength;
    if (t === "Script") bytes.js += e.encodedDataLength;
    else if (t === "Image") bytes.img += e.encodedDataLength;
    else if (t === "Font") bytes.font += e.encodedDataLength;
    else if (t === "Stylesheet") bytes.css += e.encodedDataLength;
    else if (t === "Document") bytes.doc += e.encodedDataLength;
  });
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, inp: 0, lcpEl: "" };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__perf.lcp = e.startTime;
        window.__perf.lcpEl = e.element ? `${e.element.tagName.toLowerCase()}${e.element.id ? "#" + e.element.id : ""}` : "";
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.interactionId) window.__perf.inp = Math.max(window.__perf.inp, e.duration);
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  });
  const t0 = Date.now();
  await page.goto(`${BASE}${PATH}?utm_source=facebook&utm_medium=cpc&fbclid=teste123`, { waitUntil: "load", timeout: 120_000 });
  const loadMs = Date.now() - t0;
  const nav = await page.evaluate(() => {
    const e = performance.getEntriesByType("navigation")[0];
    return { ttfb: e.responseStart, dcl: e.domContentLoadedEventEnd };
  });
  // interação real: escrever o nome e tocar no método/telefone (mede a resposta da página)
  const form = {};
  form.priceVisible = await page.getByText(/MZN/).first().isVisible();
  form.imageLoaded = await page.evaluate(() => [...document.images].some((i) => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().width > 100));
  const name = page.getByLabel(/Nome/).first();
  await name.click();
  await name.pressSequentially("Ana Macuácua", { delay: 30 });
  const phone = page.locator("input[type=tel], input[inputmode=tel], input[inputmode=numeric]").first();
  form.phoneKeyboard = (await phone.count()) ? await phone.evaluate((el) => el.type === "tel" || ["tel", "numeric"].includes(el.inputMode)) : false;
  const email = page.locator("input[type=email]").first();
  form.emailKeyboard = (await email.count()) > 0;
  const submit = page.getByRole("button", { name: /Pagar|Finalizar|Comprar/i }).first();
  await submit.scrollIntoViewIfNeeded();
  form.submitVisible = await submit.isVisible();
  form.submitInViewportAfterScroll = await submit.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom <= window.innerHeight && r.top >= 0;
  });
  form.horizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await page.waitForTimeout(500);
  const perf = await page.evaluate(() => window.__perf);
  await ctx.close();
  return { profile: prof.name, loadMs, ttfb: Math.round(nav.ttfb), lcp: Math.round(perf.lcp), lcpElement: perf.lcpEl, cls: Math.round(perf.cls * 1000) / 1000, inp: Math.round(perf.inp), requests, kb: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])), form };
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const results = [];
for (const prof of PROFILES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await measure(browser, prof));
  // mediana por métrica (o resto vem da execução mediana pelo LCP)
  runs.sort((a, b) => a.lcp - b.lcp);
  const med = runs[Math.floor(runs.length / 2)];
  results.push({ ...med, lcpRuns: runs.map((r) => r.lcp) });
  console.log(JSON.stringify(results.at(-1)));
}
await browser.close();
if (args.out) writeFileSync(args.out, JSON.stringify(results, null, 2));
