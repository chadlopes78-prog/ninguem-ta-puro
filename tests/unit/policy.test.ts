import { describe, expect, it } from "vitest";
import { accountState, canAdminister, canApplyAdminAction, canUseApp, type PolicyUser } from "@/server/auth/policy";

const u = (o: Partial<PolicyUser> & { id?: string } = {}) => ({ id: o.id ?? "u1", role: o.role ?? "USER", status: o.status ?? "PENDING_APPROVAL", bannedAt: o.bannedAt ?? null }) as PolicyUser & { id: string };
const owner = u({ id: "owner", role: "OWNER", status: "APPROVED" });

describe("política de acesso", () => {
  it("estado da conta: a suspensão sobrepõe-se à aprovação", () => {
    expect(accountState(u())).toBe("pending");
    expect(accountState(u({ status: "APPROVED" }))).toBe("approved");
    expect(accountState(u({ status: "REJECTED" }))).toBe("rejected");
    expect(accountState(u({ status: "APPROVED", bannedAt: new Date() }))).toBe("banned");
  });

  it("só contas aprovadas e não suspensas usam o painel; só o OWNER administra", () => {
    expect(canUseApp(u())).toBe(false);
    expect(canUseApp(u({ status: "REJECTED" }))).toBe(false);
    expect(canUseApp(u({ status: "APPROVED", bannedAt: new Date() }))).toBe(false);
    expect(canUseApp(u({ status: "APPROVED" }))).toBe(true);
    expect(canAdminister(u({ status: "APPROVED" }))).toBe(false);
    expect(canAdminister(owner)).toBe(true);
    expect(canAdminister(u({ role: "OWNER", status: "PENDING_APPROVAL" }))).toBe(false);
  });

  it("ações administrativas: nunca sobre o OWNER nem por não-OWNER; transições coerentes", () => {
    const target = u({ id: "t" });
    expect(canApplyAdminAction(owner, target, "approve").ok).toBe(true);
    expect(canApplyAdminAction(owner, target, "reject").ok).toBe(true);
    expect(canApplyAdminAction(owner, target, "unban").ok).toBe(false);
    expect(canApplyAdminAction(owner, u({ id: "t", status: "APPROVED" }), "approve").ok).toBe(false);
    expect(canApplyAdminAction(owner, u({ id: "t", bannedAt: new Date() }), "ban").ok).toBe(false);
    expect(canApplyAdminAction(owner, u({ id: "t", bannedAt: new Date() }), "unban").ok).toBe(true);
    expect(canApplyAdminAction(owner, owner, "ban").ok).toBe(false);
    expect(canApplyAdminAction(owner, u({ id: "x", role: "OWNER", status: "APPROVED" }), "ban").ok).toBe(false);
    expect(canApplyAdminAction(u({ id: "a", status: "APPROVED" }), target, "approve").ok).toBe(false);
  });
});
