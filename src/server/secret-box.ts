// Cifra de credenciais guardadas na base de dados (ex.: credenciais da E2Payments introduzidas na aba Integrações).
// AES-256-GCM com uma chave que só existe no servidor e nunca na base de dados (nunca NEXT_PUBLIC_*):
//  - "v1":  INTEGRATIONS_ENCRYPTION_KEY, quando definida (recomendado em instalações próprias);
//  - "v1d": derivada de DATABASE_URL (segredo do servidor que já existe), para que as credenciais possam ser
//           geridas no site sem configurar nada no alojamento. Uma cópia da base de dados sozinha não as revela.
//           Se a palavra-passe da base de dados mudar, as credenciais têm de ser introduzidas de novo.
// Cada valor guarda a versão da chave usada, por isso definir mais tarde INTEGRATIONS_ENCRYPTION_KEY não estraga
// o que já foi guardado.
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

type KeyVersion = "v1" | "v1d";

function keyFor(version: KeyVersion): Buffer | null {
  if (version === "v1") {
    const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
    if (!raw || raw.length < 32) return null;
    return createHash("sha256").update(`ntp-integrations:${raw}`).digest();
  }
  const db = process.env.DATABASE_URL?.trim();
  if (!db) return null;
  return createHash("sha256").update(`ntp-integrations-db:${db}`).digest();
}

function currentVersion(): KeyVersion | null {
  if (keyFor("v1")) return "v1";
  if (keyFor("v1d")) return "v1d";
  return null;
}

export function secretStorageAvailable(): boolean {
  return currentVersion() !== null;
}

export function encryptSecret(plain: string): string {
  const version = currentVersion();
  const k = version ? keyFor(version) : null;
  if (!version || !k) throw new Error("Sem chave de cifra disponível no servidor");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [version, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

/** Devolve null se a chave faltar, tiver mudado ou o valor estiver corrompido (nunca lança com detalhes do segredo). */
export function decryptSecret(box: string | null | undefined): string | null {
  if (!box) return null;
  const [v, iv, tag, ct] = box.split(":");
  if ((v !== "v1" && v !== "v1d") || !iv || !tag || !ct) return null;
  const k = keyFor(v);
  if (!k) return null;
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
