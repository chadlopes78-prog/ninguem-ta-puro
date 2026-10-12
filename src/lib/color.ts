/** Escolhe texto claro ou escuro para garantir contraste sobre uma cor de fundo #RRGGBB. */
export function readableOn(hex: string): "#0a0b0d" | "#ffffff" {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return L > 0.4 ? "#0a0b0d" : "#ffffff";
}

export function isDark(hex: string): boolean {
  return readableOn(hex) === "#ffffff";
}
