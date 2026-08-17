"use client";

import { useMemo, useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { ValidacionSelect } from "../sector/[slug]/ValidacionSelect";

export interface ConsolidadoRow {
  evaluacion_id: string;
  sector: string;
  sector_slug: string;
  puesto_nombre: string;
  evaluador: string | null;
  fecha_evaluacion: string | null;
  puntaje_ponderado_pct: number;
  clasificacion: string;
  nivel_riesgo: string;
  semaforo: string;
  validacion_direccion: string;
}

interface TablaConsolidadaProps {
  rows: ConsolidadoRow[];
  esDireccion: boolean;
}

const RIESGO_VARIANT: Record<string, BadgeVariant> = {
  ALTO: "riesgo-alto",
  MEDIO: "riesgo-medio",
  BAJO: "riesgo-bajo",
};

const VALIDACION_VARIANT: Record<string, BadgeVariant> = {
  pendiente: "validacion-pendiente",
  aprobado: "validacion-aprobado",
  observado: "validacion-observado",
};

type ColumnaOrdenable = "sector" | "puesto_nombre" | "evaluador" | "fecha_evaluacion" | "puntaje_ponderado_pct" | "clasificacion" | "nivel_riesgo";

const COLUMNAS: { key: ColumnaOrdenable; label: string }[] = [
  { key: "sector", label: "Sector" },
  { key: "puesto_nombre", label: "Puesto" },
  { key: "evaluador", label: "Evaluador" },
  { key: "fecha_evaluacion", label: "Fecha" },
  { key: "puntaje_ponderado_pct", label: "Puntaje" },
  { key: "clasificacion", label: "Clasificación" },
  { key: "nivel_riesgo", label: "Riesgo" },
];

export function TablaConsolidada({ rows, esDireccion }: TablaConsolidadaProps) {
  const [filtroSector, setFiltroSector] = useState("");
  const [filtroClasificacion, setFiltroClasificacion] = useState("");
  const [orden, setOrden] = useState<{ columna: ColumnaOrdenable; direccion: "asc" | "desc" }>({
    columna: "sector",
    direccion: "asc",
  });

  const sectores = useMemo(() => Array.from(new Set(rows.map((r) => r.sector))).sort(), [rows]);
  const clasificaciones = useMemo(() => Array.from(new Set(rows.map((r) => r.clasificacion))).sort(), [rows]);

  const filasVisibles = useMemo(() => {
    let resultado = rows;
    if (filtroSector) resultado = resultado.filter((r) => r.sector === filtroSector);
    if (filtroClasificacion) resultado = resultado.filter((r) => r.clasificacion === filtroClasificacion);
    const { columna, direccion } = orden;
    const factor = direccion === "asc" ? 1 : -1;
    return [...resultado].sort((a, b) => {
      const va = a[columna];
      const vb = b[columna];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }, [rows, filtroSector, filtroClasificacion, orden]);

  function alternarOrden(columna: ColumnaOrdenable) {
    setOrden((prev) =>
      prev.columna === columna
        ? { columna, direccion: prev.direccion === "asc" ? "desc" : "asc" }
        : { columna, direccion: "asc" }
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={filtroSector}
          onChange={(e) => setFiltroSector(e.target.value)}
          aria-label="Filtrar por sector"
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary"
        >
          <option value="">Todos los sectores</option>
          {sectores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filtroClasificacion}
          onChange={(e) => setFiltroClasificacion(e.target.value)}
          aria-label="Filtrar por clasificación"
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary"
        >
          <option value="">Todas las clasificaciones</option>
          {clasificaciones.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-subtle text-text-muted">
              <th className="px-2 py-2 font-medium">N°</th>
              {COLUMNAS.map((c) => (
                <th
                  key={c.key}
                  className="px-2 py-2 font-medium"
                  aria-sort={
                    orden.columna === c.key ? (orden.direccion === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  <button
                    type="button"
                    onClick={() => alternarOrden(c.key)}
                    className="flex cursor-pointer select-none items-center gap-1 font-medium"
                  >
                    {c.label}
                    {orden.columna === c.key && (orden.direccion === "asc" ? " ▲" : " ▼")}
                  </button>
                </th>
              ))}
              <th className="px-2 py-2 font-medium">Semáforo</th>
              <th className="px-2 py-2 font-medium">Validación</th>
            </tr>
          </thead>
          <tbody>
            {filasVisibles.map((r, i) => (
              <tr key={r.evaluacion_id} className="border-b border-border last:border-0">
                <td className="px-2 py-2 text-text-muted">{i + 1}</td>
                <td className="px-2 py-2">{r.sector}</td>
                <td className="px-2 py-2">{r.puesto_nombre}</td>
                <td className="px-2 py-2">{r.evaluador ?? "—"}</td>
                <td className="px-2 py-2">{r.fecha_evaluacion ?? "—"}</td>
                <td className="px-2 py-2">{r.puntaje_ponderado_pct}%</td>
                <td className="px-2 py-2">
                  <Badge variant={RIESGO_VARIANT[r.nivel_riesgo] ?? "validacion-pendiente"}>{r.clasificacion}</Badge>
                </td>
                <td className="px-2 py-2">{r.nivel_riesgo}</td>
                <td className="px-2 py-2 text-base">{r.semaforo}</td>
                <td className="px-2 py-2">
                  {esDireccion ? (
                    <ValidacionSelect
                      evaluacionId={r.evaluacion_id}
                      estadoActual={r.validacion_direccion}
                      slug={r.sector_slug}
                    />
                  ) : (
                    <Badge variant={VALIDACION_VARIANT[r.validacion_direccion] ?? "validacion-pendiente"}>
                      {r.validacion_direccion}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
