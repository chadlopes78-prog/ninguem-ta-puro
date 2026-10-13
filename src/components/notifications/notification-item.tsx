"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Abrir (marca como lida e navega) e marcar como lida. */
export function NotificationActions({ id, url, unread, markRead }: { id: string; url: string | null; unread: boolean; markRead: (id: string) => Promise<ActionResult<unknown>> }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const read = (then?: string) =>
    start(async () => {
      if (unread) {
        const r = await markRead(id);
        if (!r.ok) return toast(r.error, "error");
      }
      if (then) router.push(then);
      else router.refresh();
    });
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5">
      {url && (
        <Button size="sm" variant="secondary" onClick={() => read(url)} disabled={pending} data-testid="notification-open">
          Abrir <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      )}
      {unread && (
        <Button size="sm" variant="ghost" onClick={() => read()} disabled={pending} data-testid="notification-read">
          <Check className="h-3.5 w-3.5" /> Marcar como lida
        </Button>
      )}
    </div>
  );
}
