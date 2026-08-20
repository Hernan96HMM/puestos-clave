"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withUserContext } from "@/lib/db/withUserContext";

export interface ValidacionActionState {
  error?: string;
  ok?: boolean;
}

// Los tres valores del CHECK de validacion_puesto.estado (migración 0003).
const ESTADOS_VALIDOS = ["pendiente", "aprobado", "observado"] as const;

export async function updateValidacionAction(
  _prevState: ValidacionActionState,
  formData: FormData
): Promise<ValidacionActionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "No hay sesión activa." };
  }
  if (!session.user.esDireccion) {
    return { error: "No tenés permiso para editar este campo." };
  }

  const evaluacionId = formData.get("evaluacionId");
  const estado = formData.get("estado");
  const slug = formData.get("slug");
  if (typeof evaluacionId !== "string" || typeof estado !== "string" || typeof slug !== "string") {
    return { error: "Datos inválidos." };
  }
  // Validar contra la whitelist antes de tocar la base: si no, un POST armado a
  // mano choca contra el CHECK, lanza, y el catch de abajo lo etiquetaría como
  // un problema de permisos.
  if (!(ESTADOS_VALIDOS as readonly string[]).includes(estado)) {
    return { error: "Estado inválido." };
  }

  let rows: unknown[];
  try {
    rows = await withUserContext(
      { id: session.user.id, rol: "direccion", sectorId: null },
      async (client) => {
        const result = await client.query(
          "update validacion_puesto set estado = $1, actualizado_por = $2, actualizado_en = now() where evaluacion_id = $3 returning id",
          [estado, session.user.id, evaluacionId]
        );
        return result.rows;
      }
    );
  } catch {
    // Cualquier fallo real de la base (conexión, constraint inesperado): no es
    // un problema de permisos, y mezclarlo con el caso de abajo confunde.
    return { error: "Ocurrió un error, intentá de nuevo." };
  }

  // 0 filas con la sentencia ejecutada sin error = la política RLS filtró la fila.
  if (rows.length === 0) {
    return { error: "No tenés permiso para editar este sector." };
  }

  // La página se renderizó en el servidor con el valor viejo y el <select> es
  // no controlado, así que sin esto los datos quedan viejos hasta un reload.
  revalidatePath(`/sector/${slug}`);
  return { ok: true };
}
