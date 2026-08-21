"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { withUserContext } from "@/lib/db/withUserContext";

export interface PuestoActionState {
  error?: string;
  ok?: boolean;
}

export async function crearPuestoAction(
  _prevState: PuestoActionState,
  formData: FormData
): Promise<PuestoActionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "No hay sesión activa." };
  }

  const slug = formData.get("slug");
  const nombre = formData.get("nombre");
  if (typeof slug !== "string" || typeof nombre !== "string" || nombre.trim() === "") {
    return { error: "El nombre del puesto es obligatorio." };
  }

  const sectorRows = await query<{ id: string }>("select id from sector where slug = $1", [slug]);
  const sector = sectorRows[0];
  if (!sector) {
    return { error: "Sector no encontrado." };
  }

  const esGerenteDeEsteSector = session.user.sectoresGerente.includes(sector.id);
  if (!session.user.esDireccion && !esGerenteDeEsteSector) {
    return { error: "No tenés permiso para agregar puestos en este sector." };
  }

  const rol = session.user.esDireccion ? "direccion" : "gerente";
  const nombreLimpio = nombre.trim();

  try {
    await withUserContext(
      { id: session.user.id, rol, sectorId: esGerenteDeEsteSector ? sector.id : null },
      async (client) => {
        const ordenRows = await client.query<{ siguiente: number }>(
          "select coalesce(max(orden), 0) + 1 as siguiente from puesto where sector_id = $1",
          [sector.id]
        );
        const orden = ordenRows.rows[0].siguiente;

        const puestoRows = await client.query<{ id: string }>(
          "insert into puesto (sector_id, nombre, orden) values ($1, $2, $3) returning id",
          [sector.id, nombreLimpio, orden]
        );
        const puestoId = puestoRows.rows[0].id;

        const evalRows = await client.query<{ id: string }>(
          "insert into evaluacion (puesto_id) values ($1) returning id",
          [puestoId]
        );
        const evaluacionId = evalRows.rows[0].id;

        await client.query(
          "insert into validacion_puesto (evaluacion_id) values ($1)",
          [evaluacionId]
        );

        const preguntasGlobales = await client.query<{ id: string }>(
          "select id from pregunta where puesto_id is null"
        );
        for (const p of preguntasGlobales.rows) {
          await client.query(
            "insert into respuesta_pregunta (evaluacion_id, pregunta_id) values ($1, $2)",
            [evaluacionId, p.id]
          );
        }
      }
    );
  } catch {
    return { error: "Ocurrió un error, intentá de nuevo." };
  }

  revalidatePath(`/sector/${slug}`);
  return { ok: true };
}
