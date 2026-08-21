"use client";

import { useActionState, useState } from "react";
import { crearPuestoAction, type PuestoActionState } from "./puestoActions";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: PuestoActionState = {};

export function NuevoPuestoForm({ slug }: { slug: string }) {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionState(crearPuestoAction, initialState);

  if (!abierto) {
    return (
      <Button variant="ghost" onClick={() => setAbierto(true)} className="self-start">
        + Nuevo puesto
      </Button>
    );
  }

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="slug" value={slug} />
        <div className="flex-1">
          <Field label="Nombre del puesto" name="nombre" id="nuevo-puesto-nombre" disabled={pending} required />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creando..." : "Crear"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </form>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-risk-high">
          {state.error}
        </p>
      )}
    </Card>
  );
}
