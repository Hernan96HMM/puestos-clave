import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";

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
      <h1>Sectores</h1>
      <ul>
        {sectores.map((s) => (
          <li key={s.slug}>
            <Link href={`/sector/${s.slug}`}>{s.nombre}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
