// Verificação do endereço da app na Pagar (passagem para LIVE, docs/pagar-api.md secção 11).
//
// A Pagar pede, por hostname, um token público («pagar-verification=dom_…») publicado por DNS TXT ou no ficheiro
// https://<hostname>/.well-known/pagar-verification.txt com «apenas o token». Como cada hostname só pode mostrar UM
// token, cada vendedor com a sua própria app na Pagar usa o SEU hostname (associado a este projeto na Vercel) e
// guarda aqui o seu token; o ficheiro é servido conforme o hostname do pedido. O endereço principal da plataforma
// fica sempre com o token da conta proprietária (o mesmo que estava no ficheiro estático — verificado na Pagar).
// Os tokens não são segredos (são publicados na internet), por isso ficam em publicConfig.
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { staticAppBaseUrl } from "@/server/app-url";

/** Token publicado no endereço principal antes desta funcionalidade (app da conta proprietária, já verificado). */
export const PLATFORM_PAGAR_TOKEN = "pagar-verification=dom_BXrd2xVKntloZoRBp_HFdnwS1Z3BFaDl";

const TOKEN_RE = /^dom_[A-Za-z0-9_-]{16,80}$/;
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Normaliza um hostname (aceita um endereço colado com https:// ou caminho). */
export function normalizeHost(input: string | null | undefined): string | null {
  let s = (input ?? "").trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  return HOST_RE.test(s) ? s : null;
}

/** Aceita «pagar-verification=dom_…» ou só «dom_…»; devolve a linha completa a publicar. */
export function normalizeToken(input: string | null | undefined): string | null {
  const s = (input ?? "").trim().replace(/^pagar-verification\s*=\s*/i, "");
  return TOKEN_RE.test(s) ? `pagar-verification=${s}` : null;
}

/** Hostname principal da plataforma (APP_BASE_URL ou domínio de produção da Vercel). */
export function platformHost(): string | null {
  const url = staticAppBaseUrl().url;
  return url ? normalizeHost(url) : null;
}

/** Endereços da própria plataforma (APP_BASE_URL e domínio de produção da Vercel), reservados à conta proprietária. */
export function isPlatformHost(host: string): boolean {
  return host === platformHost() || host === normalizeHost(process.env.VERCEL_PROJECT_PRODUCTION_URL);
}

/** Token a publicar para o hostname do pedido (null → 404). */
export async function pagarVerificationTokenFor(hostHeader: string | null | undefined): Promise<string | null> {
  const host = normalizeHost(hostHeader);
  if (!host) return null;
  const row = await prisma.integrationConfig.findFirst({
    where: { provider: "pagar", publicConfig: { path: ["domainHost"], equals: host } },
    select: { publicConfig: true },
    orderBy: { updatedAt: "asc" },
  });
  const token = (row?.publicConfig as Record<string, unknown> | undefined)?.domainToken;
  if (typeof token === "string" && normalizeToken(token)) return token;
  return isPlatformHost(host) ? PLATFORM_PAGAR_TOKEN : null;
}

export interface PagarDomainView {
  host: string | null;
  token: string | null;
  platformHost: string | null;
}

export async function getPagarDomain(ownerId: string): Promise<PagarDomainView> {
  const row = await prisma.integrationConfig.findUnique({ where: { ownerId_provider: { ownerId, provider: "pagar" } }, select: { publicConfig: true } });
  const pub = (row?.publicConfig as Record<string, unknown> | undefined) ?? {};
  return { host: typeof pub.domainHost === "string" ? pub.domainHost : null, token: typeof pub.domainToken === "string" ? pub.domainToken : null, platformHost: platformHost() };
}

/**
 * Guarda o hostname e o token desta conta. O endereço principal é reservado à conta proprietária e um hostname só
 * pode pertencer a uma conta (impede que outra conta publique um token no endereço de outro vendedor).
 * Campos vazios removem a verificação desta conta.
 */
export async function savePagarDomain(
  ownerId: string,
  input: { host?: string; token?: string },
): Promise<{ ok: true; message: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { role: true } });
  if (!user) return { ok: false, error: "Conta não encontrada." };
  const row = await prisma.integrationConfig.findUnique({ where: { ownerId_provider: { ownerId, provider: "pagar" } }, select: { publicConfig: true } });
  const pub = { ...((row?.publicConfig as Record<string, unknown> | undefined) ?? {}) };
  const rawHost = input.host?.trim() ?? "";
  const rawToken = input.token?.trim() ?? "";
  if (!rawHost && !rawToken) {
    delete pub.domainHost;
    delete pub.domainToken;
    if (row) await prisma.integrationConfig.update({ where: { ownerId_provider: { ownerId, provider: "pagar" } }, data: { publicConfig: pub as Prisma.InputJsonValue } });
    return { ok: true, message: "Verificação do domínio removida desta conta." };
  }
  const host = normalizeHost(rawHost);
  const token = normalizeToken(rawToken);
  const fieldErrors: Record<string, string> = {};
  if (!host) fieldErrors.host = "Indique o hostname registado na Pagar (ex.: loja.exemplo.co.mz).";
  else if (isPlatformHost(host) && user.role !== "OWNER")
    fieldErrors.host = "Este endereço é o principal da plataforma e já tem o token da conta proprietária. Use um endereço próprio para a sua app.";
  if (!token) fieldErrors.token = "Cole o token mostrado pela Pagar (pagar-verification=dom_…).";
  if (host && !fieldErrors.host) {
    const taken = await prisma.integrationConfig.findFirst({ where: { provider: "pagar", ownerId: { not: ownerId }, publicConfig: { path: ["domainHost"], equals: host } }, select: { id: true } });
    if (taken) fieldErrors.host = "Este endereço já está associado a outra conta.";
  }
  if (Object.keys(fieldErrors).length || !host || !token) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors };
  const publicConfig = { ...pub, domainHost: host, domainToken: token } as Prisma.InputJsonValue;
  await prisma.integrationConfig.upsert({
    where: { ownerId_provider: { ownerId, provider: "pagar" } },
    create: { ownerId, provider: "pagar", enabled: false, publicConfig },
    update: { publicConfig },
  });
  await prisma.integrationLog.create({ data: { ownerId, provider: "pagar", level: "info", message: `Token de verificação do domínio da Pagar guardado para ${host}.` } });
  return { ok: true, message: `Token publicado em https://${host}/.well-known/pagar-verification.txt` };
}
