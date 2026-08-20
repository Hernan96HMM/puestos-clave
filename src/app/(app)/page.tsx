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
    // Ni rol dirección ni ningún sector gerente: perfil sin roles asignados.
    // No debería pasar en uso normal (seed-users.mjs siempre asigna al menos
    // uno), pero el schema ya no lo impide desde que perfil_rol reemplazó al
    // perfil.rol NOT NULL de antes — degradar acá en vez de encadenar
    // redirects hasta un 404 sin la barra de navegación.
    return (
      <p className="text-sm text-text-muted">
        Tu usuario no tiene ningún rol asignado. Contactá a un administrador.
      </p>
    );
  }

  // Con rol dirección, aterriza en el dashboard consolidado en vez de una
  // lista plana de sectores.
  redirect("/dashboard");
}
