"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withUserContext } from "@/lib/db/withUserContext";

export interface EvaluacionActionState {
  error?: string;
  ok?: boolean;
}

// Los 7 valores válidos del <select> por pregunta: "NA" (puntaje null) o "0"-"5".
const PUNTAJES_VALIDOS = ["NA", "0", "1", "2", "3", "4", "5"] as const;

export async function updateEvaluacionAction(
  _prevState: EvaluacionActionState,
  formData: FormData
): Promise<EvaluacionActionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "No hay sesión activa." };
  }
  if (session.user.rol !== "gerente") {
    return { error: "No tenés permiso para editar esta evaluación." };
  }

  const evaluacionId = formData.get("evaluacionId");
  const slug = formData.get("slug");
  const preguntaIdsRaw = formData.get("preguntaIds");
  const evaluador = formData.get("evaluador");
  const fechaEvaluacion = formData.get("fechaEvaluacion");
  if (
    typeof evaluacionId !== "string" ||
    typeof slug !== "string" ||
    typeof preguntaIdsRaw !== "string" ||
    typeof evaluador !== "string" ||
    typeof fechaEvaluacion !== "string"
  ) {
    return { error: "Datos inválidos." };
  }

  const preguntaIds = preguntaIdsRaw.split(",").filter(Boolean);
  if (preguntaIds.length === 0) {
    return { error: "Datos inválidos." };
  }

  // Validar TODO (whitelist de puntajes + regla de justificación obligatoria)
  // antes de tocar la base: si no, un dato inválido en la mitad del loop dejaría
  // la escritura a medio hacer, o el error de constraint se confundiría con un
  // problema de permisos (mismo criterio que updateValidacionAction).
  const respuestas: { preguntaId: string; puntaje: number | null; justificacion: string }[] = [];
  for (const preguntaId of preguntaIds) {
    const puntajeRaw = formData.get(`puntaje_${preguntaId}`);
    const justificacion = formData.get(`justificacion_${preguntaId}`);
    if (typeof puntajeRaw !== "string" || typeof justificacion !== "string") {
      return { error: "Datos inválidos." };
    }
    if (!(PUNTAJES_VALIDOS as readonly string[]).includes(puntajeRaw)) {
      return { error: "Puntaje inválido." };
    }
    const puntaje = puntajeRaw === "NA" ? null : Number(puntajeRaw);
    if (puntaje !== null && puntaje >= 3 && justificacion.trim() === "") {
      return { error: "Falta justificación en una o más preguntas con puntaje 3 o más." };
    }
    respuestas.push({ preguntaId, puntaje, justificacion });
  }

  let filasAfectadas: number;
  try {
    filasAfectadas = await withUserContext(
      { id: session.user.id, rol: session.user.rol, sectorId: session.user.sectorId },
      async (client) => {
        let count = 0;
        const evalResult = await client.query(
          "update evaluacion set evaluador = $1, fecha_evaluacion = $2 where id = $3 returning id",
          [evaluador || null, fechaEvaluacion || null, evaluacionId]
        );
        count += evalResult.rowCount ?? 0;

        for (const r of respuestas) {
          const result = await client.query(
            "update respuesta_pregunta set puntaje = $1, justificacion = $2 where evaluacion_id = $3 and pregunta_id = $4 returning id",
            [r.puntaje, r.justificacion || null, evaluacionId, r.preguntaId]
          );
          count += result.rowCount ?? 0;
        }
        return count;
      }
    );
  } catch {
    // Cualquier fallo real de la base (conexión, constraint inesperado): no es
    // un problema de permisos, y mezclarlo con el caso de abajo confunde.
    return { error: "Ocurrió un error, intentá de nuevo." };
  }

  // Menos filas afectadas que las esperadas (1 de evaluacion + N de respuestas)
  // = la policy de RLS filtró alguna fila (sector ajeno) sin lanzar error.
  const filasEsperadas = 1 + respuestas.length;
  if (filasAfectadas < filasEsperadas) {
    return { error: "No tenés permiso para editar este puesto." };
  }

  // La página se renderizó en el servidor con los valores viejos; sin esto
  // quedan desactualizados hasta un reload.
  revalidatePath(`/sector/${slug}`);
  return { ok: true };
}
