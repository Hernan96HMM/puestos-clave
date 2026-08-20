import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return null;

  // Sin rol dirección: directo al primer sector gerente (sectoresGerente ya
  // viene ordenado por sector.orden desde auth.ts — hoy es siempre 0 o 1
  // elemento, el schema soporta más).
  if (!session.user.esDireccion) {
    const propio = session.user.sectoresGerente[0];
    if (propio) {
      const rows = await query<{ slug: string }>("select slug from sector where id = $1", [propio]);
      if (rows[0]) redirect(`/sector/${rows[0].slug}`);
    }
  }

  // Con rol dirección, aterriza en el dashboard consolidado en vez de una
  // lista plana de sectores.
  redirect("/dashboard");
}
