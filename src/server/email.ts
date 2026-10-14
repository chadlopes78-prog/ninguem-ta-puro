// Envio de email transacional (redefinição de palavra-passe). A plataforma não tinha fornecedor de email:
// se RESEND_API_KEY e EMAIL_FROM estiverem definidos no servidor, usa a API HTTP da Resend; caso contrário,
// não envia nada (e o chamador informa o utilizador). A chave nunca é registada nem enviada ao browser.
import "server-only";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.error("[email] envio recusado", r.status);
    return r.ok;
  } catch (e) {
    console.error("[email] falha de rede", e instanceof Error ? e.name : "erro");
    return false;
  }
}
