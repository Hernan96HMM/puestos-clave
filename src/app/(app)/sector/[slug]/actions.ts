"use server";

import { auth } from "@/auth";
import { withUserContext } from "@/lib/db/withUserContext";

export interface ValidacionActionState {
  error?: string;
  ok?: boolean;
}

export async function updateValidacionAction(
  _prevState: ValidacionActionState,
  formData: FormData
): Promise<ValidacionActionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "No hay sesión activa." };
  }
  if (session.user.rol !== "direccion") {
    return { error: "No tenés permiso para editar este campo." };
  }

  const evaluacionId = formData.get("evaluacionId");
  const estado = formData.get("estado");
  if (typeof evaluacionId !== "string" || typeof estado !== "string") {
    return { error: "Datos inválidos." };
  }

  try {
    const rows = await withUserContext(
      { id: session.user.id, rol: session.user.rol, sectorId: session.user.sectorId },
      async (client) => {
        const result = await client.query(
          "update validacion_puesto set estado = $1, actualizado_por = $2, actualizado_en = now() where evaluacion_id = $3 returning id",
          [estado, session.user.id, evaluacionId]
        );
        return result.rows;
      }
    );
    if (rows.length === 0) {
      return { error: "No tenés permiso para editar este sector." };
    }
    return { ok: true };
  } catch {
    return { error: "No tenés permiso para editar este sector." };
  }
}
