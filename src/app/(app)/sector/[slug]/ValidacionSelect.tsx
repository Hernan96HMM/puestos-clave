"use client";

import { useActionState } from "react";
import { updateValidacionAction, type ValidacionActionState } from "./actions";

const initialState: ValidacionActionState = {};

export function ValidacionSelect({
  evaluacionId,
  estadoActual,
  slug,
}: {
  evaluacionId: string;
  estadoActual: string;
  slug: string;
}) {
  const [state, formAction, pending] = useActionState(updateValidacionAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="evaluacionId" value={evaluacionId} />
      {/* La acción necesita el slug para revalidar esta misma ruta. */}
      <input type="hidden" name="slug" value={slug} />
      <select name="estado" defaultValue={estadoActual} disabled={pending}>
        <option value="pendiente">Pendiente</option>
        <option value="aprobado">Aprobado</option>
        <option value="observado">Observado</option>
      </select>
      <button type="submit" disabled={pending}>
        Guardar
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.ok && <p>Guardado.</p>}
    </form>
  );
}
