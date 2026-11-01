// Verificação do domínio na Pagar por hostname: cada vendedor com app própria publica o SEU token no SEU hostname,
// sem tirar o token da conta proprietária do endereço principal.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { getPagarDomain, normalizeHost, normalizeToken, pagarVerificationTokenFor, PLATFORM_PAGAR_TOKEN, savePagarDomain } from "@/server/services/pagar-domain";
import { GET } from "@/app/.well-known/pagar-verification.txt/route";

const MAIN = "ninguem-ta-puro.vercel.app";
const SELLER_TOKEN = "pagar-verification=dom_VdjmeEB2M7ANJ77khlruR1SJuVtZXTpt";
const prevUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const prevBase = process.env.APP_BASE_URL;

beforeEach(async () => {
  await resetTestDb();
  delete process.env.APP_BASE_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = MAIN;
});
afterAll(() => {
  process.env.VERCEL_PROJECT_PRODUCTION_URL = prevUrl;
  if (prevBase !== undefined) process.env.APP_BASE_URL = prevBase;
});

const fetchFile = (host: string) => GET(new Request(`https://${host}/.well-known/pagar-verification.txt`, { headers: { host } }));

describe("verificação do domínio da Pagar", () => {
  it("normaliza o hostname e o token colados", () => {
    expect(normalizeHost("https://Loja.Exemplo.co.mz/qualquer")).toBe("loja.exemplo.co.mz");
    expect(normalizeHost("nao é host")).toBeNull();
    expect(normalizeToken("dom_VdjmeEB2M7ANJ77khlruR1SJuVtZXTpt")).toBe(SELLER_TOKEN);
    expect(normalizeToken(" " + SELLER_TOKEN + " ")).toBe(SELLER_TOKEN);
    expect(normalizeToken("sk_live_abc")).toBeNull();
  });

  it("endereço principal continua a mostrar apenas o token da conta proprietária", async () => {
    const r = await fetchFile(MAIN);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(PLATFORM_PAGAR_TOKEN);
    expect(r.headers.get("content-type")).toContain("text/plain");
  });

  it("vendedor guarda o seu token no seu hostname: cada hostname mostra só o seu token", async () => {
    await testOwner();
    const seller = await testSeller("vendedor@ntp.local");
    const r = await savePagarDomain(seller.id, { host: "https://pay-vendedor.vercel.app/", token: "dom_VdjmeEB2M7ANJ77khlruR1SJuVtZXTpt" });
    expect(r.ok).toBe(true);
    expect(await (await fetchFile("pay-vendedor.vercel.app")).text()).toBe(SELLER_TOKEN);
    expect(await (await fetchFile(MAIN)).text()).toBe(PLATFORM_PAGAR_TOKEN);
    expect((await fetchFile("desconhecido.vercel.app")).status).toBe(404);
    expect(await getPagarDomain(seller.id)).toMatchObject({ host: "pay-vendedor.vercel.app", token: SELLER_TOKEN });
  });

  it("não deixa um vendedor ocupar o endereço principal nem o hostname de outra conta", async () => {
    const a = await testSeller("a@ntp.local");
    const b = await testSeller("b@ntp.local");
    const main = await savePagarDomain(a.id, { host: MAIN, token: SELLER_TOKEN });
    expect(main.ok).toBe(false);
    expect(main.ok ? null : main.fieldErrors?.host).toMatch(/principal/);
    expect((await savePagarDomain(a.id, { host: "loja-a.vercel.app", token: SELLER_TOKEN })).ok).toBe(true);
    const steal = await savePagarDomain(b.id, { host: "loja-a.vercel.app", token: "dom_OutroTokenQualquer123456" });
    expect(steal.ok ? null : steal.fieldErrors?.host).toMatch(/outra conta/);
    expect(await pagarVerificationTokenFor("loja-a.vercel.app")).toBe(SELLER_TOKEN);
  });

  it("guardar o token não mexe no modo nem nas credenciais da Pagar; campos vazios removem a verificação", async () => {
    const s = await testSeller("c@ntp.local");
    await prisma.integrationConfig.create({ data: { ownerId: s.id, provider: "pagar", publicConfig: { mode: "live" }, secretConfig: "cifrado", status: "CONFIGURED" } });
    await savePagarDomain(s.id, { host: "loja-c.vercel.app", token: SELLER_TOKEN });
    const row = await prisma.integrationConfig.findUniqueOrThrow({ where: { ownerId_provider: { ownerId: s.id, provider: "pagar" } } });
    expect(row.publicConfig).toMatchObject({ mode: "live", domainHost: "loja-c.vercel.app" });
    expect(row.secretConfig).toBe("cifrado");
    await savePagarDomain(s.id, { host: "", token: "" });
    expect((await fetchFile("loja-c.vercel.app")).status).toBe(404);
    const after = await prisma.integrationConfig.findUniqueOrThrow({ where: { ownerId_provider: { ownerId: s.id, provider: "pagar" } } });
    expect(after.publicConfig).toEqual({ mode: "live" });
  });

  it("token inválido é recusado", async () => {
    const s = await testSeller("d@ntp.local");
    const r = await savePagarDomain(s.id, { host: "loja-d.vercel.app", token: "abc" });
    expect(r.ok ? null : r.fieldErrors?.token).toBeTruthy();
  });
});
