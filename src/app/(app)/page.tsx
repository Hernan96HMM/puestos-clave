import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { Card } from "@/components/ui/Card";

type SectorRow = {
  nombre: string;
  slug: string;
};

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return null;

  // El gerente sólo administra su propio sector: lo mandamos directo ahí.
  if (session.user.rol === "gerente" && session.user.sectorId) {
    const rows = await query<SectorRow>("select nombre, slug from sector where id = $1", [
      session.user.sectorId,
    ]);
    const propio = rows[0];
    if (propio) redirect(`/sector/${propio.slug}`);
  }

  // Dirección (y cualquier caso sin sector propio resoluble) ve el índice.
  const sectores = await query<SectorRow>("select nombre, slug from sector order by orden");

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-primary">Sectores</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {sectores.map((s) => (
          <Card key={s.slug}>
            <Link href={`/sector/${s.slug}`} className="font-medium text-primary hover:underline">
              {s.nombre}
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
