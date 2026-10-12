import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb } from "../helpers/db";
import { createUser, getUserBySessionToken, hasAnyUser, login, revokeSession, LOGIN_MAX_FAILURES, changePassword } from "@/server/auth/service";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { hashToken } from "@/server/auth/tokens";

beforeEach(async () => {
  await resetTestDb();
});

describe("autenticação", () => {
  it("hash de password", async () => {
    const h = await hashPassword("segredo-muito-forte");
    expect(h).not.toContain("segredo");
    expect(await verifyPassword("segredo-muito-forte", h)).toBe(true);
    expect(await verifyPassword("errada", h)).toBe(false);
    expect(await verifyPassword("x", "formato-invalido")).toBe(false);
  });

  it("login cria sessão; token guardado apenas como hash", async () => {
    expect(await hasAnyUser()).toBe(false);
    await createUser({ email: "Dono@Exemplo.pt", name: "Dono", password: "password-segura-1" });
    expect(await hasAnyUser()).toBe(true);
    const r = await login("dono@exemplo.pt", "password-segura-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stored = await prisma.session.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashToken(r.token));
    expect(stored.tokenHash).not.toBe(r.token);
    expect((await getUserBySessionToken(r.token))?.email).toBe("dono@exemplo.pt");
    await revokeSession(r.token);
    expect(await getUserBySessionToken(r.token)).toBeNull();
  });

  it("rejeita credenciais erradas, tokens inválidos e sessões expiradas", async () => {
    await createUser({ email: "a@b.pt", name: "A", password: "password-segura-1" });
    expect((await login("a@b.pt", "errada")).ok).toBe(false);
    expect((await login("naoexiste@b.pt", "x")).ok).toBe(false);
    expect(await getUserBySessionToken("token-inventado-com-tamanho-suficiente")).toBeNull();
    expect(await getUserBySessionToken(undefined)).toBeNull();
    const r = await login("a@b.pt", "password-segura-1");
    if (!r.ok) throw new Error();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getUserBySessionToken(r.token)).toBeNull();
  });

  it("limita tentativas falhadas", async () => {
    await createUser({ email: "a@b.pt", name: "A", password: "password-segura-1" });
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await login("a@b.pt", "errada", { ip: "1.2.3.4" });
    const blocked = await login("a@b.pt", "password-segura-1", { ip: "1.2.3.4" });
    expect(blocked).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("mudar password revoga sessões", async () => {
    const u = await createUser({ email: "a@b.pt", name: "A", password: "password-segura-1" });
    const r = await login("a@b.pt", "password-segura-1");
    if (!r.ok) throw new Error();
    expect(await changePassword(u.id, "errada", "nova-password-12")).toBe(false);
    expect(await changePassword(u.id, "password-segura-1", "nova-password-12")).toBe(true);
    expect(await getUserBySessionToken(r.token)).toBeNull();
  });
});
