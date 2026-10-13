// Âmbito de dados de cada pedido: a conta autenticada (ownerId) e o modo (real/demonstração).
// O ownerId vem SEMPRE da sessão validada no servidor (ou do dono do recurso público), nunca de dados do browser.
export interface Scope {
  readonly ownerId: string;
  readonly isDemo: boolean;
}

/** Filtro/dados de uma entidade da conta: { ownerId, isDemo } (objeto novo, só com estes dois campos). */
export function own(s: Scope): { ownerId: string; isDemo: boolean } {
  return { ownerId: s.ownerId, isDemo: s.isDemo };
}

export function scopeOf(ownerId: string, isDemo: boolean): Scope {
  if (!ownerId) throw new Error("Âmbito sem conta");
  return Object.freeze({ ownerId, isDemo });
}
