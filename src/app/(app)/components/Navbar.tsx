"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/Badge";

interface Sector {
  id: string;
  nombre: string;
  slug: string;
}

export function Navbar({
  sectores,
  rol,
  sectorId,
  mostrarDashboard,
}: {
  sectores: Sector[];
  rol: "gerente" | "direccion";
  sectorId: string | null;
  mostrarDashboard: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 overflow-x-auto border-t border-border px-4 py-2">
      {mostrarDashboard && (
        <Link
          href="/dashboard"
          aria-current={pathname === "/dashboard" ? "page" : undefined}
          className={`relative flex shrink-0 items-center gap-1.5 px-1 py-2 text-sm font-medium transition-colors ${
            pathname === "/dashboard" ? "text-primary" : "text-text-muted hover:text-primary"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
          MAESTRO
          {pathname === "/dashboard" && (
            <motion.span
              layoutId="nav-indicator"
              className="absolute inset-x-0 -bottom-px h-0.5 bg-secondary"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
        </Link>
      )}
      {sectores.map((sector) => {
        const isEditable = rol === "gerente" && sectorId === sector.id;
        const isActive = pathname === `/sector/${sector.slug}`;
        return (
          <Link
            key={sector.id}
            href={`/sector/${sector.slug}`}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex shrink-0 flex-col items-center gap-1 px-1 py-2 text-sm font-medium transition-colors ${
              isActive ? "text-primary" : "text-text-muted hover:text-primary"
            }`}
          >
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              {sector.nombre}
            </span>
            <Badge variant={isEditable ? "editable" : "solo-lectura"}>
              {isEditable ? "Editable" : "Solo lectura"}
            </Badge>
            {isActive && (
              <motion.span
                layoutId="nav-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-secondary"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
