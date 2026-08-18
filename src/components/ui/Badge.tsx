"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

export type BadgeVariant =
  | "riesgo-alto"
  | "riesgo-medio"
  | "riesgo-bajo"
  | "validacion-pendiente"
  | "validacion-aprobado"
  | "validacion-observado"
  | "editable"
  | "solo-lectura";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  "riesgo-alto": "bg-risk-high-bg text-risk-high",
  "riesgo-medio": "bg-risk-medium-bg text-risk-medium",
  "riesgo-bajo": "bg-risk-low-bg text-risk-low",
  "validacion-pendiente": "bg-bg-subtle text-text-muted",
  "validacion-aprobado": "bg-risk-low-bg text-risk-low",
  "validacion-observado": "bg-risk-medium-bg text-risk-medium",
  editable: "bg-secondary-bg text-secondary-text",
  "solo-lectura": "bg-bg-subtle text-text-muted",
};

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  // Pulso sutil solo en riesgo ALTO — llama la atención sin ser molesto
  // en el resto de los badges (spec original F-116, sección 4).
  const esAlerta = variant === "riesgo-alto";
  return (
    <motion.span
      animate={esAlerta ? { scale: [1, 1.06, 1] } : undefined}
      transition={esAlerta ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : undefined}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </motion.span>
  );
}
