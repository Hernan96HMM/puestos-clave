"use client";

import { useActionState, useState } from "react";
import { updateEvaluacionAction, type EvaluacionActionState } from "./evaluacionActions";
import { calcularPuntajePonderado } from "@/lib/calculoPuntaje";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

interface PreguntaRespuesta {
  preguntaId: string;
  numero: number;
  texto: string;
  refIso: string;
  pesoPct: number;
  puntaje: number | null;
  justificacion: string | null;
}

interface PuestoEvaluacionFormProps {
  evaluacionId: string;
  slug: string;
  evaluador: string | null;
  fechaEvaluacion: string | null;
  preguntas: PreguntaRespuesta[];
}

const initialState: EvaluacionActionState = {};

// Escala del formulario (sección 2.4 del prompt original F-116):
// 0 = No aplica el criterio ... 5 = Muy alto, N/A = la pregunta no corresponde a este puesto.
const OPCIONES_PUNTAJE = [
  { value: "NA", label: "N/A — No corresponde a este puesto" },
  { value: "0", label: "0 — No aplica el criterio" },
  { value: "1", label: "1 — Muy bajo" },
  { value: "2", label: "2 — Bajo" },
  { value: "3", label: "3 — Medio" },
  { value: "4", label: "4 — Alto" },
  { value: "5", label: "5 — Muy alto" },
];

export function PuestoEvaluacionForm({
  evaluacionId,
  slug,
  evaluador,
  fechaEvaluacion,
  preguntas,
}: PuestoEvaluacionFormProps) {
  const [state, formAction, pending] = useActionState(updateEvaluacionAction, initialState);
  const [respuestas, setRespuestas] = useState(
    preguntas.map((p) => ({
      preguntaId: p.preguntaId,
      puntaje: p.puntaje,
      justificacion: p.justificacion ?? "",
    }))
  );

  const puntajeEnVivo = calcularPuntajePonderado(
    respuestas.map((r, i) => ({ peso_pct: preguntas[i].pesoPct, puntaje: r.puntaje }))
  );

  function actualizarPuntaje(preguntaId: string, valor: string) {
    setRespuestas((prev) =>
      prev.map((r) =>
        r.preguntaId === preguntaId ? { ...r, puntaje: valor === "NA" ? null : Number(valor) } : r
      )
    );
  }

  function actualizarJustificacion(preguntaId: string, valor: string) {
    setRespuestas((prev) =>
      prev.map((r) => (r.preguntaId === preguntaId ? { ...r, justificacion: valor } : r))
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 pt-4">
      <input type="hidden" name="evaluacionId" value={evaluacionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="preguntaIds" value={preguntas.map((p) => p.preguntaId).join(",")} />

      <div className="flex items-center justify-between rounded-md bg-secondary-bg px-3 py-2">
        <span className="text-sm font-medium text-secondary-text">Puntaje ponderado (en vivo)</span>
        <span className="text-lg font-bold text-secondary-text">{puntajeEnVivo.toFixed(1)}%</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Evaluador"
          name="evaluador"
          id={`evaluador-${evaluacionId}`}
          defaultValue={evaluador ?? ""}
          disabled={pending}
        />
        <Field
          label="Fecha de evaluación"
          name="fechaEvaluacion"
          id={`fechaEvaluacion-${evaluacionId}`}
          type="date"
          defaultValue={fechaEvaluacion ?? ""}
          disabled={pending}
        />
      </div>

      <div className="flex flex-col gap-4">
        {preguntas.map((p, i) => {
          const respuesta = respuestas[i];
          const requiereJustificacion = respuesta.puntaje !== null && respuesta.puntaje >= 3;
          return (
            <div key={p.preguntaId} className="flex flex-col gap-2 border-t border-border pt-3">
              <p id={`pregunta-${evaluacionId}-${p.preguntaId}`} className="text-sm text-text">
                <span className="font-medium">{p.numero}.</span> {p.texto}
              </p>
              <p className="text-xs text-text-muted">
                Ref. ISO 9001:2015 {p.refIso} · Peso {p.pesoPct}%
              </p>
              <select
                name={`puntaje_${p.preguntaId}`}
                value={respuesta.puntaje === null ? "NA" : String(respuesta.puntaje)}
                onChange={(e) => actualizarPuntaje(p.preguntaId, e.target.value)}
                disabled={pending}
                aria-labelledby={`pregunta-${evaluacionId}-${p.preguntaId}`}
                className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {OPCIONES_PUNTAJE.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Textarea
                name={`justificacion_${p.preguntaId}`}
                value={respuesta.justificacion}
                onChange={(e) => actualizarJustificacion(p.preguntaId, e.target.value)}
                required={requiereJustificacion}
                disabled={pending}
                aria-labelledby={`pregunta-${evaluacionId}-${p.preguntaId}`}
                rows={2}
                placeholder={
                  requiereJustificacion
                    ? "Justificación obligatoria para este puntaje"
                    : "Justificación (opcional)"
                }
              />
            </div>
          );
        })}
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-risk-high">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-risk-low">Guardado.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
