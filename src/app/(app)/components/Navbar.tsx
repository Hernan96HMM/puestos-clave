"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
}: {
  sectores: Sector[];
  rol: "gerente" | "direccion";
  sectorId: string | null;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 overflow-x-auto border-t border-border px-4 py-2">
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
