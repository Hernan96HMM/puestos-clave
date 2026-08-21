"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withUserContext } from "@/lib/db/withUserContext";

export interface PreguntaActionState {
  error?: string;
  ok?: boolean;
}

// Marcador local (mismo patrón que evaluacionActions.ts): se lanza DENTRO
// del callback de withUserContext para que dispare ROLLBACK en vez de
// COMMIT si la evaluación no existe.
class PermisoError extends Error {}

export async function crearPreguntaPuestoAction(
  _prevState: PreguntaActionState,
  formData: FormData
): Promise<PreguntaActionState> {
  const session = await auth();
  if (!session?.user?.esDireccion) {
    return { error: "Solo Dirección puede agregar preguntas." };
  }

  const evaluacionId = formData.get("evaluacionId");
  const slug = formData.get("slug");
  const texto = formData.get("texto");
  const refIso = formData.get("refIso");
  const pesoPctRaw = formData.get("pesoPct");
  if (
    typeof evaluacionId !== "string" ||
    typeof slug !== "string" ||
    typeof texto !== "string" ||
    typeof refIso !== "string" ||
    typeof pesoPctRaw !== "string"
  ) {
    return { error: "Datos inválidos." };
  }

  const textoLimpio = texto.trim();
  const refIsoLimpio = refIso.trim();
  const pesoPct = Number(pesoPctRaw);
  if (!textoLimpio) {
    return { error: "El texto de la pregunta es obligatorio." };
  }
  if (!Number.isFinite(pesoPct) || pesoPct <= 0 || pesoPct > 100) {
    return { error: "El peso debe ser un número entre 1 y 100." };
  }

  try {
    await withUserContext(
      { id: session.user.id, rol: "direccion", sectorId: null },
      async (client) => {
        const evalRows = await client.query<{ puesto_id: string }>(
          "select puesto_id from evaluacion where id = $1",
          [evaluacionId]
        );
        const puestoId = evalRows.rows[0]?.puesto_id;
        if (!puestoId) {
          throw new PermisoError();
        }

        const numeroRows = await client.query<{ siguiente: number }>(
          `select coalesce(max(numero), 0) + 1 as siguiente from pregunta
           where puesto_id is null or puesto_id = $1`,
          [puestoId]
        );
        const numero = numeroRows.rows[0].siguiente;

        const preguntaRows = await client.query<{ id: string }>(
          "insert into pregunta (numero, texto, ref_iso, peso_pct, puesto_id) values ($1, $2, $3, $4, $5) returning id",
          [numero, textoLimpio, refIsoLimpio, pesoPct, puestoId]
        );

        await client.query(
          "insert into respuesta_pregunta (evaluacion_id, pregunta_id) values ($1, $2)",
          [evaluacionId, preguntaRows.rows[0].id]
        );
      }
    );
  } catch (e) {
    if (e instanceof PermisoError) {
      return { error: "Evaluación no encontrada." };
    }
    return { error: "Ocurrió un error, intentá de nuevo." };
  }

  revalidatePath(`/sector/${slug}`);
  return { ok: true };
}
