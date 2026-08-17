"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
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
          className={`flex shrink-0 items-center gap-1.5 border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
            pathname === "/dashboard"
              ? "border-secondary text-primary"
              : "border-transparent text-text-muted hover:text-primary"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
          MAESTRO
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
            className={`flex shrink-0 flex-col items-center gap-1 border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
              isActive ? "border-secondary text-primary" : "border-transparent text-text-muted hover:text-primary"
            }`}
          >
            <span className="whitespace-nowrap">{sector.nombre}</span>
            <Badge variant={isEditable ? "editable" : "solo-lectura"}>
              {isEditable ? "Editable" : "Solo lectura"}
            </Badge>
          </Link>
        );
      })}
    </nav>
  );
}
