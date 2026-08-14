"use client";

import { useActionState } from "react";
import { updateValidacionAction, type ValidacionActionState } from "./actions";
import { Button } from "@/components/ui/Button";

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
    <form action={formAction} className="flex flex-col items-start gap-1 sm:items-end">
      <input type="hidden" name="evaluacionId" value={evaluacionId} />
      {/* La acción necesita el slug para revalidar esta misma ruta. */}
      <input type="hidden" name="slug" value={slug} />
      <div className="flex items-center gap-2">
        <select
          name="estado"
          defaultValue={estadoActual}
          disabled={pending}
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="pendiente">Pendiente</option>
          <option value="aprobado">Aprobado</option>
          <option value="observado">Observado</option>
        </select>
        <Button type="submit" disabled={pending} className="px-3 py-1.5 text-xs">
          Guardar
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-xs text-risk-high">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-xs text-risk-low">Guardado.</p>}
    </form>
  );
}
