"use server";

import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { isPanelTheme, THEME_COOKIE } from "@/lib/panel-theme";

/** Guarda a preferência de tema do utilizador (base de dados + cookie para o primeiro desenho da página). */
export async function setThemePreferenceAction(theme: string) {
  const user = await requireUser();
  if (!isPanelTheme(theme)) return { ok: false as const };
  await prisma.user.update({ where: { id: user.id }, data: { themePreference: theme } });
  (await cookies()).set(THEME_COOKIE, theme, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, httpOnly: false });
  return { ok: true as const };
}
