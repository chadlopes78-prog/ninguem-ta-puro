import { redirect } from "next/navigation";

// Entrada «Operações» do menu: abre a primeira aba (Pedidos)
export default function OperationsPage() {
  redirect("/pedidos");
}
