import { randomBytes } from "crypto";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Identificador aleatório criptograficamente seguro, sem caracteres ambíguos. */
export function randomId(length = 12, alphabet = ALPHABET): string {
  const bytes = randomBytes(length * 2);
  let out = "";
  // rejeição para evitar enviesamento do módulo
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    const b = bytes[i];
    if (b < max) out += alphabet[b % alphabet.length];
  }
  return out.length === length ? out : randomId(length, alphabet);
}

export function newCheckoutPublicId(): string {
  return randomId(14);
}

export function newOrderCode(): string {
  return `NTP-${randomId(8, "23456789ABCDEFGHJKLMNPQRSTUVWXYZ")}`;
}

export function newRunId(): string {
  return randomId(20);
}
