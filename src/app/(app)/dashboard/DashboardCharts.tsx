"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { CHART_COLORS } from "@/lib/chartColors";

export interface DistribucionClasificacion {
  clasificacion: string;
  cantidad: number;
}

export interface PuestosPorSector {
  sector: string;
  cantidad: number;
}

interface DashboardChartsProps {
  distribucion: DistribucionClasificacion[];
  porSector: PuestosPorSector[];
}

const COLOR_POR_CLASIFICACION: Record<string, string> = {
  "PUESTO CLAVE": CHART_COLORS.riesgoAlto,
  "PUESTO DE ATENCIÓN": CHART_COLORS.riesgoMedio,
  "NO ES PUESTO CLAVE": CHART_COLORS.riesgoBajo,
};

export function DashboardCharts({ distribucion, porSector }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="h-72 w-full rounded-lg border border-border bg-bg-subtle p-4">
        <h2 className="mb-2 text-sm font-medium text-text-muted">Distribución por clasificación</h2>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={distribucion}
              dataKey="cantidad"
              nameKey="clasificacion"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
            >
              {distribucion.map((d) => (
                <Cell
                  key={d.clasificacion}
                  fill={COLOR_POR_CLASIFICACION[d.clasificacion] ?? CHART_COLORS.textMuted}
                />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="h-72 w-full rounded-lg border border-border bg-bg-subtle p-4">
        <h2 className="mb-2 text-sm font-medium text-text-muted">Puestos clave por sector</h2>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porSector}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} />
            <XAxis dataKey="sector" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={70} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="cantidad" fill={CHART_COLORS.riesgoAlto} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
