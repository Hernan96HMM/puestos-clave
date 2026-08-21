"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { InstruccionesTab } from "./InstruccionesTab";

type Tab = "instrucciones" | "evaluacion";

const TABS: { id: Tab; label: string }[] = [
  { id: "instrucciones", label: "Instrucciones" },
  { id: "evaluacion", label: "Evaluación" },
];

export function SectorTabs({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>("instrucciones");

  return (
    <div>
      <div className="mb-4 flex gap-4 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`relative px-1 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "text-primary" : "text-text-muted hover:text-primary"
            }`}
          >
            {t.label}
            {tab === t.id && (
              <motion.span
                layoutId="sector-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-secondary"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>
      {tab === "instrucciones" ? <InstruccionesTab /> : children}
    </div>
  );
}
