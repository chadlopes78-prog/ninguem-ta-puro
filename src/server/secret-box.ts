// Cifra de credenciais guardadas na base de dados (ex.: credenciais da E2Payments introduzidas na aba Integrações).
// AES-256-GCM com uma chave que só existe no servidor (INTEGRATIONS_ENCRYPTION_KEY, nunca NEXT_PUBLIC_*).
// Sem a chave nada é guardado: a base de dados nunca contém segredos em texto simples.
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const VERSION = "v1";

function key(): Buffer | null {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!raw || raw.length < 32) return null;
  // aceita qualquer texto aleatório longo (ex.: openssl rand -base64 32) e deriva 32 bytes
  return createHash("sha256").update(`ntp-integrations:${raw}`).digest();
}

export function secretStorageAvailable(): boolean {
  return key() !== null;
}

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("INTEGRATIONS_ENCRYPTION_KEY não definida");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

/** Devolve null se a chave faltar, tiver mudado ou o valor estiver corrompido (nunca lança com detalhes do segredo). */
export function decryptSecret(box: string | null | undefined): string | null {
  const k = key();
  if (!k || !box) return null;
  const [v, iv, tag, ct] = box.split(":");
  if (v !== VERSION || !iv || !tag || !ct) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Para mostrar que um valor existe sem o revelar: "••••1a2b". */
export function maskSecret(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.length <= 8 ? "••••" : `••••${v.slice(-4)}`;
}
