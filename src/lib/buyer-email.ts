// Produtos com «Pedir email» desativado: o comprador é identificado pelo telefone. Como cada cliente precisa de um
// identificador único, guarda-se um endereço interno não entregável (domínio .invalid, RFC 2606) — nunca é mostrado
// como email real nem enviado a terceiros (ex.: Meta).
export const NO_EMAIL_DOMAIN = "sem-email.invalid";

export function phoneOnlyEmail(phone: string) {
  return `tel-${phone.replace(/\D/g, "")}@${NO_EMAIL_DOMAIN}`;
}

export function isPhoneOnlyEmail(email: string | null | undefined) {
  return !!email && email.toLowerCase().endsWith(`@${NO_EMAIL_DOMAIN}`);
}

/** Email para mostrar no painel («Sem email» quando o comprador só deu o telefone). */
export function displayEmail(email: string | null | undefined) {
  return isPhoneOnlyEmail(email) ? "Sem email" : (email ?? "");
}
