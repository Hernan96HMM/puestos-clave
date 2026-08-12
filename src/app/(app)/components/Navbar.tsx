import Link from "next/link";

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
  return (
    <nav>
      {sectores.map((sector) => {
        const isEditable = rol === "gerente" && sectorId === sector.id;
        return (
          <Link key={sector.id} href={`/sector/${sector.slug}`}>
            {sector.nombre}
            <span>{isEditable ? "Editable" : "Solo lectura"}</span>
          </Link>
        );
      })}
    </nav>
  );
}
