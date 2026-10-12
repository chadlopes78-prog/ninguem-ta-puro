"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./button";
import { useToast } from "./toast";

/** Copia um caminho (relativo à origem atual) ou URL absoluto para a área de transferência. */
export function CopyButton({ value, label = "Copiar link", size = "sm" as const }: { value: string; label?: string; size?: "sm" | "md" | "icon" }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  const copy = async () => {
    const text = value.startsWith("/") ? `${window.location.origin}${value}` : value;
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      toast("Link copiado para a área de transferência.");
      setTimeout(() => setDone(false), 2000);
    } catch {
      toast("Não foi possível copiar. Copie manualmente: " + text, "error");
    }
  };
  return (
    <Button variant="secondary" size={size} onClick={copy} aria-label={label} data-copy-value={value}>
      {done ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
      {size !== "icon" && label}
    </Button>
  );
}
