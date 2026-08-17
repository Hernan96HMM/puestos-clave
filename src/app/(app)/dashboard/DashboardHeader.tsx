"use client";

import { motion } from "framer-motion";
import { Users, KeySquare, TrendingUp, AlertTriangle, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";

export interface KpiValores {
  total: number;
  puestoClave: number;
  pctPuestoClave: number;
  puestoAtencion: number;
}

const PALABRAS_TITULO = ["Dashboard", "MAESTRO"];

export function DashboardHeader({ kpis }: { kpis: KpiValores }) {
  const cards: { label: string; value: string | number; Icon: LucideIcon }[] = [
    { label: "Puestos evaluados", value: kpis.total, Icon: Users },
    { label: "Puesto Clave", value: kpis.puestoClave, Icon: KeySquare },
    { label: "% Puesto Clave", value: `${kpis.pctPuestoClave}%`, Icon: TrendingUp },
    { label: "Puesto de Atención", value: kpis.puestoAtencion, Icon: AlertTriangle },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex flex-wrap gap-2 text-2xl font-bold text-primary">
        {PALABRAS_TITULO.map((palabra, i) => (
          <motion.span
            key={palabra}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12, duration: 0.4 }}
          >
            {palabra}
          </motion.span>
        ))}
      </h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ label, value, Icon }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.35 }}
          >
            <Card className="flex flex-col gap-1">
              <Icon className="h-5 w-5 text-secondary" aria-hidden="true" />
              <span className="text-2xl font-bold text-text">{value}</span>
              <span className="text-xs text-text-muted">{label}</span>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
