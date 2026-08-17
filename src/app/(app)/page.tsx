import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { puedeVerTodo } from "@/lib/permisos";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return null;

  // Gerente sin acceso extendido: directo a su propio sector, como hoy.
  if (session.user.rol === "gerente" && !puedeVerTodo(session.user)) {
    const rows = await query<{ slug: string }>("select slug from sector where id = $1", [
      session.user.sectorId,
    ]);
    const propio = rows[0];
    if (propio) redirect(`/sector/${propio.slug}`);
  }

  // Cualquiera con acceso extendido (RRHH, SIG, Dirección) aterriza en el
  // dashboard consolidado en vez de una lista plana de sectores.
  redirect("/dashboard");
}
