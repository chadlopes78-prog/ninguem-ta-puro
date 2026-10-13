"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/spinner";

// A biblioteca de gráficos (Recharts) é pesada para o telemóvel: carrega-se à parte, depois da página,
// para que os números e as tabelas apareçam e respondam ao toque sem esperar pelos gráficos.
// Os gráficos só se desenham no browser (precisam da largura do ecrã), por isso não há perda no servidor.
const box = (h: string) =>
  function ChartLoading() {
    return <Skeleton className={`w-full ${h}`} />;
  };

export const RevenueChart = dynamic(() => import("./charts").then((m) => m.RevenueChart), { ssr: false, loading: box("h-[260px] sm:h-[300px]") });
export const OrdersChart = dynamic(() => import("./charts").then((m) => m.OrdersChart), { ssr: false, loading: box("h-[220px]") });
export const GrossChart = dynamic(() => import("./charts").then((m) => m.GrossChart), { ssr: false, loading: box("h-[240px] sm:h-[280px]") });
export const DailyBars = dynamic(() => import("./charts").then((m) => m.DailyBars), { ssr: false, loading: box("h-[200px]") });
